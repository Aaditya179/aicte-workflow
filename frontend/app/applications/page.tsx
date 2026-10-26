'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { fetchApi } from '@/lib/api';
import {
  FileText, Clock, CheckCircle2, AlertTriangle, XCircle, RefreshCw,
  ChevronRight, Filter, Search, PlusCircle, Loader2, ArrowRight
} from 'lucide-react';

interface Application {
  id: string;
  application_no: string;
  institution_id: string;
  application_type: string;
  template_id: string;
  current_stage: string;
  status: string;
  assigned_to: string | null;
  region_id: string | null;
  submitted_at: string;
  stage_entered_at: string;
  due_at: string | null;
  risk_score: number | null;
  risk_label: string | null;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  in_progress: { label: 'In Progress', color: 'text-blue-600 bg-blue-50 border-blue-200', icon: Clock },
  returned:    { label: 'Returned',    color: 'text-amber-600 bg-amber-50 border-amber-200', icon: AlertTriangle },
  approved:    { label: 'Approved',    color: 'text-emerald-600 bg-emerald-50 border-emerald-200', icon: CheckCircle2 },
  rejected:    { label: 'Rejected',    color: 'text-red-600 bg-red-50 border-red-200', icon: XCircle },
  closed:      { label: 'Closed',      color: 'text-slate-500 bg-slate-50 border-slate-200', icon: FileText },
  draft:       { label: 'Draft',       color: 'text-slate-500 bg-slate-50 border-slate-200', icon: FileText },
};

const STAGE_LABELS: Record<string, string> = {
  scrutiny: 'Scrutiny',
  institution_response: 'Inst. Response',
  re_scrutiny: 'Re-scrutiny',
  evc_queue: 'EVC Queue',
  evc_visit: 'EVC Visit',
  sac_shc: 'SAC/SHC',
  final_decision: 'Final Decision',
};

function daysSince(date: string): number {
  return Math.floor((Date.now() - new Date(date).getTime()) / 86400000);
}

function isOverdue(dueAt: string | null): boolean {
  if (!dueAt) return false;
  return new Date(dueAt) < new Date();
}

export default function ApplicationsPage() {
  const router = useRouter();
  const [apps, setApps] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [stageFilter, setStageFilter] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (statusFilter) params.set('status', statusFilter);
    if (stageFilter) params.set('stage', stageFilter);

    const { data } = await fetchApi<Application[]>(`/applications?${params.toString()}`);
    setApps(data || []);
    setLoading(false);
  }, [search, statusFilter, stageFilter]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Page Header */}
      <div className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-6 py-5">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">Applications</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              Track and manage AICTE approval workflow applications
            </p>
          </div>
          <Link
            href="/applications/new"
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm"
          >
            <PlusCircle className="w-4 h-4" />
            New Application
          </Link>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-5">
        {/* Filters */}
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-60">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search application number..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="py-2 px-3 text-sm border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">All Statuses</option>
            <option value="in_progress">In Progress</option>
            <option value="returned">Returned</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
          <select
            value={stageFilter}
            onChange={e => setStageFilter(e.target.value)}
            className="py-2 px-3 text-sm border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">All Stages</option>
            {Object.entries(STAGE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <button onClick={load} className="p-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {/* Table */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">App No.</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Type</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Current Stage</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Due At</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Age (Days)</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="py-16 text-center">
                      <Loader2 className="w-6 h-6 animate-spin mx-auto text-indigo-500" />
                      <p className="text-sm text-slate-400 mt-2">Loading applications...</p>
                    </td>
                  </tr>
                ) : apps.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-16 text-center">
                      <FileText className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-700 mb-2" />
                      <p className="text-sm text-slate-400 dark:text-slate-500">No applications found.</p>
                      <p className="text-xs text-slate-300 dark:text-slate-600 mt-1">Submit a new application to get started.</p>
                    </td>
                  </tr>
                ) : apps.map(app => {
                  const overdue = isOverdue(app.due_at);
                  const statusCfg = STATUS_CONFIG[app.status] || STATUS_CONFIG.in_progress;
                  const StatusIcon = statusCfg.icon;
                  const age = daysSince(app.submitted_at);

                  return (
                    <tr
                      key={app.id}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors"
                      onClick={() => router.push(`/applications/${app.id}`)}
                    >
                      <td className="px-4 py-3.5 font-mono text-xs font-medium text-indigo-600 dark:text-indigo-400">
                        {app.application_no}
                      </td>
                      <td className="px-4 py-3.5 text-slate-700 dark:text-slate-200 max-w-48 truncate">{app.application_type}</td>
                      <td className="px-4 py-3.5">
                        <span className="text-xs px-2 py-1 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium">
                          {STAGE_LABELS[app.current_stage] || app.current_stage}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={`inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full border font-medium ${statusCfg.color}`}>
                          <StatusIcon className="w-3 h-3" />
                          {statusCfg.label}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        {app.due_at ? (
                          <span className={`text-xs font-medium ${overdue ? 'text-red-600 dark:text-red-400' : 'text-slate-600 dark:text-slate-300'}`}>
                            {overdue ? '⚠ ' : ''}{new Date(app.due_at).toLocaleDateString()}
                          </span>
                        ) : <span className="text-slate-300 dark:text-slate-600">—</span>}
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={`text-xs font-medium ${age > 30 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-600 dark:text-slate-300'}`}>
                          {age}d
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <ChevronRight className="w-4 h-4 text-slate-300 dark:text-slate-600 inline" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {apps.length > 0 && (
            <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-400 dark:text-slate-500">
              Showing {apps.length} application{apps.length !== 1 ? 's' : ''}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
