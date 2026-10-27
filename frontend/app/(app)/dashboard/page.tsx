'use client';

import React, { useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import NextComplianceItems from '@/components/NextComplianceItems';
import DailyBrief from '@/components/DailyBrief';
import { formatDate } from '@/components/ui';
import {
  FileText, FastForward, Clock, Building2, Sparkles, Loader2, BarChart3, Users, Layers, Shield,
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
  workload_balancer?: {
    officers: Array<{ user_id: string; name: string; open_count: number; overdue_count: number }>;
    suggestion: { from_officer: string; from_officer_id: string; to_officer: string; to_officer_id: string; case_id: string; case_number: string } | null;
  };
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

const ROLE_INTRO: Record<string, string> = {
  bureau_officer: 'Where cases are late across the country, and who is carrying the load.',
  regional_officer: "Your region's late cases, EVC visits and officer workload.",
  scrutiny_officer: 'Your cases, ordered by deadline.',
  evc_member: 'Your visits and reports, ordered by deadline.',
  sac_shc_member: 'The cases assigned to you, ordered by deadline.',
  institution: 'Your applications, deadlines and documents.',
};

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
          <span>Loading your dashboard…</span>
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
            Nirikshan · AICTE approvals and compliance
          </div>
          <h1 className="text-2xl sm:text-3xl font-serif font-bold tracking-tight text-[#1C1917]">
            Welcome, {userName}
          </h1>
          <p className="text-sm text-stone-600 mt-2 leading-relaxed">
            Signed in as <strong className="capitalize text-[#1C1917]">{role.replace(/_/g, ' ')}</strong>. {ROLE_INTRO[role] || 'Deadlines, alerts and cases that need you.'}
          </p>

          <div className="flex flex-wrap items-center gap-3 mt-6">
            <Link
              href="/applications"
              className="px-4 py-2 rounded-full bg-[#C25E26] hover:bg-[#A84A19] text-white font-medium text-xs transition shadow-2xs inline-flex items-center gap-1.5"
            >
              <FileText className="w-4 h-4 text-white" />
              Applications
            </Link>
            <Link
              href="/reports"
              className="px-4 py-2 rounded-full border border-[#E8E2D8] bg-white hover:bg-[#FAF7F2] text-stone-700 font-medium text-xs transition shadow-2xs inline-flex items-center gap-1.5"
            >
              <BarChart3 className="w-4 h-4 text-[#C25E26]" />
              Reports (PDF, Excel)
            </Link>
            {(role === 'admin' || role === 'bureau_officer') && (
              <Link
                href="/admin/simulator"
                className="px-4 py-2 rounded-full bg-[#FBF0E4] hover:bg-[#F5EBE1] text-[#C25E26] border border-[#F0D5BE] font-medium text-xs transition shadow-2xs inline-flex items-center gap-1.5"
              >
                <FastForward className="w-4 h-4" />
                Time simulator
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
            <Kpi label="Open cases" value={bureauData.kpis.open_applications} note="In the workflow now" />
            <Kpi label="Past deadline" value={bureauData.kpis.overdue_applications} note="Stage deadline missed" tone="red" />
            <Kpi label="EVC visits due" value={bureauData.kpis.evcs_due} note="To schedule or report" tone="amber" />
            <Kpi label="Expired documents" value={bureauData.kpis.expiring_documents} note="Need a renewal" />
            <Kpi label="On-time rate" value={`${bureauData.kpis.sla_compliance_rate}%`} note="Stages finished within deadline" tone="green" className="col-span-2 lg:col-span-1" />
          </div>

          {/* Regional Urgent Case Queue (For Regional Officers) */}
          {bureauData.urgent_case_queue && bureauData.urgent_case_queue.length > 0 && (
            <div className="bg-white border border-[#E8E2D8] rounded-2xl p-6 shadow-2xs">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-base font-serif font-bold text-[#1C1917] flex items-center gap-2">
                    <Clock className="w-5 h-5 text-[#C25E26]" />
                    Cases that need attention first
                  </h3>
                  <p className="text-xs text-stone-500">Your region&apos;s open cases, nearest deadline first</p>
                </div>
                <Link href="/applications" className="text-xs font-medium text-[#C25E26] hover:underline">
                  All applications
                </Link>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-[#FAF7F2] text-xs font-semibold text-stone-600 border-b border-[#E8E2D8]">
                    <tr>
                      <th className="py-2.5 px-4">Application</th>
                      <th className="py-2.5 px-4">Institution</th>
                      <th className="py-2.5 px-4">Stage</th>
                      <th className="py-2.5 px-4">Deadline</th>
                      <th className="py-2.5 px-4 text-right"><span className="sr-only">Open</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E8E2D8]">
                    {bureauData.urgent_case_queue.map((c) => (
                      <tr key={c.id} className="hover:bg-[#FAF7F2]/60 transition">
                        <td className="py-2.5 px-4 font-mono font-medium text-stone-900">{c.application_no}</td>
                        <td className="py-2.5 px-4 text-stone-800">{c.institutions?.name || 'Institution'}</td>
                        <td className="py-2.5 px-4 text-xs text-stone-600">{stageLabel(c.current_stage)}</td>
                        <td className="py-2.5 px-4">
                          {c.days_left === null ? <span className="text-xs text-stone-400">—</span> : c.is_overdue ? (
                            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-50 text-red-700 border border-red-200">
                              {Math.abs(c.days_left)} {Math.abs(c.days_left) === 1 ? 'day' : 'days'} overdue
                            </span>
                          ) : (
                            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                              {c.days_left === 0 ? 'Due today' : `${c.days_left} ${c.days_left === 1 ? 'day' : 'days'} left`}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-4 text-right">
                          <Link
                            href={`/applications/${c.id}`}
                            className="px-3 py-1 text-xs font-medium rounded-full bg-[#FBF0E4] text-[#C25E26] border border-[#F0D5BE] hover:bg-[#F5EBE1] transition"
                          >
                            Open case
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Charts: overdue items by region, open cases by stage */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <RegionChart rows={bureauData.region_summary} />
            <StageChart rows={bureauData.stage_funnel} />
          </div>

          {bureauData.workload_balancer?.suggestion && (
            <div className="bg-white border border-[#F0D5BE] rounded-2xl p-5 shadow-2xs flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-[#1C1917] flex items-center gap-2">
                  <Users className="w-4 h-4 text-[#C25E26]" /> Workload suggestion
                </h3>
                <p className="text-sm text-stone-700 mt-1">
                  {bureauData.workload_balancer.suggestion.from_officer} has {bureauData.workload_balancer.officers.find((o) => o.user_id === bureauData.workload_balancer?.suggestion?.from_officer_id)?.open_count ?? 'more'} open
                  cases and {bureauData.workload_balancer.suggestion.to_officer} has {bureauData.workload_balancer.officers.find((o) => o.user_id === bureauData.workload_balancer?.suggestion?.to_officer_id)?.open_count ?? 'fewer'}.
                  Consider moving the oldest case, <span className="font-mono">{bureauData.workload_balancer.suggestion.case_number}</span>.
                </p>
                <p className="text-xs text-stone-500 mt-1">A suggestion only: reassigning is your decision, from the case page.</p>
              </div>
              <Link href={`/applications/${bureauData.workload_balancer.suggestion.case_id}`}
                className="px-3 py-1.5 text-xs font-medium rounded-full bg-[#C25E26] hover:bg-[#A84A19] text-white transition">
                Open case
              </Link>
            </div>
          )}

          {/* Officer Workload Table */}
          <div className="bg-white border border-[#E8E2D8] rounded-2xl p-6 shadow-2xs">
            <h3 className="text-base font-serif font-bold text-[#1C1917] mb-1 flex items-center gap-2">
              <Users className="w-5 h-5 text-[#C25E26]" />
              Officer workload
            </h3>
            <p className="text-xs text-stone-500 mb-4">Open and overdue cases held by each officer</p>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#FAF7F2] font-semibold text-stone-600 border-b border-[#E8E2D8]">
                  <tr>
                    <th className="py-2.5 px-4">Officer</th>
                    <th className="py-2.5 px-4">Role</th>
                    <th className="py-2.5 px-4">Region</th>
                    <th className="py-2.5 px-4">Open cases</th>
                    <th className="py-2.5 px-4">Overdue</th>
                    <th className="py-2.5 px-4">Average age</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E8E2D8]">
                  {bureauData.officer_workload.map((o) => (
                    <tr key={o.officer_id} className="hover:bg-[#FAF7F2]/60">
                      <td className="py-2.5 px-4 font-semibold text-[#1C1917]">{o.officer_name}</td>
                      <td className="py-2.5 px-4 capitalize text-stone-700">{o.officer_role.replace(/_/g, ' ')}</td>
                      <td className="py-2.5 px-4 text-stone-600">{o.region_name || 'National'}</td>
                      <td className="py-2.5 px-4 font-mono font-medium text-stone-900">{o.open_cases}</td>
                      <td className={`py-2.5 px-4 font-mono ${o.overdue_cases ? 'font-bold text-red-600' : 'text-stone-500'}`}>{o.overdue_cases}</td>
                      <td className="py-2.5 px-4 font-mono text-stone-600">{o.avg_case_age_days} days</td>
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
            <Kpi label="Assigned to me" value={officerData.kpis.total_assigned} />
            <Kpi label="Overdue" value={officerData.kpis.overdue} tone="red" />
            <Kpi label="Due today" value={officerData.kpis.due_today} tone="amber" />
            <Kpi label="Due this week" value={officerData.kpis.due_this_week} tone="accent" />
          </div>

          <div className="bg-white border border-[#E8E2D8] rounded-2xl p-6 shadow-2xs">
            <h3 className="text-base font-serif font-bold text-[#1C1917] mb-1">My cases</h3>
            <p className="text-xs text-stone-500 mb-3">Overdue first, then by deadline</p>
            {(() => {
              const groups: Array<[string, any[], string]> = [
                ['Overdue', officerData.cases.overdue, 'bg-red-50 text-red-700 border-red-200'],
                ['Due today', officerData.cases.due_today, 'bg-amber-50 text-amber-800 border-amber-200'],
                ['Due this week', officerData.cases.due_this_week, 'bg-[#FBF0E4] text-[#C25E26] border-[#F0D5BE]'],
                ['Later', officerData.cases.upcoming, 'bg-stone-50 text-stone-600 border-[#E8E2D8]'],
              ];
              const all = groups.flatMap(([label, rows, tone]) => rows.map((c) => ({ c, label, tone })));
              if (!all.length) return <p className="py-6 text-center text-sm text-stone-500">No cases are assigned to you right now.</p>;
              return (
                <div className="divide-y divide-[#E8E2D8]">
                  {all.map(({ c, label, tone }) => (
                    <div key={c.id} className="py-3 flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <span className="font-mono font-bold text-sm text-[#1C1917]">{c.application_no}</span>
                        <span className="text-xs text-stone-500 ml-2">{c.institutions?.name}</span>
                        <p className="text-xs text-stone-500 mt-0.5">{stageLabel(c.current_stage)} · due {formatDate(c.due_at)}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${tone}`}>{label}</span>
                        <Link
                          href={`/applications/${c.id}`}
                          className="px-3 py-1 text-xs font-medium rounded-full bg-[#C25E26] hover:bg-[#A84A19] text-white transition"
                        >
                          Open
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* 3. Institution View */}
      {institutionData && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-6 rounded-2xl border border-[#E8E2D8] bg-white shadow-2xs">
              <span className="text-xs font-semibold text-stone-500">Compliance health score</span>
              <div className={`text-5xl font-serif font-bold mt-3 ${healthTier(institutionData.health_score).text}`}>
                {institutionData.health_score}<span className="text-2xl font-normal text-stone-400">/100</span>
              </div>
              <p className="text-xs mt-2 text-stone-600">
                <span className="font-semibold">{healthTier(institutionData.health_score).label}.</span>{' '}
                {institutionData.health_score >= 80
                  ? 'Deadlines and documents are in order.'
                  : 'Expired documents, overdue undertakings and returns lower the score.'}
              </p>
            </div>

            <Kpi label="Applications in progress" value={institutionData.applications.filter((a) => a.status === 'in_progress' || a.status === 'returned').length}
              note={`${institutionData.applications.length} submitted in all`} className="p-6" />
            <Kpi label="Documents on record" value={institutionData.documents.length}
              note={`${institutionData.documents.filter((d) => d.valid_until && String(d.valid_until).slice(0, 10) < todayIso() && d.status !== 'renewed').length} expired`} className="p-6" />
          </div>
        </div>
      )}
    </div>
  );
}

const STAGE_LABELS: Record<string, string> = {
  scrutiny: 'Scrutiny', institution_response: 'Institution response', re_scrutiny: 'Re-scrutiny',
  evc_queue: 'EVC scheduling', evc_visit: 'EVC visit', sac_shc: 'SAC/SHC', final_decision: 'Final decision',
};
const STAGE_ORDER = Object.keys(STAGE_LABELS);

function stageLabel(stage: string) {
  return STAGE_LABELS[stage] || stage.replace(/_/g, ' ');
}

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function healthTier(score: number) {
  if (score >= 80) return { label: 'Good', text: 'text-emerald-700' };
  if (score >= 50) return { label: 'Watch', text: 'text-amber-600' };
  return { label: 'At risk', text: 'text-red-600' };
}

const KPI_TONES = {
  neutral: 'text-[#1C1917]', red: 'text-red-600', amber: 'text-amber-600', green: 'text-emerald-600', accent: 'text-[#C25E26]',
};

function Kpi({ label, value, note, tone = 'neutral', className = '' }: {
  label: string; value: React.ReactNode; note?: string; tone?: keyof typeof KPI_TONES; className?: string;
}) {
  return (
    <div className={`p-5 rounded-2xl border border-[#E8E2D8] bg-white shadow-2xs ${className}`}>
      <span className="text-xs font-semibold text-stone-500 block">{label}</span>
      <div className={`text-3xl font-serif font-bold mt-2 ${KPI_TONES[tone]}`}>{value}</div>
      {note && <span className="text-[11px] text-stone-500">{note}</span>}
    </div>
  );
}

const REGION_SERIES = [
  { key: 'overdue_applications', label: 'Cases past deadline', color: 'bg-red-500' },
  { key: 'overdue_evcs', label: 'EVC visits late', color: 'bg-amber-500' },
  { key: 'overdue_undertakings', label: 'Undertakings late', color: 'bg-[#C25E26]' },
  { key: 'expired_documents', label: 'Expired documents', color: 'bg-stone-400' },
] as const;

function RegionChart({ rows }: { rows: BureauDashboardData['region_summary'] }) {
  const total = (r: BureauDashboardData['region_summary'][number]) =>
    REGION_SERIES.reduce((n, s) => n + (r[s.key] || 0), 0);
  const sorted = [...rows].sort((a, b) => total(b) - total(a));
  const max = Math.max(1, ...sorted.map(total));
  return (
    <div className="bg-white border border-[#E8E2D8] rounded-2xl p-6 shadow-2xs">
      <h3 className="text-base font-serif font-bold text-[#1C1917] mb-1 flex items-center gap-2">
        <BarChart3 className="w-5 h-5 text-[#C25E26]" />
        Late items by region
      </h3>
      <p className="text-xs text-stone-500 mb-3">Everything past its deadline, by regional office</p>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 mb-4 text-[11px] text-stone-600" aria-label="Legend">
        {REGION_SERIES.map((s) => (
          <li key={s.key} className="flex items-center gap-1.5"><span className={`h-2.5 w-2.5 rounded-sm ${s.color}`} aria-hidden="true" />{s.label}</li>
        ))}
      </ul>
      {sorted.length === 0 ? <p className="text-sm text-stone-500">No regions to show.</p> : (
        <ul className="space-y-2.5">
          {sorted.map((r) => {
            const t = total(r);
            return (
              <li key={r.region_id} className="grid grid-cols-[7rem_1fr_2rem] items-center gap-3 text-xs">
                <span className="truncate font-medium text-stone-800">{r.region_name}</span>
                <div className="flex h-3.5 overflow-hidden rounded-full bg-stone-100"
                  role="img" aria-label={`${r.region_name}: ${REGION_SERIES.map((s) => `${r[s.key] || 0} ${s.label.toLowerCase()}`).join(', ')}`}>
                  {REGION_SERIES.map((s) => (r[s.key] || 0) > 0 && (
                    <div key={s.key} className={s.color} style={{ width: `${((r[s.key] || 0) / max) * 100}%` }} />
                  ))}
                </div>
                <span className={`text-right font-mono ${t ? 'font-bold text-stone-900' : 'text-stone-400'}`}>{t}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function StageChart({ rows }: { rows: BureauDashboardData['stage_funnel'] }) {
  const sorted = rows.filter((s) => s.open_cases > 0).sort((a, b) =>
    (STAGE_ORDER.indexOf(a.stage) + 1 || 99) - (STAGE_ORDER.indexOf(b.stage) + 1 || 99));
  const max = Math.max(1, ...sorted.map((s) => s.open_cases));
  const slowest = [...rows].sort((a, b) => b.avg_age_days - a.avg_age_days)[0];
  return (
    <div className="bg-white border border-[#E8E2D8] rounded-2xl p-6 shadow-2xs">
      <h3 className="text-base font-serif font-bold text-[#1C1917] mb-1 flex items-center gap-2">
        <Layers className="w-5 h-5 text-[#C25E26]" />
        Open cases by stage
      </h3>
      <p className="text-xs text-stone-500 mb-3">
        {slowest && slowest.open_cases
          ? <>Cases wait longest at <strong className="text-stone-700">{stageLabel(slowest.stage)}</strong>, {slowest.avg_age_days} days on average.</>
          : 'Where cases are waiting in the workflow'}
      </p>
      <ul className="flex flex-wrap gap-x-4 mb-4 text-[11px] text-stone-600" aria-label="Legend">
        <li className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[#E9B48F]" aria-hidden="true" />Within deadline</li>
        <li className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-red-500" aria-hidden="true" />Overdue</li>
      </ul>
      {sorted.length === 0 ? <p className="text-sm text-stone-500">No open cases.</p> : (
        <ul className="space-y-2.5">
          {sorted.map((s) => {
            const onTime = Math.max(0, s.open_cases - s.overdue_cases);
            return (
              <li key={s.stage} className="grid grid-cols-[7rem_1fr_5.5rem] items-center gap-3 text-xs">
                <span className="truncate font-medium text-stone-800">{stageLabel(s.stage)}</span>
                <div className="flex h-3.5 overflow-hidden rounded-full bg-stone-100" role="img"
                  aria-label={`${stageLabel(s.stage)}: ${s.open_cases} open, ${s.overdue_cases} overdue`}>
                  {onTime > 0 && <div className="bg-[#E9B48F]" style={{ width: `${(onTime / max) * 100}%` }} />}
                  {s.overdue_cases > 0 && <div className="bg-red-500" style={{ width: `${(s.overdue_cases / max) * 100}%` }} />}
                </div>
                <span className="text-right font-mono text-stone-700">
                  {s.open_cases}{s.overdue_cases > 0 && <span className="text-red-600"> · {s.overdue_cases} late</span>}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="max-w-7xl mx-auto px-4 py-8 text-sm text-stone-500">Loading your dashboard…</div>}>
      <DashboardContent />
    </Suspense>
  );
}
