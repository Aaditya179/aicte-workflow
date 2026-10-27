'use client';

import React, { useEffect, useState } from 'react';
import { fetchApi } from '@/lib/api';
import {
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  ChevronDown,
  ChevronUp,
  Loader2,
  FileText,
  Lock,
  RotateCcw
} from 'lucide-react';

interface AssuranceFlag {
  id: string;
  check_type: string;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  entity_type: string | null;
  entity_id: string | null;
  status: 'open' | 'acknowledged' | 'overridden';
  reason: string | null;
}

interface AssuranceCheck {
  check: string;
  result: 'passed' | 'flagged';
  detail: string;
}

interface AssuranceReport {
  id: string;
  kind: 'pre' | 'post';
  passed: number;
  flagged: number;
  checks: AssuranceCheck[];
  generated_at: string;
}

interface Decision {
  id: string;
  outcome: string;
  status: 'draft' | 'committed';
  stage_key: string;
  remarks: string | null;
}

export default function AssurancePanel({
  applicationId,
  currentStage,
  onCommitSuccess
}: {
  applicationId: string;
  currentStage: string;
  onCommitSuccess?: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [report, setReport] = useState<AssuranceReport | null>(null);
  const [flags, setFlags] = useState<AssuranceFlag[]>([]);
  const [openCount, setOpenCount] = useState(0);

  // Form states
  const [selectedOutcome, setSelectedOutcome] = useState('approve');
  const [remarks, setRemarks] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [overrideInput, setOverrideInput] = useState<{ [flagId: string]: string }>({});
  const [showOverrideFor, setShowOverrideFor] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [commitSuccessMsg, setCommitSuccessMsg] = useState<string | null>(null);

  const startOrRefreshDraft = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetchApi<any>(`/applications/${applicationId}/decisions`, {
        method: 'POST',
        body: JSON.stringify({
          stage_key: currentStage,
          outcome: selectedOutcome,
          remarks: remarks
        })
      });

      if (res.data) {
        setDecision({
          id: res.data.decision_id,
          outcome: selectedOutcome,
          status: 'draft',
          stage_key: currentStage,
          remarks: remarks
        });
        setReport({
          id: res.data.report_id,
          kind: 'pre',
          passed: res.data.passed,
          flagged: res.data.flagged,
          checks: res.data.checks,
          generated_at: new Date().toISOString()
        });
        setFlags(res.data.flags || []);
        setOpenCount((res.data.flags || []).filter((f: any) => f.status === 'open').length);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to initialize decision assurance run.');
    } finally {
      setLoading(false);
    }
  };

  const handleAcknowledge = async (flagId: string) => {
    setActionLoading(flagId);
    try {
      await fetchApi(`/assurance/flags/${flagId}/acknowledge`, { method: 'POST' });
      // Update local state
      setFlags(prev => prev.map(f => f.id === flagId ? { ...f, status: 'acknowledged' } : f));
      setOpenCount(prev => Math.max(0, prev - 1));
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to acknowledge flag.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleOverride = async (flagId: string) => {
    const reason = overrideInput[flagId];
    if (!reason || reason.trim().length < 5) {
      setErrorMessage('A documented justification reason of at least 5 characters is required for overrides.');
      return;
    }

    setActionLoading(flagId);
    setErrorMessage(null);
    try {
      await fetchApi(`/assurance/flags/${flagId}/override`, {
        method: 'POST',
        body: JSON.stringify({ reason: reason.trim() })
      });
      // Update local state
      setFlags(prev => prev.map(f => f.id === flagId ? { ...f, status: 'overridden', reason: reason.trim() } : f));
      setOpenCount(prev => Math.max(0, prev - 1));
      setShowOverrideFor(null);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to override flag.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleCommit = async () => {
    if (!decision) return;
    if (openCount > 0) {
      setErrorMessage(`Cannot commit decision: ${openCount} open assurance flag(s) require officer action.`);
      return;
    }

    setActionLoading('commit');
    setErrorMessage(null);
    try {
      await fetchApi(`/decisions/${decision.id}/commit`, { method: 'POST' });
      setDecision(prev => prev ? { ...prev, status: 'committed' } : null);
      setCommitSuccessMsg('Decision successfully committed to statutory record with full evidence audit trail.');
      if (onCommitSuccess) onCommitSuccess();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to commit decision.');
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 space-y-4 shadow-sm">
      {/* Panel Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-teal-100 dark:bg-teal-950 text-[#0F766E] flex items-center justify-center font-bold">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
              Decision Assurance & Evidence Integrity
            </h2>
            <p className="text-xs text-slate-500">
              Statutory verification of freshness, completeness, consistency & source provenance (§15.2)
            </p>
          </div>
        </div>

        <span className="text-[10px] font-semibold text-teal-700 bg-teal-50 dark:bg-teal-950/60 border border-teal-200 px-2 py-0.5 rounded-full">
          Advisory Only
        </span>
      </div>

      {errorMessage && (
        <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/50 border border-rose-200 text-rose-700 dark:text-rose-300 text-xs">
          {errorMessage}
        </div>
      )}

      {commitSuccessMsg && (
        <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 text-emerald-700 dark:text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          <span>{commitSuccessMsg}</span>
        </div>
      )}

      {/* Decision Form if no draft started or draft open */}
      {(!decision || decision.status === 'draft') && (
        <div className="space-y-3 pt-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Formulate Stage Outcome
              </label>
              <select
                value={selectedOutcome}
                onChange={e => setSelectedOutcome(e.target.value)}
                disabled={loading}
                className="w-full text-xs px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
              >
                <option value="approve">Approve</option>
                <option value="approve_with_conditions">Approve with Conditions</option>
                <option value="return">Return for Deficiency</option>
                <option value="reject">Reject</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Officer Remarks
              </label>
              <input
                type="text"
                placeholder="Findings & statutory references..."
                value={remarks}
                onChange={e => setRemarks(e.target.value)}
                disabled={loading}
                className="w-full text-xs px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>
          </div>

          <button
            type="button"
            onClick={startOrRefreshDraft}
            disabled={loading}
            className="px-3.5 py-2 rounded-lg bg-[#0F766E] hover:bg-[#115E59] text-white text-xs font-semibold transition flex items-center gap-2 cursor-pointer disabled:opacity-60"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
            <span>{decision ? 'Re-run Assurance Checks' : 'Draft Decision & Snapshot Evidence'}</span>
          </button>
        </div>
      )}

      {/* Report Summary */}
      {report && (
        <div className="pt-2 space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200">
              <span className="text-[11px] font-semibold text-emerald-800 dark:text-emerald-300">Checks Passed</span>
              <p className="text-xl font-bold text-emerald-700 dark:text-emerald-400 mt-0.5">{report.passed}</p>
            </div>

            <div className={`p-3 rounded-lg border ${openCount > 0 ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-200' : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200'}`}>
              <span className={`text-[11px] font-semibold ${openCount > 0 ? 'text-rose-800 dark:text-rose-300' : 'text-slate-600'}`}>
                Open Flags Required
              </span>
              <p className={`text-xl font-bold mt-0.5 ${openCount > 0 ? 'text-rose-700 dark:text-rose-400' : 'text-slate-700'}`}>
                {openCount}
              </p>
            </div>

            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200 col-span-2 sm:col-span-1">
              <span className="text-[11px] font-semibold text-slate-600">Decision State</span>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200 mt-1.5">
                {decision?.status || 'Draft'}
              </p>
            </div>
          </div>

          {/* Active Flags List */}
          {flags.length > 0 && (
            <div className="space-y-2 pt-1">
              <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                Assurance Findings ({flags.length})
              </h4>
              {flags.map((flag) => {
                const isOverridden = flag.status === 'overridden';
                const isAcked = flag.status === 'acknowledged';
                const isOpen = flag.status === 'open';

                return (
                  <div
                    key={flag.id}
                    className={`p-3 rounded-lg border text-xs space-y-2 ${
                      isOpen
                        ? 'bg-rose-50/70 dark:bg-rose-950/30 border-rose-200'
                        : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className={`w-4 h-4 flex-shrink-0 mt-0.5 ${isOpen ? 'text-rose-600' : 'text-slate-400'}`} />
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900 dark:text-white uppercase text-[10px] tracking-wider px-1.5 py-0.2 rounded bg-slate-200 dark:bg-slate-700">
                              {flag.check_type}
                            </span>
                            <span className={`text-[10px] font-semibold capitalize px-1.5 py-0.2 rounded ${
                              isOpen ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'
                            }`}>
                              {flag.status}
                            </span>
                          </div>
                          <p className="text-slate-700 dark:text-slate-300 mt-1 leading-relaxed">
                            {flag.message}
                          </p>
                          {flag.reason && (
                            <p className="text-[11px] text-slate-500 mt-1 italic">
                              Override Justification: "{flag.reason}"
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Action buttons if open */}
                      {isOpen && decision?.status === 'draft' && (
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <button
                            type="button"
                            onClick={() => handleAcknowledge(flag.id)}
                            disabled={!!actionLoading}
                            className="px-2 py-1 rounded bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 text-slate-800 dark:text-slate-200 text-[11px] font-medium transition cursor-pointer"
                          >
                            Acknowledge
                          </button>
                          <button
                            type="button"
                            onClick={() => setShowOverrideFor(showOverrideFor === flag.id ? null : flag.id)}
                            disabled={!!actionLoading}
                            className="px-2 py-1 rounded bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-medium transition cursor-pointer"
                          >
                            Override
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Override justification drawer */}
                    {showOverrideFor === flag.id && isOpen && (
                      <div className="pt-2 border-t border-rose-200 dark:border-rose-900/50 space-y-2">
                        <textarea
                          placeholder="Provide statutory justification reason for override (audited in SHA-256 chain)..."
                          value={overrideInput[flag.id] || ''}
                          onChange={e => setOverrideInput({ ...overrideInput, [flag.id]: e.target.value })}
                          className="w-full text-xs p-2 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 resize-none h-16"
                        />
                        <button
                          type="button"
                          onClick={() => handleOverride(flag.id)}
                          disabled={actionLoading === flag.id}
                          className="px-2.5 py-1 rounded bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold transition"
                        >
                          Confirm Audited Override
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Commit Decision Button */}
          {decision?.status === 'draft' && (
            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <span className="text-[11px] text-slate-500">
                {openCount > 0
                  ? `Cannot commit: ${openCount} open flag(s) must be addressed`
                  : 'All flags addressed. Ready to commit decision.'}
              </span>

              <button
                type="button"
                onClick={handleCommit}
                disabled={openCount > 0 || actionLoading === 'commit'}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-sm disabled:opacity-50 cursor-pointer"
              >
                {actionLoading === 'commit' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                <span>Commit Decision</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
