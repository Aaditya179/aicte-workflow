'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Bot, Loader2, Send, Copy, Check, ChevronDown, Megaphone } from 'lucide-react';
import { fetchApi } from '@/lib/api';

const COPILOT_ROLES = ['scrutiny_officer', 'regional_officer', 'bureau_officer', 'evc_member', 'sac_shc_member'];

const SUGGESTIONS = [
  'Why is this case delayed?',
  'Who is holding it and since when?',
  'What happened at each stage?',
];

interface Turn { role: 'user' | 'assistant'; content: string; mode?: string; facts?: string[] }
interface Answer { answer: string; mode: string; facts: string[]; advisory: string }
interface Recipient { user_id: string; name: string; role: string }
interface Draft { subject: string; body: string; mode: string; recipients: Recipient[]; advisory: string }

function wantsDraft(q: string) {
  const s = q.toLowerCase();
  return /escalat/.test(s) && /(draft|write|prepare|compose|message|mail|note)/.test(s);
}

function ModeNote({ mode }: { mode?: string }) {
  if (!mode || mode === 'production') return null;
  return (
    <span className="mt-1 block text-[10px] text-stone-500">
      {mode === 'mock' ? 'Built from the case record (AI unavailable).' : 'Built from the case record: the AI answer was set aside because it stated a number the record does not contain.'}
    </span>
  );
}

/**
 * Case copilot: ask about this case in plain words. Answers come only from the case record, and
 * every number in them is checked against it. Escalation messages are drafted here, and sent
 * only when the officer reviews and sends them.
 */
export default function CaseCopilot({ applicationId, role }: { applicationId: string; role: string | undefined }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [recipient, setRecipient] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [turns, draft, busy]);

  if (!role || !COPILOT_ROLES.includes(role)) return null;

  async function requestDraft(asked?: string) {
    setBusy(true);
    setError(null);
    setSent(null);
    if (asked) setTurns((t) => [...t, { role: 'user', content: asked }]);
    const { data, error } = await fetchApi<Draft>('/ai/copilot/escalation-draft', {
      method: 'POST', body: JSON.stringify({ application_id: applicationId }),
    });
    setBusy(false);
    if (!data) return setError(error || 'The draft could not be prepared.');
    setDraft(data);
    setRecipient(data.recipients[0]?.user_id || '');
  }

  async function ask(q: string) {
    const text = q.trim();
    if (!text || busy) return;
    setQuestion('');
    if (wantsDraft(text)) return requestDraft(text);
    const history = turns.map(({ role, content }) => ({ role, content }));
    setTurns((t) => [...t, { role: 'user', content: text }]);
    setBusy(true);
    setError(null);
    const { data, error } = await fetchApi<Answer>('/ai/copilot', {
      method: 'POST', body: JSON.stringify({ application_id: applicationId, question: text, history }),
    });
    setBusy(false);
    if (!data) return setError(error || 'The copilot could not answer.');
    setTurns((t) => [...t, { role: 'assistant', content: data.answer, mode: data.mode, facts: data.facts }]);
  }

  async function send() {
    if (!draft || !recipient) return;
    setSending(true);
    setError(null);
    const { data, error } = await fetchApi<{ sent: boolean; recipient: string }>('/ai/copilot/escalation-send', {
      method: 'POST',
      body: JSON.stringify({ application_id: applicationId, recipient_id: recipient, subject: draft.subject, body: draft.body }),
    });
    setSending(false);
    if (!data) return setError(error || 'The message could not be sent.');
    setSent(`Sent to ${data.recipient} as an in-app message, and recorded in the audit trail.`);
    setDraft(null);
  }

  async function copy() {
    if (!draft) return;
    try {
      await navigator.clipboard.writeText(`${draft.subject}\n\n${draft.body}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError('Copying is blocked in this browser; select the text instead.');
    }
  }

  return (
    <section className="bg-white rounded-2xl border border-[#E8E2D8] shadow-2xs" aria-labelledby="copilot-heading">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#F0EBE3] px-5 py-4">
        <h2 id="copilot-heading" className="text-base font-serif font-bold text-[#1C1917] flex items-center gap-2">
          <Bot className="w-5 h-5 text-[#C25E26]" aria-hidden="true" /> Case copilot
          <span className="text-[10px] font-sans font-semibold bg-[#FBF0E4] text-[#C25E26] border border-[#F0D5BE] px-2 py-0.5 rounded-full">AI · advisory</span>
        </h2>
        <button type="button" onClick={() => requestDraft()} disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-full border border-[#E8E2D8] bg-white px-3 py-1 text-xs font-medium text-stone-700 hover:border-[#C25E26] hover:text-[#C25E26] disabled:opacity-50 cursor-pointer">
          <Megaphone className="h-3.5 w-3.5" aria-hidden="true" /> Draft escalation
        </button>
      </div>

      <div ref={listRef} className="max-h-[28rem] overflow-y-auto px-5 py-4 space-y-3" aria-live="polite">
        {turns.length === 0 && !draft && !busy && (
          <p className="text-sm text-stone-600">
            Ask about this case. Answers come only from its record: stage history, deadlines, returns,
            alerts, the EVC visit and documents.
          </p>
        )}

        {turns.map((t, i) => t.role === 'user' ? (
          <div key={i} className="flex justify-end">
            <p className="max-w-[85%] rounded-2xl rounded-br-sm bg-[#C25E26] px-3.5 py-2 text-sm text-white">{t.content}</p>
          </div>
        ) : (
          <div key={i} className="max-w-[90%]">
            <div className="rounded-2xl rounded-bl-sm bg-[#FAF7F2] border border-[#F0EBE3] px-3.5 py-2 text-sm text-stone-800 leading-relaxed">
              {t.content}
              <ModeNote mode={t.mode} />
            </div>
            {t.facts && t.facts.length > 0 && (
              <details className="group mt-1 text-xs text-stone-500">
                <summary className="inline-flex cursor-pointer items-center gap-1 hover:text-[#C25E26]">
                  <ChevronDown className="h-3 w-3 transition group-open:rotate-180" aria-hidden="true" /> Case record used
                </summary>
                <ol className="mt-1 list-decimal space-y-0.5 pl-5">
                  {t.facts.map((f) => <li key={f}>{f}</li>)}
                </ol>
              </details>
            )}
          </div>
        ))}

        {busy && (
          <p className="flex items-center gap-2 text-xs text-stone-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> Reading the case record…
          </p>
        )}

        {draft && (
          <div className="rounded-xl border border-[#F0D5BE] bg-[#FFFBF7] p-4 space-y-3">
            <p className="text-xs font-semibold text-[#C25E26]">
              Escalation draft: review and edit before sending
              {draft.mode !== 'production' && <span className="ml-1 font-normal text-stone-500">(built from the case record)</span>}
            </p>
            {draft.recipients.length > 0 ? (
              <div>
                <label htmlFor="esc-to" className="block text-xs font-semibold text-stone-600 mb-1">To</label>
                <select id="esc-to" value={recipient} onChange={(e) => setRecipient(e.target.value)}
                  className="w-full rounded-lg border border-[#E8E2D8] bg-white px-3 py-2 text-sm focus:border-[#C25E26] focus:outline-none">
                  {draft.recipients.map((r) => <option key={r.user_id} value={r.user_id}>{r.name} ({r.role})</option>)}
                </select>
              </div>
            ) : (
              <p className="text-xs text-stone-600">There is nobody above you in this case&apos;s escalation chain; copy the draft instead.</p>
            )}
            <div>
              <label htmlFor="esc-subject" className="block text-xs font-semibold text-stone-600 mb-1">Subject</label>
              <input id="esc-subject" value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
                className="w-full rounded-lg border border-[#E8E2D8] bg-white px-3 py-2 text-sm focus:border-[#C25E26] focus:outline-none" />
            </div>
            <div>
              <label htmlFor="esc-body" className="block text-xs font-semibold text-stone-600 mb-1">Message</label>
              <textarea id="esc-body" rows={7} value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                className="w-full rounded-lg border border-[#E8E2D8] bg-white px-3 py-2 text-sm leading-relaxed focus:border-[#C25E26] focus:outline-none" />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {draft.recipients.length > 0 && (
                <button type="button" onClick={send} disabled={sending || !draft.subject.trim() || !draft.body.trim()}
                  className="inline-flex items-center gap-1.5 rounded-full bg-[#C25E26] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#A84A19] disabled:opacity-50 cursor-pointer">
                  {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Send className="h-3.5 w-3.5" aria-hidden="true" />} Send
                </button>
              )}
              <button type="button" onClick={copy}
                className="inline-flex items-center gap-1.5 rounded-full border border-[#E8E2D8] bg-white px-4 py-1.5 text-xs font-medium text-stone-700 hover:bg-[#FAF7F2] cursor-pointer">
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />} {copied ? 'Copied' : 'Copy'}
              </button>
              <button type="button" onClick={() => setDraft(null)} className="text-xs text-stone-500 hover:text-stone-800 cursor-pointer">Discard</button>
            </div>
          </div>
        )}

        {sent && <p className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-xs text-emerald-800">{sent}</p>}
        {error && <p className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">{error}</p>}
      </div>

      <div className="border-t border-[#F0EBE3] px-5 py-3 space-y-2">
        {turns.length === 0 && (
          <div className="flex flex-wrap gap-1.5">
            {SUGGESTIONS.map((s) => (
              <button key={s} type="button" onClick={() => ask(s)} disabled={busy}
                className="rounded-full border border-[#E8E2D8] px-2.5 py-0.5 text-xs text-stone-700 hover:border-[#C25E26] hover:text-[#C25E26] disabled:opacity-50 cursor-pointer">
                {s}
              </button>
            ))}
          </div>
        )}
        <form onSubmit={(e) => { e.preventDefault(); ask(question); }} className="flex gap-2">
          <label htmlFor="copilot-q" className="sr-only">Ask about this case</label>
          <input id="copilot-q" value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={1000}
            placeholder="Ask about this case, or ask for an escalation draft"
            className="flex-1 min-w-0 rounded-full border border-[#E8E2D8] bg-white px-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#C25E26]" />
          <button type="submit" disabled={busy || !question.trim()} aria-label="Ask"
            className="inline-flex items-center justify-center rounded-full bg-[#C25E26] px-4 text-white hover:bg-[#A84A19] disabled:opacity-50 cursor-pointer">
            <Send className="h-4 w-4" aria-hidden="true" />
          </button>
        </form>
        <p className="text-[11px] text-stone-500">
          Advisory only, final decisions rest with the competent authority. Every number in an answer is checked against the case record.
        </p>
      </div>
    </section>
  );
}
