'use client';

import React, { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { fetchApi } from '@/lib/api';
import OcrSuggestion from '@/components/OcrSuggestion';
import type { UploadedDocument } from '@/components/DocumentUpload';
import { PageShell, card, btnPrimary, btnSecondary, Notice, Badge, useMe, formatDate, formatDateTime } from '@/components/ui';

interface DocumentDetail extends UploadedDocument {
  status: string;
  valid_from: string | null;
  supersedes_document_id: string | null;
  created_at: string;
  institutions?: { name: string; city: string };
  link: { url: string; expires_at: number; ttl_seconds: number } | null;
}

interface AccessEntry {
  id: string;
  action: string;
  full_name: string | null;
  role: string | null;
  ip: string | null;
  created_at: string;
}

const ACTION_TONE: Record<string, 'blue' | 'green' | 'amber' | 'neutral'> = {
  upload: 'blue', view: 'neutral', download: 'amber', verify: 'green',
};

function DocumentContent() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const { me } = useMe();
  const [doc, setDoc] = useState<DocumentDetail | null>(null);
  const [log, setLog] = useState<AccessEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);

  const loadLog = useCallback(async () => {
    const { data } = await fetchApi<AccessEntry[]>(`/documents/${id}/access-log`);
    setLog(data);
  }, [id]);

  useEffect(() => {
    fetchApi<DocumentDetail>(`/documents/${id}`).then(({ data, error }) => {
      if (data) setDoc(data);
      else setError(error);
      loadLog();
    });
  }, [id, loadLog]);

  async function openFile() {
    // Each opening gets a fresh link; links expire after five minutes
    setOpening(true);
    const { data, error } = await fetchApi<DocumentDetail>(`/documents/${id}`);
    setOpening(false);
    if (!data?.link) return setError(error || 'This document has no stored file');
    window.open(data.link.url, '_blank', 'noopener,noreferrer');
    setTimeout(loadLog, 1500);
  }

  if (error && !doc) {
    return (
      <PageShell title="Document">
        <Notice kind="error">{error}</Notice>
        {log && <AccessLog log={log} />}
      </PageShell>
    );
  }
  if (!doc) return <div className="p-8 text-sm text-stone-500">Loading document…</div>;

  const canConfirmDate = ['lease', 'undertaking_evidence', 'other'].includes(doc.doc_type)
    && (me?.role === 'institution' || ['regional_officer', 'scrutiny_officer', 'bureau_officer'].includes(me?.role || ''));

  return (
    <PageShell
      title={doc.title}
      subtitle={`${doc.institutions?.name || ''} · ${doc.doc_type.replace('_', ' ')} · version ${doc.version || 1}`}
      actions={<Link href="/documents" className={btnSecondary}>All documents</Link>}
    >
      {params.get('uploaded') && <div className="mb-4"><Notice kind="success">Uploaded. The file is stored privately and its fingerprint is recorded below.</Notice></div>}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {canConfirmDate && (
            <section className={card} aria-labelledby="expiry-heading">
              <h2 id="expiry-heading" className="mb-3 text-sm font-bold text-stone-900">Expiry date</h2>
              <OcrSuggestion doc={doc} onChange={(d) => setDoc({ ...doc, ...d })} />
            </section>
          )}
          <section className={card} aria-labelledby="integrity-heading">
            <h2 id="integrity-heading" className="mb-3 text-sm font-bold text-stone-900">Integrity and storage</h2>
            <dl className="grid gap-3 text-sm sm:grid-cols-[10rem_1fr]">
              <dt className="text-stone-500">SHA-256</dt>
              <dd className="break-all font-mono text-xs text-stone-900">{doc.sha256 || 'Not recorded (registered before uploads were hashed)'}</dd>
              <dt className="text-stone-500">Storage</dt>
              <dd className="break-all font-mono text-xs text-stone-900">private bucket · {doc.storage_path || '—'}</dd>
              <dt className="text-stone-500">Status</dt>
              <dd><Badge tone={doc.status === 'verified' ? 'green' : doc.status === 'expired' ? 'red' : 'neutral'}>{doc.status.replace('_', ' ')}</Badge></dd>
              <dt className="text-stone-500">Valid</dt>
              <dd className="text-stone-900">{formatDate(doc.valid_from)} to {formatDate(doc.valid_until)}</dd>
              {doc.supersedes_document_id && (<>
                <dt className="text-stone-500">Renews</dt>
                <dd><Link className="text-[#C25E26] underline" href={`/documents/${doc.supersedes_document_id}`}>previous version</Link></dd>
              </>)}
            </dl>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button className={btnPrimary} onClick={openFile} disabled={opening || !doc.link}>{opening ? 'Opening…' : 'Open file'}</button>
              <span className="text-xs text-stone-500">Opens through a signed link that expires in 5 minutes.</span>
            </div>
          </section>
        </div>
        <div>{log ? <AccessLog log={log} /> : null}</div>
      </div>
    </PageShell>
  );
}

function AccessLog({ log }: { log: AccessEntry[] }) {
  return (
    <section className={card} aria-labelledby="log-heading">
      <h2 id="log-heading" className="mb-3 text-sm font-bold text-stone-900">Access log</h2>
      {log.length === 0 ? <p className="text-sm text-stone-500">No access recorded yet.</p> : (
        <ol className="space-y-3">
          {log.map((e) => (
            <li key={e.id} className="flex items-start justify-between gap-3 border-b border-[#E8E2D8] pb-2 text-sm last:border-0">
              <div>
                <Badge tone={ACTION_TONE[e.action] || 'neutral'}>{e.action}</Badge>
                <p className="mt-1 text-stone-800">{e.full_name || 'Unknown user'}<span className="text-stone-500"> · {(e.role || '').replace('_', ' ')}</span></p>
              </div>
              <time className="shrink-0 text-xs text-stone-500" dateTime={e.created_at}>{formatDateTime(e.created_at)}</time>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export default function DocumentPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-stone-500">Loading…</div>}>
      <DocumentContent />
    </Suspense>
  );
}
