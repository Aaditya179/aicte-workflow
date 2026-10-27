'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { fetchApi } from '@/lib/api';
import { card, btnPrimary, btnSecondary, input, label, Notice, Badge, formatDateTime } from '@/components/ui';

interface Communication {
  id: string;
  template_code: string | null;
  channel: string;
  subject: string | null;
  body: string;
  sent_by_name: string | null;
  sent_at: string;
}

const TEMPLATES = [
  { code: 'acknowledgement', label: 'Acknowledgement' },
  { code: 'deficiency_letter', label: 'Deficiency letter' },
  { code: 'deadline_reminder', label: 'Deadline reminder' },
  { code: 'escalation_notice', label: 'Escalation notice' },
  { code: 'renewal_request', label: 'Renewal request' },
  { code: 'undertaking_notice', label: 'Undertaking notice' },
];

/**
 * Standard letters to the institution (§15.7): pick a template, review the filled text, edit,
 * optionally ask the AI to polish the wording, then send. Every send is logged and audited.
 */
export default function CommunicationsPanel({ applicationId, canSend }: { applicationId: string; canSend: boolean }) {
  const [history, setHistory] = useState<Communication[]>([]);
  const [code, setCode] = useState('acknowledgement');
  const [locale, setLocale] = useState('en');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    const { data } = await fetchApi<Communication[]>(`/communications?application_id=${applicationId}`);
    setHistory(data || []);
  }, [applicationId]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  async function preview() {
    setBusy('preview');
    setError(null);
    setNotice(null);
    const { data, error } = await fetchApi<{ subject: string; body: string }>('/communications/preview', {
      method: 'POST',
      body: JSON.stringify({ application_id: applicationId, template_code: code, locale, channel: 'email' }),
    });
    setBusy(null);
    if (!data) return setError(error);
    setSubject(data.subject);
    setBody(data.body);
  }

  async function polish() {
    setBusy('polish');
    setError(null);
    const { data, error } = await fetchApi<{ text: string; mode: string }>('/ai/polish', { method: 'POST', body: JSON.stringify({ text: body }) });
    setBusy(null);
    if (!data) return setError(error);
    setBody(data.text);
    setNotice(data.mode === 'production' ? 'Wording polished by AI. Review it before sending.' : 'AI polishing is not configured, so the text is unchanged.');
  }

  async function send() {
    setBusy('send');
    setError(null);
    const { error } = await fetchApi('/communications/send', {
      method: 'POST',
      body: JSON.stringify({ application_id: applicationId, template_code: code, locale, channel: 'email', subject, body }),
    });
    setBusy(null);
    if (error) return setError(error);
    setNotice('Sent to the institution and recorded in the audit trail.');
    setSubject('');
    setBody('');
    loadHistory();
  }

  return (
    <div className="space-y-6">
      {canSend && (
        <section className={card} aria-labelledby="compose-heading">
          <h2 id="compose-heading" className="mb-4 text-sm font-bold text-stone-900">New message</h2>
          <div className="grid gap-4 sm:grid-cols-[1fr_10rem_auto] sm:items-end">
            <div>
              <label htmlFor="tmpl" className={label}>Template</label>
              <select id="tmpl" className={input} value={code} onChange={(e) => setCode(e.target.value)}>
                {TEMPLATES.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="locale" className={label}>Language</label>
              <select id="locale" className={input} value={locale} onChange={(e) => setLocale(e.target.value)}>
                <option value="en">English</option>
                <option value="hi">हिन्दी (Hindi)</option>
              </select>
            </div>
            <button className={btnSecondary} onClick={preview} disabled={busy !== null}>{busy === 'preview' ? 'Filling…' : 'Fill template'}</button>
          </div>
          {body && (
            <div className="mt-4 space-y-4">
              <div>
                <label htmlFor="subj" className={label}>Subject</label>
                <input id="subj" className={input} value={subject} maxLength={300} onChange={(e) => setSubject(e.target.value)} />
              </div>
              <div>
                <label htmlFor="body" className={label}>Message</label>
                <textarea id="body" className={`${input} min-h-56 font-mono text-[13px] leading-relaxed`} value={body} maxLength={8000} onChange={(e) => setBody(e.target.value)} />
              </div>
              <div className="flex flex-wrap gap-2">
                <button className={btnPrimary} onClick={send} disabled={busy !== null || !body.trim()}>{busy === 'send' ? 'Sending…' : 'Send to institution'}</button>
                <button className={btnSecondary} onClick={polish} disabled={busy !== null || !body.trim()}>{busy === 'polish' ? 'Polishing…' : 'Polish wording with AI'}</button>
              </div>
              <p className="text-xs text-stone-500">The institution reads the full message after signing in. Email carries only the reference number and a link.</p>
            </div>
          )}
          {error && <div className="mt-4"><Notice kind="error">{error}</Notice></div>}
          {notice && <div className="mt-4"><Notice kind="success">{notice}</Notice></div>}
        </section>
      )}
      <section className={card} aria-labelledby="history-heading">
        <h2 id="history-heading" className="mb-3 text-sm font-bold text-stone-900">Messages sent</h2>
        {history.length === 0 ? <p className="text-sm text-stone-500">No messages yet.</p> : (
          <ul className="space-y-4">
            {history.map((c) => (
              <li key={c.id} className="border-b border-[#E8E2D8] pb-4 last:border-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge>{(c.template_code || 'custom').replace('_', ' ')}</Badge>
                  <span className="text-xs text-stone-500">{c.sent_by_name || 'Officer'} · {formatDateTime(c.sent_at)}</span>
                </div>
                {c.subject && <p className="mt-1 font-medium text-stone-900">{c.subject}</p>}
                <p className="mt-1 whitespace-pre-line text-sm text-stone-700">{c.body}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
