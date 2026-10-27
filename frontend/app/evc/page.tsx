'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  Calendar, CheckCircle2, Clock, AlertTriangle, Users, 
  FileText, Plus, Shield, ArrowRight, X 
} from 'lucide-react';

interface EVCVisit {
  id: string;
  application_id: string;
  status: 'queued' | 'scheduled' | 'completed' | 'overdue' | 'cancelled';
  queued_at: string;
  scheduling_due_at: string;
  scheduled_for: string | null;
  completion_due_at: string | null;
  completed_at: string | null;
  committee_members: string[];
  applications?: {
    application_no: string;
    current_stage: string;
    institutions?: {
      name: string;
      city: string;
    };
  };
}

function EVCContent() {
  const [visits, setVisits] = useState<EVCVisit[]>([]);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<string>('institution');
  const [token, setToken] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Modals state
  const [scheduleModalVisit, setScheduleModalVisit] = useState<EVCVisit | null>(null);
  const [reportModalVisit, setReportModalVisit] = useState<EVCVisit | null>(null);
  const [completeModalVisit, setCompleteModalVisit] = useState<EVCVisit | null>(null);

  // Form states
  const [scheduledDate, setScheduledDate] = useState<string>('');
  const [reportTitle, setReportTitle] = useState('EVC Expert Committee Inspection Report');
  const [reportPath, setReportPath] = useState('documents/evc_reports/inspection_report.pdf');
  const [reportRemarks, setReportRemarks] = useState('');
  const [completeRemarks, setCompleteRemarks] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadUserAndVisits();
  }, [statusFilter]);

  async function loadUserAndVisits() {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      setToken(session.access_token);
      setRole(session.user.app_metadata?.role || session.user.user_metadata?.role || 'institution');

      const url = new URL('/api/v1/evc', process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000');
      if (statusFilter !== 'all') {
        url.searchParams.set('status', statusFilter);
      }

      try {
        const res = await fetch(url.toString(), {
          headers: { Authorization: `Bearer ${session.access_token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setVisits(data);
        }
      } catch (err) {
        console.error('Failed to load EVC visits:', err);
      }
    }
    setLoading(false);
  }

  async function handleSchedule(e: React.FormEvent) {
    e.preventDefault();
    if (!scheduleModalVisit || !scheduledDate) return;
    setSubmitting(true);
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/v1/evc/${scheduleModalVisit.id}/schedule`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            scheduled_for: new Date(scheduledDate).toISOString(),
            committee_members: []
          })
        }
      );
      if (res.ok) {
        setScheduleModalVisit(null);
        await loadUserAndVisits();
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUploadReport(e: React.FormEvent) {
    e.preventDefault();
    if (!reportModalVisit) return;
    setSubmitting(true);
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/v1/evc/${reportModalVisit.id}/report`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            title: reportTitle,
            storage_path: reportPath,
            remarks: reportRemarks
          })
        }
      );
      if (res.ok) {
        setReportModalVisit(null);
        await loadUserAndVisits();
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCompleteVisit(e: React.FormEvent) {
    e.preventDefault();
    if (!completeModalVisit) return;
    setSubmitting(true);
    try {
      const url = new URL(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/v1/evc/${completeModalVisit.id}/complete`
      );
      if (completeRemarks) url.searchParams.set('remarks', completeRemarks);

      const res = await fetch(url.toString(), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setCompleteModalVisit(null);
        await loadUserAndVisits();
      }
    } finally {
      setSubmitting(false);
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"><CheckCircle2 className="w-3.5 h-3.5" /> Completed</span>;
      case 'scheduled':
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300"><Calendar className="w-3.5 h-3.5" /> Scheduled</span>;
      case 'overdue':
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"><AlertTriangle className="w-3.5 h-3.5" /> Overdue</span>;
      default:
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"><Clock className="w-3.5 h-3.5" /> Queued</span>;
    }
  };

  const canManage = role === 'regional_officer' || role === 'bureau_officer' || role === 'admin';
  const canReport = canManage || role === 'evc_member';

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <Users className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            Expert Visit Committee (EVC) Calendar
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Track site visit scheduling, committee allocations, report submissions, and inspection closures.
          </p>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2">
          {['all', 'queued', 'scheduled', 'completed'].map((f) => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition ${
                statusFilter === f
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Advisory Banner */}
      <div className="p-3 bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded-xl flex items-center gap-2 text-xs text-blue-700 dark:text-blue-300">
        <Shield className="w-4 h-4 shrink-0" />
        <span>Advisory only, final decisions rest with the competent authority.</span>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-slate-400">Loading EVC visits...</div>
        ) : visits.length === 0 ? (
          <div className="py-16 text-center text-slate-400">No EVC visits found in this queue.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-3 px-4">Application</th>
                  <th className="py-3 px-4">Institution</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Scheduling Due</th>
                  <th className="py-3 px-4">Visit Date</th>
                  <th className="py-3 px-4">Completion Due</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {visits.map((v) => (
                  <tr key={v.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition">
                    <td className="py-3.5 px-4 font-mono font-medium text-slate-900 dark:text-white">
                      {v.applications?.application_no || 'N/A'}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-medium text-slate-900 dark:text-white">
                        {v.applications?.institutions?.name || 'Institution'}
                      </div>
                      <div className="text-xs text-slate-400">
                        {v.applications?.institutions?.city || 'Location'}
                      </div>
                    </td>
                    <td className="py-3.5 px-4">{getStatusBadge(v.status)}</td>
                    <td className="py-3.5 px-4 text-xs font-mono">
                      {new Date(v.scheduling_due_at).toLocaleDateString()}
                    </td>
                    <td className="py-3.5 px-4 text-xs font-mono">
                      {v.scheduled_for ? new Date(v.scheduled_for).toLocaleDateString() : '—'}
                    </td>
                    <td className="py-3.5 px-4 text-xs font-mono">
                      {v.completion_due_at ? new Date(v.completion_due_at).toLocaleDateString() : '—'}
                    </td>
                    <td className="py-3.5 px-4 text-right space-x-2">
                      {v.status === 'queued' && canManage && (
                        <button
                          onClick={() => {
                            setScheduleModalVisit(v);
                            setScheduledDate('');
                          }}
                          className="px-2.5 py-1 text-xs font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 transition"
                        >
                          Schedule
                        </button>
                      )}
                      {v.status === 'scheduled' && canReport && (
                        <>
                          <button
                            onClick={() => {
                              setReportModalVisit(v);
                              setReportRemarks('');
                            }}
                            className="px-2.5 py-1 text-xs font-medium rounded-md bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300 hover:bg-indigo-100 transition"
                          >
                            Upload Report
                          </button>
                          <button
                            onClick={() => {
                              setCompleteModalVisit(v);
                              setCompleteRemarks('');
                            }}
                            className="px-2.5 py-1 text-xs font-medium rounded-md bg-emerald-600 text-white hover:bg-emerald-700 transition"
                          >
                            Complete
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Schedule Modal */}
      {scheduleModalVisit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <Calendar className="w-5 h-5 text-blue-600" />
                Schedule EVC Inspection Visit
              </h3>
              <button onClick={() => setScheduleModalVisit(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSchedule} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Visit Date & Time
                </label>
                <input
                  type="date"
                  required
                  value={scheduledDate}
                  onChange={(e) => setScheduledDate(e.target.value)}
                  className="w-full px-3 py-2 border rounded-xl text-sm dark:bg-slate-800 dark:border-slate-700"
                />
              </div>
              <p className="text-xs text-slate-500">
                Scheduling auto-calculates completion due date (+15 days) and resolves open scheduling alerts.
              </p>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setScheduleModalVisit(null)}
                  className="px-4 py-2 text-xs font-medium rounded-xl border border-slate-300 dark:border-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-xs font-medium rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {submitting ? 'Scheduling...' : 'Confirm Schedule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Upload Report Modal */}
      {reportModalVisit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <FileText className="w-5 h-5 text-indigo-600" />
                Attach EVC Inspection Report
              </h3>
              <button onClick={() => setReportModalVisit(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleUploadReport} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Report Document Title
                </label>
                <input
                  type="text"
                  required
                  value={reportTitle}
                  onChange={(e) => setReportTitle(e.target.value)}
                  className="w-full px-3 py-2 border rounded-xl text-sm dark:bg-slate-800 dark:border-slate-700"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Storage Path / URI
                </label>
                <input
                  type="text"
                  required
                  value={reportPath}
                  onChange={(e) => setReportPath(e.target.value)}
                  className="w-full px-3 py-2 border rounded-xl text-sm dark:bg-slate-800 dark:border-slate-700 font-mono text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Key Findings & Observations
                </label>
                <textarea
                  rows={3}
                  value={reportRemarks}
                  onChange={(e) => setReportRemarks(e.target.value)}
                  placeholder="Summarize compliance with AICTE norms..."
                  className="w-full px-3 py-2 border rounded-xl text-sm dark:bg-slate-800 dark:border-slate-700"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setReportModalVisit(null)}
                  className="px-4 py-2 text-xs font-medium rounded-xl border border-slate-300 dark:border-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-xs font-medium rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {submitting ? 'Uploading...' : 'Save Report'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Complete Modal */}
      {completeModalVisit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                Complete EVC Visit
              </h3>
              <button onClick={() => setCompleteModalVisit(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCompleteVisit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Final Completion Remarks
                </label>
                <textarea
                  rows={3}
                  value={completeRemarks}
                  onChange={(e) => setCompleteRemarks(e.target.value)}
                  placeholder="e.g. Visit successfully concluded, report submitted."
                  className="w-full px-3 py-2 border rounded-xl text-sm dark:bg-slate-800 dark:border-slate-700"
                />
              </div>
              <p className="text-xs text-slate-500">
                Completing the visit auto-resolves any open completion alerts and logs a cryptographically verified audit entry.
              </p>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCompleteModalVisit(null)}
                  className="px-4 py-2 text-xs font-medium rounded-xl border border-slate-300 dark:border-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-xs font-medium rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {submitting ? 'Completing...' : 'Confirm Closure'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default function EVCPage() {
  return (
    <Suspense fallback={<div className="max-w-7xl mx-auto px-4 py-8">Loading EVC Calendar...</div>}>
      <EVCContent />
    </Suspense>
  );
}
