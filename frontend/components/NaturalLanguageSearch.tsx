'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Sparkles, Loader2, ChevronRight } from 'lucide-react';
import { fetchApi } from '@/lib/api';
import { formatDate } from '@/components/ui';

interface Filter {
  entity: 'applications' | 'evc' | 'undertakings' | 'documents';
  region: string | null;
  stage: string | null;
  status: string | null;
  overdue: boolean | null;
  days_overdue_gte: number | null;
  institution_name: string | null;
}

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

interface Result {
  filter: Filter;
  parser: 'llm' | 'rules';
  total_matches: number;
  results: Row[];
}

const EXAMPLES = ['Cases at scrutiny in the western region', 'EVC visits waiting to be scheduled', 'Expired documents', 'Overdue cases'];

const ENTITY_LABELS: Record<Filter['entity'], string> = {
  applications: 'Applications', evc: 'EVC visits', undertakings: 'Undertakings', documents: 'Documents',
};

const STAGE_LABELS: Record<string, string> = {
  scrutiny: 'Scrutiny', institution_response: 'Institution response', re_scrutiny: 'Re-scrutiny',
  evc_queue: 'EVC scheduling', evc_visit: 'EVC visit', sac_shc: 'SAC/SHC', final_decision: 'Final decision',
};

function describe(row: Row, entity: Filter['entity']) {
  const inst = row.institutions?.name || row.applications?.institutions?.name || '';
  switch (entity) {
    case 'applications':
      return { title: row.application_no, sub: `${inst} · ${STAGE_LABELS[row.current_stage] || row.current_stage} · due ${formatDate(row.due_at)}`, href: `/applications/${row.id}` };
    case 'evc':
      return { title: row.applications?.application_no || 'EVC visit', sub: `${inst} · ${row.status} · schedule by ${formatDate(row.scheduling_due_at)}`, href: '/evc' };
    case 'undertakings':
      return { title: row.title, sub: `${inst} · ${row.status} · due ${formatDate(row.due_at)}`, href: '/undertakings' };
    default:
      return { title: row.title, sub: `${inst} · valid until ${formatDate(row.valid_until)}`, href: `/documents/${row.id}` };
  }
}

/** Ask in plain words. The AI only turns the question into a filter, which is checked before it runs. */
export default function NaturalLanguageSearch() {
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function ask(q: string) {
    if (!q.trim()) return;
    setQuestion(q);
    setBusy(true);
    setError(null);
    const { data, error } = await fetchApi<Result>('/ai/query', { method: 'POST', body: JSON.stringify({ query: q }) });
    setBusy(false);
    setResult(data);
    if (!data) setError(error || 'The question could not be answered.');
  }

  const f = result?.filter;
  const chips = f ? [
    ENTITY_LABELS[f.entity],
    f.region && `${f.region} region`,
    f.entity === 'applications' && f.stage && (STAGE_LABELS[f.stage] || f.stage),
    f.status && `Status: ${f.status.replace(/_/g, ' ')}`,
    f.days_overdue_gte ? `Overdue by ${f.days_overdue_gte}+ days` : f.overdue && 'Overdue',
    f.institution_name && `Institution: ${f.institution_name}`,
  ].filter(Boolean) as string[] : [];

  return (
    <section className="bg-white p-5 rounded-2xl border border-[#E8E2D8] shadow-2xs space-y-3" aria-labelledby="nl-search">
      <h2 id="nl-search" className="flex items-center gap-2 text-sm font-semibold text-[#1C1917]">
        <Sparkles className="w-4 h-4 text-[#C25E26]" aria-hidden="true" /> Ask in plain words
        <span className="text-[10px] bg-[#FBF0E4] text-[#C25E26] border border-[#F0D5BE] px-2 py-0.5 rounded-full font-semibold">AI · advisory</span>
      </h2>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); ask(question); }}>
        <label htmlFor="nl-question" className="sr-only">Question</label>
        <input
          id="nl-question"
          type="text"
          placeholder="e.g. Overdue scrutiny cases in the western region"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          className="flex-1 min-w-0 px-4 py-2 text-sm border border-[#E8E2D8] rounded-full bg-white text-[#1C1917] focus:outline-none focus:ring-1 focus:ring-[#C25E26]"
        />
        <button type="submit" disabled={busy || !question.trim()}
          className="px-5 py-2 bg-[#C25E26] hover:bg-[#A84A19] text-white rounded-full text-sm font-medium transition shadow-2xs disabled:opacity-50 cursor-pointer">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" aria-label="Searching" /> : 'Ask'}
        </button>
      </form>
      {!result && !busy && (
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="text-stone-500">Try:</span>
          {EXAMPLES.map((q) => (
            <button key={q} type="button" onClick={() => ask(q)}
              className="rounded-full border border-[#E8E2D8] px-2.5 py-0.5 text-stone-700 hover:border-[#C25E26] hover:text-[#C25E26] cursor-pointer">
              {q}
            </button>
          ))}
        </div>
      )}

      {error && <p className="text-sm text-red-700">{error}</p>}

      {result && (
        <div className="space-y-2" aria-live="polite">
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-stone-500">Understood as</span>
            {chips.map((c) => <span key={c} className="rounded-full bg-stone-100 px-2 py-0.5 font-medium text-stone-700">{c}</span>)}
            <span className="text-stone-500">· {result.total_matches} {result.total_matches === 1 ? 'match' : 'matches'}</span>
          </div>
          {result.results.length > 0 ? (
            <ul className="divide-y divide-[#F0EBE3] rounded-xl border border-[#E8E2D8]">
              {result.results.map((row) => {
                const d = describe(row, result.filter.entity);
                return (
                  <li key={row.id}>
                    <Link href={d.href} className="group flex items-center gap-3 px-3 py-2 text-sm hover:bg-[#FAF7F2]">
                      <span className="flex-1 min-w-0">
                        <span className="block font-mono text-xs font-bold text-[#C25E26] truncate">{d.title}</span>
                        <span className="block text-xs text-stone-600 truncate">{d.sub}</span>
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-stone-400 group-hover:text-[#C25E26]" aria-hidden="true" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-stone-500">Nothing matches that question.</p>
          )}
          <p className="text-[11px] text-stone-500">
            {result.parser === 'llm' ? 'The AI read the question as the filter above;' : 'Read with keyword rules (AI unavailable);'} the filter is
            checked before it runs, and you only see cases in your scope. The AI never reads or changes the data itself.
          </p>
        </div>
      )}
    </section>
  );
}
