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
  id: string;
  application_no: string;
  current_stage: string;
  status: string;
  submitted_at: string;
  stage_entered_at: string;
  due_at: string;
}

interface AlertEntry {
  id: string;
  kind: string;
  level: number;
  severity: string;
  message: string;
  status: string;
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
    const [clockRes, runsRes, appsRes] = await Promise.all([
      fetchApi<ClockStatus>('/admin/clock'),
      fetchApi<SchedulerRun[]>('/admin/scheduler/runs?limit=8'),
      fetchApi<any[]>('/applications?search=DEMO-CASE-B'),
    ]);

    if (clockRes.data) setClockStatus(clockRes.data);
    if (runsRes.data) setSchedulerRuns(runsRes.data);

    if (appsRes.data && appsRes.data.length > 0) {
      const b = appsRes.data[0];
      setCaseB(b);
      // Fetch alerts for Case B
      const alertsRes = await fetchApi<AlertEntry[]>(`/alerts?limit=50`);
      if (alertsRes.data) {
        setCaseBAlerts(alertsRes.data.filter((a: any) => a.entity_id === b.id));
      }
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
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Time-Travel Simulator
            </h1>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
              Admin & Testing
            </span>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Shift the simulated clock to test SLA reminder rules, overdue thresholds, and 3-tier escalation chains in seconds.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={triggerSchedulerRun}
            disabled={actionLoading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 transition disabled:opacity-50"
          >
            <Play className="w-3.5 h-3.5 text-blue-600" />
            Run Scheduler Pass
          </button>
          <button
            onClick={resetClock}
            disabled={actionLoading || clockStatus?.offset_days === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-950 text-xs font-semibold hover:bg-slate-800 dark:hover:bg-white transition disabled:opacity-50"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset to Real UTC
          </button>
        </div>
      </div>

      {/* Clock Status Banner */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Simulated Time</span>
          <div className="text-xl font-mono font-bold text-slate-900 dark:text-white mt-2">
            {clockStatus ? new Date(clockStatus.clock_now).toLocaleString() : 'Loading...'}
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-xs">
            {clockStatus?.is_simulated ? (
              <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 font-semibold inline-flex items-center gap-1">
                <FastForward className="w-3 h-3" /> Offset: +{clockStatus.offset_days} days
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 font-semibold inline-flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Real UTC (Synced)
              </span>
            )}
          </div>
        </div>

        <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Real System Clock</span>
          <div className="text-xl font-mono font-bold text-slate-700 dark:text-slate-300 mt-2">
            {clockStatus ? new Date(clockStatus.actual_utc).toLocaleString() : 'Loading...'}
          </div>
          <div className="mt-2 text-xs text-slate-400">
            Postgres `app_now()` evaluates against simulated offset.
          </div>
        </div>

        <div className="p-5 rounded-2xl border border-blue-200 dark:border-blue-900 bg-blue-50/50 dark:bg-blue-950/20 shadow-sm flex flex-col justify-between">
          <div>
            <span className="text-xs font-semibold text-blue-700 dark:text-blue-300 uppercase tracking-wider">Last Scheduler Execution</span>
            <div className="text-xs text-slate-700 dark:text-slate-300 mt-2">
              {lastRunResult ? (
                <div>
                  <p><strong>Alerts Created:</strong> {lastRunResult.alerts_created}</p>
                  <p><strong>Escalations:</strong> {lastRunResult.escalations_created}</p>
                  <p className="text-[10px] text-slate-400 mt-1">Finished: {new Date(lastRunResult.finished_at).toLocaleTimeString()}</p>
                </div>
              ) : schedulerRuns.length > 0 ? (
                <div>
                  <p><strong>Alerts Created:</strong> {schedulerRuns[0].alerts_created}</p>
                  <p><strong>Escalations:</strong> {schedulerRuns[0].escalations_created}</p>
                  <p className="text-[10px] text-slate-400 mt-1">Last run: {new Date(schedulerRuns[0].finished_at).toLocaleTimeString()}</p>
                </div>
              ) : (
                <p>No runs recorded yet.</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Time-Jump Controls Panel */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 mb-8 shadow-sm">
        <h2 className="text-base font-bold text-slate-900 dark:text-white mb-1">Advance Clock</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-5">
          Select a predefined jump to trigger the spec scenarios, or enter custom days.
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <button
            onClick={() => advanceClock(1)}
            disabled={actionLoading}
            className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-blue-500 hover:bg-blue-50/40 dark:hover:bg-blue-950/20 text-left transition disabled:opacity-50"
          >
            <div className="text-sm font-bold text-slate-900 dark:text-white">+1 Day</div>
            <div className="text-[11px] text-slate-500 mt-0.5">Progress SLA cycle</div>
          </button>

          <button
            onClick={() => advanceClock(3)}
            disabled={actionLoading}
            className="p-3 rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50/20 dark:bg-amber-950/10 hover:border-amber-500 text-left transition disabled:opacity-50"
          >
            <div className="text-sm font-bold text-amber-700 dark:text-amber-400 flex items-center justify-between">
              +3 Days
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">Triggers Overdue & Level 1</div>
          </button>

          <button
            onClick={() => advanceClock(7)}
            disabled={actionLoading}
            className="p-3 rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50/20 dark:bg-red-950/10 hover:border-red-500 text-left transition disabled:opacity-50"
          >
            <div className="text-sm font-bold text-red-700 dark:text-red-400 flex items-center justify-between">
              +7 Days
              <ShieldAlert className="w-4 h-4" />
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">Triggers Level 2 Escalation</div>
          </button>

          <button
            onClick={() => advanceClock(10)}
            disabled={actionLoading}
            className="p-3 rounded-xl border border-red-300 dark:border-red-800 bg-red-100/30 dark:bg-red-950/30 hover:border-red-600 text-left transition disabled:opacity-50"
          >
            <div className="text-sm font-bold text-red-800 dark:text-red-300 flex items-center justify-between">
              +10 Days
              <ShieldAlert className="w-4 h-4" />
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">Triggers Level 3 (Bureau)</div>
          </button>
        </div>

        {/* Custom Days Input */}
        <div className="flex items-center gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
          <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
            Custom Jump:
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              step="0.5"
              value={customDays}
              onChange={(e) => setCustomDays(e.target.value)}
              className="w-24 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs bg-slate-50 dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-xs text-slate-500">days</span>
            <button
              onClick={() => advanceClock(parseFloat(customDays) || 1)}
              disabled={actionLoading}
              className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition disabled:opacity-50 flex items-center gap-1.5"
            >
              {actionLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Advance
            </button>
          </div>
        </div>
      </div>

      {/* Case B Live Showcase Section */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 mb-8 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Case B: Demo Verification Target
              </h2>
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-semibold">
                DEMO-CASE-B
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Spec §9 scripted case in Scrutiny stage. Watch alerts dynamically trigger as you jump the clock!
            </p>
          </div>

          {caseB && (
            <Link
              href={`/applications/${caseB.id}`}
              className="text-xs text-blue-600 font-semibold hover:underline inline-flex items-center gap-1"
            >
              Open Application <ArrowRight className="w-3 h-3" />
            </Link>
          )}
        </div>

        {caseB ? (
          <div>
            {/* Case B Status Indicators */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-slate-50 dark:bg-slate-800/40 rounded-xl mb-5 text-xs">
              <div>
                <span className="text-slate-400">Current Stage:</span>
                <p className="font-semibold text-slate-800 dark:text-slate-200 capitalize mt-0.5">
                  {caseB.current_stage}
                </p>
              </div>
              <div>
                <span className="text-slate-400">Stage Entered:</span>
                <p className="font-semibold text-slate-800 dark:text-slate-200 mt-0.5">
                  {new Date(caseB.stage_entered_at).toLocaleDateString()}
                </p>
              </div>
              <div>
                <span className="text-slate-400">Due Date:</span>
                <p className="font-semibold text-slate-800 dark:text-slate-200 mt-0.5">
                  {new Date(caseB.due_at).toLocaleDateString()}
                </p>
              </div>
              <div>
                <span className="text-slate-400">Current Status:</span>
                <p className="mt-0.5">
                  {isOverdue ? (
                    <span className="text-red-600 dark:text-red-400 font-bold flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      Overdue by {Math.abs(Math.floor(daysDiff))} day(s)
                    </span>
                  ) : (
                    <span className="text-blue-600 dark:text-blue-400 font-semibold flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      Due in {Math.ceil(daysDiff)} day(s)
                    </span>
                  )}
                </p>
              </div>
            </div>

            {/* Fired Alerts for Case B */}
            <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
              Fired Alerts for Case B ({caseBAlerts.length})
            </h3>
            {caseBAlerts.length === 0 ? (
              <p className="text-xs text-slate-400 italic">No alerts fired yet for Case B. Run scheduler or jump clock.</p>
            ) : (
              <div className="space-y-2">
                {caseBAlerts.map((a) => (
                  <div
                    key={a.id}
                    className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                          a.severity === 'critical'
                            ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300'
                            : a.severity === 'warning'
                            ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                            : 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                        }`}
                      >
                        {a.severity}
                      </span>
                      <strong className="text-slate-700 dark:text-slate-200 capitalize">
                        {a.kind} {a.level > 0 && `(Level ${a.level})`}
                      </strong>
                      <span className="text-slate-500">— {a.message}</span>
                    </div>
                    <span className="text-[10px] text-slate-400">
                      {new Date(a.fired_at).toLocaleTimeString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="p-6 text-center text-xs text-slate-400">
            Case B application not found. Ensure database is seeded.
          </div>
        )}
      </div>

      {/* Recent Scheduler Runs Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
        <h2 className="text-base font-bold text-slate-900 dark:text-white mb-4">Recent Scheduler Runs</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                <th className="pb-3 font-semibold">Run ID</th>
                <th className="pb-3 font-semibold">Started At</th>
                <th className="pb-3 font-semibold">Clock Time During Run</th>
                <th className="pb-3 font-semibold">Alerts Created</th>
                <th className="pb-3 font-semibold">Escalations</th>
                <th className="pb-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {schedulerRuns.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className="py-2.5 font-mono text-[11px] text-slate-500">{r.id.slice(0, 8)}...</td>
                  <td className="py-2.5 text-slate-700 dark:text-slate-300">{new Date(r.started_at).toLocaleString()}</td>
                  <td className="py-2.5 text-slate-600 dark:text-slate-400">{new Date(r.clock_now).toLocaleString()}</td>
                  <td className="py-2.5 font-semibold text-slate-800 dark:text-slate-200">{r.alerts_created}</td>
                  <td className="py-2.5 font-semibold text-red-600 dark:text-red-400">{r.escalations_created}</td>
                  <td className="py-2.5">
                    {r.errors ? (
                      <span className="text-red-600 font-semibold">Error: {r.errors}</span>
                    ) : (
                      <span className="text-emerald-600 font-semibold">Success</span>
                    )}
                  </td>
                </tr>
              ))}
              {schedulerRuns.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-slate-400">
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
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-8">
        <div className="flex items-center gap-3 text-slate-500">
          <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
          <span>Loading simulator...</span>
        </div>
      </div>
    }>
      <SimulatorContent />
    </Suspense>
  );
}

