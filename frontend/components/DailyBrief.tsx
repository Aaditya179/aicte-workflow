'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Sunrise, ChevronRight } from 'lucide-react';
import { fetchApi } from '@/lib/api';
import { formatDate } from '@/components/ui';

interface BriefFact {
  key: string;
  severity: 'critical' | 'warning' | 'info';
  text: string;
  link: string;
}

interface Brief {
  date: string;
  is_simulated: boolean;
  summary: string;
  mode: string;
  facts: BriefFact[];
  advisory: string;
}

const DOT: Record<BriefFact['severity'], string> = {
  critical: 'bg-red-600',
  warning: 'bg-amber-500',
  info: 'bg-stone-400',
};

/**
 * What needs attention today. The facts are computed by the server; the summary above them is
 * written by AI from those facts only, and falls back to the facts themselves when it cannot be.
 */
export default function DailyBrief() {
  const [brief, setBrief] = useState<Brief | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetchApi<Brief>('/dashboard/brief').then(({ data }) => {
      if (data) setBrief(data);
      else setFailed(true);
    });
  }, []);

  if (failed) return null;

  return (
    <section
      className="bg-white border border-[#E8E2D8] rounded-2xl p-5 sm:p-6 shadow-2xs"
      aria-labelledby="brief-heading"
      aria-busy={!brief}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="brief-heading" className="flex items-center gap-2 text-base font-serif font-bold text-[#1C1917]">
          <Sunrise className="w-5 h-5 text-[#C25E26]" aria-hidden="true" />
          Today&apos;s brief
        </h2>
        {brief && (
          <span className="text-xs text-stone-500">
            {formatDate(brief.date)}
            {brief.is_simulated && <span className="ml-1.5 rounded-full bg-[#FBF0E4] px-2 py-0.5 font-semibold text-[#C25E26]">simulated date</span>}
          </span>
        )}
      </div>

      {!brief ? (
        <div className="mt-4 space-y-2" aria-label="Loading today's brief">
          <div className="h-3 w-11/12 animate-pulse rounded bg-stone-100" />
          <div className="h-3 w-4/5 animate-pulse rounded bg-stone-100" />
          <div className="h-3 w-2/3 animate-pulse rounded bg-stone-100" />
        </div>
      ) : (
        <>
          <p className="mt-3 text-sm leading-relaxed text-stone-800">{brief.summary}</p>
          {brief.facts.length > 0 && (
            <ul className="mt-4 divide-y divide-[#F0EBE3] border-t border-[#F0EBE3]">
              {brief.facts.map((f) => (
                <li key={f.key}>
                  <Link
                    href={f.link}
                    className="group flex items-start gap-3 py-2.5 text-sm text-stone-700 hover:text-[#1C1917]"
                  >
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${DOT[f.severity]}`} aria-hidden="true" />
                    <span className="sr-only">{f.severity}:</span>
                    <span className="flex-1">{f.text}</span>
                    <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-stone-400 group-hover:text-[#C25E26]" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-stone-500">
            {brief.mode === 'production'
              ? 'Summary written by AI from the facts listed, which are computed from live data.'
              : 'Summary taken from the facts listed (AI unavailable).'}{' '}
            {brief.advisory}
          </p>
        </>
      )}
    </section>
  );
}
