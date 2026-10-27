'use client';

import React, { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { fetchApi } from '@/lib/api';
import CommunicationsPanel from '@/components/CommunicationsPanel';
import { PageShell, btnSecondary, Notice, useMe } from '@/components/ui';

export default function ApplicationCommunicationsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-stone-500">Loading…</div>}>
      <CommunicationsContent />
    </Suspense>
  );
}

function CommunicationsContent() {
  const { id } = useParams<{ id: string }>();
  const { me } = useMe();
  const [appNo, setAppNo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchApi<{ application_no: string }>(`/applications/${id}`).then(({ data, error }) => (data ? setAppNo(data.application_no) : setError(error)));
  }, [id]);

  const canSend = ['scrutiny_officer', 'regional_officer', 'bureau_officer'].includes(me?.role || '');
  return (
    <PageShell
      title="Communications"
      subtitle={appNo ? `Letters and notices for ${appNo}` : undefined}
      actions={<Link href={`/applications/${id}`} className={btnSecondary}>Back to application</Link>}
    >
      {error ? <Notice kind="error">{error}</Notice> : <CommunicationsPanel applicationId={id} canSend={canSend} />}
    </PageShell>
  );
}
