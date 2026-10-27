'use client';

import React, { useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
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
        `${(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000').replace(/\/api\/v1\/?$/, '')}/api/v1/evc/${scheduleModalVisit.id}/schedule`,
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
        `${(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000').replace(/\/api\/v1\/?$/, '')}/api/v1/evc/${reportModalVisit.id}/report`,
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
        `${(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000').replace(/\/api\/v1\/?$/, '')}/api/v1/evc/${completeModalVisit.id}/complete`
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
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200"><CheckCircle2 className="w-3.5 h-3.5" /> Completed</span>;
      case 'scheduled':
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#FBF0E4] text-[#C25E26] border border-[#F0D5BE]"><Calendar className="w-3.5 h-3.5" /> Scheduled</span>;
      case 'overdue':
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-50 text-red-800 border border-red-200"><AlertTriangle className="w-3.5 h-3.5" /> Overdue</span>;
      default:
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200"><Clock className="w-3.5 h-3.5" /> Queued</span>;
    }
  };

  // Matches the API: only the regional officer schedules; members and the regional officer report
  const canManage = role === 'regional_officer';
  const canReport = canManage || role === 'evc_member';

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6 text-[#1C1917]">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-serif font-bold tracking-tight text-[#1C1917] flex items-center gap-2">
            <Users className="w-6 h-6 text-[#C25E26]" />
            Expert Visit Committee (EVC) Calendar
          </h1>
          <p className="text-sm text-stone-500">
            Track site visit scheduling, committee allocations, report submissions, and inspection closures.
          </p>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2">
          {['all', 'queued', 'scheduled', 'completed'].map((f) => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium capitalize transition cursor-pointer ${
                statusFilter === f
                  ? 'bg-[#C25E26] text-white shadow-2xs'
                  : 'bg-white text-stone-700 border border-[#E8E2D8] hover:bg-[#FAF7F2]'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Advisory Banner */}
      <div className="p-3 bg-[#FBF0E4]/60 border border-[#F0D5BE] rounded-xl flex items-center gap-2 text-xs text-[#C25E26]">
        <Shield className="w-4 h-4 shrink-0" />
        <span>Advisory only, final decisions rest with the competent authority.</span>
      </div>

      {/* Table */}
      <div className="bg-white border border-[#E8E2D8] rounded-2xl shadow-2xs overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-stone-400">Loading EVC visits...</div>
        ) : visits.length === 0 ? (
          <div className="py-16 text-center text-stone-400">No EVC visits found in this queue.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-stone-700">
              <thead className="bg-[#FAF7F2] text-xs font-semibold text-stone-600 uppercase tracking-wider border-b border-[#E8E2D8]">
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
              <tbody className="divide-y divide-[#E8E2D8]">
                {visits.map((v) => (
                  <tr key={v.id} className="hover:bg-[#FAF7F2]/60 transition">
                    <td className="py-3.5 px-4 font-mono font-bold text-[#C25E26]">
                      {v.applications?.application_no || 'N/A'}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-medium text-[#1C1917]">
                        {v.applications?.institutions?.name || 'Institution'}
                      </div>
                      <div className="text-xs text-stone-500">
                        {v.applications?.institutions?.city || 'Location'}
                      </div>
                    </td>
                    <td className="py-3.5 px-4">{getStatusBadge(v.status)}</td>
                    <td className="py-3.5 px-4 text-xs font-mono text-stone-600">
                      {new Date(v.scheduling_due_at).toLocaleDateString()}
                    </td>
                    <td className="py-3.5 px-4 text-xs font-mono text-stone-600">
                      {v.scheduled_for ? new Date(v.scheduled_for).toLocaleDateString() : '—'}
                    </td>
                    <td className="py-3.5 px-4 text-xs font-mono text-stone-600">
                      {v.completion_due_at ? new Date(v.completion_due_at).toLocaleDateString() : '—'}
                    </td>
                    <td className="py-3.5 px-4 text-right space-x-2">
                      {(v.status === 'queued' || v.status === 'overdue') && canManage && (
                        <>
                          <Link
                            href={`/evc/${v.id}/schedule`}
                            className="inline-block px-3 py-1 text-xs font-medium rounded-full bg-[#C25E26] text-white hover:bg-[#A84A19] transition shadow-2xs"
                          >
                            Suggest dates
                          </Link>
                          <button
                            onClick={() => {
                              setScheduleModalVisit(v);
                              setScheduledDate('');
                            }}
                            className="px-3 py-1 text-xs font-medium rounded-full bg-white text-stone-700 border border-[#E8E2D8] hover:bg-[#FAF7F2] transition cursor-pointer"
                          >
                            Pick date manually
                          </button>
                        </>
                      )}
                      {v.status === 'scheduled' && canReport && (
                        <>
                          <button
                            onClick={() => {
                              setReportModalVisit(v);
                              setReportRemarks('');
                            }}
                            className="px-3 py-1 text-xs font-medium rounded-full bg-[#FBF0E4] text-[#C25E26] border border-[#F0D5BE] hover:bg-[#F5EBE1] transition cursor-pointer"
                          >
                            Upload Report
                          </button>
                          <button
                            onClick={() => {
                              setCompleteModalVisit(v);
                              setCompleteRemarks('');
                            }}
                            className="px-3 py-1 text-xs font-medium rounded-full bg-emerald-700 text-white hover:bg-emerald-800 transition cursor-pointer shadow-2xs"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-xs">
          <div className="bg-white border border-[#E8E2D8] rounded-2xl p-6 max-w-md w-full shadow-xl space-y-4 text-[#1C1917]">
            <div className="flex justify-between items-center">
              <h3 className="font-serif font-bold text-[#1C1917] flex items-center gap-2">
                <Calendar className="w-5 h-5 text-[#C25E26]" />
                Schedule EVC Inspection Visit
              </h3>
              <button onClick={() => setScheduleModalVisit(null)} className="text-stone-400 hover:text-stone-600 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSchedule} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1">
                  Visit Date & Time
                </label>
                <input
                  type="date"
                  required
                  value={scheduledDate}
                  onChange={(e) => setScheduledDate(e.target.value)}
                  className="w-full px-3 py-2 border border-[#E8E2D8] rounded-xl text-sm bg-white text-[#1C1917] focus:outline-none focus:ring-1 focus:ring-[#C25E26]"
                />
              </div>
              <p className="text-xs text-stone-500">
                Scheduling auto-calculates completion due date (+15 days) and resolves open scheduling alerts.
              </p>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setScheduleModalVisit(null)}
                  className="px-4 py-2 text-xs font-medium rounded-full border border-[#E8E2D8] hover:bg-[#FAF7F2] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-xs font-medium rounded-full bg-[#C25E26] text-white hover:bg-[#A84A19] disabled:opacity-50 cursor-pointer shadow-2xs"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-xs">
          <div className="bg-white border border-[#E8E2D8] rounded-2xl p-6 max-w-md w-full shadow-xl space-y-4 text-[#1C1917]">
            <div className="flex justify-between items-center">
              <h3 className="font-serif font-bold text-[#1C1917] flex items-center gap-2">
                <FileText className="w-5 h-5 text-[#C25E26]" />
                Attach EVC Inspection Report
              </h3>
              <button onClick={() => setReportModalVisit(null)} className="text-stone-400 hover:text-stone-600 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleUploadReport} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1">
                  Report Document Title
                </label>
                <input
                  type="text"
                  required
                  value={reportTitle}
                  onChange={(e) => setReportTitle(e.target.value)}
                  className="w-full px-3 py-2 border border-[#E8E2D8] rounded-xl text-sm bg-white text-[#1C1917] focus:outline-none focus:ring-1 focus:ring-[#C25E26]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1">
                  Storage Path / URI
                </label>
                <input
                  type="text"
                  required
                  value={reportPath}
                  onChange={(e) => setReportPath(e.target.value)}
                  className="w-full px-3 py-2 border border-[#E8E2D8] rounded-xl text-sm bg-white text-[#1C1917] font-mono text-xs focus:outline-none focus:ring-1 focus:ring-[#C25E26]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1">
                  Key Findings & Observations
                </label>
                <textarea
                  rows={3}
                  value={reportRemarks}
                  onChange={(e) => setReportRemarks(e.target.value)}
                  placeholder="Summarize compliance with AICTE norms..."
                  className="w-full px-3 py-2 border border-[#E8E2D8] rounded-xl text-sm bg-white text-[#1C1917] focus:outline-none focus:ring-1 focus:ring-[#C25E26]"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setReportModalVisit(null)}
                  className="px-4 py-2 text-xs font-medium rounded-full border border-[#E8E2D8] hover:bg-[#FAF7F2] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-xs font-medium rounded-full bg-[#C25E26] text-white hover:bg-[#A84A19] disabled:opacity-50 cursor-pointer shadow-2xs"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-xs">
          <div className="bg-white border border-[#E8E2D8] rounded-2xl p-6 max-w-md w-full shadow-xl space-y-4 text-[#1C1917]">
            <div className="flex justify-between items-center">
              <h3 className="font-serif font-bold text-[#1C1917] flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-700" />
                Complete EVC Visit
              </h3>
              <button onClick={() => setCompleteModalVisit(null)} className="text-stone-400 hover:text-stone-600 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCompleteVisit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1">
                  Final Completion Remarks
                </label>
                <textarea
                  rows={3}
                  value={completeRemarks}
                  onChange={(e) => setCompleteRemarks(e.target.value)}
                  placeholder="e.g. Visit successfully concluded, report submitted."
                  className="w-full px-3 py-2 border border-[#E8E2D8] rounded-xl text-sm bg-white text-[#1C1917] focus:outline-none focus:ring-1 focus:ring-[#C25E26]"
                />
              </div>
              <p className="text-xs text-stone-500">
                Completing the visit auto-resolves any open completion alerts and logs a cryptographically verified audit entry.
              </p>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCompleteModalVisit(null)}
                  className="px-4 py-2 text-xs font-medium rounded-full border border-[#E8E2D8] hover:bg-[#FAF7F2] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-xs font-medium rounded-full bg-emerald-700 text-white hover:bg-emerald-800 disabled:opacity-50 cursor-pointer shadow-2xs"
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
