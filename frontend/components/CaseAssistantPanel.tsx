'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { FileText, Loader2, RefreshCw } from 'lucide-react';
import { fetchApi } from '@/lib/api';

interface Summary { summary: string; word_count: number; mode: string; advisory: string }
interface Draft { draft: string; mode: string; advisory: string }

const SUMMARY_ROLES = ['scrutiny_officer', 'regional_officer', 'bureau_officer'];
const DRAFT_ROLES = ['scrutiny_officer', 'regional_officer'];

function ModeBadge({ mode }: { mode: string }) {
  const live = mode === 'production';
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${live ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-stone-100 text-stone-600 border-[#E8E2D8]'}`}>
      {live ? 'AI generated' : 'Template (AI unavailable)'}
    </span>
  );
}

/** AI case summary and deficiency letter draft (§10.3). Advisory only; nothing is sent from here. */
export default function CaseAssistantPanel({ applicationId, role }: { applicationId: string; role: string | undefined }) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [deficiencies, setDeficiencies] = useState('');
  const [deadlineDays, setDeadlineDays] = useState(15);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [draftLoading, setDraftLoading] = useState(false);

  const canSummarise = !!role && SUMMARY_ROLES.includes(role);
  const canDraft = !!role && DRAFT_ROLES.includes(role);

  const loadSummary = async () => {
    setSummaryLoading(true);
    setSummaryError(null);
    const { data, error } = await fetchApi<Summary>('/ai/case-summary', {
      method: 'POST',
      body: JSON.stringify({ application_id: applicationId }),
    });
    setSummaryLoading(false);
    if (error) return setSummaryError(error);
    setSummary(data);
  };

  useEffect(() => {
    if (canSummarise) loadSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applicationId, canSummarise]);

  const generateDraft = async (e: React.FormEvent) => {
    e.preventDefault();
    const items = deficiencies.split('\n').map((d) => d.trim()).filter(Boolean);
    if (!items.length) return;
    setDraftLoading(true);
    setDraftError(null);
    const { data, error } = await fetchApi<Draft>('/ai/deficiency-draft', {
      method: 'POST',
      body: JSON.stringify({ application_id: applicationId, deficiencies: items, deadline_days: deadlineDays }),
    });
    setDraftLoading(false);
    if (error) return setDraftError(error);
    setDraft(data);
  };

  if (!canSummarise) return null;

  return (
    <div className="bg-white rounded-2xl border border-[#E8E2D8] p-5 space-y-4 shadow-2xs">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-serif font-bold text-[#1C1917] flex items-center gap-2">
          <FileText className="w-4 h-4 text-[#C25E26]" /> Case summary and AI assistant
        </h2>
        <span className="text-[10px] font-semibold text-[#C25E26] bg-[#FBF0E4] border border-[#F0D5BE] px-2.5 py-0.5 rounded-full">
          Advisory only
        </span>
      </div>

      <div className="bg-[#FAF7F2] p-3.5 rounded-xl border border-[#E8E2D8]" aria-live="polite">
        {summaryLoading && (
          <p className="text-xs text-stone-500 flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Writing a summary from the case record…</p>
        )}
        {!summaryLoading && summaryError && <p className="text-xs text-red-700">{summaryError}</p>}
        {!summaryLoading && summary && <p className="text-xs text-stone-700 leading-relaxed whitespace-pre-line">{summary.summary}</p>}
      </div>
      {summary && (
        <div className="flex items-center justify-between gap-2 text-[11px] text-stone-500">
          <span className="flex items-center gap-2"><ModeBadge mode={summary.mode} /> {summary.word_count} of 150 words</span>
          <button onClick={loadSummary} disabled={summaryLoading} className="inline-flex items-center gap-1 font-semibold text-[#C25E26] hover:underline disabled:opacity-50 cursor-pointer">
            <RefreshCw className="w-3 h-3" /> Regenerate
          </button>
        </div>
      )}

      {canDraft && (
        <form onSubmit={generateDraft} className="pt-3 border-t border-[#E8E2D8] space-y-2">
          <label htmlFor="deficiencies" className="block text-xs font-semibold text-stone-700">Draft a deficiency letter</label>
          <textarea
            id="deficiencies"
            value={deficiencies}
            onChange={(e) => setDeficiencies(e.target.value)}
            placeholder={'One deficiency per line, for example:\nFire NOC not submitted'}
            className="w-full px-3 py-2 text-sm border border-[#E8E2D8] rounded-xl bg-white focus:outline-none focus:ring-1 focus:ring-[#C25E26] resize-y h-20"
          />
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-xs text-stone-600 flex items-center gap-2">
              Respond within
              <input type="number" min={1} max={90} value={deadlineDays} onChange={(e) => setDeadlineDays(Number(e.target.value) || 15)}
                className="w-16 px-2 py-1 text-sm border border-[#E8E2D8] rounded-lg bg-white" />
              days
            </label>
            <button type="submit" disabled={draftLoading || !deficiencies.trim()}
              className="px-4 py-1.5 bg-[#C25E26] hover:bg-[#A84A19] text-white text-xs font-medium rounded-full transition disabled:opacity-50 cursor-pointer">
              {draftLoading ? 'Drafting…' : 'Draft letter'}
            </button>
          </div>
          {draftError && <p className="text-xs text-red-700">{draftError}</p>}
          {draft && (
            <div className="space-y-2">
              <textarea readOnly value={draft.draft} aria-label="Draft deficiency letter"
                className="w-full px-3 py-2 text-xs font-mono border border-[#E8E2D8] rounded-xl bg-[#FAF7F2] h-56" />
              <div className="flex items-center justify-between text-[11px] text-stone-500">
                <ModeBadge mode={draft.mode} />
                <Link href={`/applications/${applicationId}/communications`} className="font-semibold text-[#C25E26] hover:underline">
                  Review and send from Communications
                </Link>
              </div>
            </div>
          )}
        </form>
      )}
    </div>
  );
}
