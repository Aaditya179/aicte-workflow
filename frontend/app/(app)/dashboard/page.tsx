'use client';

import React, { useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import {
  FileText, ShieldAlert, AlertTriangle, FastForward,
  Clock, ArrowRight, UserCheck, Building2, CheckCircle2,
  ChevronRight, Sparkles, Loader2, BarChart3, Users,
  Layers, Shield, Download, FileSpreadsheet
} from 'lucide-react';

interface BureauDashboardData {
  kpis: {
    open_applications: number;
    overdue_applications: number;
    evcs_due: number;
    expiring_documents: number;
    sla_compliance_rate: number;
    simulated_time: string;
  };
  region_summary: Array<{
    region_id: string;
    region_name: string;
    overdue_applications: number;
    overdue_evcs: number;
    overdue_undertakings: number;
    expired_documents: number;
  }>;
  stage_funnel: Array<{
    stage: string;
    open_cases: number;
    overdue_cases: number;
    avg_age_days: number;
  }>;
  officer_workload: Array<{
    officer_id: string;
    officer_name: string;
    officer_role: string;
    region_name: string;
    open_cases: number;
    overdue_cases: number;
    avg_case_age_days: number;
  }>;
  escalations: Array<{
    id: string;
    kind: string;
    severity: string;
    message: string;
    fired_at: string;
  }>;
  urgent_case_queue?: Array<{
    id: string;
    application_no: string;
    current_stage: string;
    status: string;
    days_left: number | null;
    is_overdue: boolean;
    institutions?: {
      name: string;
      city: string;
    };
  }>;
}

interface OfficerDashboardData {
  kpis: {
    total_assigned: number;
    due_today: number;
    due_this_week: number;
    overdue: number;
  };
  cases: {
    overdue: any[];
    due_today: any[];
    due_this_week: any[];
    upcoming: any[];
  };
}

interface InstitutionDashboardData {
  institution: any;
  health_score: number;
  applications: any[];
  undertakings: any[];
  documents: any[];
}

function DashboardContent() {
  const router = useRouter();
  const [role, setRole] = useState<string>('bureau_officer');
  const [userName, setUserName] = useState<string>('Officer');
  const [token, setToken] = useState<string>('');
  const [loading, setLoading] = useState(true);

  // Role data
  const [bureauData, setBureauData] = useState<BureauDashboardData | null>(null);
  const [officerData, setOfficerData] = useState<OfficerDashboardData | null>(null);
  const [institutionData, setInstitutionData] = useState<InstitutionDashboardData | null>(null);

  useEffect(() => {
    loadDashboard();

    // Realtime listener for live updates
    const channel = supabase
      .channel('dashboard-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'alerts' }, () => {
        loadDashboard();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'applications' }, () => {
        loadDashboard();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function loadDashboard() {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      router.push('/login');
      return;
    }

    const userRole = session.user.app_metadata?.role || session.user.user_metadata?.role || 'bureau_officer';
    setRole(userRole);
    setToken(session.access_token);
    setUserName(session.user.user_metadata?.full_name || session.user.email?.split('@')[0] || 'User');

    const rawApi = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    const apiBase = rawApi.replace(/\/api\/v1\/?$/, '');
    const headers = { Authorization: `Bearer ${session.access_token}` };

    try {
      if (userRole === 'admin' || userRole === 'bureau_officer') {
        const res = await fetch(`${apiBase}/api/v1/dashboard/bureau`, { headers });
        if (res.ok) setBureauData(await res.json());
      } else if (userRole === 'regional_officer') {
        const res = await fetch(`${apiBase}/api/v1/dashboard/regional`, { headers });
        if (res.ok) setBureauData(await res.json());
      } else if (userRole === 'scrutiny_officer' || userRole === 'evc_member') {
        const res = await fetch(`${apiBase}/api/v1/dashboard/officer`, { headers });
        if (res.ok) setOfficerData(await res.json());
      } else if (userRole === 'institution') {
        const res = await fetch(`${apiBase}/api/v1/dashboard/institution`, { headers });
        if (res.ok) setInstitutionData(await res.json());
      }
    } catch (err) {
      console.error('Failed to load dashboard:', err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center">
        <div className="flex items-center gap-3 text-slate-500 text-sm">
          <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
          <span>Synchronizing real-time governance metrics...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-blue-700 via-indigo-700 to-slate-900 rounded-3xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 opacity-10 pointer-events-none flex items-center pr-8">
          <Building2 className="w-64 h-64" />
        </div>
        <div className="relative z-10 max-w-2xl">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md text-xs font-semibold mb-3 border border-white/20">
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            AICTE National SLA Monitoring Portal
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            Welcome, {userName}
          </h1>
          <p className="text-sm text-blue-100 mt-2 leading-relaxed">
            Logged in as <strong className="capitalize text-white">{role.replace(/_/g, ' ')}</strong>. Monitor real-time SLA adherence, institutional compliance, and workflow progressions.
          </p>

          <div className="flex flex-wrap items-center gap-3 mt-6">
            <Link
              href="/applications"
              className="px-4 py-2 rounded-xl bg-white text-blue-900 font-bold text-xs hover:bg-blue-50 transition shadow-sm inline-flex items-center gap-1.5"
            >
              <FileText className="w-4 h-4 text-blue-700" />
              Applications Queue
            </Link>
            <Link
              href="/reports"
              className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold text-xs transition border border-white/20 inline-flex items-center gap-1.5"
            >
              <BarChart3 className="w-4 h-4 text-emerald-300" />
              Download Reports (PDF / Excel)
            </Link>
            {(role === 'admin' || role === 'bureau_officer') && (
              <Link
                href="/admin/simulator"
                className="px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs transition shadow-sm inline-flex items-center gap-1.5"
              >
                <FastForward className="w-4 h-4" />
                Time Simulator
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Advisory Banner */}
      <div className="p-3 bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded-xl flex items-center gap-2 text-xs text-blue-700 dark:text-blue-300">
        <Shield className="w-4 h-4 shrink-0" />
        <span>Advisory only, final decisions rest with the competent authority.</span>
      </div>

      {/* 1. Bureau & Regional Officer View */}
      {bureauData && (
        <div className="space-y-8">
          {/* KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Open Cases</span>
              <div className="text-3xl font-extrabold text-slate-900 dark:text-white mt-2">
                {bureauData.kpis.open_applications}
              </div>
              <span className="text-[11px] text-blue-600 font-medium">Active in workflow</span>
            </div>

            <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
              <span className="text-xs font-semibold text-red-600 dark:text-red-400 uppercase tracking-wider block">Overdue SLA</span>
              <div className="text-3xl font-extrabold text-red-600 dark:text-red-400 mt-2">
                {bureauData.kpis.overdue_applications}
              </div>
              <span className="text-[11px] text-red-500 font-medium">Breached stage due_at</span>
            </div>

            <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
              <span className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider block">EVC Visits Due</span>
              <div className="text-3xl font-extrabold text-amber-600 dark:text-amber-400 mt-2">
                {bureauData.kpis.evcs_due}
              </div>
              <span className="text-[11px] text-amber-500 font-medium">Pending schedule/report</span>
            </div>

            <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
              <span className="text-xs font-semibold text-purple-600 dark:text-purple-400 uppercase tracking-wider block">Expired Docs</span>
              <div className="text-3xl font-extrabold text-purple-600 dark:text-purple-400 mt-2">
                {bureauData.kpis.expiring_documents}
              </div>
              <span className="text-[11px] text-purple-500 font-medium">Needs renewal upload</span>
            </div>

            <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm col-span-2 lg:col-span-1">
              <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider block">SLA Compliance</span>
              <div className="text-3xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-2">
                {bureauData.kpis.sla_compliance_rate}%
              </div>
              <span className="text-[11px] text-emerald-500 font-medium">On-time clearance rate</span>
            </div>
          </div>

          {/* Regional Urgent Case Queue (For Regional Officers) */}
          {bureauData.urgent_case_queue && bureauData.urgent_case_queue.length > 0 && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Clock className="w-5 h-5 text-amber-500" />
                    Urgent Regional Case Queue
                  </h3>
                  <p className="text-xs text-slate-500">Sorted by closest deadline (due_at relative to simulated time)</p>
                </div>
                <Link href="/applications" className="text-xs font-semibold text-blue-600 hover:underline">
                  Full Queue →
                </Link>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-800 text-xs font-semibold text-slate-600 dark:text-slate-300">
                    <tr>
                      <th className="py-2.5 px-4">Application</th>
                      <th className="py-2.5 px-4">Institution</th>
                      <th className="py-2.5 px-4">Current Stage</th>
                      <th className="py-2.5 px-4">Urgency / Days Left</th>
                      <th className="py-2.5 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {bureauData.urgent_case_queue.map((c) => (
                      <tr key={c.id} className="hover:bg-slate-50/50">
                        <td className="py-2.5 px-4 font-mono font-medium">{c.application_no}</td>
                        <td className="py-2.5 px-4">{c.institutions?.name || 'Institution'}</td>
                        <td className="py-2.5 px-4 capitalize text-xs">{c.current_stage}</td>
                        <td className="py-2.5 px-4">
                          {c.is_overdue ? (
                            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300">
                              OVERDUE ({c.days_left}d)
                            </span>
                          ) : (
                            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                              {c.days_left} days remaining
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-4 text-right">
                          <Link
                            href={`/applications/${c.id}`}
                            className="px-2.5 py-1 text-xs font-semibold rounded-md bg-blue-50 text-blue-700 hover:bg-blue-100 transition"
                          >
                            Review Case
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Regional Summary & Stage Funnel */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Regional Overdue Table */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
              <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1 flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-indigo-600" />
                Regional Overdue Governance Matrix
              </h3>
              <p className="text-xs text-slate-500 mb-4">Live evaluation from SQL view `v_overdue_summary`</p>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800 font-semibold text-slate-600 dark:text-slate-300">
                    <tr>
                      <th className="py-2 px-3">Region</th>
                      <th className="py-2 px-3">Apps Overdue</th>
                      <th className="py-2 px-3">EVCs Overdue</th>
                      <th className="py-2 px-3">Undertakings</th>
                      <th className="py-2 px-3">Expired Docs</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {bureauData.region_summary.map((r) => (
                      <tr key={r.region_id}>
                        <td className="py-2.5 px-3 font-semibold">{r.region_name}</td>
                        <td className="py-2.5 px-3 font-mono font-bold text-red-600">{r.overdue_applications}</td>
                        <td className="py-2.5 px-3 font-mono text-amber-600">{r.overdue_evcs}</td>
                        <td className="py-2.5 px-3 font-mono text-slate-700 dark:text-slate-300">{r.overdue_undertakings}</td>
                        <td className="py-2.5 px-3 font-mono text-purple-600">{r.expired_documents}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Stage Bottlenecks Funnel */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
              <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1 flex items-center gap-2">
                <Layers className="w-5 h-5 text-blue-600" />
                Stage Pendency & Bottlenecks
              </h3>
              <p className="text-xs text-slate-500 mb-4">Calculated from `v_pendency_by_stage_region`</p>
              <div className="space-y-3">
                {bureauData.stage_funnel.map((s) => (
                  <div key={s.stage} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-bold text-slate-900 dark:text-white uppercase tracking-wider">{s.stage}</span>
                      <span className="text-slate-500">Avg {s.avg_age_days} days in stage</span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-300 font-mono">
                      <span>Open: <strong>{s.open_cases}</strong></span>
                      <span className="text-red-600">Overdue: <strong>{s.overdue_cases}</strong></span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Officer Workload Table */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
            <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1 flex items-center gap-2">
              <Users className="w-5 h-5 text-indigo-600" />
              Officer Workload & SLA Performance
            </h3>
            <p className="text-xs text-slate-500 mb-4">Real-time allocation from SQL view `v_officer_workload`</p>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800 font-semibold text-slate-600 dark:text-slate-300">
                  <tr>
                    <th className="py-2.5 px-4">Officer Name</th>
                    <th className="py-2.5 px-4">Role</th>
                    <th className="py-2.5 px-4">Region</th>
                    <th className="py-2.5 px-4">Open Cases</th>
                    <th className="py-2.5 px-4">Overdue Cases</th>
                    <th className="py-2.5 px-4">Avg Case Age</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {bureauData.officer_workload.map((o) => (
                    <tr key={o.officer_id}>
                      <td className="py-2.5 px-4 font-semibold text-slate-900 dark:text-white">{o.officer_name}</td>
                      <td className="py-2.5 px-4 capitalize">{o.officer_role.replace(/_/g, ' ')}</td>
                      <td className="py-2.5 px-4">{o.region_name || 'HQ'}</td>
                      <td className="py-2.5 px-4 font-mono font-medium">{o.open_cases}</td>
                      <td className="py-2.5 px-4 font-mono font-bold text-red-600">{o.overdue_cases}</td>
                      <td className="py-2.5 px-4 font-mono">{o.avg_case_age_days}d</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 2. Individual Officer View */}
      {officerData && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
              <span className="text-xs font-semibold text-slate-500 uppercase">Total Assigned</span>
              <div className="text-3xl font-extrabold text-slate-900 dark:text-white mt-2">
                {officerData.kpis.total_assigned}
              </div>
            </div>
            <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
              <span className="text-xs font-semibold text-red-600 uppercase">Overdue Cases</span>
              <div className="text-3xl font-extrabold text-red-600 mt-2">
                {officerData.kpis.overdue}
              </div>
            </div>
            <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
              <span className="text-xs font-semibold text-amber-600 uppercase">Due Today</span>
              <div className="text-3xl font-extrabold text-amber-600 mt-2">
                {officerData.kpis.due_today}
              </div>
            </div>
            <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
              <span className="text-xs font-semibold text-blue-600 uppercase">Due This Week</span>
              <div className="text-3xl font-extrabold text-blue-600 mt-2">
                {officerData.kpis.due_this_week}
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
            <h3 className="text-base font-bold text-slate-900 dark:text-white mb-4">My Assigned Cases</h3>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {[...officerData.cases.overdue, ...officerData.cases.due_today, ...officerData.cases.due_this_week, ...officerData.cases.upcoming].map((c) => (
                <div key={c.id} className="py-3 flex items-center justify-between">
                  <div>
                    <span className="font-mono font-bold text-sm">{c.application_no}</span>
                    <span className="text-xs text-slate-500 ml-2">· {c.institutions?.name}</span>
                  </div>
                  <Link
                    href={`/applications/${c.id}`}
                    className="px-3 py-1 text-xs font-semibold rounded-lg bg-blue-600 text-white"
                  >
                    Open
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 3. Institution View */}
      {institutionData && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-6 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-700 text-white shadow-lg">
              <span className="text-xs font-bold uppercase tracking-wider opacity-90">Institutional Health Score</span>
              <div className="text-5xl font-black mt-3">
                {institutionData.health_score}<span className="text-2xl font-normal opacity-80">/100</span>
              </div>
              <p className="text-xs mt-2 opacity-90">
                {institutionData.health_score >= 80 ? 'Excellent compliance track record' : 'Action needed on pending undertakings'}
              </p>
            </div>

            <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
              <span className="text-xs font-semibold text-slate-500 uppercase">My Applications</span>
              <div className="text-3xl font-extrabold text-slate-900 dark:text-white mt-2">
                {institutionData.applications.length}
              </div>
              <span className="text-xs text-blue-600 font-medium">In academic year 2026-27</span>
            </div>

            <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
              <span className="text-xs font-semibold text-slate-500 uppercase">Statutory Documents</span>
              <div className="text-3xl font-extrabold text-slate-900 dark:text-white mt-2">
                {institutionData.documents.length}
              </div>
              <span className="text-xs text-emerald-600 font-medium">Registered in system</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="max-w-7xl mx-auto px-4 py-8">Loading Portal Dashboard...</div>}>
      <DashboardContent />
    </Suspense>
  );
}
