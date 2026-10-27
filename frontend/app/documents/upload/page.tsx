'use client';

import React, { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { fetchApi } from '@/lib/api';
import DocumentUpload, { UploadedDocument } from '@/components/DocumentUpload';
import { PageShell, card, Notice } from '@/components/ui';

/**
 * Upload form, prefilled from the query string so the compliance calendar can open it for an item:
 *   ?supersedes=<document id>  renew a document
 *   ?undertaking=<id>          submit evidence for an undertaking
 *   ?doc_type=&title=&application_id=
 */
function UploadContent() {
  const params = useSearchParams();
  const router = useRouter();
  const supersedes = params.get('supersedes');
  const undertaking = params.get('undertaking');
  const [error, setError] = useState<string | null>(null);

  async function uploaded(doc: UploadedDocument) {
    if (undertaking) {
      const { error } = await fetchApi(`/undertakings/${undertaking}/submit`, {
        method: 'POST',
        body: JSON.stringify({ title: doc.title, evidence_document_id: doc.id }),
      });
      if (error) return setError(`The file was uploaded, but submitting it for the undertaking failed: ${error}`);
    }
    router.push(`/documents/${doc.id}?uploaded=1`);
  }

  const heading = supersedes ? 'Upload a renewal' : undertaking ? 'Submit undertaking evidence' : 'Upload a document';
  return (
    <PageShell title={heading} subtitle="Validity documents are read automatically to suggest the expiry date. You confirm the date on the next screen.">
      <div className={`${card} max-w-2xl`}>
        <DocumentUpload
          defaultDocType={params.get('doc_type') || (undertaking ? 'undertaking_evidence' : 'lease')}
          defaultTitle={params.get('title') || ''}
          supersedesId={supersedes}
          applicationId={params.get('application_id')}
          lockDocType={Boolean(supersedes || undertaking)}
          onUploaded={uploaded}
        />
        {error && <div className="mt-4"><Notice kind="error">{error}</Notice></div>}
      </div>
    </PageShell>
  );
}

export default function UploadPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-stone-500">Loading…</div>}>
      <UploadContent />
    </Suspense>
  );
}
