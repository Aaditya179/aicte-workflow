'use client';

import React, { useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import NextComplianceItems from '@/components/NextComplianceItems';
import DailyBrief from '@/components/DailyBrief';
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

    // The administrator and auditor have no case dashboard (§15.0)
    if (userRole === 'admin' || userRole === 'auditor') {
      router.replace(userRole === 'admin' ? '/admin' : '/audit');
      return;
    }

    try {
      if (userRole === 'bureau_officer') {
        const res = await fetch(`${apiBase}/api/v1/dashboard/bureau`, { headers });
        if (res.ok) setBureauData(await res.json());
      } else if (userRole === 'regional_officer') {
        const res = await fetch(`${apiBase}/api/v1/dashboard/regional`, { headers });
        if (res.ok) setBureauData(await res.json());
      } else if (userRole === 'scrutiny_officer' || userRole === 'evc_member' || userRole === 'sac_shc_member') {
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
        <div className="flex items-center gap-3 text-stone-600 text-sm">
          <Loader2 className="w-5 h-5 animate-spin text-[#C25E26]" />
          <span>Synchronizing real-time governance metrics...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Welcome Banner */}
      <div className="bg-white border border-[#E8E2D8] rounded-3xl p-6 sm:p-8 text-[#1C1917] shadow-xs relative overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 opacity-5 pointer-events-none flex items-center pr-8 text-[#1C1917]">
          <Building2 className="w-64 h-64" />
        </div>
        <div className="relative z-10 max-w-2xl">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FBF0E4] border border-[#F0D5BE] text-xs font-semibold mb-3 text-[#C25E26]">
            <Sparkles className="w-3.5 h-3.5 text-[#C25E26]" />
            Nirikshan • AICTE National SLA Monitoring Portal
          </div>
          <h1 className="text-2xl sm:text-3xl font-serif font-bold tracking-tight text-[#1C1917]">
            Welcome, {userName}
          </h1>
          <p className="text-sm text-stone-600 mt-2 leading-relaxed">
            Logged in as <strong className="capitalize text-[#1C1917]">{role.replace(/_/g, ' ')}</strong>. Monitor real-time SLA adherence, institutional compliance, and workflow progressions.
          </p>

          <div className="flex flex-wrap items-center gap-3 mt-6">
            <Link
              href="/applications"
              className="px-4 py-2 rounded-full bg-[#C25E26] hover:bg-[#A84A19] text-white font-medium text-xs transition shadow-2xs inline-flex items-center gap-1.5"
            >
              <FileText className="w-4 h-4 text-white" />
              Applications Queue
            </Link>
            <Link
              href="/reports"
              className="px-4 py-2 rounded-full border border-[#E8E2D8] bg-white hover:bg-[#FAF7F2] text-stone-700 font-medium text-xs transition shadow-2xs inline-flex items-center gap-1.5"
            >
              <BarChart3 className="w-4 h-4 text-[#C25E26]" />
              Download Reports (PDF / Excel)
            </Link>
            {(role === 'admin' || role === 'bureau_officer') && (
              <Link
                href="/admin/simulator"
                className="px-4 py-2 rounded-full bg-[#FBF0E4] hover:bg-[#F5EBE1] text-[#C25E26] border border-[#F0D5BE] font-medium text-xs transition shadow-2xs inline-flex items-center gap-1.5"
              >
                <FastForward className="w-4 h-4" />
                Time Simulator
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Advisory Banner */}
      <div className="p-3 bg-[#FBF0E4]/60 border border-[#F0D5BE] rounded-xl flex items-center gap-2 text-xs text-[#C25E26]">
        <Shield className="w-4 h-4 shrink-0" />
        <span>Advisory only, final decisions rest with the competent authority.</span>
      </div>

      <DailyBrief />

      {/* Institution: next three compliance items (§15.6) */}
      {role === 'institution' && <NextComplianceItems />}

      {/* 1. Bureau & Regional Officer View */}
      {bureauData && (
        <div className="space-y-8">
          {/* KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="p-5 rounded-2xl border border-[#E8E2D8] bg-white shadow-2xs">
              <span className="text-xs font-semibold text-stone-500 uppercase tracking-wider block">Open Cases</span>
              <div className="text-3xl font-serif font-bold text-[#1C1917] mt-2">
                {bureauData.kpis.open_applications}
              </div>
              <span className="text-[11px] text-[#C25E26] font-medium">Active in workflow</span>
            </div>

            <div className="p-5 rounded-2xl border border-[#E8E2D8] bg-white shadow-2xs">
              <span className="text-xs font-semibold text-red-700 uppercase tracking-wider block">Overdue SLA</span>
              <div className="text-3xl font-serif font-bold text-red-600 mt-2">
                {bureauData.kpis.overdue_applications}
              </div>
              <span className="text-[11px] text-red-500 font-medium">Breached stage due_at</span>
            </div>

            <div className="p-5 rounded-2xl border border-[#E8E2D8] bg-white shadow-2xs">
              <span className="text-xs font-semibold text-amber-700 uppercase tracking-wider block">EVC Visits Due</span>
              <div className="text-3xl font-serif font-bold text-amber-600 mt-2">
                {bureauData.kpis.evcs_due}
              </div>
              <span className="text-[11px] text-amber-600 font-medium">Pending schedule/report</span>
            </div>

            <div className="p-5 rounded-2xl border border-[#E8E2D8] bg-white shadow-2xs">
              <span className="text-xs font-semibold text-stone-500 uppercase tracking-wider block">Expired Docs</span>
              <div className="text-3xl font-serif font-bold text-stone-800 mt-2">
                {bureauData.kpis.expiring_documents}
              </div>
              <span className="text-[11px] text-stone-500 font-medium">Needs renewal upload</span>
            </div>

            <div className="p-5 rounded-2xl border border-[#E8E2D8] bg-white shadow-2xs col-span-2 lg:col-span-1">
              <span className="text-xs font-semibold text-emerald-700 uppercase tracking-wider block">SLA Compliance</span>
              <div className="text-3xl font-serif font-bold text-emerald-600 mt-2">
                {bureauData.kpis.sla_compliance_rate}%
              </div>
              <span className="text-[11px] text-emerald-600 font-medium">On-time clearance rate</span>
            </div>
          </div>

          {/* Regional Urgent Case Queue (For Regional Officers) */}
          {bureauData.urgent_case_queue && bureauData.urgent_case_queue.length > 0 && (
            <div className="bg-white border border-[#E8E2D8] rounded-2xl p-6 shadow-2xs">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-base font-serif font-bold text-[#1C1917] flex items-center gap-2">
                    <Clock className="w-5 h-5 text-[#C25E26]" />
                    Urgent Regional Case Queue
                  </h3>
                  <p className="text-xs text-stone-500">Sorted by closest deadline (due_at relative to simulated time)</p>
                </div>
                <Link href="/applications" className="text-xs font-medium text-[#C25E26] hover:underline">
                  Full Queue →
                </Link>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-[#FAF7F2] text-xs font-semibold text-stone-600 border-b border-[#E8E2D8]">
                    <tr>
                      <th className="py-2.5 px-4">Application</th>
                      <th className="py-2.5 px-4">Institution</th>
                      <th className="py-2.5 px-4">Current Stage</th>
                      <th className="py-2.5 px-4">Urgency / Days Left</th>
                      <th className="py-2.5 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E8E2D8]">
                    {bureauData.urgent_case_queue.map((c) => (
                      <tr key={c.id} className="hover:bg-[#FAF7F2]/60 transition">
                        <td className="py-2.5 px-4 font-mono font-medium text-stone-900">{c.application_no}</td>
                        <td className="py-2.5 px-4 text-stone-800">{c.institutions?.name || 'Institution'}</td>
                        <td className="py-2.5 px-4 capitalize text-xs text-stone-600">{c.current_stage}</td>
                        <td className="py-2.5 px-4">
                          {c.is_overdue ? (
                            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-50 text-red-700 border border-red-200">
                              OVERDUE ({c.days_left}d)
                            </span>
                          ) : (
                            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                              {c.days_left} days remaining
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-4 text-right">
                          <Link
                            href={`/applications/${c.id}`}
                            className="px-3 py-1 text-xs font-medium rounded-full bg-[#FBF0E4] text-[#C25E26] border border-[#F0D5BE] hover:bg-[#F5EBE1] transition"
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
            <div className="bg-white border border-[#E8E2D8] rounded-2xl p-6 shadow-2xs">
              <h3 className="text-base font-serif font-bold text-[#1C1917] mb-1 flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-[#C25E26]" />
                Regional Overdue Governance Matrix
              </h3>
              <p className="text-xs text-stone-500 mb-4">Live evaluation from SQL view `v_overdue_summary`</p>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#FAF7F2] font-semibold text-stone-600 border-b border-[#E8E2D8]">
                    <tr>
                      <th className="py-2 px-3">Region</th>
                      <th className="py-2 px-3">Apps Overdue</th>
                      <th className="py-2 px-3">EVCs Overdue</th>
                      <th className="py-2 px-3">Undertakings</th>
                      <th className="py-2 px-3">Expired Docs</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E8E2D8]">
                    {bureauData.region_summary.map((r) => (
                      <tr key={r.region_id} className="hover:bg-[#FAF7F2]/60">
                        <td className="py-2.5 px-3 font-semibold text-[#1C1917]">{r.region_name}</td>
                        <td className="py-2.5 px-3 font-mono font-bold text-red-600">{r.overdue_applications}</td>
                        <td className="py-2.5 px-3 font-mono text-amber-600">{r.overdue_evcs}</td>
                        <td className="py-2.5 px-3 font-mono text-stone-700">{r.overdue_undertakings}</td>
                        <td className="py-2.5 px-3 font-mono text-stone-700">{r.expired_documents}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Stage Bottlenecks Funnel */}
            <div className="bg-white border border-[#E8E2D8] rounded-2xl p-6 shadow-2xs">
              <h3 className="text-base font-serif font-bold text-[#1C1917] mb-1 flex items-center gap-2">
                <Layers className="w-5 h-5 text-[#C25E26]" />
                Stage Pendency & Bottlenecks
              </h3>
              <p className="text-xs text-stone-500 mb-4">Calculated from `v_pendency_by_stage_region`</p>
              <div className="space-y-3">
                {bureauData.stage_funnel.map((s) => (
                  <div key={s.stage} className="p-3.5 rounded-xl bg-[#FAF7F2] border border-[#E8E2D8]">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-bold text-[#1C1917] uppercase tracking-wider">{s.stage}</span>
                      <span className="text-stone-500">Avg {s.avg_age_days} days in stage</span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-stone-600 font-mono">
                      <span>Open: <strong>{s.open_cases}</strong></span>
                      <span className="text-red-600">Overdue: <strong>{s.overdue_cases}</strong></span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Officer Workload Table */}
          <div className="bg-white border border-[#E8E2D8] rounded-2xl p-6 shadow-2xs">
            <h3 className="text-base font-serif font-bold text-[#1C1917] mb-1 flex items-center gap-2">
              <Users className="w-5 h-5 text-[#C25E26]" />
              Officer Workload & SLA Performance
            </h3>
            <p className="text-xs text-stone-500 mb-4">Real-time allocation from SQL view `v_officer_workload`</p>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#FAF7F2] font-semibold text-stone-600 border-b border-[#E8E2D8]">
                  <tr>
                    <th className="py-2.5 px-4">Officer Name</th>
                    <th className="py-2.5 px-4">Role</th>
                    <th className="py-2.5 px-4">Region</th>
                    <th className="py-2.5 px-4">Open Cases</th>
                    <th className="py-2.5 px-4">Overdue Cases</th>
                    <th className="py-2.5 px-4">Avg Case Age</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E8E2D8]">
                  {bureauData.officer_workload.map((o) => (
                    <tr key={o.officer_id} className="hover:bg-[#FAF7F2]/60">
                      <td className="py-2.5 px-4 font-semibold text-[#1C1917]">{o.officer_name}</td>
                      <td className="py-2.5 px-4 capitalize text-stone-700">{o.officer_role.replace(/_/g, ' ')}</td>
                      <td className="py-2.5 px-4 text-stone-600">{o.region_name || 'HQ'}</td>
                      <td className="py-2.5 px-4 font-mono font-medium text-stone-900">{o.open_cases}</td>
                      <td className="py-2.5 px-4 font-mono font-bold text-red-600">{o.overdue_cases}</td>
                      <td className="py-2.5 px-4 font-mono text-stone-600">{o.avg_case_age_days}d</td>
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
            <div className="p-5 rounded-2xl border border-[#E8E2D8] bg-white shadow-2xs">
              <span className="text-xs font-semibold text-stone-500 uppercase">Total Assigned</span>
              <div className="text-3xl font-serif font-bold text-[#1C1917] mt-2">
                {officerData.kpis.total_assigned}
              </div>
            </div>
            <div className="p-5 rounded-2xl border border-[#E8E2D8] bg-white shadow-2xs">
              <span className="text-xs font-semibold text-red-600 uppercase">Overdue Cases</span>
              <div className="text-3xl font-serif font-bold text-red-600 mt-2">
                {officerData.kpis.overdue}
              </div>
            </div>
            <div className="p-5 rounded-2xl border border-[#E8E2D8] bg-white shadow-2xs">
              <span className="text-xs font-semibold text-amber-600 uppercase">Due Today</span>
              <div className="text-3xl font-serif font-bold text-amber-600 mt-2">
                {officerData.kpis.due_today}
              </div>
            </div>
            <div className="p-5 rounded-2xl border border-[#E8E2D8] bg-white shadow-2xs">
              <span className="text-xs font-semibold text-[#C25E26] uppercase">Due This Week</span>
              <div className="text-3xl font-serif font-bold text-[#C25E26] mt-2">
                {officerData.kpis.due_this_week}
              </div>
            </div>
          </div>

          <div className="bg-white border border-[#E8E2D8] rounded-2xl p-6 shadow-2xs">
            <h3 className="text-base font-serif font-bold text-[#1C1917] mb-4">My Assigned Cases</h3>
            <div className="divide-y divide-[#E8E2D8]">
              {[...officerData.cases.overdue, ...officerData.cases.due_today, ...officerData.cases.due_this_week, ...officerData.cases.upcoming].map((c) => (
                <div key={c.id} className="py-3 flex items-center justify-between">
                  <div>
                    <span className="font-mono font-bold text-sm text-[#1C1917]">{c.application_no}</span>
                    <span className="text-xs text-stone-500 ml-2">· {c.institutions?.name}</span>
                  </div>
                  <Link
                    href={`/applications/${c.id}`}
                    className="px-3 py-1 text-xs font-medium rounded-full bg-[#C25E26] hover:bg-[#A84A19] text-white transition"
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
            <div className="p-6 rounded-2xl border border-[#E8E2D8] bg-white shadow-2xs">
              <span className="text-xs font-semibold uppercase tracking-wider text-stone-500">Institutional Health Score</span>
              <div className="text-5xl font-serif font-bold text-emerald-700 mt-3">
                {institutionData.health_score}<span className="text-2xl font-normal text-stone-400">/100</span>
              </div>
              <p className="text-xs mt-2 text-stone-600">
                {institutionData.health_score >= 80 ? 'Excellent compliance track record' : 'Action needed on pending undertakings'}
              </p>
            </div>

            <div className="p-6 rounded-2xl border border-[#E8E2D8] bg-white shadow-2xs">
              <span className="text-xs font-semibold text-stone-500 uppercase">My Applications</span>
              <div className="text-3xl font-serif font-bold text-[#1C1917] mt-2">
                {institutionData.applications.length}
              </div>
              <span className="text-xs text-[#C25E26] font-medium">In academic year 2026-27</span>
            </div>

            <div className="p-6 rounded-2xl border border-[#E8E2D8] bg-white shadow-2xs">
              <span className="text-xs font-semibold text-stone-500 uppercase">Statutory Documents</span>
              <div className="text-3xl font-serif font-bold text-[#1C1917] mt-2">
                {institutionData.documents.length}
              </div>
              <span className="text-xs text-emerald-700 font-medium">Registered in system</span>
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
