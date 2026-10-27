'use client';

import React, { useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import { fetchApi } from '@/lib/api';
import {
  FastForward, RotateCcw, Play, Clock, ShieldAlert,
  AlertTriangle, CheckCircle2, ChevronRight, Loader2, ArrowRight
} from 'lucide-react';

interface ClockStatus {
  clock_now: string;
  actual_utc: string;
  offset_seconds: number;
  offset_days: number;
  is_simulated: boolean;
}

interface SchedulerRun {
  id: string;
  started_at: string;
  finished_at: string;
  clock_now: string;
  alerts_created: number;
  escalations_created: number;
  errors: string | null;
}

interface ApplicationCaseB {
  application_no: string;
  current_stage: string;
  stage_entered_at: string;
  due_at: string;
}

interface AlertEntry {
  id: string;
  kind: string;
  level: number;
  severity: string;
  status: string;
  target_role: string | null;
  fired_at: string;
}

function SimulatorContent() {
  const [clockStatus, setClockStatus] = useState<ClockStatus | null>(null);
  const [schedulerRuns, setSchedulerRuns] = useState<SchedulerRun[]>([]);
  const [caseB, setCaseB] = useState<ApplicationCaseB | null>(null);
  const [caseBAlerts, setCaseBAlerts] = useState<AlertEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [customDays, setCustomDays] = useState('1');
  const [lastRunResult, setLastRunResult] = useState<any>(null);

  const loadData = async () => {
    setLoading(true);
    // The admin has no case access, so Case B timing comes from a dedicated admin endpoint
    const [clockRes, runsRes, caseRes] = await Promise.all([
      fetchApi<ClockStatus>('/admin/clock'),
      fetchApi<SchedulerRun[]>('/admin/scheduler/runs?limit=8'),
      fetchApi<{ case: ApplicationCaseB | null; alerts: AlertEntry[] }>('/admin/clock/demo-case'),
    ]);

    if (clockRes.data) setClockStatus(clockRes.data);
    if (runsRes.data) setSchedulerRuns(runsRes.data);
    if (caseRes.data) {
      setCaseB(caseRes.data.case);
      setCaseBAlerts(caseRes.data.alerts);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const advanceClock = async (days: number) => {
    setActionLoading(true);
    const { data } = await fetchApi<{
      ok: boolean;
      new_clock_now: string;
      offset_days: number;
      scheduler_run: any;
    }>('/admin/clock/advance', {
      method: 'POST',
      body: JSON.stringify({ days }),
    });
    setActionLoading(false);
    if (data) {
      setLastRunResult(data.scheduler_run);
      loadData();
    }
  };

  const resetClock = async () => {
    setActionLoading(true);
    const { data } = await fetchApi('/admin/clock/reset', { method: 'POST' });
    setActionLoading(false);
    if (data) {
      setLastRunResult(null);
      loadData();
    }
  };

  const triggerSchedulerRun = async () => {
    setActionLoading(true);
    const { data } = await fetchApi<{ ok: boolean; run: any }>('/admin/scheduler/run', {
      method: 'POST',
    });
    setActionLoading(false);
    if (data) {
      setLastRunResult(data.run);
      loadData();
    }
  };

  // Case B deadline calculations relative to simulated time
  const simNow = clockStatus ? new Date(clockStatus.clock_now).getTime() : null;
  const caseBDue = caseB ? new Date(caseB.due_at).getTime() : null;
  const daysDiff = simNow !== null && caseBDue !== null ? (caseBDue - simNow) / 86400000 : 0;
  const isOverdue = daysDiff < 0;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 pb-6 border-b border-[#E8E2D8]">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-serif font-bold tracking-tight text-stone-900">
              Time-Travel Simulator
            </h1>
            <span className="text-xs font-medium px-3 py-1 rounded-full bg-[#FBF0E4] text-[#C25E26] border border-[#F0D5BE]">
              Admin & Testing
            </span>
          </div>
          <p className="text-sm text-stone-600 mt-1 font-sans">
            Shift the simulated clock to test SLA reminder rules, overdue thresholds, and 3-tier escalation chains in seconds.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={triggerSchedulerRun}
            disabled={actionLoading}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full border border-[#E8E2D8] bg-white text-xs font-semibold text-stone-700 hover:bg-[#FAF7F2] transition shadow-2xs disabled:opacity-50"
          >
            <Play className="w-3.5 h-3.5 text-[#C25E26]" />
            Run Scheduler Pass
          </button>
          <button
            onClick={resetClock}
            disabled={actionLoading || clockStatus?.offset_days === 0}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#C25E26] hover:bg-[#A84A19] text-white text-xs font-semibold transition shadow-2xs disabled:opacity-50"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset to Real UTC
          </button>
        </div>
      </div>

      {/* Clock Status Banner */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="p-5 rounded-2xl border border-[#E8E2D8] bg-white shadow-2xs">
          <span className="text-xs font-semibold text-stone-500 uppercase tracking-wider">Simulated Time</span>
          <div className="text-xl font-mono font-bold text-stone-900 mt-2">
            {clockStatus ? new Date(clockStatus.clock_now).toLocaleString() : 'Loading...'}
          </div>
          <div className="mt-2.5 flex items-center gap-1.5 text-xs">
            {clockStatus?.is_simulated ? (
              <span className="px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 font-semibold inline-flex items-center gap-1">
                <FastForward className="w-3 h-3 text-amber-600" /> Offset: +{clockStatus.offset_days} days
              </span>
            ) : (
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 font-semibold inline-flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Real UTC (Synced)
              </span>
            )}
          </div>
        </div>

        <div className="p-5 rounded-2xl border border-[#E8E2D8] bg-white shadow-2xs">
          <span className="text-xs font-semibold text-stone-500 uppercase tracking-wider">Real System Clock</span>
          <div className="text-xl font-mono font-bold text-stone-700 mt-2">
            {clockStatus ? new Date(clockStatus.actual_utc).toLocaleString() : 'Loading...'}
          </div>
          <div className="mt-2.5 text-xs text-stone-500">
            Postgres <code className="text-[#C25E26] bg-[#FBF0E4] px-1 py-0.5 rounded">app_now()</code> evaluates against simulated offset.
          </div>
        </div>

        <div className="p-5 rounded-2xl border border-[#E8E2D8] bg-[#FAF7F2] shadow-2xs flex flex-col justify-between">
          <div>
            <span className="text-xs font-semibold text-[#C25E26] uppercase tracking-wider">Last Scheduler Execution</span>
            <div className="text-xs text-stone-700 mt-2 space-y-0.5">
              {lastRunResult ? (
                <div>
                  <p><strong>Alerts Created:</strong> {lastRunResult.alerts_created}</p>
                  <p><strong>Escalations:</strong> {lastRunResult.escalations_created}</p>
                  <p className="text-[10px] text-stone-500 mt-1">Finished: {new Date(lastRunResult.finished_at).toLocaleTimeString()}</p>
                </div>
              ) : schedulerRuns.length > 0 ? (
                <div>
                  <p><strong>Alerts Created:</strong> {schedulerRuns[0].alerts_created}</p>
                  <p><strong>Escalations:</strong> {schedulerRuns[0].escalations_created}</p>
                  <p className="text-[10px] text-stone-500 mt-1">Last run: {new Date(schedulerRuns[0].finished_at).toLocaleTimeString()}</p>
                </div>
              ) : (
                <p className="text-stone-500">No runs recorded yet.</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Time-Jump Controls Panel */}
      <div className="bg-white rounded-2xl border border-[#E8E2D8] p-6 mb-8 shadow-2xs">
        <h2 className="text-lg font-serif font-bold text-stone-900 mb-1">Advance Clock</h2>
        <p className="text-xs text-stone-600 mb-5">
          Select a predefined jump to trigger the spec scenarios, or enter custom days.
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <button
            onClick={() => advanceClock(1)}
            disabled={actionLoading}
            className="p-3.5 rounded-xl border border-[#E8E2D8] bg-[#FAF7F2] hover:border-[#C25E26] text-left transition disabled:opacity-50"
          >
            <div className="text-sm font-bold text-stone-900">+1 Day</div>
            <div className="text-[11px] text-stone-500 mt-0.5">Progress SLA cycle</div>
          </button>

          <button
            onClick={() => advanceClock(3)}
            disabled={actionLoading}
            className="p-3.5 rounded-xl border border-amber-200 bg-amber-50/50 hover:border-amber-400 text-left transition disabled:opacity-50"
          >
            <div className="text-sm font-bold text-amber-800 flex items-center justify-between">
              +3 Days
              <AlertTriangle className="w-4 h-4 text-amber-600" />
            </div>
            <div className="text-[11px] text-stone-600 mt-0.5">Triggers Overdue & Level 1</div>
          </button>

          <button
            onClick={() => advanceClock(7)}
            disabled={actionLoading}
            className="p-3.5 rounded-xl border border-rose-200 bg-rose-50/50 hover:border-rose-400 text-left transition disabled:opacity-50"
          >
            <div className="text-sm font-bold text-rose-800 flex items-center justify-between">
              +7 Days
              <ShieldAlert className="w-4 h-4 text-rose-600" />
            </div>
            <div className="text-[11px] text-stone-600 mt-0.5">Triggers Level 2 Escalation</div>
          </button>

          <button
            onClick={() => advanceClock(10)}
            disabled={actionLoading}
            className="p-3.5 rounded-xl border border-rose-300 bg-rose-100/50 hover:border-rose-500 text-left transition disabled:opacity-50"
          >
            <div className="text-sm font-bold text-rose-900 flex items-center justify-between">
              +10 Days
              <ShieldAlert className="w-4 h-4 text-rose-700" />
            </div>
            <div className="text-[11px] text-stone-600 mt-0.5">Triggers Level 3 (Bureau)</div>
          </button>
        </div>

        {/* Custom Days Input */}
        <div className="flex items-center gap-3 pt-3 border-t border-[#E8E2D8]">
          <label className="text-xs font-semibold text-stone-700">
            Custom Jump:
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              step="0.5"
              value={customDays}
              onChange={(e) => setCustomDays(e.target.value)}
              className="w-24 px-3 py-1.5 rounded-xl border border-[#E8E2D8] text-xs bg-[#FAF7F2] text-stone-900 focus:outline-none focus:border-[#C25E26] font-bold text-center"
            />
            <span className="text-xs text-stone-500">days</span>
            <button
              onClick={() => advanceClock(parseFloat(customDays) || 1)}
              disabled={actionLoading}
              className="px-5 py-2 rounded-full bg-[#C25E26] hover:bg-[#A84A19] text-white text-xs font-semibold transition disabled:opacity-50 flex items-center gap-1.5 shadow-2xs"
            >
              {actionLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Advance
            </button>
          </div>
        </div>
      </div>

      {/* Case B Live Showcase Section */}
      <div className="bg-white rounded-2xl border border-[#E8E2D8] p-6 mb-8 shadow-2xs">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-lg font-serif font-bold text-stone-900">
                Case B: Demo Verification Target
              </h2>
              <span className="text-xs font-mono px-2.5 py-0.5 rounded-full bg-[#FBF0E4] text-[#C25E26] border border-[#F0D5BE] font-semibold">
                DEMO-CASE-B
              </span>
            </div>
            <p className="text-xs text-stone-500 mt-1">
              Spec §9 scripted case in Scrutiny stage. Watch alerts dynamically trigger as you jump the clock!
            </p>
          </div>

          {caseB && (
            <span className="text-xs text-stone-500">
              Sign in as the regional officer to open {caseB.application_no}
            </span>
          )}
        </div>

        {caseB ? (
          <div>
            {/* Case B Status Indicators */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-[#FAF7F2] border border-[#E8E2D8] rounded-xl mb-5 text-xs">
              <div>
                <span className="text-stone-500">Current Stage:</span>
                <p className="font-semibold text-stone-900 capitalize mt-0.5">
                  {caseB.current_stage}
                </p>
              </div>
              <div>
                <span className="text-stone-500">Stage Entered:</span>
                <p className="font-semibold text-stone-900 mt-0.5">
                  {new Date(caseB.stage_entered_at).toLocaleDateString()}
                </p>
              </div>
              <div>
                <span className="text-stone-500">Due Date:</span>
                <p className="font-semibold text-stone-900 mt-0.5">
                  {new Date(caseB.due_at).toLocaleDateString()}
                </p>
              </div>
              <div>
                <span className="text-stone-500">Current Status:</span>
                <p className="mt-0.5">
                  {isOverdue ? (
                    <span className="text-red-700 font-bold flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
                      Overdue by {Math.abs(Math.floor(daysDiff))} day(s)
                    </span>
                  ) : (
                    <span className="text-[#C25E26] font-semibold flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-[#C25E26]" />
                      Due in {Math.ceil(daysDiff)} day(s)
                    </span>
                  )}
                </p>
              </div>
            </div>

            {/* Fired Alerts for Case B */}
            <h3 className="text-xs font-semibold text-stone-700 uppercase tracking-wider mb-2">
              Fired Alerts for Case B ({caseBAlerts.length})
            </h3>
            {caseBAlerts.length === 0 ? (
              <p className="text-xs text-stone-400 italic">No alerts fired yet for Case B. Run scheduler or jump clock.</p>
            ) : (
              <div className="space-y-2">
                {caseBAlerts.map((a) => (
                  <div
                    key={a.id}
                    className="p-3 rounded-xl border border-[#E8E2D8] bg-[#FAF7F2] flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                          a.severity === 'critical'
                            ? 'bg-red-100 text-red-700 border border-red-200'
                            : a.severity === 'warning'
                            ? 'bg-amber-100 text-amber-700 border border-amber-200'
                            : 'bg-[#FBF0E4] text-[#C25E26] border border-[#F0D5BE]'
                        }`}
                      >
                        {a.severity}
                      </span>
                      <strong className="text-stone-900 capitalize">
                        {a.kind} {a.level > 0 && `(Level ${a.level})`}
                      </strong>
                      {a.target_role && (
                        <span className="text-stone-600">sent to {a.target_role.replace(/_/g, ' ')}</span>
                      )}
                    </div>
                    <span className="text-[10px] text-stone-400">
                      {new Date(a.fired_at).toLocaleTimeString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="p-6 text-center text-xs text-stone-400">
            Case B application not found. Ensure database is seeded.
          </div>
        )}
      </div>

      {/* Recent Scheduler Runs Table */}
      <div className="bg-white rounded-2xl border border-[#E8E2D8] p-6 shadow-2xs">
        <h2 className="text-lg font-serif font-bold text-stone-900 mb-4">Recent Scheduler Runs</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[#E8E2D8] text-stone-500 uppercase text-[11px]">
                <th className="pb-3 font-semibold">Run ID</th>
                <th className="pb-3 font-semibold">Started At</th>
                <th className="pb-3 font-semibold">Clock Time During Run</th>
                <th className="pb-3 font-semibold">Alerts Created</th>
                <th className="pb-3 font-semibold">Escalations</th>
                <th className="pb-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E8E2D8]">
              {schedulerRuns.map((r) => (
                <tr key={r.id} className="hover:bg-[#FAF7F2] transition">
                  <td className="py-2.5 font-mono text-[11px] text-stone-500">{r.id.slice(0, 8)}...</td>
                  <td className="py-2.5 text-stone-700">{new Date(r.started_at).toLocaleString()}</td>
                  <td className="py-2.5 text-stone-600">{new Date(r.clock_now).toLocaleString()}</td>
                  <td className="py-2.5 font-semibold text-stone-900">{r.alerts_created}</td>
                  <td className="py-2.5 font-semibold text-red-600">{r.escalations_created}</td>
                  <td className="py-2.5">
                    {r.errors ? (
                      <span className="text-red-600 font-semibold">Error: {r.errors}</span>
                    ) : (
                      <span className="text-emerald-700 font-semibold">Success</span>
                    )}
                  </td>
                </tr>
              ))}
              {schedulerRuns.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-stone-400">
                    No scheduler runs recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function TimeTravelSimulatorPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#FAF7F2] flex items-center justify-center p-8">
        <div className="flex items-center gap-3 text-stone-500">
          <Loader2 className="w-5 h-5 animate-spin text-[#C25E26]" />
          <span>Loading simulator...</span>
        </div>
      </div>
    }>
      <SimulatorContent />
    </Suspense>
  );
}

