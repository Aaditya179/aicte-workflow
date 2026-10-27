'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  FileCheck2, AlertTriangle, Clock, CheckCircle2, RotateCw, 
  FileText, Shield, Plus, X, Calendar 
} from 'lucide-react';

interface DocumentRecord {
  id: string;
  institution_id: string;
  application_id: string | null;
  doc_type: string;
  title: string;
  storage_path: string;
  status: 'active' | 'expiring' | 'expired' | 'renewed' | 'under_verification' | 'verified';
  live_status?: 'active' | 'expiring' | 'expired' | 'renewed' | 'under_verification' | 'verified';
  days_remaining?: number;
  valid_from: string | null;
  valid_until: string | null;
  supersedes_document_id: string | null;
  verified_by: string | null;
  verified_at: string | null;
  institutions?: {
    name: string;
    city: string;
    aicte_id: string;
  };
}

function DocumentsContent() {
  const [docs, setDocs] = useState<DocumentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<string>('institution');
  const [token, setToken] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  // Modals
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [renewModalDoc, setRenewModalDoc] = useState<DocumentRecord | null>(null);
  const [verifyModalDoc, setVerifyModalDoc] = useState<DocumentRecord | null>(null);

  // Form states
  const [docType, setDocType] = useState('lease');
  const [title, setTitle] = useState('');
  const [storagePath, setStoragePath] = useState('');
  const [validFrom, setValidFrom] = useState('');
  const [validUntil, setValidUntil] = useState('');

  // Renewal form states
  const [renewalTitle, setRenewalTitle] = useState('');
  const [renewalPath, setRenewalPath] = useState('');
  const [renewalFrom, setRenewalFrom] = useState('');
  const [renewalUntil, setRenewalUntil] = useState('');

  const [verifyRemarks, setVerifyRemarks] = useState('Document verified and validated with registry');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadDocs();
  }, [typeFilter]);

  async function loadDocs() {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      setToken(session.access_token);
      setRole(session.user.app_metadata?.role || session.user.user_metadata?.role || 'institution');

      const url = new URL('/api/v1/documents', process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000');
      if (typeFilter !== 'all') {
        url.searchParams.set('doc_type', typeFilter);
      }

      try {
        const res = await fetch(url.toString(), {
          headers: { Authorization: `Bearer ${session.access_token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setDocs(data);
        }
      } catch (err) {
        console.error('Failed to load documents:', err);
      }
    }
    setLoading(false);
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/v1/documents`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            doc_type: docType,
            title,
            storage_path: storagePath,
            valid_from: validFrom || null,
            valid_until: validUntil || null
          })
        }
      );
      if (res.ok) {
        setShowRegisterModal(false);
        setTitle('');
        setStoragePath('');
        setValidFrom('');
        setValidUntil('');
        await loadDocs();
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRenew(e: React.FormEvent) {
    e.preventDefault();
    if (!renewModalDoc) return;
    setSubmitting(true);
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/v1/documents/${renewModalDoc.id}/renew`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            title: renewalTitle,
            storage_path: renewalPath,
            valid_from: renewalFrom || null,
            valid_until: renewalUntil
          })
        }
      );
      if (res.ok) {
        setRenewModalDoc(null);
        await loadDocs();
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!verifyModalDoc) return;
    setSubmitting(true);
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/v1/documents/${verifyModalDoc.id}/verify`,
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
        setVerifyModalDoc(null);
        await loadDocs();
      }
    } finally {
      setSubmitting(false);
    }
  }

  const getStatusBadge = (doc: DocumentRecord) => {
    if (doc.status === 'renewed') {
      return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"><RotateCw className="w-3.5 h-3.5" /> Renewed</span>;
    }
    if (doc.status === 'under_verification') {
      return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300"><Clock className="w-3.5 h-3.5" /> Under Review</span>;
    }

    const live = doc.live_status || doc.status;
    switch (live) {
      case 'expired':
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300"><AlertTriangle className="w-3.5 h-3.5" /> Expired</span>;
      case 'expiring':
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"><Clock className="w-3.5 h-3.5" /> Expiring Soon ({doc.days_remaining}d)</span>;
      case 'verified':
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"><CheckCircle2 className="w-3.5 h-3.5" /> Verified</span>;
      default:
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"><CheckCircle2 className="w-3.5 h-3.5" /> Active</span>;
    }
  };

  const isOfficer = role === 'regional_officer' || role === 'bureau_officer' || role === 'admin';

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <FileCheck2 className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
            Document Validity & Renewal Tracker
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Track statutory lease validity, AICTE approvals, periodic renewals, and officer verification chains.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Filters */}
          <div className="flex items-center gap-1.5">
            {['all', 'lease', 'evc_report', 'undertaking_evidence'].map((f) => (
              <button
                key={f}
                onClick={() => setTypeFilter(f)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition ${
                  typeFilter === f
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50'
                }`}
              >
                {f.replace('_', ' ')}
              </button>
            ))}
          </div>

          <button
            onClick={() => setShowRegisterModal(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm transition"
          >
            <Plus className="w-4 h-4" /> Register Document
          </button>
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
          <div className="py-16 text-center text-slate-400">Loading documents...</div>
        ) : docs.length === 0 ? (
          <div className="py-16 text-center text-slate-400">No documents registered.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-3 px-4">Title & URI</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">Institution</th>
                  <th className="py-3 px-4">Validity Range</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {docs.map((d) => (
                  <tr key={d.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition">
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-slate-900 dark:text-white">{d.title}</div>
                      <div className="text-xs text-slate-400 font-mono truncate max-w-xs">{d.storage_path}</div>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-xs font-medium capitalize">
                        {d.doc_type.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-medium text-slate-900 dark:text-white">
                        {d.institutions?.name || 'Institution'}
                      </div>
                      <div className="text-xs text-slate-400">{d.institutions?.city || ''}</div>
                    </td>
                    <td className="py-3.5 px-4 text-xs font-mono">
                      {d.valid_until ? (
                        <span>
                          {d.valid_from ? `${new Date(d.valid_from).toLocaleDateString()} → ` : ''}
                          <span className="font-semibold text-slate-800 dark:text-slate-200">
                            {new Date(d.valid_until).toLocaleDateString()}
                          </span>
                        </span>
                      ) : (
                        <span className="text-slate-400 italic">No expiry set</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4">{getStatusBadge(d)}</td>
                    <td className="py-3.5 px-4 text-right space-x-2">
                      {d.status !== 'renewed' && (
                        <button
                          onClick={() => {
                            setRenewModalDoc(d);
                            setRenewalTitle(`${d.title} (Renewed)`);
                            setRenewalPath(`documents/renewals/${d.id}_renewed.pdf`);
                          }}
                          className="px-2.5 py-1 text-xs font-medium rounded-md bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300 hover:bg-amber-100 transition"
                        >
                          Renew
                        </button>
                      )}
                      {(d.status === 'under_verification' || d.supersedes_document_id) && isOfficer && (
                        <button
                          onClick={() => {
                            setVerifyModalDoc(d);
                            setVerifyRemarks('Document verified and validated with registry');
                          }}
                          className="px-2.5 py-1 text-xs font-medium rounded-md bg-emerald-600 text-white hover:bg-emerald-700 transition"
                        >
                          Verify Renewal
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Register Modal */}
      {showRegisterModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <FileText className="w-5 h-5 text-emerald-600" />
                Register Statutory Document
              </h3>
              <button onClick={() => setShowRegisterModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleRegister} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Document Type
                </label>
                <select
                  value={docType}
                  onChange={(e) => setDocType(e.target.value)}
                  className="w-full px-3 py-2 border rounded-xl text-sm dark:bg-slate-800 dark:border-slate-700"
                >
                  <option value="lease">Land Lease / Ownership Deed</option>
                  <option value="undertaking_evidence">Undertaking Compliance Evidence</option>
                  <option value="application_form">Official Application Dossier</option>
                  <option value="evc_report">EVC Inspection Report</option>
                  <option value="other">Other Statutory Affidavit</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Document Title
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. 30-Year Campus Lease Agreement"
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
                  value={storagePath}
                  onChange={(e) => setStoragePath(e.target.value)}
                  placeholder="documents/lease/lease_deed.pdf"
                  className="w-full px-3 py-2 border rounded-xl text-sm dark:bg-slate-800 dark:border-slate-700 font-mono text-xs"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Valid From
                  </label>
                  <input
                    type="date"
                    value={validFrom}
                    onChange={(e) => setValidFrom(e.target.value)}
                    className="w-full px-3 py-2 border rounded-xl text-sm dark:bg-slate-800 dark:border-slate-700"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Valid Until
                  </label>
                  <input
                    type="date"
                    value={validUntil}
                    onChange={(e) => setValidUntil(e.target.value)}
                    className="w-full px-3 py-2 border rounded-xl text-sm dark:bg-slate-800 dark:border-slate-700"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowRegisterModal(false)}
                  className="px-4 py-2 text-xs font-medium rounded-xl border border-slate-300 dark:border-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-xs font-medium rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {submitting ? 'Registering...' : 'Register Document'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Renew Modal */}
      {renewModalDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <RotateCw className="w-5 h-5 text-amber-600" />
                Upload Document Renewal
              </h3>
              <button onClick={() => setRenewModalDoc(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleRenew} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Renewal Title
                </label>
                <input
                  type="text"
                  required
                  value={renewalTitle}
                  onChange={(e) => setRenewalTitle(e.target.value)}
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
                  value={renewalPath}
                  onChange={(e) => setRenewalPath(e.target.value)}
                  className="w-full px-3 py-2 border rounded-xl text-sm dark:bg-slate-800 dark:border-slate-700 font-mono text-xs"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Valid From
                  </label>
                  <input
                    type="date"
                    value={renewalFrom}
                    onChange={(e) => setRenewalFrom(e.target.value)}
                    className="w-full px-3 py-2 border rounded-xl text-sm dark:bg-slate-800 dark:border-slate-700"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    New Valid Until
                  </label>
                  <input
                    type="date"
                    required
                    value={renewalUntil}
                    onChange={(e) => setRenewalUntil(e.target.value)}
                    className="w-full px-3 py-2 border rounded-xl text-sm dark:bg-slate-800 dark:border-slate-700"
                  />
                </div>
              </div>
              <p className="text-xs text-slate-500">
                Uploading a renewal links this to the previous document and notifies the regional office for verification.
              </p>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setRenewModalDoc(null)}
                  className="px-4 py-2 text-xs font-medium rounded-xl border border-slate-300 dark:border-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-xs font-medium rounded-xl bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50"
                >
                  {submitting ? 'Uploading...' : 'Submit Renewal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Verify Modal */}
      {verifyModalDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                Verify Document Renewal
              </h3>
              <button onClick={() => setVerifyModalDoc(null)} className="text-slate-400 hover:text-slate-600">
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
                Verifying sets this document as &apos;verified&apos;, marks the superseded document as &apos;renewed&apos;, and resolves any open expiry alerts.
              </p>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setVerifyModalDoc(null)}
                  className="px-4 py-2 text-xs font-medium rounded-xl border border-slate-300 dark:border-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-xs font-medium rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {submitting ? 'Verifying...' : 'Approve & Mark Renewed'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default function DocumentsPage() {
  return (
    <Suspense fallback={<div className="max-w-7xl mx-auto px-4 py-8">Loading Document Tracker...</div>}>
      <DocumentsContent />
    </Suspense>
  );
}
