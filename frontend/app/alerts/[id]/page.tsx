'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { fetchApi } from '@/lib/api';
import DeliveryTimeline, { RecipientDeliveries } from '@/components/DeliveryTimeline';
import { PageShell, card, btnSecondary, Notice, Badge, formatDateTime } from '@/components/ui';

interface Alert {
  id: string;
  kind: string;
  level: number;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  status: string;
  target_role: string | null;
  fired_at: string;
  acknowledged_at: string | null;
}

export default function AlertDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<{ alert: Alert; recipients: RecipientDeliveries[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchApi<{ alert: Alert; recipients: RecipientDeliveries[] }>(`/alerts/${id}/deliveries`).then(({ data, error }) => (data ? setData(data) : setError(error)));
  }, [id]);

  const a = data?.alert;
  return (
    <PageShell title="Alert delivery" actions={<Link href="/alerts" className={btnSecondary}>All alerts</Link>}>
      {error && <Notice kind="error">{error}</Notice>}
      {a && (
        <div className="grid gap-6 lg:grid-cols-3">
          <section className={card} aria-labelledby="alert-heading">
            <h2 id="alert-heading" className="sr-only">Alert</h2>
            <div className="flex flex-wrap gap-2">
              <Badge tone={a.severity === 'critical' ? 'red' : a.severity === 'warning' ? 'amber' : 'blue'}>{a.severity}</Badge>
              <Badge>{a.kind}{a.kind === 'escalation' ? ` level ${a.level}` : ''}</Badge>
              <Badge tone={a.status === 'open' ? 'amber' : 'green'}>{a.status}</Badge>
            </div>
            <p className="mt-3 text-sm text-stone-900">{a.message}</p>
            <dl className="mt-4 space-y-1 text-xs text-stone-600">
              <div>Fired {formatDateTime(a.fired_at)}</div>
              {a.target_role && <div>Escalated to {a.target_role.replace(/_/g, ' ')}</div>}
              {a.acknowledged_at && <div>Acknowledged {formatDateTime(a.acknowledged_at)}</div>}
            </dl>
          </section>
          <section className={`${card} lg:col-span-2`} aria-labelledby="delivery-heading">
            <h2 id="delivery-heading" className="mb-4 text-sm font-bold text-stone-900">Delivery by recipient and channel</h2>
            <DeliveryTimeline recipients={data.recipients} />
            <p className="mt-6 text-xs text-stone-500">
              Email, SMS and WhatsApp carry only the reference number, the alert type and a signed link. Simulated means the provider is not configured in this demo, so the message was logged instead of sent.
            </p>
          </section>
        </div>
      )}
    </PageShell>
  );
}
