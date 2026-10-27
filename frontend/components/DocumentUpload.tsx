'use client';

import React, { useState } from 'react';
import { fetchApi } from '@/lib/api';
import { btnPrimary, input, label, Notice } from '@/components/ui';

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = ['application/pdf', 'image/png', 'image/jpeg'];

export interface UploadedDocument {
  id: string;
  title: string;
  doc_type: string;
  sha256: string;
  storage_path: string;
  version: number;
  valid_until: string | null;
  ocr_status: string;
  ocr_suggested_expiry: string | null;
  ocr_confidence: number | null;
  metadata: Record<string, any>;
  institution_id: string;
}

const DOC_TYPES = [
  { value: 'lease', label: 'Lease or land document' },
  { value: 'undertaking_evidence', label: 'Undertaking evidence' },
  { value: 'application_form', label: 'Application form' },
  { value: 'evc_report', label: 'EVC report' },
  { value: 'other', label: 'Other' },
];

export default function DocumentUpload({
  defaultDocType = 'lease',
  defaultTitle = '',
  supersedesId,
  applicationId,
  lockDocType = false,
  onUploaded,
}: {
  defaultDocType?: string;
  defaultTitle?: string;
  supersedesId?: string | null;
  applicationId?: string | null;
  lockDocType?: boolean;
  onUploaded: (doc: UploadedDocument) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [docType, setDocType] = useState(defaultDocType);
  const [title, setTitle] = useState(defaultTitle);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function pick(f: File | null) {
    setError(null);
    if (f && !ALLOWED.includes(f.type)) {
      setError('Only PDF, PNG and JPG files are allowed.');
      return setFile(null);
    }
    if (f && f.size > MAX_BYTES) {
      setError('Files must be 10 MB or smaller.');
      return setFile(null);
    }
    setFile(f);
    if (f && !title) setTitle(f.name.replace(/\.[^.]+$/, ''));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return setError('Choose a file to upload.');
    setBusy(true);
    setError(null);
    const form = new FormData();
    form.append('file', file);
    form.append('doc_type', docType);
    form.append('title', title || file.name);
    if (supersedesId) form.append('supersedes_document_id', supersedesId);
    if (applicationId) form.append('application_id', applicationId);
    const { data, error } = await fetchApi<UploadedDocument>('/documents/upload', { method: 'POST', body: form });
    setBusy(false);
    if (error || !data) return setError(error || 'Upload failed');
    onUploaded(data);
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {supersedesId && <Notice>This upload renews an existing document. It replaces the old one once an officer verifies it.</Notice>}
      <div>
        <label htmlFor="doc-file" className={label}>File (PDF, PNG or JPG, up to 10 MB)</label>
        <input
          id="doc-file"
          type="file"
          accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
          onChange={(e) => pick(e.target.files?.[0] || null)}
          className="block w-full text-sm text-stone-700 file:mr-4 file:rounded-lg file:border-0 file:bg-[#FBF0E4] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-[#C25E26] hover:file:bg-[#F6E2CC]"
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="doc-title" className={label}>Title</label>
          <input id="doc-title" className={input} value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} required />
        </div>
        <div>
          <label htmlFor="doc-type" className={label}>Document type</label>
          <select id="doc-type" className={input} value={docType} disabled={lockDocType} onChange={(e) => setDocType(e.target.value)}>
            {DOC_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
      </div>
      {error && <Notice kind="error">{error}</Notice>}
      <button type="submit" className={btnPrimary} disabled={busy || !file}>
        {busy ? 'Uploading and reading the file…' : 'Upload document'}
      </button>
      <p className="text-xs text-stone-500">
        Files are stored privately. The system records a SHA-256 fingerprint and logs every view and download.
      </p>
    </form>
  );
}
