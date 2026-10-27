'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { fetchApi } from '@/lib/api';
import { PageShell, card, btnPrimary, btnSecondary, label, Notice, useMe } from '@/components/ui';

const APPLICATION_TYPES = [
  { value: 'extension_of_approval', label: 'Extension of approval' },
  { value: 'increase_in_intake', label: 'Increase in intake' },
  { value: 'new_course', label: 'New course' },
  { value: 'change_of_name', label: 'Change of name or address' },
  { value: 'new_institution', label: 'New institution' },
];

const WORKFLOWS = [
  { code: 'SCRUTINY_EVC', name: 'Scrutiny and EVC', stages: 'Scrutiny (15 days), EVC queue (30), EVC visit (15), final decision (20)' },
  { code: 'ONLY_SCRUTINY', name: 'Only scrutiny', stages: 'Scrutiny (15 days), final decision (20)' },
  { code: 'ONLY_EVC', name: 'Only EVC', stages: 'EVC queue (30 days), EVC visit (15), final decision (20)' },
  { code: 'EVC_SAC_SHC', name: 'EVC and SAC/SHC', stages: 'EVC queue (30 days), EVC visit (15), SAC/SHC (20), final decision (20)' },
];

interface Created { id: string; application_no: string }

export default function NewApplicationPage() {
  const router = useRouter();
  const { me } = useMe();
  const [type, setType] = useState(APPLICATION_TYPES[0].value);
  const [workflow, setWorkflow] = useState(WORKFLOWS[0].code);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { data, error } = await fetchApi<Created>('/applications', {
      method: 'POST',
      body: JSON.stringify({ application_type: type, template_code: workflow }),
    });
    setBusy(false);
    if (error || !data) return setError(error || 'The application could not be submitted.');
    router.push(`/applications/${data.id}`);
  }

  return (
    <PageShell
      title="New application"
      subtitle="Submit an application to AICTE. It starts at the first stage of the workflow, with a due date."
      actions={<Link href="/applications" className={btnSecondary}>Back to applications</Link>}
    >
      {me && me.role !== 'institution' ? (
        <Notice kind="info">Only an institution can submit an application. Sign in as the institution to try it.</Notice>
      ) : (
        <form onSubmit={submit} className={`${card} max-w-2xl space-y-6`}>
          <div>
            <label htmlFor="type" className={label}>What are you applying for?</label>
            <select id="type" value={type} onChange={(e) => setType(e.target.value)}
              className="w-full rounded-lg border border-[#E8E2D8] bg-white px-3 py-2 text-sm text-stone-900 focus:border-[#C25E26] focus:outline-none focus:ring-2 focus:ring-[#FBF0E4]">
              {APPLICATION_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>

          <fieldset>
            <legend className={label}>Workflow</legend>
            <p className="mb-2 text-xs text-stone-500">In the live system AICTE assigns this from the application type. Here you can pick one to try.</p>
            <div className="space-y-2">
              {WORKFLOWS.map((w) => (
                <label key={w.code}
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm transition ${workflow === w.code ? 'border-[#C25E26] bg-[#FBF0E4]' : 'border-[#E8E2D8] bg-white hover:bg-[#FAF7F2]'}`}>
                  <input type="radio" name="workflow" value={w.code} checked={workflow === w.code}
                    onChange={() => setWorkflow(w.code)} className="mt-1 accent-[#C25E26]" />
                  <span>
                    <span className="block font-semibold text-stone-900">{w.name}</span>
                    <span className="block text-xs text-stone-600">{w.stages}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          {error && <Notice kind="error">{error}</Notice>}
          <button type="submit" className={btnPrimary} disabled={busy}>{busy ? 'Submitting…' : 'Submit application'}</button>
        </form>
      )}
    </PageShell>
  );
}
