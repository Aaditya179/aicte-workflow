'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { fetchApi } from '@/lib/api';
import {
  AlertTriangle, ShieldAlert, Clock, CheckCircle2,
  Filter, Search, RefreshCw, Check, Loader2, ArrowRight
} from 'lucide-react';

interface AlertItem {
  id: string;
  entity_type: string;
  entity_id: string;
  kind: string;
  level: number;
  severity: 'critical' | 'warning' | 'info';
  message: string;
  status: 'open' | 'acknowledged' | 'resolved';
  target_role: string | null;
  target_user_id: string | null;
  acknowledged_at: string | null;
  resolved_at: string | null;
  fired_at: string;
}

interface AlertCounts {
  total_open: number;
  critical: number;
  warning: number;
  info: number;
}

export default function AlertsInboxPage() {
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [counts, setCounts] = useState<AlertCounts>({ total_open: 0, critical: 0, warning: 0, info: 0 });
  const [loading, setLoading] = useState(true);
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('open');
  const [kindFilter, setKindFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Acknowledge state
  const [ackModalAlert, setAckModalAlert] = useState<AlertItem | null>(null);
  const [ackNotes, setAckNotes] = useState('');
  const [ackSubmitting, setAckSubmitting] = useState(false);

  const loadData = async () => {
    setLoading(true);
    let url = '/alerts?limit=100';
    if (statusFilter !== 'all') url += `&status=${statusFilter}`;
    if (severityFilter !== 'all') url += `&severity=${severityFilter}`;
    if (kindFilter !== 'all') url += `&kind=${kindFilter}`;

    const [alertsRes, countsRes] = await Promise.all([
      fetchApi<AlertItem[]>(url),
      fetchApi<AlertCounts>('/alerts/counts'),
    ]);

    setAlerts(alertsRes.data || []);
    if (countsRes.data) setCounts(countsRes.data);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, [statusFilter, severityFilter, kindFilter]);

  const handleAcknowledge = async () => {
    if (!ackModalAlert) return;
    setAckSubmitting(true);
    const { data, error } = await fetchApi(`/alerts/${ackModalAlert.id}/acknowledge`, {
      method: 'POST',
      body: JSON.stringify({ notes: ackNotes || 'Acknowledged by officer' }),
    });
    setAckSubmitting(false);
    if (!error) {
      setAlerts((prev) =>
        prev.map((a) => (a.id === ackModalAlert.id ? { ...a, status: 'acknowledged' } : a))
      );
      setAckModalAlert(null);
      setAckNotes('');
      // Refresh counts
      fetchApi<AlertCounts>('/alerts/counts').then((c) => c.data && setCounts(c.data));
    }
  };

  const filteredAlerts = alerts.filter((a) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      a.message.toLowerCase().includes(q) ||
      a.entity_type.toLowerCase().includes(q) ||
      a.kind.toLowerCase().includes(q) ||
      (a.target_role && a.target_role.toLowerCase().includes(q))
    );
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Alerts Inbox</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Real-time SLA breaches, escalation notices, and compliance deadlines
          </p>
        </div>
        <button
          onClick={loadData}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 transition w-fit"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <button
          onClick={() => { setStatusFilter('open'); setSeverityFilter('all'); }}
          className={`p-4 rounded-xl border transition text-left ${
            statusFilter === 'open' && severityFilter === 'all'
              ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/20 shadow-sm'
              : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
          }`}
        >
          <div className="text-xs text-slate-500 font-medium">Open Alerts</div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white mt-1">{counts.total_open}</div>
        </button>

        <button
          onClick={() => { setStatusFilter('open'); setSeverityFilter('critical'); }}
          className={`p-4 rounded-xl border transition text-left ${
            statusFilter === 'open' && severityFilter === 'critical'
              ? 'border-red-500 bg-red-50/50 dark:bg-red-950/20 shadow-sm'
              : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
          }`}
        >
          <div className="text-xs text-red-600 dark:text-red-400 font-medium flex items-center gap-1">
            <ShieldAlert className="w-3.5 h-3.5" />
            Critical Escalations
          </div>
          <div className="text-2xl font-bold text-red-600 dark:text-red-400 mt-1">{counts.critical}</div>
        </button>

        <button
          onClick={() => { setStatusFilter('open'); setSeverityFilter('warning'); }}
          className={`p-4 rounded-xl border transition text-left ${
            statusFilter === 'open' && severityFilter === 'warning'
              ? 'border-amber-500 bg-amber-50/50 dark:bg-amber-950/20 shadow-sm'
              : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
          }`}
        >
          <div className="text-xs text-amber-600 dark:text-amber-400 font-medium flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5" />
            Overdue Warnings
          </div>
          <div className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-1">{counts.warning}</div>
        </button>

        <button
          onClick={() => { setStatusFilter('open'); setSeverityFilter('info'); }}
          className={`p-4 rounded-xl border transition text-left ${
            statusFilter === 'open' && severityFilter === 'info'
              ? 'border-blue-400 bg-blue-50/40 dark:bg-blue-950/10 shadow-sm'
              : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
          }`}
        >
          <div className="text-xs text-blue-600 dark:text-blue-400 font-medium flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" />
            Upcoming Reminders
          </div>
          <div className="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-1">{counts.info}</div>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 mb-6 flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          {/* Status Tabs */}
          {(['open', 'acknowledged', 'resolved', 'all'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition ${
                statusFilter === s
                  ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-950'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              {s}
            </button>
          ))}

          <span className="text-slate-300 dark:text-slate-700 hidden sm:inline">|</span>

          {/* Severity selector */}
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200"
          >
            <option value="all">All Severities</option>
            <option value="critical">Critical</option>
            <option value="warning">Warning</option>
            <option value="info">Info</option>
          </select>

          {/* Kind selector */}
          <select
            value={kindFilter}
            onChange={(e) => setKindFilter(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200"
          >
            <option value="all">All Types</option>
            <option value="upcoming">Upcoming</option>
            <option value="overdue">Overdue</option>
            <option value="escalation">Escalation</option>
            <option value="expiry">Expiry</option>
          </select>
        </div>

        {/* Search */}
        <div className="relative w-full md:w-64">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search alerts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs bg-slate-50 dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Alerts List */}
      {loading ? (
        <div className="p-12 text-center text-slate-400 flex items-center justify-center gap-2">
          <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
          <span>Loading alert inbox...</span>
        </div>
      ) : filteredAlerts.length === 0 ? (
        <div className="p-16 text-center bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
          <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2 opacity-80" />
          <p className="font-semibold text-slate-700 dark:text-slate-200 text-sm">No alerts matching your criteria</p>
          <p className="text-xs text-slate-400 mt-1">All clear. SLA monitors are healthy.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredAlerts.map((a) => {
            const isCritical = a.severity === 'critical';
            const isWarning = a.severity === 'warning';
            return (
              <div
                key={a.id}
                className={`p-4 rounded-xl border transition shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 ${
                  isCritical
                    ? 'border-red-200 bg-red-50/30 dark:border-red-950/50 dark:bg-red-950/10'
                    : isWarning
                    ? 'border-amber-200 bg-amber-50/20 dark:border-amber-950/40 dark:bg-amber-950/10'
                    : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5">
                    {isCritical ? (
                      <div className="w-8 h-8 rounded-lg bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300 flex items-center justify-center">
                        <ShieldAlert className="w-4 h-4" />
                      </div>
                    ) : isWarning ? (
                      <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 flex items-center justify-center">
                        <AlertTriangle className="w-4 h-4" />
                      </div>
                    ) : (
                      <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 flex items-center justify-center">
                        <Clock className="w-4 h-4" />
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                          isCritical
                            ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                            : isWarning
                            ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                            : 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                        }`}
                      >
                        {a.severity}
                      </span>
                      <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                        {a.kind} {a.level > 0 && `(Level ${a.level})`}
                      </span>
                      <span className="text-xs text-slate-400">·</span>
                      <span className="text-xs text-slate-400 capitalize">{a.entity_type.replace('_', ' ')}</span>
                    </div>

                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100 mt-1">
                      {a.message}
                    </p>

                    <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-slate-400">
                      <span>Fired: {new Date(a.fired_at).toLocaleString()}</span>
                      {a.target_role && (
                        <span>Target: <strong className="text-slate-600 dark:text-slate-300 capitalize">{a.target_role.replace('_', ' ')}</strong></span>
                      )}
                      {a.status === 'acknowledged' && (
                        <span className="text-blue-600 dark:text-blue-400 font-semibold flex items-center gap-1">
                          <Check className="w-3 h-3" /> Acknowledged
                        </span>
                      )}
                      {a.status === 'resolved' && (
                        <span className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Resolved
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-2 self-end sm:self-center">
                  {a.entity_type === 'application_stage' && (
                    <Link
                      href={`/applications/${a.entity_id}`}
                      className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800 transition inline-flex items-center gap-1"
                    >
                      View Case
                      <ArrowRight className="w-3 h-3" />
                    </Link>
                  )}

                  {a.status === 'open' && (
                    <button
                      onClick={() => { setAckModalAlert(a); setAckNotes(''); }}
                      className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition"
                    >
                      Acknowledge
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Acknowledge Modal */}
      {ackModalAlert && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-150">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Acknowledge Alert</h3>
            <p className="text-xs text-slate-500 mt-1">
              Acknowledging records your identity in the cryptographically chained audit log.
            </p>

            <div className="my-4 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl text-xs text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
              {ackModalAlert.message}
            </div>

            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Officer Notes / Action Plan:
            </label>
            <textarea
              rows={3}
              placeholder="e.g., Contacted regional officer for expedited scrutiny review..."
              value={ackNotes}
              onChange={(e) => setAckNotes(e.target.value)}
              className="w-full text-xs p-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />

            <div className="flex items-center justify-end gap-2 mt-5">
              <button
                onClick={() => setAckModalAlert(null)}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={handleAcknowledge}
                disabled={ackSubmitting}
                className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1.5 disabled:opacity-50"
              >
                {ackSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Confirm Acknowledge
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
