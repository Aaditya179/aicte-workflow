'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Building2, Route, Loader2, ChevronRight } from 'lucide-react';
import { fetchApi } from '@/lib/api';
import { PageShell, card, btnPrimary, btnSecondary, input, label, Notice, useMe } from '@/components/ui';

const APPLICATION_TYPES = [
  { value: 'extension_of_approval', label: 'Extension of approval', hint: 'Continue running your approved programmes next year' },
  { value: 'increase_in_intake', label: 'Increase in intake', hint: 'Admit more students to an approved course' },
  { value: 'new_course', label: 'New course', hint: 'Start a course you do not run today' },
  { value: 'change_of_name', label: 'Change of name', hint: 'Rename the institution' },
  { value: 'change_of_site', label: 'Change of site', hint: 'Move to a new campus' },
  { value: 'new_institution', label: 'New institution', hint: 'Establish another institution under your trust' },
  { value: 'restoration_of_intake', label: 'Restoration of intake', hint: 'Restore intake that was reduced or withdrawn' },
  { value: 'appeal', label: 'Appeal', hint: 'Appeal against an earlier AICTE decision' },
] as const;

type AppType = (typeof APPLICATION_TYPES)[number]['value'];

const LEVELS = ['Diploma', 'UG', 'PG', 'PG Diploma'];
const DISCIPLINES = [
  'Engineering and Technology', 'Management', 'Pharmacy', 'Architecture', 'Computer Applications',
  'Hotel Management and Catering', 'Applied Arts and Crafts', 'Planning',
];

type Details = Record<string, string | number | boolean>;

interface Stage { key: string; label: string; owner: string; sla_days: number }
interface RoutePreview {
  template_code: string;
  workflow_name: string;
  reasons: string[];
  stages: Stage[];
  total_days: number;
}
interface Institution { name: string; aicte_id: string; city: string | null; state: string | null; regions?: { name: string } | null }
interface Created { id: string; application_no: string }

function academicYears(): string[] {
  const y = new Date().getFullYear();
  return [y + 1, y + 2].map((s) => `${s}-${String((s + 1) % 100).padStart(2, '0')}`);
}

const select = input;

function Field({ id, text, children, hint }: { id: string; text: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <label htmlFor={id} className={label}>{text}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-stone-500">{hint}</p>}
    </div>
  );
}

function YesNo({ name, question, value, onChange }: {
  name: string; question: string; value: boolean | undefined; onChange: (v: boolean) => void;
}) {
  return (
    <fieldset>
      <legend className={label}>{question}</legend>
      <div className="flex gap-2">
        {[true, false].map((v) => (
          <label key={String(v)}
            className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${value === v ? 'border-[#C25E26] bg-[#FBF0E4]' : 'border-[#E8E2D8] bg-white hover:bg-[#FAF7F2]'}`}>
            <input type="radio" name={name} checked={value === v} onChange={() => onChange(v)} className="accent-[#C25E26]" />
            {v ? 'Yes' : 'No'}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export default function NewApplicationPage() {
  const router = useRouter();
  const { me } = useMe();
  const years = academicYears();
  const [institution, setInstitution] = useState<Institution | null>(null);
  const [type, setType] = useState<AppType>('extension_of_approval');
  const [year, setYear] = useState(years[0]);
  const [details, setDetails] = useState<Details>({});
  const [declared, setDeclared] = useState(false);
  const [preview, setPreview] = useState<RoutePreview | null>(null);
  const [previewNote, setPreviewNote] = useState<string | null>(null);
  const [previewFor, setPreviewFor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isInstitution = me?.role === 'institution';
  const previewing = previewFor !== JSON.stringify([type, details]);

  useEffect(() => {
    if (!isInstitution) return;
    fetchApi<{ institution: Institution }>('/dashboard/institution').then(({ data }) => {
      if (data) setInstitution(data.institution);
    });
  }, [isInstitution]);

  // How it will be processed: decided by the server's routing rules, refreshed as the form changes
  useEffect(() => {
    if (!isInstitution) return;
    const key = JSON.stringify([type, details]);
    const t = setTimeout(async () => {
      const { data, error } = await fetchApi<RoutePreview>('/applications/route-preview', {
        method: 'POST',
        body: JSON.stringify({ application_type: type, details }),
      });
      setPreview(data || null);
      setPreviewNote(data ? null : error);
      setPreviewFor(key);
    }, 400);
    return () => clearTimeout(t);
  }, [type, details, isInstitution]);

  const set = (key: string) => (value: string | number | boolean) => setDetails((d) => ({ ...d, [key]: value }));
  const text = (key: string) => ({
    id: key,
    value: (details[key] as string | number | undefined) ?? '',
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => set(key)(e.target.value),
    className: input,
  });

  function chooseType(t: AppType) {
    setType(t);
    setDetails((d): Details => (d.remarks ? { remarks: d.remarks } : {}));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { data, error } = await fetchApi<Created>('/applications', {
      method: 'POST',
      body: JSON.stringify({ application_type: type, academic_year: year, details, declaration: declared }),
    });
    setBusy(false);
    if (error || !data) return setError(error || 'The application could not be submitted.');
    router.push(`/applications/${data.id}`);
  }

  const programme = (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="level" text="Level">
          <select {...text('level')} className={select}>
            <option value="">Select level</option>
            {LEVELS.map((l) => <option key={l}>{l}</option>)}
          </select>
        </Field>
        <Field id="discipline" text="Discipline">
          <select {...text('discipline')} className={select}>
            <option value="">Select discipline</option>
            {DISCIPLINES.map((d) => <option key={d}>{d}</option>)}
          </select>
        </Field>
      </div>
    </>
  );

  const typeFields: Record<AppType, React.ReactNode> = {
    extension_of_approval: (
      <YesNo name="changes" question="Have the land, buildings or programmes changed since the last approval?"
        value={details.changes_since_last_approval as boolean | undefined} onChange={set('changes_since_last_approval')} />
    ),
    increase_in_intake: (
      <>
        {programme}
        <Field id="course_name" text="Course"><input {...text('course_name')} placeholder="e.g. B.Tech Computer Science and Engineering" /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="current_intake" text="Approved intake"><input type="number" min={1} {...text('current_intake')} /></Field>
          <Field id="proposed_intake" text="Proposed intake"><input type="number" min={1} {...text('proposed_intake')} /></Field>
        </div>
        <YesNo name="nba" question="Is the course accredited by NBA?" value={details.nba_accredited as boolean | undefined} onChange={set('nba_accredited')} />
      </>
    ),
    new_course: (
      <>
        {programme}
        <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
          <Field id="course_name" text="Course"><input {...text('course_name')} placeholder="e.g. B.Tech Artificial Intelligence and Data Science" /></Field>
          <Field id="proposed_intake" text="Proposed intake"><input type="number" min={1} {...text('proposed_intake')} /></Field>
        </div>
        <YesNo name="existing" question="Does the institution already run courses in this discipline, with their labs?"
          value={details.existing_discipline as boolean | undefined} onChange={set('existing_discipline')} />
      </>
    ),
    change_of_name: (
      <>
        <Field id="new_name" text="Proposed name"><input {...text('new_name')} /></Field>
        <Field id="reason" text="Reason for the change"><textarea rows={2} {...text('reason')} placeholder="e.g. Resolution of the trust dated 12 August" /></Field>
      </>
    ),
    change_of_site: (
      <>
        <Field id="new_address" text="Address of the new site"><textarea rows={2} {...text('new_address')} /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="land_area" text="Land area"><input {...text('land_area')} placeholder="e.g. 10 acres or 4.05 hectares" /></Field>
          <Field id="land_tenure" text="Land held as">
            <select {...text('land_tenure')} className={select}>
              <option value="">Select</option>
              <option value="owned">Owned</option>
              <option value="leased">Leased (30 years or more)</option>
            </select>
          </Field>
        </div>
      </>
    ),
    new_institution: (
      <>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="proposed_name" text="Name of the new institution"><input {...text('proposed_name')} /></Field>
          <Field id="trust_name" text="Trust or society"><input {...text('trust_name')} /></Field>
        </div>
        <Field id="new_address" text="Address"><textarea rows={2} {...text('new_address')} /></Field>
        <Field id="land_area" text="Land area"><input {...text('land_area')} placeholder="e.g. 10 acres or 4.05 hectares" /></Field>
        {programme}
      </>
    ),
    restoration_of_intake: (
      <>
        <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
          <Field id="course_name" text="Course"><input {...text('course_name')} /></Field>
          <Field id="intake_to_restore" text="Intake to restore"><input type="number" min={1} {...text('intake_to_restore')} /></Field>
        </div>
        <Field id="compliance_summary" text="What has been put right"><textarea rows={3} {...text('compliance_summary')} placeholder="e.g. Faculty vacancies filled, library stock completed" /></Field>
      </>
    ),
    appeal: (
      <>
        <Field id="reference_application_no" text="Application number of the decision appealed"><input {...text('reference_application_no')} className={`${input} font-mono`} /></Field>
        <Field id="grounds" text="Grounds for the appeal"><textarea rows={3} {...text('grounds')} /></Field>
      </>
    ),
  };

  return (
    <PageShell
      title="New application"
      subtitle="Apply to AICTE for the coming academic year. How the application is processed is decided by AICTE's rules, from what you apply for and your institution's record."
      actions={<Link href="/applications" className={btnSecondary}>Back to applications</Link>}
    >
      {me && !isInstitution ? (
        <Notice kind="info">Only an institution can submit an application. Sign in as the institution to try it.</Notice>
      ) : (
        <form onSubmit={submit} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
          <div className="space-y-6">
            <section className={card} aria-labelledby="applicant">
              <h2 id="applicant" className="mb-3 flex items-center gap-2 text-sm font-semibold text-stone-900">
                <Building2 className="h-4 w-4 text-[#C25E26]" aria-hidden="true" /> Applicant
              </h2>
              {institution ? (
                <dl className="grid gap-3 text-sm sm:grid-cols-3">
                  <div className="sm:col-span-3"><dt className="text-xs text-stone-500">Institution</dt><dd className="font-semibold text-stone-900">{institution.name}</dd></div>
                  <div><dt className="text-xs text-stone-500">AICTE ID</dt><dd className="font-mono text-xs text-stone-900">{institution.aicte_id}</dd></div>
                  <div><dt className="text-xs text-stone-500">Location</dt><dd className="text-stone-900">{[institution.city, institution.state].filter(Boolean).join(', ') || '—'}</dd></div>
                  <div><dt className="text-xs text-stone-500">Regional office</dt><dd className="text-stone-900">{institution.regions?.name || '—'}</dd></div>
                </dl>
              ) : (
                <div className="h-10 animate-pulse rounded bg-stone-100" aria-label="Loading institution" />
              )}
            </section>

            <section className={`${card} space-y-5`} aria-labelledby="application">
              <h2 id="application" className="text-sm font-semibold text-stone-900">Application</h2>
              <Field id="year" text="Academic year">
                <select id="year" value={year} onChange={(e) => setYear(e.target.value)} className={`${select} sm:w-48`}>
                  {years.map((y) => <option key={y}>{y}</option>)}
                </select>
              </Field>
              <fieldset>
                <legend className={label}>What are you applying for?</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {APPLICATION_TYPES.map((t) => (
                    <label key={t.value}
                      className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm transition ${type === t.value ? 'border-[#C25E26] bg-[#FBF0E4]' : 'border-[#E8E2D8] bg-white hover:bg-[#FAF7F2]'}`}>
                      <input type="radio" name="type" value={t.value} checked={type === t.value}
                        onChange={() => chooseType(t.value)} className="mt-1 accent-[#C25E26]" />
                      <span>
                        <span className="block font-semibold text-stone-900">{t.label}</span>
                        <span className="block text-xs text-stone-600">{t.hint}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            </section>

            <section className={`${card} space-y-4`} aria-labelledby="details">
              <h2 id="details" className="text-sm font-semibold text-stone-900">Details</h2>
              {typeFields[type]}
              <Field id="remarks" text="Remarks (optional)"><textarea rows={2} {...text('remarks')} /></Field>
            </section>

            <section className={`${card} space-y-4`}>
              <label className="flex cursor-pointer items-start gap-3 text-sm text-stone-700">
                <input type="checkbox" checked={declared} onChange={(e) => setDeclared(e.target.checked)} className="mt-1 accent-[#C25E26]" />
                <span>
                  I declare that the information given is true and complete, and that the institution meets the norms of the
                  Approval Process Handbook. I understand that approval may be withdrawn if any of it is found to be false.
                </span>
              </label>
              {error && <Notice kind="error">{error}</Notice>}
              <button type="submit" className={btnPrimary} disabled={busy || !declared || !preview}>
                {busy ? 'Submitting…' : 'Submit application'}
              </button>
            </section>
          </div>

          <aside className={`${card} lg:sticky lg:top-6`} aria-labelledby="processing" aria-live="polite">
            <h2 id="processing" className="flex items-center gap-2 text-sm font-semibold text-stone-900">
              <Route className="h-4 w-4 text-[#C25E26]" aria-hidden="true" /> How it will be processed
              {previewing && <Loader2 className="h-3.5 w-3.5 animate-spin text-stone-400" aria-label="Updating" />}
            </h2>
            {preview ? (
              <div className="mt-3 space-y-4">
                <p className="text-base font-serif font-bold text-[#1C1917]">{preview.workflow_name}</p>
                <ul className="space-y-1.5 text-sm text-stone-700">
                  {preview.reasons.map((r) => <li key={r} className="flex gap-2"><ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-[#C25E26]" aria-hidden="true" />{r}</li>)}
                </ul>
                <ol className="border-l-2 border-[#F0D5BE] pl-4">
                  {preview.stages.map((s, i) => (
                    <li key={s.key} className="relative pb-3 last:pb-0">
                      <span className="absolute -left-[1.4rem] top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-[#C25E26] text-[10px] font-bold text-white">{i + 1}</span>
                      <p className="text-sm font-semibold text-stone-900">{s.label}</p>
                      <p className="text-xs text-stone-500">{s.owner} · {s.sla_days} days</p>
                    </li>
                  ))}
                </ol>
                <p className="text-xs text-stone-500">
                  About {preview.total_days} days in all if no stage is late and nothing is returned to you. Each case is
                  assigned to the officer with the fewest open cases in your region.
                </p>
              </div>
            ) : (
              <p className="mt-3 text-sm text-stone-500">
                {previewNote ? `Fill in the details to see the route. ${previewNote}.` : 'Working out the route…'}
              </p>
            )}
            <p className="mt-4 border-t border-[#F0EBE3] pt-3 text-xs text-stone-500">
              Decided by AICTE&apos;s routing rules and recorded with the application. Applicants cannot choose it.
            </p>
          </aside>
        </form>
      )}
    </PageShell>
  );
}
