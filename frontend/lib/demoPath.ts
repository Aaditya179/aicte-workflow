/**
 * The 2-minute path for judges (§8.2, §15.13). Shared by the welcome page and the Guide drawer so
 * both always show the same steps. Each step signs in as the named demo role and opens the screen.
 * Steps must match the seeded demo cases: Case B (Scrutiny, due in 2 days) and the sample lease.
 */
export interface DemoStep {
  id: string;
  role: string;
  roleLabel: string;
  title: string;
  description: string;
  lookFor: string;
  next: string;
  linkText: string;
}

export const SAMPLE_LEASE_HREF = '/samples/sample_lease.png';

export const TWO_MINUTE_STEPS: DemoStep[] = [
  {
    id: 'step-1',
    role: 'institution',
    roleLabel: 'Institution',
    title: 'Submit a new application',
    description: 'Choose Extension of approval, answer Yes to the changes question, accept the declaration and submit.',
    lookFor: 'The route (Scrutiny and EVC) is worked out for you with its reasons, and the application starts in Scrutiny with a due date 15 days away.',
    next: '/applications/new',
    linkText: 'Enter as Institution',
  },
  {
    id: 'step-2',
    role: 'scrutiny_officer',
    roleLabel: 'Scrutiny officer',
    title: 'Review it and move it on',
    description: 'Open the application you just submitted (newest, at the top of the list), read the AI case summary, then press Advance to EVC Queue.',
    lookFor: 'The stage tracker moves to the EVC queue, which the regional officer owns.',
    next: '/applications',
    linkText: 'Enter as Scrutiny officer',
  },
  {
    id: 'step-3',
    role: 'admin',
    roleLabel: 'Admin',
    title: 'Move the clock forward 7 days',
    description: 'In the time simulator, press +7 days.',
    lookFor: 'Case B goes from due in 2 days to 5 days overdue, and its escalations fire.',
    next: '/admin/simulator',
    linkText: 'Enter as Admin',
  },
  {
    id: 'step-4',
    role: 'regional_officer',
    roleLabel: 'Regional officer',
    title: 'See the escalation',
    description: 'Open Alerts and find DEMO-CASE-B, escalated to you at level 2. Press Delivery on it.',
    lookFor: 'Delivery shows in-app, email and SMS for each recipient.',
    next: '/alerts',
    linkText: 'Enter as Regional officer',
  },
  {
    id: 'step-5',
    role: 'institution',
    roleLabel: 'Institution',
    title: 'Renew the lease',
    description: 'Download the sample lease, then upload it on this screen.',
    lookFor: 'The expiry date is read from the document (31 March 2028). Accept it to save.',
    next: '/documents/upload?doc_type=lease&title=Campus%20lease%20renewal',
    linkText: 'Enter as Institution',
  },
  {
    id: 'step-6',
    role: 'bureau_officer',
    roleLabel: 'Bureau officer',
    title: 'Check the audit trail',
    description: 'Open the audit trail and press Verify integrity.',
    lookFor: 'Every entry checks out, and your actions from steps 1 to 5 are listed.',
    next: '/audit',
    linkText: 'Enter as Bureau officer',
  },
];

export function demoLoginHref(role: string, next: string): string {
  return `/login?demo=${role}&next=${encodeURIComponent(next)}`;
}
