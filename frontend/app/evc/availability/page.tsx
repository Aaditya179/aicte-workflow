'use client';

import React, { useEffect, useState } from 'react';
import { fetchApi } from '@/lib/api';
import { PageShell, card, btnPrimary, Notice, useMe, formatDate } from '@/components/ui';

interface MemberAvailability {
  user_id: string;
  full_name: string;
  base_city: string | null;
  days: Record<string, boolean>;
}

const WINDOW = 30;

/**
 * EVC member availability (§15.4). Members mark the days they can travel; regional officers see
 * the whole region's availability, which feeds the suggested visit dates.
 */
export default function AvailabilityPage() {
  const { me } = useMe();
  const [members, setMembers] = useState<MemberAvailability[]>([]);
  const [draft, setDraft] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  // Days come from the API so they follow the simulated clock
  const [days, setDays] = useState<string[]>([]);
  const editable = me?.role === 'evc_member';

  useEffect(() => {
    fetchApi<{ days: string[]; members: MemberAvailability[] }>(`/evc/availability?days=${WINDOW}`).then(({ data, error }) => {
      if (!data) return setError(error);
      setDays(data.days);
      setMembers(data.members);
      if (data.members.length === 1) setDraft(data.members[0].days);
    });
  }, []);

  async function save() {
    setBusy(true);
    setSaved(false);
    const { error } = await fetchApi('/evc/availability', {
      method: 'PUT',
      body: JSON.stringify({ days: days.map((d) => ({ day: d, available: draft[d] ?? false })) }),
    });
    setBusy(false);
    if (error) return setError(error);
    setSaved(true);
  }

  return (
    <PageShell
      title="EVC member availability"
      subtitle={editable ? 'Mark the days you can visit in the next 30 days. Weekends are never suggested.' : 'Availability of EVC members in your region for the next 30 days.'}
    >
      {error && <div className="mb-4"><Notice kind="error">{error}</Notice></div>}
      {editable && members[0] && (
        <div className={card}>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 md:grid-cols-7">
            {days.map((d) => {
              const date = new Date(`${d}T00:00:00`);
              const weekend = date.getDay() === 0 || date.getDay() === 6;
              const on = draft[d] ?? false;
              return (
                <button key={d} aria-pressed={on} onClick={() => { setSaved(false); setDraft({ ...draft, [d]: !on }); }}
                  className={`rounded-lg border px-2 py-2 text-left text-xs focus-visible:outline-2 focus-visible:outline-[#C25E26] ${
                    on ? 'border-emerald-300 bg-emerald-50 text-emerald-900' : 'border-[#E8E2D8] bg-white text-stone-500'} ${weekend ? 'opacity-60' : ''}`}>
                  <span className="block font-semibold">{formatDate(date, { weekday: true })}</span>
                  <span>{on ? 'Available' : 'Unavailable'}</span>
                </button>
              );
            })}
          </div>
          <div className="mt-4 flex items-center gap-3">
            <button className={btnPrimary} onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save availability'}</button>
            {saved && <span className="text-sm text-emerald-700">Saved.</span>}
          </div>
        </div>
      )}
      {!editable && members.length > 0 && (
        <div className={`${card} overflow-x-auto`}>
          <table className="min-w-full text-xs">
            <thead>
              <tr>
                <th scope="col" className="sticky left-0 bg-white py-2 pr-4 text-left font-semibold text-stone-700">Member</th>
                {days.map((d) => <th key={d} scope="col" className="px-1 font-medium text-stone-500">{Number(d.slice(8))}</th>)}
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.user_id} className="border-t border-[#E8E2D8]">
                  <th scope="row" className="sticky left-0 bg-white py-2 pr-4 text-left font-medium text-stone-900">
                    {m.full_name}<span className="block font-normal text-stone-500">{m.base_city}</span>
                  </th>
                  {days.map((d) => (
                    <td key={d} className="px-1 text-center">
                      <span title={`${d}: ${m.days[d] ? 'available' : 'unavailable'}`}
                        className={`inline-block h-3 w-3 rounded-sm ${m.days[d] ? 'bg-emerald-500' : 'bg-stone-200'}`} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PageShell>
  );
}
