'use client';

import React, { useState } from 'react';
import { fetchApi } from '@/lib/api';
import { btnPrimary, btnSecondary, btnDanger, input, label, Notice, formatDate } from '@/components/ui';
import type { UploadedDocument } from '@/components/DocumentUpload';

/**
 * Expiry date suggested by OCR (§15.3). The suggestion is never trusted on its own:
 * valid_until changes only when someone accepts or enters the date here.
 */
export default function OcrSuggestion({ doc, onChange }: { doc: UploadedDocument; onChange: (doc: UploadedDocument) => void }) {
  const [editing, setEditing] = useState(false);
  const [date, setDate] = useState(doc.ocr_suggested_expiry || doc.valid_until || '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ocr = doc.metadata?.ocr || {};

  async function respond(action: 'accept' | 'edit' | 'reject') {
    setBusy(true);
    setError(null);
    const body = action === 'edit' ? { valid_until: date } : {};
    const { data, error } = await fetchApi<UploadedDocument>(`/documents/${doc.id}/ocr/${action}`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (error || !data) return setError(error || 'Could not save');
    setEditing(false);
    onChange({ ...doc, ...data });
  }

  const dateForm = (
    <div className="flex flex-wrap items-end gap-3">
      <div>
        <label htmlFor="expiry" className={label}>Expiry date</label>
        <input id="expiry" type="date" className={input} value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      <button className={btnPrimary} disabled={busy || !date} onClick={() => respond('edit')}>Save date</button>
      {editing && <button className={btnSecondary} onClick={() => setEditing(false)}>Cancel</button>}
    </div>
  );

  if (doc.ocr_status === 'accepted' || doc.ocr_status === 'edited' || (doc.valid_until && doc.ocr_status !== 'suggested')) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-stone-700">
          Expiry date confirmed: <strong>{formatDate(doc.valid_until)}</strong>
          {doc.ocr_status === 'accepted' && ' (OCR suggestion accepted)'}
          {doc.ocr_status === 'edited' && ' (entered by hand)'}
        </p>
        {editing ? dateForm : <button className={btnSecondary} onClick={() => setEditing(true)}>Change date</button>}
        {error && <Notice kind="error">{error}</Notice>}
      </div>
    );
  }

  if (doc.ocr_status !== 'suggested') {
    return (
      <div className="space-y-3">
        <Notice kind="warning">
          {doc.ocr_status === 'rejected'
            ? 'Suggestion rejected. Enter the expiry date from the document.'
            : ocr.message || 'Could not read the date, enter it manually'}
        </Notice>
        {dateForm}
        {error && <Notice kind="error">{error}</Notice>}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-stone-700">
        Suggested expiry date: <strong>{formatDate(doc.ocr_suggested_expiry)}</strong>{' '}
        <span className="text-stone-500">({Math.round((doc.ocr_confidence || 0) * 100)}% confidence)</span>
      </p>
      {ocr.evidence_text && (
        <blockquote className="border-l-4 border-[#C25E26] bg-[#FBF0E4] px-3 py-2 text-sm text-stone-800">
          “{ocr.evidence_text}”
        </blockquote>
      )}
      <p className="text-xs text-stone-500">Read by an AI model. Check it against the document before accepting.</p>
      {editing ? dateForm : (
        <div className="flex flex-wrap gap-2">
          <button className={btnPrimary} disabled={busy} onClick={() => respond('accept')}>Accept date</button>
          <button className={btnSecondary} disabled={busy} onClick={() => setEditing(true)}>Edit date</button>
          <button className={btnDanger} disabled={busy} onClick={() => respond('reject')}>Reject suggestion</button>
        </div>
      )}
      {error && <Notice kind="error">{error}</Notice>}
    </div>
  );
}
