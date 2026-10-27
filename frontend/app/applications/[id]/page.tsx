'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { fetchApi } from '@/lib/api';
import {
  ArrowLeft, CheckCircle2, Clock, AlertTriangle, XCircle, ChevronRight,
  RotateCcw, UserPlus, SendHorizonal, ChevronDown, Loader2, ShieldAlert, FileText
} from 'lucide-react';
import AssurancePanel from '@/components/AssurancePanel';

interface Application {
  id: string;
  application_no: string;
  institution_id: string;
  application_type: string;
  current_stage: string;
  status: string;
  submitted_at: string;
  stage_entered_at: string;
  due_at: string | null;
  risk_score: number | null;
  risk_label: string | null;
}

interface StageHistoryEntry {
  id: string;
  from_stage: string | null;
  to_stage: string;
  action: string;
  reason: string | null;
  entered_at: string;
  exited_at: string | null;
}

interface AuditEntry {
  seq: number;
  actor_role: string;
  action: string;
  created_at: string;
  reason: string | null;
}

const STAGE_ORDER = [
  'scrutiny', 'institution_response', 're_scrutiny',
  'evc_queue', 'evc_visit', 'sac_shc', 'final_decision'
];

const STAGE_LABELS: Record<string, string> = {
  scrutiny: 'Scrutiny',
  institution_response: 'Institution Response',
  re_scrutiny: 'Re-scrutiny',
  evc_queue: 'EVC Queue',
  evc_visit: 'EVC Visit',
  sac_shc: 'SAC/SHC',
  final_decision: 'Final Decision',
};

function StageStepper({ currentStage, stages }: { currentStage: string; stages: string[] }) {
  const currentIdx = stages.indexOf(currentStage);
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {stages.map((stage, idx) => {
        const isDone = idx < currentIdx;
        const isCurrent = idx === currentIdx;
        return (
          <React.Fragment key={stage}>
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
              isCurrent ? 'bg-[#C25E26] text-white shadow-2xs' :
              isDone ? 'bg-[#FBF0E4] text-[#C25E26] border border-[#F0D5BE]' :
              'bg-stone-100 text-stone-400'
            }`}>
              {isDone && <CheckCircle2 className="w-3 h-3" />}
              {isCurrent && <Clock className="w-3 h-3" />}
              {STAGE_LABELS[stage] || stage}
            </div>
            {idx < stages.length - 1 && (
              <ChevronRight className="w-3.5 h-3.5 text-stone-300 flex-shrink-0" />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function RiskBadge({ score, label }: { score: number | null; label: string | null }) {
  if (score === null) return null;
  const color = label === 'High' ? 'bg-red-50 text-red-700 border-red-200'
    : label === 'Medium' ? 'bg-amber-50 text-amber-700 border-amber-200'
    : 'bg-emerald-50 text-emerald-700 border-emerald-200';
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-xs font-semibold ${color}`}>
      <ShieldAlert className="w-3.5 h-3.5" />
      Risk: {label} ({score})
      <span className="text-[10px] font-normal opacity-60">[Advisory]</span>
    </span>
  );
}

function ApplicationDetailContent() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [app, setApp] = useState<Application | null>(null);
  const [timeline, setTimeline] = useState<{ stage_history: StageHistoryEntry[]; audit_entries: AuditEntry[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState('');
  const [actionError, setActionError] = useState('');
  const [reasonInput, setReasonInput] = useState('');
  const [showReasonFor, setShowReasonFor] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const [appRes, tlRes] = await Promise.all([
      fetchApi<Application>(`/applications/${id}`),
      fetchApi<{ stage_history: StageHistoryEntry[]; audit_entries: AuditEntry[] }>(`/applications/${id}/timeline`),
    ]);
    setApp(appRes.data);
    setTimeline(tlRes.data);
    setLoading(false);
  };

  useEffect(() => { load(); }, [id]);

  const doAction = async (endpoint: string, body: object) => {
    setActionLoading(endpoint);
    setActionError('');
    const { data, error } = await fetchApi(`/applications/${id}/${endpoint}`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    setActionLoading('');
    if (error) {
      setActionError(error);
    } else if (data) {
      setApp(data as Application);
      setShowReasonFor(null);
      setReasonInput('');
      load();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-[#C25E26]" />
      </div>
    );
  }

  if (!app) {
    return <div className="p-8 text-center text-stone-500">Application not found.</div>;
  }

  const approxStages = STAGE_ORDER.filter(s => STAGE_LABELS[s]);

  return (
    <div className="min-h-screen bg-[#FAF7F2] bg-grid-texture text-[#1C1917]">
      {/* Header */}
      <div className="bg-[#FAF7F2]/80 backdrop-blur-md border-b border-[#E8E2D8] px-6 py-4">
        <div className="max-w-6xl mx-auto">
          <button onClick={() => router.back()} className="flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-800 mb-3 transition-colors cursor-pointer">
            <ArrowLeft className="w-4 h-4" />
            Back to Applications
          </button>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-xl font-serif font-bold text-[#1C1917] font-mono">{app.application_no}</h1>
              <p className="text-sm text-stone-500 mt-0.5">{app.application_type}</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <RiskBadge score={app.risk_score} label={app.risk_label} />
              <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${
                app.status === 'in_progress' ? 'bg-[#FBF0E4] text-[#C25E26] border-[#F0D5BE]' :
                app.status === 'returned' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                'bg-stone-100 text-stone-600 border-[#E8E2D8]'
              }`}>
                {app.status.replace('_', ' ').toUpperCase()}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left/Main */}
        <div className="lg:col-span-2 space-y-5">
          {/* Stage Tracker */}
          <div className="bg-white rounded-2xl border border-[#E8E2D8] p-5 shadow-2xs">
            <h2 className="text-sm font-serif font-bold text-[#1C1917] mb-4 uppercase tracking-wider">Stage Tracker</h2>
            <StageStepper currentStage={app.current_stage} stages={approxStages} />
          </div>

          {/* Actions */}
          <div className="bg-white rounded-2xl border border-[#E8E2D8] p-5 space-y-3 shadow-2xs">
            <h2 className="text-sm font-serif font-bold text-[#1C1917] uppercase tracking-wider">Actions</h2>
            {actionError && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
                {actionError}
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => doAction('advance', {})}
                disabled={!!actionLoading}
                className="flex items-center gap-1.5 px-4 py-2 bg-[#C25E26] hover:bg-[#A84A19] text-white text-xs font-medium rounded-full transition disabled:opacity-50 shadow-2xs cursor-pointer"
              >
                {actionLoading === 'advance' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ChevronRight className="w-3.5 h-3.5" />}
                Advance Stage
              </button>
              <button
                onClick={() => setShowReasonFor(showReasonFor === 'return' ? null : 'return')}
                disabled={!!actionLoading}
                className="flex items-center gap-1.5 px-4 py-2 border border-[#E8E2D8] bg-white hover:bg-[#FAF7F2] text-stone-700 text-xs font-medium rounded-full transition shadow-2xs cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Return for Deficiency
              </button>
            </div>

            {showReasonFor && (
              <div className="mt-2 space-y-2">
                <textarea
                  placeholder={`Reason for ${showReasonFor}...`}
                  value={reasonInput}
                  onChange={e => setReasonInput(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-[#E8E2D8] rounded-xl bg-white text-[#1C1917] focus:outline-none focus:ring-1 focus:ring-[#C25E26] resize-none h-20"
                />
                <button
                  onClick={() => doAction(showReasonFor, { reason: reasonInput })}
                  disabled={!reasonInput.trim() || !!actionLoading}
                  className="px-4 py-1.5 bg-[#C25E26] hover:bg-[#A84A19] text-white text-xs font-medium rounded-full transition disabled:opacity-50 cursor-pointer shadow-2xs"
                >
                  {actionLoading === showReasonFor ? <Loader2 className="w-3.5 h-3.5 animate-spin inline mr-1" /> : null}
                  Confirm {showReasonFor}
                </button>
              </div>
            )}
          </div>

          {/* Decision Assurance Panel (§15.2) */}
          <AssurancePanel
            applicationId={app.id}
            currentStage={app.current_stage}
            onCommitSuccess={() => load()}
          />

          {/* AI Case Summary & Deficiency Notice Assistant (§10.3) */}
          <div className="bg-white rounded-2xl border border-[#E8E2D8] p-5 space-y-4 shadow-2xs">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-serif font-bold text-[#1C1917] uppercase tracking-wider flex items-center gap-2">
                <FileText className="w-4 h-4 text-[#C25E26]" /> Statutory Case Summary & AI Assistant
              </h2>
              <span className="text-[10px] font-semibold text-[#C25E26] bg-[#FBF0E4] border border-[#F0D5BE] px-2.5 py-0.5 rounded-full">
                Advisory Only
              </span>
            </div>

            <p className="text-xs text-stone-700 leading-relaxed bg-[#FAF7F2] p-3.5 rounded-xl border border-[#E8E2D8]">
              {app.application_no ? (
                `Application ${app.application_no} (${app.application_type}) is currently in the ${STAGE_LABELS[app.current_stage] || app.current_stage} stage with status '${app.status}'. Next required administrative action is for the scrutiny officer to review submitted evidence against AICTE approval guidelines.`
              ) : 'Loading summary...'}
            </p>

            <div className="pt-2 border-t border-[#E8E2D8] flex items-center justify-between">
              <span className="text-[11px] text-stone-400">
                Word count: ~35 words (Max statutory limit: 150 words)
              </span>
              <button
                onClick={() => {
                  setShowReasonFor('return');
                  setReasonInput('1. Discrepancy observed in faculty land ownership affidavit.\n2. Incomplete fire NOC endorsement.');
                }}
                className="text-xs font-medium text-[#C25E26] hover:underline flex items-center gap-1 cursor-pointer"
              >
                Generate Deficiency Draft Notice →
              </button>
            </div>
          </div>

          {/* Stage History */}
          <div className="bg-white rounded-2xl border border-[#E8E2D8] p-5 shadow-2xs">
            <h2 className="text-sm font-serif font-bold text-[#1C1917] uppercase tracking-wider mb-4">Stage History</h2>
            <div className="space-y-3">
              {(timeline?.stage_history || []).map((sh, i) => (
                <div key={sh.id} className="flex gap-3 items-start">
                  <div className="flex-shrink-0 w-7 h-7 rounded-full bg-[#FBF0E4] text-[#C25E26] border border-[#F0D5BE] flex items-center justify-center">
                    <span className="text-[10px] font-bold">{i + 1}</span>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-[#1C1917]">
                      {sh.from_stage ? `${STAGE_LABELS[sh.from_stage] || sh.from_stage} → ` : ''}{STAGE_LABELS[sh.to_stage] || sh.to_stage}
                      <span className="ml-2 text-xs text-stone-400 font-normal capitalize">({sh.action})</span>
                    </div>
                    {sh.reason && <p className="text-xs text-stone-500 mt-0.5 italic">"{sh.reason}"</p>}
                    <p className="text-xs text-stone-400 mt-0.5">{new Date(sh.entered_at).toLocaleString()}</p>
                  </div>
                </div>
              ))}
              {!timeline?.stage_history?.length && (
                <p className="text-sm text-stone-400">No stage history yet.</p>
              )}
            </div>
          </div>
        </div>

        {/* Right column - Details & Audit */}
        <div className="space-y-5">
          {/* Key info */}
          <div className="bg-white rounded-2xl border border-[#E8E2D8] p-5 space-y-3 shadow-2xs">
            <h2 className="text-sm font-serif font-bold text-[#1C1917] uppercase tracking-wider">Details</h2>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-stone-500">Submitted</dt>
                <dd className="font-medium text-[#1C1917]">{new Date(app.submitted_at).toLocaleDateString()}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-stone-500">Stage entered</dt>
                <dd className="font-medium text-[#1C1917]">{new Date(app.stage_entered_at).toLocaleDateString()}</dd>
              </div>
              {app.due_at && (
                <div className="flex justify-between">
                  <dt className="text-stone-500">Due date</dt>
                  <dd className={`font-medium ${new Date(app.due_at) < new Date() ? 'text-red-600' : 'text-[#1C1917]'}`}>
                    {new Date(app.due_at).toLocaleDateString()}
                  </dd>
                </div>
              )}
            </dl>
          </div>

          {/* Audit Tail */}
          <div className="bg-white rounded-2xl border border-[#E8E2D8] p-5 shadow-2xs">
            <h2 className="text-sm font-serif font-bold text-[#1C1917] uppercase tracking-wider mb-4">Recent Audit Entries</h2>
            <div className="space-y-2">
              {(timeline?.audit_entries || []).slice(-5).reverse().map(e => (
                <div key={e.seq} className="text-xs p-2.5 rounded-xl bg-[#FAF7F2] border border-[#E8E2D8]">
                  <div className="font-medium text-[#1C1917]">{e.action}</div>
                  <div className="text-stone-500 mt-0.5">{e.actor_role} · {new Date(e.created_at).toLocaleString()}</div>
                </div>
              ))}
              {!timeline?.audit_entries?.length && (
                <p className="text-xs text-stone-400">No audit entries yet.</p>
              )}
            </div>
          </div>

          {/* Advisory notice */}
          <div className="p-3.5 rounded-xl border border-[#E8E2D8] bg-[#FAF7F2] text-xs text-stone-500 text-center">
            Advisory only — final decisions rest with the competent authority.
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ApplicationDetailPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#FAF7F2] flex items-center justify-center p-8">
        <div className="flex items-center gap-3 text-stone-600">
          <Loader2 className="w-5 h-5 animate-spin text-[#C25E26]" />
          <span>Loading application...</span>
        </div>
      </div>
    }>
      <ApplicationDetailContent />
    </Suspense>
  );
}

