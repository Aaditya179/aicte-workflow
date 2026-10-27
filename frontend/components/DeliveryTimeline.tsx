'use client';

import React from 'react';
import { Badge, formatDateTime } from '@/components/ui';

export interface ChannelDelivery {
  id: string;
  channel: 'in_app' | 'email' | 'sms' | 'whatsapp';
  delivery_status: 'queued' | 'sent' | 'delivered' | 'failed' | 'read';
  created_at: string;
  sent_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
  simulated: boolean;
}

export interface RecipientDeliveries {
  user_id: string;
  full_name: string | null;
  role: string | null;
  channels: ChannelDelivery[];
}

const CHANNEL_LABEL = { in_app: 'In-app', email: 'Email', sms: 'SMS', whatsapp: 'WhatsApp' };
const STATUS_TONE = { queued: 'neutral', sent: 'blue', delivered: 'green', read: 'green', failed: 'red' } as const;

/** Delivery of one alert per recipient and channel (§15.5). */
export default function DeliveryTimeline({ recipients }: { recipients: RecipientDeliveries[] }) {
  if (recipients.length === 0) return <p className="text-sm text-stone-500">No deliveries recorded for this alert.</p>;
  return (
    <ul className="space-y-6">
      {recipients.map((r) => (
        <li key={r.user_id}>
          <p className="font-medium text-stone-900">{r.full_name || 'Recipient'}<span className="text-sm font-normal text-stone-500"> · {(r.role || '').replace(/_/g, ' ')}</span></p>
          <ol className="mt-2 space-y-2 border-l-2 border-[#E8E2D8] pl-4">
            {r.channels.map((c) => (
              <li key={c.id} className="relative">
                <span aria-hidden className={`absolute -left-[1.4rem] top-1.5 h-2.5 w-2.5 rounded-full ${c.delivery_status === 'failed' ? 'bg-red-600' : c.delivery_status === 'queued' ? 'bg-stone-300' : 'bg-emerald-500'}`} />
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="w-20 font-semibold text-stone-800">{CHANNEL_LABEL[c.channel] || c.channel}</span>
                  <Badge tone={STATUS_TONE[c.delivery_status] || 'neutral'}>{c.delivery_status}</Badge>
                  {c.simulated && <Badge tone="amber">simulated</Badge>}
                </div>
                <p className="mt-0.5 text-xs text-stone-500">
                  Queued {formatDateTime(c.created_at)}
                  {c.sent_at && ` · sent ${formatDateTime(c.sent_at)}`}
                  {c.delivered_at && ` · delivered ${formatDateTime(c.delivered_at)}`}
                  {c.read_at && ` · read ${formatDateTime(c.read_at)}`}
                </p>
              </li>
            ))}
          </ol>
        </li>
      ))}
    </ul>
  );
}
