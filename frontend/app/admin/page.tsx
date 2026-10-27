'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Settings, ClipboardCheck, Users, FastForward, ShieldCheck, Bell, Mail, MessageSquare, Clock } from 'lucide-react';
import { fetchApi } from '@/lib/api';
import { PageShell, card, btnSecondary, Notice, Badge, formatDateTime } from '@/components/ui';

interface ChainLevel { level: number; channels: string[]; notify_role: string; after_days_overdue: number }
interface DeliveryCounts { delivered: number; sent: number; failed: number; queued: number; read: number; simulated: number }
interface AdminDashboard {
  users_by_role: Record<string, number>;
  active_sla_rules: number;
  escalation_chains: number;
  workflow_templates: number;
  pending_rule_changes: number;
  pending_rule_change_list: { id: string; table: string | null; requested_by_name: string | null; created_at: string }[];
  maker_checker_for_overrides: boolean;
  default_escalation_chain: ChainLevel[];
  deliveries_7d: Record<string, DeliveryCounts>;
  recent_admin_activity: { seq: number; action: string; entity_type: string; actor_name: string | null; created_at: string; reason: string | null }[];
  recent_scheduler_runs: { started_at: string; finished_at: string | null; alerts_created: number; escalations_created: number; errors: string | null }[];
  simulated_now: string;
  clock_offset_days: number;
}

const TABLE_LABEL: Record<string, string> = {
  sla_rules: 'Time limit', escalation_chains: 'Escalation chain', workflow_templates: 'Workflow',
};
const ROLE_LABEL: Record<string, string> = {
  institution: 'Institutions', scrutiny_officer: 'Scrutiny officers', regional_officer: 'Regional officers',
  evc_member: 'EVC members', sac_shc_member: 'SAC/SHC members', bureau_officer: 'Bureau officers',
  auditor: 'Auditors', admin: 'Admins',
};
const CHANNELS: { key: string; label: string; Icon: typeof Bell }[] = [
  { key: 'in_app', label: 'In-app', Icon: Bell },
  { key: 'email', label: 'Email', Icon: Mail },
  { key: 'sms', label: 'SMS', Icon: MessageSquare },
  { key: 'whatsapp', label: 'WhatsApp', Icon: MessageSquare },
];

function humanize(action: string) {
  const s = action.toLowerCase().replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function Stat({ label, value, href, tone }: { label: string; value: React.ReactNode; href: string; tone?: 'amber' }) {
  return (
    <Link href={href} className={`${card} block hover:border-[#C25E26] transition focus-visible:outline-2 focus-visible:outline-[#C25E26]`}>
      <p className="text-xs font-semibold text-stone-600">{label}</p>
      <p className={`mt-1 text-3xl font-bold tracking-tight ${tone === 'amber' ? 'text-amber-700' : 'text-stone-900'}`}>{value}</p>
    </Link>
  );
}

/**
 * Administrator home (§15.0): configuration and system health only. Nothing here names an
 * application, institution or decision, because the administrator has no case access.
 */
export default function AdminOverviewPage() {
  const [d, setD] = useState<AdminDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchApi<AdminDashboard>('/dashboard/admin').then(({ data, error }) => (data ? setD(data) : setError(error)));
  }, []);

  const totalUsers = d ? Object.values(d.users_by_role).reduce((a, b) => a + b, 0) : 0;
  const lastRun = d?.recent_scheduler_runs[0];

  return (
    <PageShell
      title="Admin overview"
      subtitle="Rules, people and system health. Admins have no access to cases, so no application data appears here."
      actions={<Link href="/admin/rules" className={btnSecondary}><Settings className="w-4 h-4" aria-hidden /> Edit rules</Link>}
    >
      {error && <div className="mb-4"><Notice kind="error">{error}</Notice></div>}
      {!d && !error && <p className="text-sm text-stone-500">Loading…</p>}

      {d && (
        <div className="space-y-6">
          {d.clock_offset_days !== 0 && (
            <Notice kind="warning">
              The clock is simulated: it reads {formatDateTime(d.simulated_now)}, {d.clock_offset_days > 0 ? '+' : ''}{d.clock_offset_days} days from real time.{' '}
              <Link href="/admin/simulator" className="font-semibold underline">Reset it in the simulator</Link>.
            </Notice>
          )}

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Stat label="Waiting for a second admin" value={d.pending_rule_changes} href="/admin/approvals" tone={d.pending_rule_changes ? 'amber' : undefined} />
            <Stat label="Active time limits" value={d.active_sla_rules} href="/admin/rules" />
            <Stat label="Workflows" value={d.workflow_templates} href="/admin/rules" />
            <Stat label="Users" value={totalUsers} href="/admin/users" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Approvals */}
            <section className={`${card} lg:col-span-2`} aria-labelledby="pending-heading">
              <div className="flex items-center justify-between gap-2 mb-3">
                <h2 id="pending-heading" className="text-sm font-bold text-stone-900 flex items-center gap-2">
                  <ClipboardCheck className="w-4 h-4 text-[#C25E26]" aria-hidden /> Rule changes waiting for approval
                </h2>
                <Link href="/admin/approvals" className="text-xs font-semibold text-[#C25E26] hover:underline">All approvals</Link>
              </div>
              {d.pending_rule_change_list.length === 0 ? (
                <p className="text-sm text-stone-600">
                  Nothing is waiting. When an admin edits a time limit, escalation chain or workflow in Rules, the change
                  waits here until a different admin approves it.
                </p>
              ) : (
                <ul className="divide-y divide-[#E8E2D8]">
                  {d.pending_rule_change_list.map((r) => (
                    <li key={r.id} className="py-2.5 flex flex-wrap items-center justify-between gap-2 text-sm">
                      <span className="text-stone-900">{TABLE_LABEL[r.table || ''] || r.table || 'Rule'} change</span>
                      <span className="text-xs text-stone-500">by {r.requested_by_name || 'an admin'} · {formatDateTime(r.created_at)}</span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-4 pt-3 border-t border-[#E8E2D8] flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="text-stone-700">Bureau approval for case reverts and assurance overrides</span>
                <Badge tone={d.maker_checker_for_overrides ? 'green' : 'neutral'}>{d.maker_checker_for_overrides ? 'On' : 'Off'}</Badge>
              </div>
            </section>

            {/* Quick links */}
            <section className={card} aria-labelledby="actions-heading">
              <h2 id="actions-heading" className="text-sm font-bold text-stone-900 mb-3">Go to</h2>
              <ul className="space-y-2 text-sm">
                {[
                  { href: '/admin/rules', label: 'Time limits, chains and workflows', Icon: Settings },
                  { href: '/admin/simulator', label: 'Time simulator', Icon: FastForward },
                  { href: '/admin/users', label: 'Users and roles', Icon: Users },
                  { href: '/audit', label: 'Audit trail', Icon: ShieldCheck },
                ].map(({ href, label, Icon }) => (
                  <li key={href}>
                    <Link href={href} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-stone-800 hover:bg-[#FBF0E4] hover:text-[#C25E26]">
                      <Icon className="w-4 h-4" aria-hidden /> {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Escalation chain */}
            <section className={card} aria-labelledby="chain-heading">
              <div className="flex items-center justify-between gap-2 mb-3">
                <h2 id="chain-heading" className="text-sm font-bold text-stone-900">Escalation chain in use</h2>
                <Link href="/admin/rules" className="text-xs font-semibold text-[#C25E26] hover:underline">Change</Link>
              </div>
              <ol className="space-y-2">
                {d.default_escalation_chain.map((l) => (
                  <li key={l.level} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[#FAF7F2] border border-[#E8E2D8] px-3 py-2 text-sm">
                    <span className="text-stone-900">
                      <strong>Level {l.level}</strong> · day {l.after_days_overdue} overdue · {l.notify_role.replace(/_/g, ' ')}
                    </span>
                    <span className="flex flex-wrap gap-1">
                      {l.channels.map((c) => <Badge key={c}>{c.replace('_', '-')}</Badge>)}
                    </span>
                  </li>
                ))}
              </ol>
            </section>

            {/* Delivery health */}
            <section className={card} aria-labelledby="delivery-heading">
              <h2 id="delivery-heading" className="text-sm font-bold text-stone-900 mb-1">Messages sent, last 7 days</h2>
              <p className="text-xs text-stone-500 mb-3">Totals only. Simulated means the provider is not set up, so the message was logged instead.</p>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="text-left text-xs text-stone-600">
                    <tr className="border-b border-[#E8E2D8]">
                      <th scope="col" className="py-2 pr-3 font-semibold">Channel</th>
                      <th scope="col" className="py-2 pr-3 font-semibold text-right">Total</th>
                      <th scope="col" className="py-2 pr-3 font-semibold text-right">Sent</th>
                      <th scope="col" className="py-2 pr-3 font-semibold text-right">Simulated</th>
                      <th scope="col" className="py-2 font-semibold text-right">Failed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {CHANNELS.map(({ key, label, Icon }) => {
                      const c = d.deliveries_7d[key];
                      const total = c ? Object.entries(c).filter(([k]) => k !== 'simulated').reduce((a, [, v]) => a + v, 0) : 0;
                      return (
                        <tr key={key} className="border-b border-[#E8E2D8] last:border-0">
                          <td className="py-2 pr-3 text-stone-900"><span className="inline-flex items-center gap-1.5"><Icon className="w-3.5 h-3.5 text-stone-500" aria-hidden />{label}</span></td>
                          <td className="py-2 pr-3 text-right font-mono">{total}</td>
                          <td className="py-2 pr-3 text-right font-mono">{key === 'in_app' ? total : (c?.sent || 0) + (c?.delivered || 0) + (c?.read || 0) - (c?.simulated || 0)}</td>
                          <td className="py-2 pr-3 text-right font-mono">{key === 'in_app' ? '—' : c?.simulated || 0}</td>
                          <td className={`py-2 text-right font-mono ${c?.failed ? 'text-red-700 font-semibold' : ''}`}>{c?.failed || 0}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Scheduler */}
            <section className={card} aria-labelledby="scheduler-heading">
              <h2 id="scheduler-heading" className="text-sm font-bold text-stone-900 mb-1 flex items-center gap-2">
                <Clock className="w-4 h-4 text-[#C25E26]" aria-hidden /> Deadline checker
              </h2>
              <p className="text-xs text-stone-500 mb-3">Checks every deadline and sends reminders and escalations.</p>
              {lastRun ? (
                <>
                  <p className="text-sm text-stone-900">
                    Last run {formatDateTime(lastRun.started_at)}{' '}
                    {lastRun.errors ? <Badge tone="red">errors</Badge> : <Badge tone="green">ok</Badge>}
                  </p>
                  <ul className="mt-3 space-y-1 text-xs text-stone-600">
                    {d.recent_scheduler_runs.map((r) => (
                      <li key={r.started_at} className="flex justify-between gap-2">
                        <span>{formatDateTime(r.started_at)}</span>
                        <span>{r.alerts_created} alerts · {r.escalations_created} escalations</span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : <p className="text-sm text-stone-600">It has not run yet.</p>}
            </section>

            {/* People */}
            <section className={card} aria-labelledby="people-heading">
              <div className="flex items-center justify-between gap-2 mb-3">
                <h2 id="people-heading" className="text-sm font-bold text-stone-900">People by role</h2>
                <Link href="/admin/users" className="text-xs font-semibold text-[#C25E26] hover:underline">Manage</Link>
              </div>
              <ul className="space-y-1.5 text-sm">
                {Object.entries(d.users_by_role).sort((a, b) => b[1] - a[1]).map(([role, n]) => (
                  <li key={role} className="flex items-center justify-between gap-2">
                    <span className="text-stone-700">{ROLE_LABEL[role] || role}</span>
                    <span className="font-mono text-stone-900">{n}</span>
                  </li>
                ))}
              </ul>
            </section>

            {/* Admin activity */}
            <section className={card} aria-labelledby="activity-heading">
              <div className="flex items-center justify-between gap-2 mb-3">
                <h2 id="activity-heading" className="text-sm font-bold text-stone-900">Recent admin activity</h2>
                <Link href="/audit" className="text-xs font-semibold text-[#C25E26] hover:underline">Audit trail</Link>
              </div>
              {d.recent_admin_activity.length === 0 ? <p className="text-sm text-stone-600">No admin actions yet.</p> : (
                <ul className="space-y-2 text-xs">
                  {d.recent_admin_activity.map((a) => (
                    <li key={a.seq}>
                      <p className="text-stone-900 font-medium">{humanize(a.action)}</p>
                      <p className="text-stone-500">{a.actor_name || 'Admin'} · {formatDateTime(a.created_at)}</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      )}
    </PageShell>
  );
}
