'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { fetchApi } from '@/lib/api';
import { card, Badge, formatDate } from '@/components/ui';

interface Item { id: string; title: string; date: string; status: string; detail: string }

/** The institution's next three compliance items, for the institution dashboard (§15.6). */
export default function NextComplianceItems() {
  const [items, setItems] = useState<Item[] | null>(null);
  useEffect(() => {
    fetchApi<{ next: Item[] }>('/institution/calendar').then(({ data }) => setItems(data?.next || []));
  }, []);
  if (items === null) return null;
  return (
    <section className={card} aria-labelledby="next-items-heading">
      <div className="mb-2 flex items-center justify-between">
        <h2 id="next-items-heading" className="text-sm font-bold text-stone-900">Coming up</h2>
        <Link href="/compliance-calendar" className="text-xs font-semibold text-[#C25E26] underline">Open calendar</Link>
      </div>
      {items.length === 0 ? <p className="text-sm text-stone-500">Nothing due.</p> : (
        <ul className="divide-y divide-[#E8E2D8]">
          {items.map((i) => (
            <li key={i.id} className="py-2">
              <div className="flex items-center gap-2">
                <Badge tone={i.status === 'overdue' ? 'red' : i.status === 'due_soon' ? 'amber' : 'blue'}>{formatDate(i.date)}</Badge>
                <span className="text-sm font-medium text-stone-900">{i.title}</span>
              </div>
              <p className="mt-0.5 text-xs text-stone-600">{i.detail}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
