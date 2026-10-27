import React from 'react';
import Link from 'next/link';
import { FileText, Route } from 'lucide-react';

export const TYPE_LABELS: Record<string, string> = {
  extension_of_approval: 'Extension of approval',
  increase_in_intake: 'Increase in intake',
  new_course: 'New course',
  change_of_name: 'Change of name',
  change_of_site: 'Change of site',
  new_institution: 'New institution',
  restoration_of_intake: 'Restoration of intake',
  appeal: 'Appeal against a decision',
};

export function typeLabel(type: string) {
  return TYPE_LABELS[type] || type;
}

const FIELD_LABELS: Record<string, string> = {
  changes_since_last_approval: 'Changes since last approval',
  level: 'Level',
  discipline: 'Discipline',
  course_name: 'Course',
  current_intake: 'Approved intake',
  proposed_intake: 'Proposed intake',
  nba_accredited: 'NBA accredited',
  existing_discipline: 'Discipline already run',
  new_name: 'Proposed name',
  reason: 'Reason',
  new_address: 'Address',
  land_area: 'Land area',
  land_tenure: 'Land held as',
  proposed_name: 'Name of the new institution',
  trust_name: 'Trust or society',
  intake_to_restore: 'Intake to restore',
  compliance_summary: 'What has been put right',
  reference_application_no: 'Decision appealed',
  grounds: 'Grounds',
  remarks: 'Remarks',
};

export interface ApplicationForm {
  document_id: string;
  academic_year: string;
  details: Record<string, string | number | boolean>;
  routing: { template_code: string; workflow_name: string; reasons: string[] };
}

function show(v: string | number | boolean) {
  return typeof v === 'boolean' ? (v ? 'Yes' : 'No') : String(v);
}

/** What the institution submitted, and why the case follows the workflow it does. */
export default function ApplicationFormCard({ form }: { form: ApplicationForm }) {
  return (
    <div className="bg-white rounded-2xl border border-[#E8E2D8] p-5 shadow-2xs space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-serif font-bold text-[#1C1917] uppercase tracking-wider">Application</h2>
        <Link href={`/documents/${form.document_id}`} className="flex items-center gap-1 text-xs font-medium text-[#C25E26] hover:underline">
          <FileText className="h-3.5 w-3.5" aria-hidden="true" /> Form in the case file
        </Link>
      </div>
      <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
        <div><dt className="text-xs text-stone-500">Academic year</dt><dd className="text-stone-900">{form.academic_year}</dd></div>
        {Object.entries(form.details).map(([k, v]) => (
          <div key={k} className={String(v).length > 40 ? 'sm:col-span-2' : ''}>
            <dt className="text-xs text-stone-500">{FIELD_LABELS[k] || k}</dt>
            <dd className="text-stone-900 break-words">{show(v)}</dd>
          </div>
        ))}
      </dl>
      <div className="rounded-xl bg-[#FAF7F2] border border-[#F0EBE3] p-3">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-stone-700">
          <Route className="h-3.5 w-3.5 text-[#C25E26]" aria-hidden="true" /> Routed to {form.routing.workflow_name}
        </p>
        <ul className="mt-1 space-y-0.5 text-xs text-stone-600">
          {form.routing.reasons.map((r) => <li key={r}>{r}</li>)}
        </ul>
      </div>
    </div>
  );
}
