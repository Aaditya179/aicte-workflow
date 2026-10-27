'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  FileCheck, AlertCircle, Clock, CheckCircle2, XCircle, 
  Upload, Shield, Plus, X 
} from 'lucide-react';

interface Undertaking {
  id: string;
  institution_id: string;
  application_id: string | null;
  title: string;
  description: string | null;
  condition_type: string | null;
  due_at: string;
  status: 'pending' | 'submitted' | 'verified' | 'rejected' | 'overdue';
  evidence_document_id: string | null;
  verified_by: string | null;
  verified_at: string | null;
  remarks: string | null;
  institutions?: {
    name: string;
    city: string;
    aicte_id: string;
  };
  documents?: {
    title: string;
    storage_path: string;
  };
}

function UndertakingsContent() {
  const [undertakings, setUndertakings] = useState<Undertaking[]>([]);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<string>('institution');
  const [token, setToken] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [submitModalUt, setSubmitModalUt] = useState<Undertaking | null>(null);
  const [verifyModalUt, setVerifyModalUt] = useState<Undertaking | null>(null);
  const [rejectModalUt, setRejectModalUt] = useState<Undertaking | null>(null);

  // Form states
  const [newInstId, setNewInstId] = useState('');
  const [newAppId, setNewAppId] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newType, setNewType] = useState('compliance');
  const [newDueDays, setNewDueDays] = useState(30);

  const [evidenceTitle, setEvidenceTitle] = useState('Compliance Evidence Document');
  const [evidencePath, setEvidencePath] = useState('documents/evidence/compliance.pdf');

  const [verifyRemarks, setVerifyRemarks] = useState('Evidence verified and accepted');
  const [rejectRemarks, setRejectRemarks] = useState('');
  const [rejectExtension, setRejectExtension] = useState(7);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadData();
  }, [statusFilter]);

  async function loadData() {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      setToken(session.access_token);
      setRole(session.user.app_metadata?.role || session.user.user_metadata?.role || 'institution');

      const url = new URL('/api/v1/undertakings', process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000');
      if (statusFilter !== 'all') {
        url.searchParams.set('status', statusFilter);
      }

      try {
        const res = await fetch(url.toString(), {
          headers: { Authorization: `Bearer ${session.access_token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setUndertakings(data);
        }
      } catch (err) {
        console.error('Failed to load undertakings:', err);
      }
    }
    setLoading(false);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/v1/undertakings`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            institution_id: newInstId,
            application_id: newAppId || null,
            title: newTitle,
            description: newDesc,
            condition_type: newType,
            due_days: Number(newDueDays)
          })
        }
      );
      if (res.ok) {
        setShowCreateModal(false);
        setNewTitle('');
        setNewDesc('');
        await loadData();
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmitEvidence(e: React.FormEvent) {
    e.preventDefault();
    if (!submitModalUt) return;
    setSubmitting(true);
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/v1/undertakings/${submitModalUt.id}/submit`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            title: evidenceTitle,
            storage_path: evidencePath
          })
        }
      );
      if (res.ok) {
        setSubmitModalUt(null);
        await loadData();
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!verifyModalUt) return;
    setSubmitting(true);
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/v1/undertakings/${verifyModalUt.id}/verify`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ remarks: verifyRemarks })
        }
      );
      if (res.ok) {
        setVerifyModalUt(null);
        await loadData();
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReject(e: React.FormEvent) {
    e.preventDefault();
    if (!rejectModalUt) return;
    setSubmitting(true);
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/v1/undertakings/${rejectModalUt.id}/reject`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            remarks: rejectRemarks,
            extension_days: Number(rejectExtension)
          })
        }
      );
      if (res.ok) {
        setRejectModalUt(null);
        await loadData();
      }
    } finally {
      setSubmitting(false);
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'verified':
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"><CheckCircle2 className="w-3.5 h-3.5" /> Verified</span>;
      case 'submitted':
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300"><Clock className="w-3.5 h-3.5" /> In Review</span>;
      case 'rejected':
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"><XCircle className="w-3.5 h-3.5" /> Rejected</span>;
      case 'overdue':
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300"><AlertCircle className="w-3.5 h-3.5" /> Overdue</span>;
      default:
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"><Clock className="w-3.5 h-3.5" /> Pending Evidence</span>;
    }
  };

  const isOfficer = role === 'regional_officer' || role === 'bureau_officer' || role === 'admin';

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <FileCheck className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
            Institutional Undertakings & Conditional Approvals
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Monitor compliance conditions, evidentiary proof submissions, and officer review clearances.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Filters */}
          <div className="flex items-center gap-1.5">
            {['all', 'pending', 'submitted', 'verified', 'rejected'].map((f) => (
              <button
                key={f}
                onClick={() => setStatusFilter(f)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition ${
                  statusFilter === f
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50'
                }`}
              >
                {f}
              </button>
            ))}
          </div>

          {isOfficer && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm transition"
            >
              <Plus className="w-4 h-4" /> Issue Undertaking
            </button>
          )}
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
          <div className="py-16 text-center text-slate-400">Loading undertakings...</div>
        ) : undertakings.length === 0 ? (
          <div className="py-16 text-center text-slate-400">No undertakings recorded.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-3 px-4">Title & Condition</th>
                  <th className="py-3 px-4">Institution</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Deadline</th>
                  <th className="py-3 px-4">Evidence</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {undertakings.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition">
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-slate-900 dark:text-white">{u.title}</div>
                      {u.description && (
                        <div className="text-xs text-slate-400 max-w-sm truncate">{u.description}</div>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-medium text-slate-900 dark:text-white">
                        {u.institutions?.name || 'Institution'}
                      </div>
                      <div className="text-xs text-slate-400 font-mono">
                        {u.institutions?.aicte_id || u.institutions?.city || ''}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 capitalize text-xs">
                      <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 font-medium">
                        {u.condition_type || 'General'}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">{getStatusBadge(u.status)}</td>
                    <td className="py-3.5 px-4 text-xs font-mono">
                      {new Date(u.due_at).toLocaleDateString()}
                    </td>
                    <td className="py-3.5 px-4 text-xs">
                      {u.documents ? (
                        <span className="text-indigo-600 dark:text-indigo-400 font-medium hover:underline cursor-pointer">
                          {u.documents.title}
                        </span>
                      ) : (
                        <span className="text-slate-400 italic">None attached</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right space-x-2">
                      {(u.status === 'pending' || u.status === 'rejected') && (
                        <button
                          onClick={() => setSubmitModalUt(u)}
                          className="px-2.5 py-1 text-xs font-medium rounded-md bg-indigo-600 text-white hover:bg-indigo-700 transition"
                        >
                          Submit Proof
                        </button>
                      )}
                      {u.status === 'submitted' && isOfficer && (
                        <>
                          <button
                            onClick={() => {
                              setVerifyModalUt(u);
                              setVerifyRemarks('Evidence verified and accepted');
                            }}
                            className="px-2.5 py-1 text-xs font-medium rounded-md bg-emerald-600 text-white hover:bg-emerald-700 transition"
                          >
                            Verify
                          </button>
                          <button
                            onClick={() => {
                              setRejectModalUt(u);
                              setRejectRemarks('');
                            }}
                            className="px-2.5 py-1 text-xs font-medium rounded-md bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300 hover:bg-rose-100 transition"
                          >
                            Reject
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

      {/* Submit Evidence Modal */}
      {submitModalUt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <Upload className="w-5 h-5 text-indigo-600" />
                Submit Compliance Evidence
              </h3>
              <button onClick={() => setSubmitModalUt(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmitEvidence} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Evidence Document Title
                </label>
                <input
                  type="text"
                  required
                  value={evidenceTitle}
                  onChange={(e) => setEvidenceTitle(e.target.value)}
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
                  value={evidencePath}
                  onChange={(e) => setEvidencePath(e.target.value)}
                  className="w-full px-3 py-2 border rounded-xl text-sm dark:bg-slate-800 dark:border-slate-700 font-mono text-xs"
                />
              </div>
              <p className="text-xs text-slate-500">
                Submitting updates condition status to &apos;submitted&apos; and notifies the assigned Regional Officer for verification.
              </p>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSubmitModalUt(null)}
                  className="px-4 py-2 text-xs font-medium rounded-xl border border-slate-300 dark:border-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-xs font-medium rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {submitting ? 'Submitting...' : 'Upload & Submit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Verify Modal */}
      {verifyModalUt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                Approve & Clear Undertaking
              </h3>
              <button onClick={() => setVerifyModalUt(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleVerify} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Verification Remarks
                </label>
                <textarea
                  rows={3}
                  required
                  value={verifyRemarks}
                  onChange={(e) => setVerifyRemarks(e.target.value)}
                  className="w-full px-3 py-2 border rounded-xl text-sm dark:bg-slate-800 dark:border-slate-700"
                />
              </div>
              <p className="text-xs text-slate-500">
                Verification auto-resolves any open SLA alerts for this undertaking and chains a signed audit entry.
              </p>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setVerifyModalUt(null)}
                  className="px-4 py-2 text-xs font-medium rounded-xl border border-slate-300 dark:border-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-xs font-medium rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {submitting ? 'Verifying...' : 'Clear Condition'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {rejectModalUt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <XCircle className="w-5 h-5 text-rose-600" />
                Reject Evidence & Mandate Revision
              </h3>
              <button onClick={() => setRejectModalUt(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleReject} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Reason for Rejection / Missing Requirements
                </label>
                <textarea
                  rows={3}
                  required
                  value={rejectRemarks}
                  onChange={(e) => setRejectRemarks(e.target.value)}
                  placeholder="e.g. Incomplete photo evidence or illegible certificate..."
                  className="w-full px-3 py-2 border rounded-xl text-sm dark:bg-slate-800 dark:border-slate-700"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Extension Days for Re-submission
                </label>
                <input
                  type="number"
                  min="1"
                  max="30"
                  required
                  value={rejectExtension}
                  onChange={(e) => setRejectExtension(Number(e.target.value))}
                  className="w-full px-3 py-2 border rounded-xl text-sm dark:bg-slate-800 dark:border-slate-700"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setRejectModalUt(null)}
                  className="px-4 py-2 text-xs font-medium rounded-xl border border-slate-300 dark:border-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-xs font-medium rounded-xl bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50"
                >
                  {submitting ? 'Rejecting...' : 'Reject with Extension'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default function UndertakingsPage() {
  return (
    <Suspense fallback={<div className="max-w-7xl mx-auto px-4 py-8">Loading Undertakings...</div>}>
      <UndertakingsContent />
    </Suspense>
  );
}
