'use client';

import React, { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { fetchApi } from '@/lib/api';
import { PageShell, card, btnPrimary, btnSecondary, input, label, Notice, Badge, formatDate } from '@/components/ui';

interface SuggestedMember { user_id: string; full_name: string; base_city: string | null; local: boolean; busy_month: boolean }
interface Suggestion {
  date: string;
  score: number;
  before_due: boolean;
  members: SuggestedMember[];
  reason: string;
  travel_note: string;
  location: string;
}
interface SuggestResponse { scheduling_due_at: string; suggestions: Suggestion[]; message: string | null; advisory: string }
interface Visit {
  id: string;
  status: string;
  scheduling_due_at: string;
  applications?: { application_no: string; institutions?: { name: string; city: string } };
}

export default function ScheduleVisitPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-stone-500">Loading…</div>}>
      <ScheduleVisitContent />
    </Suspense>
  );
}

function ScheduleVisitContent() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [visit, setVisit] = useState<Visit | null>(null);
  const [data, setData] = useState<SuggestResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chosen, setChosen] = useState<Suggestion | null>(null);
  const [location, setLocation] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchApi<Visit>(`/evc/${id}`).then(({ data, error }) => (data ? setVisit(data) : setError(error)));
    fetchApi<SuggestResponse>(`/evc/${id}/suggest-dates`).then(({ data, error }) => (data ? setData(data) : setError(error)));
  }, [id]);

  function choose(s: Suggestion) {
    setChosen(s);
    setLocation(s.location);
  }

  async function schedule() {
    if (!chosen) return;
    setBusy(true);
    setError(null);
    const { error } = await fetchApi(`/evc/${id}/schedule`, {
      method: 'POST',
      body: JSON.stringify({
        scheduled_for: `${chosen.date}T10:00:00+05:30`,
        committee_members: chosen.members.map((m) => m.user_id),
        location,
      }),
    });
    setBusy(false);
    if (error) return setError(error);
    router.push('/evc');
  }

  const inst = visit?.applications?.institutions;
  return (
    <PageShell
      title="Schedule EVC visit"
      subtitle={visit ? `${visit.applications?.application_no} · ${inst?.name || ''}, ${inst?.city || ''} · schedule by ${formatDate(visit.scheduling_due_at)}` : undefined}
      actions={<Link href="/evc/availability" className={btnSecondary}>Member availability</Link>}
    >
      {error && <div className="mb-4"><Notice kind="error">{error}</Notice></div>}
      {data && (
        <>
          <p className="mb-4 text-sm text-stone-600">{data.advisory} Dates are weekdays where every member is available and has no other visit.</p>
          {data.suggestions.length === 0 && <Notice kind="warning">{data.message}</Notice>}
          <ol className="grid gap-4 md:grid-cols-3">
            {data.suggestions.map((s, i) => {
              const active = chosen?.date === s.date;
              return (
                <li key={s.date}>
                  <button onClick={() => choose(s)} aria-pressed={active}
                    className={`${card} h-full w-full text-left transition-colors focus-visible:outline-2 focus-visible:outline-[#C25E26] ${active ? 'border-[#C25E26] bg-[#FBF0E4]' : 'hover:bg-stone-50'}`}>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-stone-500">Option {i + 1}</span>
                      {!s.before_due && <Badge tone="amber">After deadline</Badge>}
                    </div>
                    <p className="mt-1 text-lg font-bold text-stone-900">{formatDate(s.date, { weekday: true })}</p>
                    <ul className="mt-3 space-y-1 text-sm">
                      {s.members.map((m) => (
                        <li key={m.user_id} className="flex items-center justify-between gap-2">
                          <span className="text-stone-800">{m.full_name}</span>
                          <span className="text-xs text-stone-500">{m.base_city}{m.local ? ' · local' : ''}</span>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-3 text-xs text-stone-600">{s.reason}</p>
                    <p className="mt-1 text-xs text-stone-600">{s.travel_note}</p>
                  </button>
                </li>
              );
            })}
          </ol>
          {chosen && (
            <div className={`${card} mt-6 max-w-xl space-y-4`}>
              <h2 className="text-sm font-bold text-stone-900">Confirm {formatDate(chosen.date)}</h2>
              <div>
                <label htmlFor="loc" className={label}>Visit location</label>
                <input id="loc" className={input} value={location} maxLength={300} onChange={(e) => setLocation(e.target.value)} />
              </div>
              <button className={btnPrimary} onClick={schedule} disabled={busy}>{busy ? 'Scheduling…' : 'Schedule this visit'}</button>
            </div>
          )}
        </>
      )}
    </PageShell>
  );
}
