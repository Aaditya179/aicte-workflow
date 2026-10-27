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
    <div className="min-h-screen bg-[#FAF7F2] bg-grid-texture text-[#1C1917]">
      {/* Page Header */}
      <div className="border-b border-[#E8E2D8] bg-[#FAF7F2]/80 backdrop-blur-md px-6 py-5">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-serif font-bold text-[#1C1917]">Applications</h1>
            <p className="text-sm text-stone-500 mt-0.5">
              Track and manage AICTE approval workflow applications
            </p>
          </div>
          <Link
            href="/applications/new"
            className="flex items-center gap-2 px-4 py-2 bg-[#C25E26] hover:bg-[#A84A19] text-white text-sm font-medium rounded-full transition-colors shadow-2xs"
          >
            <PlusCircle className="w-4 h-4" />
            New Application
          </Link>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-5">
        {/* Natural Language Query Bar (§10.4) */}
        <div className="bg-white p-5 rounded-2xl border border-[#E8E2D8] shadow-2xs space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-[#C25E26] uppercase tracking-wider flex items-center gap-1.5">
              ✨ Natural-Language Query
            </span>
            <span className="text-[10px] bg-[#FBF0E4] text-[#C25E26] border border-[#F0D5BE] px-2.5 py-0.5 rounded-full font-semibold">
              AI Powered · Safe Schema
            </span>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="e.g. 'Show me overdue scrutiny applications in western region' or 'delayed EVC visits'"
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') load(); }}
              className="flex-1 px-4 py-2 text-sm border border-[#E8E2D8] rounded-full bg-white text-[#1C1917] focus:outline-none focus:ring-1 focus:ring-[#C25E26] shadow-2xs"
            />
            <button
              onClick={load}
              className="px-5 py-2 bg-[#C25E26] hover:bg-[#A84A19] text-white rounded-full text-sm font-medium transition shadow-2xs cursor-pointer"
            >
              Search
            </button>
          </div>
          <p className="text-[11px] text-stone-500">
            Advisory only, final decisions rest with the competent authority. Queries execute through allow-listed schema filters.
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-60">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-stone-400" />
            <input
              type="text"
              placeholder="Search application number..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm border border-[#E8E2D8] rounded-full bg-white text-[#1C1917] focus:outline-none focus:ring-1 focus:ring-[#C25E26]"
            />
          </div>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="py-2 px-3 text-sm border border-[#E8E2D8] rounded-full bg-white text-stone-700 focus:outline-none focus:ring-1 focus:ring-[#C25E26]"
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
            className="py-2 px-3 text-sm border border-[#E8E2D8] rounded-full bg-white text-stone-700 focus:outline-none focus:ring-1 focus:ring-[#C25E26]"
          >
            <option value="">All Stages</option>
            {Object.entries(STAGE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <button onClick={load} className="p-2 rounded-full border border-[#E8E2D8] bg-white text-stone-600 hover:bg-[#FAF7F2] transition cursor-pointer">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl border border-[#E8E2D8] overflow-hidden shadow-2xs">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#E8E2D8] bg-[#FAF7F2]">
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-stone-600">App No.</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-stone-600">Type</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-stone-600">Current Stage</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-stone-600">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-stone-600">Due At</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-stone-600">Age (Days)</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8E2D8]">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="py-16 text-center">
                      <Loader2 className="w-6 h-6 animate-spin mx-auto text-[#C25E26]" />
                      <p className="text-sm text-stone-400 mt-2">Loading applications...</p>
                    </td>
                  </tr>
                ) : apps.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-16 text-center">
                      <FileText className="w-10 h-10 mx-auto text-stone-300 mb-2" />
                      <p className="text-sm text-stone-500">No applications found.</p>
                      <p className="text-xs text-stone-400 mt-1">Submit a new application to get started.</p>
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
                      className="hover:bg-[#FAF7F2]/60 cursor-pointer transition-colors"
                      onClick={() => router.push(`/applications/${app.id}`)}
                    >
                      <td className="px-4 py-3.5 font-mono text-xs font-bold text-[#C25E26]">
                        {app.application_no}
                      </td>
                      <td className="px-4 py-3.5 text-stone-700 max-w-48 truncate">{app.application_type}</td>
                      <td className="px-4 py-3.5">
                        <span className="text-xs px-2.5 py-0.5 rounded-full bg-[#FBF0E4] text-[#C25E26] border border-[#F0D5BE] font-medium">
                          {STAGE_LABELS[app.current_stage] || app.current_stage}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-0.5 rounded-full border font-medium ${statusCfg.color}`}>
                          <StatusIcon className="w-3 h-3" />
                          {statusCfg.label}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        {app.due_at ? (
                          <span className={`text-xs font-medium ${overdue ? 'text-red-600' : 'text-stone-600'}`}>
                            {overdue ? '⚠ ' : ''}{new Date(app.due_at).toLocaleDateString()}
                          </span>
                        ) : <span className="text-stone-300">—</span>}
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={`text-xs font-medium ${age > 30 ? 'text-amber-600' : 'text-stone-600'}`}>
                          {age}d
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <ChevronRight className="w-4 h-4 text-stone-400 inline" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {apps.length > 0 && (
            <div className="px-4 py-3 border-t border-[#E8E2D8] text-xs text-stone-500 bg-[#FAF7F2]/40">
              Showing {apps.length} application{apps.length !== 1 ? 's' : ''}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
