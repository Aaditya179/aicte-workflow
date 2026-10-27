'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { supabase } from '@/lib/supabase';
import {
  FileText, Download, FileSpreadsheet, BarChart3,
  Shield, CheckCircle2, Clock, Filter, Loader2, ArrowDownToLine
} from 'lucide-react';

interface ReportJSONResponse {
  report_type: string;
  title: string;
  generated_at: string;
  simulated_time: string;
  disclaimer: string;
  headers: string[];
  total_records: number;
  data: Array<Record<string, any>>;
}

const REPORT_TABS = [
  { id: 'pendency', name: 'Stage & Region Pendency', desc: 'Case distribution and stage bottleneck aging' },
  { id: 'overdue_summary', name: 'Regional Overdue Matrix', desc: 'Overdue applications, EVCs, undertakings, and expired documents' },
  { id: 'officer_workload', name: 'Officer Workload & SLAs', desc: 'Active workload, overdue counts, and average clearance times' },
  { id: 'compliance', name: 'Institutional Compliance', desc: 'Health score ratings, pending undertakings, and document validity' },
  { id: 'audit', name: 'Cryptographic Audit Trail', desc: 'Chained SHA-256 integrity logs and immutable sequence verification' },
];

function ReportsContent() {
  const [activeTab, setActiveTab] = useState<string>('pendency');
  const [reportData, setReportData] = useState<ReportJSONResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState<'pdf' | 'xlsx' | null>(null);
  const [token, setToken] = useState<string>('');

  useEffect(() => {
    loadReportPreview();
  }, [activeTab]);

  async function loadReportPreview() {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      setToken(session.access_token);
      const rawApi = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const apiBase = rawApi.replace(/\/api\/v1\/?$/, '');
      try {
        const res = await fetch(`${apiBase}/api/v1/reports/${activeTab}?format=json`, {
          headers: { Authorization: `Bearer ${session.access_token}` }
        });
        if (res.ok) {
          const json = await res.json();
          setReportData(json);
        }
      } catch (err) {
        console.error('Failed to load report:', err);
      }
    }
    setLoading(false);
  }

  async function downloadReport(format: 'pdf' | 'xlsx') {
    if (!token) return;
    setDownloading(format);
    const rawApi = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    const apiBase = rawApi.replace(/\/api\/v1\/?$/, '');

    try {
      const res = await fetch(`${apiBase}/api/v1/reports/${activeTab}?format=${format}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `aicte_${activeTab}_report_${Date.now()}.${format}`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }
    } catch (err) {
      console.error('Download failed:', err);
    } finally {
      setDownloading(null);
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            Statutory Reports & Governance Intelligence
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Generate and export official AICTE pendency, SLA breach, officer workload, and cryptographically verified audit reports.
          </p>
        </div>

        {/* Export Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => downloadReport('pdf')}
            disabled={downloading !== null}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-red-600 text-white hover:bg-red-700 shadow-sm transition disabled:opacity-50"
          >
            {downloading === 'pdf' ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <ArrowDownToLine className="w-4 h-4" />
            )}
            Download PDF
          </button>
          <button
            onClick={() => downloadReport('xlsx')}
            disabled={downloading !== null}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm transition disabled:opacity-50"
          >
            {downloading === 'xlsx' ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <FileSpreadsheet className="w-4 h-4" />
            )}
            Download Excel (.xlsx)
          </button>
        </div>
      </div>

      {/* Advisory Banner */}
      <div className="p-3 bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded-xl flex items-center gap-2 text-xs text-blue-700 dark:text-blue-300">
        <Shield className="w-4 h-4 shrink-0" />
        <span>Advisory only, final decisions rest with the competent authority.</span>
      </div>

      {/* Report Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
        {REPORT_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition text-left ${
              activeTab === tab.id
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 hover:bg-slate-50'
            }`}
          >
            <div>{tab.name}</div>
          </button>
        ))}
      </div>

      {/* Report Preview */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-4">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              {reportData?.title || 'Report Table Preview'}
            </h2>
            <p className="text-xs text-slate-500">
              Evaluated against simulated time: {reportData?.simulated_time || 'Current Time'} · Total Records: {reportData?.total_records || 0}
            </p>
          </div>
          <span className="text-xs px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-mono">
            Format: Live Table Preview
          </span>
        </div>

        {loading ? (
          <div className="py-16 text-center text-slate-400">
            <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-600" />
            Loading report data from PostgreSQL views...
          </div>
        ) : !reportData || reportData.data.length === 0 ? (
          <div className="py-16 text-center text-slate-400 text-sm">
            No records found for this report filter.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/60 font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider border-b border-slate-200 dark:border-slate-800">
                <tr>
                  {reportData.headers.map((h) => (
                    <th key={h} className="py-3 px-4">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {reportData.data.map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                    {Object.values(row).map((val, cellIdx) => (
                      <td key={cellIdx} className="py-3 px-4 font-mono">
                        {String(val ?? '—')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ReportsPage() {
  return (
    <Suspense fallback={<div className="max-w-7xl mx-auto px-4 py-8">Loading Reports...</div>}>
      <ReportsContent />
    </Suspense>
  );
}
