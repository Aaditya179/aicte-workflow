'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { fetchApi } from '@/lib/api';
import { PageShell, card, btnPrimary, btnSecondary, Notice, Badge, formatDate } from '@/components/ui';

interface CalendarItem {
  id: string;
  type: 'undertaking' | 'document' | 'application';
  entity_id: string;
  application_id: string | null;
  doc_type?: string;
  title: string;
  date: string;
  days_left: number;
  status: 'overdue' | 'due_soon' | 'upcoming' | 'waiting';
  detail: string;
  action: 'renew' | 'submit' | 'respond' | null;
}

const STATUS: Record<CalendarItem['status'], { label: string; tone: 'red' | 'amber' | 'blue' | 'neutral'; dot: string }> = {
  overdue: { label: 'Overdue', tone: 'red', dot: 'bg-red-600' },
  due_soon: { label: 'Due soon', tone: 'amber', dot: 'bg-amber-500' },
  upcoming: { label: 'Upcoming', tone: 'blue', dot: 'bg-sky-600' },
  waiting: { label: 'Waiting for officer', tone: 'neutral', dot: 'bg-stone-400' },
};
const TYPE_LABEL = { undertaking: 'Undertaking', document: 'Document', application: 'Application' };
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function actionHref(item: CalendarItem): string {
  if (item.action === 'renew') {
    const q = new URLSearchParams({ supersedes: item.entity_id, doc_type: item.doc_type || 'lease', title: `${item.title} (renewal)` });
    return `/documents/upload?${q}`;
  }
  if (item.action === 'submit') {
    const q = new URLSearchParams({ undertaking: item.entity_id, doc_type: 'undertaking_evidence', title: `Evidence: ${item.title}` });
    return `/documents/upload?${q}`;
  }
  return `/applications/${item.entity_id}`;
}

const ACTION_LABEL = { renew: 'Upload renewal', submit: 'Submit evidence', respond: 'Respond' };

function ItemRow({ item }: { item: CalendarItem }) {
  const s = STATUS[item.status];
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E8E2D8] py-3 last:border-0">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={s.tone}>{s.label}</Badge>
          <span className="text-xs text-stone-500">{TYPE_LABEL[item.type]} · {formatDate(item.date)}</span>
        </div>
        <p className="mt-1 font-medium text-stone-900">{item.title}</p>
        <p className="text-sm text-stone-600">{item.detail}</p>
      </div>
      {item.action && <Link href={actionHref(item)} className={btnPrimary}>{ACTION_LABEL[item.action]}</Link>}
    </li>
  );
}

export default function ComplianceCalendarPage() {
  const [items, setItems] = useState<CalendarItem[]>([]);
  const [today, setToday] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState<Date | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    fetchApi<{ today: string; items: CalendarItem[] }>('/institution/calendar').then(({ data, error }) => {
      setLoading(false);
      if (!data) return setError(error);
      setItems(data.items);
      setToday(data.today);
      const t = new Date(`${data.today}T00:00:00`);
      setMonth(new Date(t.getFullYear(), t.getMonth(), 1));
    });
  }, []);

  const byDay = useMemo(() => {
    const map: Record<string, CalendarItem[]> = {};
    for (const i of items) (map[i.date] ||= []).push(i);
    return map;
  }, [items]);

  const cells = useMemo(() => {
    if (!month) return [];
    const first = (month.getDay() + 6) % 7; // Monday first
    const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const out: (string | null)[] = Array(first).fill(null);
    for (let d = 1; d <= days; d++) {
      const iso = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      out.push(iso);
    }
    return out;
  }, [month]);

  const agenda = selected ? byDay[selected] || [] : items;

  return (
    <PageShell title="Compliance calendar" subtitle="Undertakings, document expiries and returned applications in one place, with the action each one needs.">
      {loading && <p className="text-sm text-stone-500">Loading calendar…</p>}
      {error && <Notice kind="error">{error}</Notice>}
      {month && (
        <div className="grid gap-6 lg:grid-cols-5">
          <section className={`${card} lg:col-span-3`} aria-label="Month view">
            <div className="mb-4 flex items-center justify-between">
              <button className={btnSecondary} onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>Previous month</button>
              <h2 className="text-sm font-bold text-stone-900">{month.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</h2>
              <button className={btnSecondary} onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>Next month</button>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-stone-500">
              {WEEKDAYS.map((d) => <div key={d} className="py-1">{d}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {cells.map((iso, idx) => {
                if (!iso) return <div key={`blank-${idx}`} />;
                const dayItems = byDay[iso] || [];
                const isToday = iso === today;
                const isSel = iso === selected;
                return (
                  <button
                    key={iso}
                    onClick={() => setSelected(isSel ? null : iso)}
                    aria-pressed={isSel}
                    aria-label={`${formatDate(iso)}, ${dayItems.length} item(s)`}
                    className={`flex min-h-16 flex-col items-start rounded-lg border p-1.5 text-left text-xs focus-visible:outline-2 focus-visible:outline-[#C25E26] ${
                      isSel ? 'border-[#C25E26] bg-[#FBF0E4]' : 'border-[#E8E2D8] bg-white hover:bg-stone-50'}`}
                  >
                    <span className={`font-semibold ${isToday ? 'rounded bg-stone-900 px-1 text-white' : 'text-stone-700'}`}>{Number(iso.slice(8))}</span>
                    <span className="mt-1 flex flex-wrap gap-1">
                      {dayItems.slice(0, 4).map((i) => <span key={i.id} className={`h-2 w-2 rounded-full ${STATUS[i.status].dot}`} />)}
                    </span>
                  </button>
                );
              })}
            </div>
            <ul className="mt-4 flex flex-wrap gap-4 text-xs text-stone-600">
              {Object.values(STATUS).map((s) => (
                <li key={s.label} className="flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${s.dot}`} />{s.label}</li>
              ))}
            </ul>
          </section>
          <section className={`${card} lg:col-span-2`} aria-label="Agenda">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-bold text-stone-900">{selected ? formatDate(selected) : 'All items'}</h2>
              {selected && <button className="text-xs text-[#C25E26] underline" onClick={() => setSelected(null)}>Show all</button>}
            </div>
            {agenda.length === 0
              ? <p className="text-sm text-stone-500">Nothing due{selected ? ' on this day' : ''}.</p>
              : <ul>{agenda.map((i) => <ItemRow key={i.id} item={i} />)}</ul>}
          </section>
        </div>
      )}
    </PageShell>
  );
}
