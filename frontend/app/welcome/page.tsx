'use client';

import React from 'react';
import Link from 'next/link';
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  Building2,
  MapPin,
  Settings,
  HelpCircle,
  ArrowRight,
  Sparkles,
  FileText,
  UserCheck,
  BookOpen,
  CheckSquare,
  Zap,
  Download,
  CalendarCheck,
  Scale,
  Eye,
  Bell,
  Mail,
  MessageSquare,
} from 'lucide-react';
import { TWO_MINUTE_STEPS, SAMPLE_LEASE_HREF, demoLoginHref } from '@/lib/demoPath';
import ServerWakeNote from '@/components/ServerWakeNote';

const DEMO_ROLES = [
  { role: 'institution', label: 'Institution', icon: FileText, does: 'Submits applications, answers deficiencies, renews documents and sees its compliance calendar.' },
  { role: 'scrutiny_officer', label: 'Scrutiny officer', icon: UserCheck, does: 'Reviews applications, reads the AI case summary, returns for deficiency or moves the case on.' },
  { role: 'regional_officer', label: 'Regional officer', icon: MapPin, does: 'Watches the region’s queue, gets escalations, reassigns work and schedules EVC visits.' },
  { role: 'evc_member', label: 'EVC member', icon: Eye, does: 'Marks availability for visits and files the inspection report.' },
  { role: 'sac_shc_member', label: 'SAC/SHC member', icon: Scale, does: 'Handles the cases assigned to the standing committee stage.' },
  { role: 'bureau_officer', label: 'Bureau officer', icon: Building2, does: 'Takes final decisions with Decision Assurance and verifies the audit trail.' },
  { role: 'admin', label: 'Admin', icon: Settings, does: 'Edits time limits, escalation chains and workflows, and runs the time simulator. No access to cases.' },
  { role: 'auditor', label: 'Auditor', icon: BookOpen, does: 'Reads the audit trail and document access logs. Cannot change anything.' },
];

const WORKFLOWS = [
  { name: 'Only scrutiny', stages: [['Scrutiny', 15], ['Final decision', 20]] },
  { name: 'Scrutiny and EVC', stages: [['Scrutiny', 15], ['EVC queue', 30], ['EVC visit', 15], ['Final decision', 20]] },
  { name: 'Only EVC', stages: [['EVC queue', 30], ['EVC visit', 15], ['Final decision', 20]] },
  { name: 'EVC and SAC/SHC', stages: [['EVC queue', 30], ['EVC visit', 15], ['SAC/SHC', 20], ['Final decision', 20]] },
] as const;

const FEATURES = [
  {
    title: 'Run the approval',
    items: [
      'Four workflows. Each case moves to the next stage when its owner finishes the current one.',
      'Return for deficiency sends the case to the institution, then to re-scrutiny. Regional and bureau officers can revert a stage with a reason.',
      'A dashboard for each role, with workload and the cases that need attention first.',
      'EVC queue with the three best visit dates: weekdays when every member is free, with local members preferred.',
      'Undertakings with due dates and uploaded evidence.',
      'Letters and notices from English and Hindi templates, with AI help on wording.',
    ],
  },
  {
    title: 'Watch every deadline',
    items: [
      'A time limit for every stage, with reminders before it ends.',
      'Escalation in three levels by in-app alert, email, SMS and WhatsApp, tracked per recipient, with a fallback channel when a critical message fails.',
      'Alerts appear live in the bell, without a page refresh.',
      'Lease and document expiry alerts. On upload, the expiry date is read from the document and saved only after a person confirms it.',
      'A compliance calendar showing each institution what is due next.',
      'A delay-risk flag on each case and a health score for each institution.',
    ],
  },
  {
    title: 'Keep decisions trustworthy',
    items: [
      'Decision Assurance runs seven checks before a decision is committed, then rechecks later if the evidence goes stale.',
      'A tamper-evident audit trail. Verify integrity re-checks every entry in the chain.',
      'Changes to time limits, escalation chains and workflows take effect only after a second admin approves them.',
      'The admin has no access to cases. Officers sign in with an authenticator app, and repeated failed sign-ins lock the account.',
      'Documents are opened through links that expire in 5 minutes. Every view and download is logged.',
      'AI summaries and drafts are labelled advisory and never decide anything.',
    ],
  },
];

const ESCALATION = [
  { level: 1, day: 'Day 0 overdue', to: 'Assigned officer', channels: [['In-app', Bell], ['Email', Mail]], tone: 'text-[#C25E26]' },
  { level: 2, day: 'Day 3 overdue', to: 'Regional officer', channels: [['In-app', Bell], ['Email', Mail], ['SMS', MessageSquare]], tone: 'text-amber-500' },
  { level: 3, day: 'Day 7 overdue', to: 'Bureau officers', channels: [['In-app', Bell], ['Email', Mail], ['SMS', MessageSquare], ['WhatsApp', MessageSquare]], tone: 'text-rose-400' },
] as const;

export default function WelcomePage() {
  const openHelpDrawer = (tab: 'checkpoints' | 'glossary' | 'roles' = 'checkpoints') => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('open-help-drawer', { detail: { tab } }));
    }
  };

  const focusRing = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C25E26]';

  return (
    <div className="min-h-screen bg-[#FAF7F2] bg-grid-texture text-[#1C1917] selection:bg-[#FBF0E4] selection:text-[#C25E26] font-sans">
      {/* 1. Header */}
      <header className="sticky top-0 z-30 w-full bg-transparent border-none pt-3 sm:pt-4 pb-2 px-4 sm:px-6 pointer-events-none">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-3">
          <div className="pointer-events-auto flex items-center">
            <Link
              href="/welcome"
              className={`inline-flex items-center transition hover:opacity-85 ${focusRing}`}
              title="Nirikshan - AICTE Approval Workflow & Compliance Monitoring System"
            >
              <img src="/nirikshan-header-logo.png" alt="Nirikshan" className="h-9 sm:h-10 w-auto object-contain" />
            </Link>
          </div>

          <nav aria-label="Page sections" className="pointer-events-auto hidden md:flex items-center gap-1.5 bg-white/95 backdrop-blur-md border border-[#E8E2D8] px-4 py-1.5 rounded-full shadow-xs text-xs font-semibold text-stone-600">
            <a href="#two-minute-path" className={`px-3 py-1 rounded-full text-[#C25E26] bg-[#FBF0E4] border border-[#F0D5BE] flex items-center gap-1 ${focusRing}`}>
              <Zap className="w-3.5 h-3.5 text-[#C25E26]" aria-hidden />
              <span>2-minute path</span>
            </a>
            <a href="#demo-roles" className={`px-3 py-1 rounded-full hover:text-[#C25E26] hover:bg-stone-100/70 transition ${focusRing}`}>Demo roles</a>
            <a href="#features" className={`px-3 py-1 rounded-full hover:text-[#C25E26] hover:bg-stone-100/70 transition ${focusRing}`}>Features</a>
            <a href="#escalation" className={`px-3 py-1 rounded-full hover:text-[#C25E26] hover:bg-stone-100/70 transition ${focusRing}`}>Escalation</a>
            <button
              onClick={() => openHelpDrawer('glossary')}
              className={`px-3 py-1 rounded-full hover:text-[#C25E26] hover:bg-stone-100/70 transition cursor-pointer flex items-center gap-1 ${focusRing}`}
            >
              <HelpCircle className="w-3.5 h-3.5 text-[#C25E26]" aria-hidden />
              <span>Guide &amp; glossary</span>
            </button>
          </nav>

          <div className="pointer-events-auto flex items-center gap-2">
            <Link
              href="/login"
              className={`px-5 py-2.5 rounded-full bg-[#C25E26] hover:bg-[#A84A19] text-white text-xs font-bold transition shadow-sm shadow-[#C25E26]/20 flex items-center gap-1.5 cursor-pointer ${focusRing}`}
            >
              <span>Sign in</span>
              <ArrowRight className="w-3.5 h-3.5" aria-hidden />
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* 2. Hero */}
        <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-12 pb-16">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
            <div className="lg:col-span-7 space-y-6">
              <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-[#FBF0E4] border border-[#F0D5BE] text-[#C25E26] text-xs font-semibold shadow-2xs">
                <Sparkles className="w-3.5 h-3.5 text-[#C25E26]" aria-hidden />
                <span>SIH26262 prototype</span>
              </div>

              <h1 className="text-3xl sm:text-5xl lg:text-[3.25rem] font-serif font-bold tracking-tight text-[#1C1917] leading-[1.12]">
                Every AICTE approval, tracked against its deadline.
              </h1>

              <p className="text-base text-stone-600 leading-relaxed max-w-xl">
                Each case moves to the next stage when its owner is done. When a stage runs late, the right
                officer hears about it the same day, and the escalation climbs until someone acts.
              </p>

              <div className="flex flex-wrap items-center gap-3.5 pt-1">
                <Link
                  href="/login?demo=regional_officer"
                  className={`px-6 py-3 rounded-full bg-[#C25E26] hover:bg-[#A84A19] text-white font-medium text-sm transition shadow-sm shadow-[#C25E26]/25 flex items-center gap-2 cursor-pointer ${focusRing}`}
                >
                  <span>Enter as Regional officer</span>
                  <ArrowRight className="w-4 h-4" aria-hidden />
                </Link>
                <a
                  href="#two-minute-path"
                  className={`px-6 py-3 rounded-full bg-[#FBF0E4] hover:bg-[#F5EBE1] border-2 border-[#C25E26] text-[#C25E26] font-bold text-sm transition shadow-2xs flex items-center gap-2 cursor-pointer ${focusRing}`}
                >
                  <Zap className="w-4 h-4 text-[#C25E26]" aria-hidden />
                  <span>See the 2-minute path</span>
                </a>
              </div>

              <p className="text-xs text-stone-600 bg-white/80 border border-[#E8E2D8] p-2.5 rounded-xl max-w-lg">
                All data is dummy. The connection to the AICTE portal is simulated, and SMS and WhatsApp
                messages are logged instead of sent.
              </p>
              <ServerWakeNote className="max-w-lg" />

              <ul className="pt-1 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-stone-500">
                <li className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-[#C25E26]" aria-hidden /> Time limit on every stage</li>
                <li className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-[#C25E26]" aria-hidden /> Three escalation levels</li>
                <li className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-[#C25E26]" aria-hidden /> Tamper-evident audit trail</li>
              </ul>
            </div>

            {/* Case B: the case the simulator step acts on */}
            <div className="lg:col-span-5 bg-white rounded-2xl border border-[#E8E2D8] p-6 shadow-2xs">
              <div className="flex items-center justify-between gap-3 pb-4 border-b border-[#E8E2D8]">
                <div>
                  <span className="text-[11px] font-semibold text-stone-500 block">Demo case in the data</span>
                  <h2 className="font-serif font-bold text-base text-[#1C1917] mt-0.5">DEMO-CASE-B · Demo Institute of Technology</h2>
                </div>
                <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-[#FBF0E4] text-[#C25E26] border border-[#F0D5BE] whitespace-nowrap">
                  In scrutiny
                </span>
              </div>

              <ol className="py-5 space-y-4 relative">
                <div className="absolute left-3.5 top-6 bottom-6 w-0.5 bg-[#E8E2D8]" aria-hidden />
                <li className="flex items-start gap-3 relative">
                  <div className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center flex-shrink-0 border border-emerald-200">
                    <CheckCircle2 className="w-4 h-4" aria-hidden />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-bold text-[#1C1917]">Submitted</p>
                      <span className="text-[10px] font-mono text-emerald-700 font-semibold">Done</span>
                    </div>
                    <p className="text-[11px] text-stone-500 mt-0.5">Only-scrutiny workflow, Western region</p>
                  </div>
                </li>
                <li className="flex items-start gap-3 relative">
                  <div className="w-7 h-7 rounded-full bg-[#C25E26] text-white flex items-center justify-center flex-shrink-0 shadow-2xs">
                    <Clock className="w-4 h-4 text-white" aria-hidden />
                  </div>
                  <div className="flex-1 bg-[#FAF7F2] p-2.5 rounded-xl border border-[#E8E2D8]">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-bold text-[#C25E26]">Scrutiny</p>
                      <span className="text-[10px] font-mono font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                        Due in 2 days
                      </span>
                    </div>
                    <p className="text-[11px] text-stone-600 mt-1">13 of its 15 days used. Owned by the scrutiny officer.</p>
                  </div>
                </li>
                <li className="flex items-start gap-3 relative opacity-60">
                  <div className="w-7 h-7 rounded-full bg-stone-100 text-stone-400 flex items-center justify-center flex-shrink-0 border border-[#E8E2D8]">
                    <Scale className="w-3.5 h-3.5" aria-hidden />
                  </div>
                  <div className="flex-1">
                    <p className="text-xs font-semibold text-stone-700">Final decision</p>
                    <p className="text-[11px] text-stone-500">Bureau officer, after Decision Assurance checks</p>
                  </div>
                </li>
              </ol>

              <div className="hero-escalation mt-1 p-3.5 rounded-xl bg-[#1C1917] text-white">
                <div className="flex items-center gap-2 text-xs font-bold">
                  <AlertTriangle className="w-4 h-4 text-amber-400" aria-hidden />
                  After step 3 (+7 days): 5 days overdue
                </div>
                <ul className="mt-2 space-y-1 text-[11px] text-stone-300">
                  <li>Level 1 to the scrutiny officer: in-app and email</li>
                  <li>Level 2 to the regional officer: in-app, email and SMS</li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* 3. The 2-minute path */}
        <section id="two-minute-path" aria-labelledby="path-heading" className="max-w-6xl mx-auto px-4 sm:px-6 py-14 border-t border-[#E8E2D8] scroll-mt-20">
          <div className="p-6 sm:p-10 rounded-3xl bg-white border-2 border-[#C25E26]/40 shadow-sm">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-6 border-b border-[#E8E2D8]">
              <div>
                <h2 id="path-heading" className="text-2xl sm:text-3xl font-serif font-bold text-[#1C1917] tracking-tight">
                  Try it in 2 minutes
                </h2>
                <p className="text-sm text-stone-600 mt-1 max-w-2xl leading-relaxed">
                  Six steps, each as a different person. Every button signs you in as that person and opens the
                  right screen, so you can switch roles without typing a password.
                </p>
              </div>
              <button
                onClick={() => openHelpDrawer('checkpoints')}
                className={`px-5 py-2.5 rounded-full bg-[#C25E26] hover:bg-[#A84A19] text-white text-xs font-bold transition flex items-center gap-2 shadow-sm cursor-pointer whitespace-nowrap self-start md:self-auto ${focusRing}`}
              >
                <CheckSquare className="w-4 h-4" aria-hidden />
                <span>Track progress in the guide</span>
              </button>
            </div>

            <ol className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 mt-6">
              {TWO_MINUTE_STEPS.map((step, i) => (
                <li key={step.id} className="p-5 rounded-2xl bg-[#FAF7F2] border border-[#E8E2D8] flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <span className="font-mono text-xs font-bold text-[#C25E26] bg-[#FBF0E4] px-2.5 py-0.5 rounded-full border border-[#F0D5BE]">
                        Step {i + 1}
                      </span>
                      <span className="text-[11px] text-stone-600 font-semibold">As {step.roleLabel.toLowerCase()}</span>
                    </div>
                    <h3 className="font-serif font-bold text-base text-[#1C1917]">{step.title}</h3>
                    <p className="text-xs text-stone-600 mt-2 leading-relaxed">{step.description}</p>
                    <p className="text-xs text-stone-800 mt-2 leading-relaxed">
                      <span className="font-semibold">Look for:</span> {step.lookFor}
                    </p>
                  </div>
                  <div className="mt-4 pt-3 border-t border-[#E8E2D8] flex flex-wrap items-center justify-between gap-2">
                    <Link
                      href={demoLoginHref(step.role, step.next)}
                      className={`text-xs font-bold text-[#C25E26] hover:underline inline-flex items-center gap-1 ${focusRing}`}
                    >
                      <span>{step.linkText}</span>
                      <ArrowRight className="w-3.5 h-3.5" aria-hidden />
                    </Link>
                    {step.id === 'step-5' && (
                      <a
                        href={SAMPLE_LEASE_HREF}
                        download="sample_lease.png"
                        className={`text-xs font-semibold text-stone-700 hover:text-[#C25E26] inline-flex items-center gap-1 ${focusRing}`}
                      >
                        <Download className="w-3.5 h-3.5" aria-hidden />
                        <span>Sample lease</span>
                      </a>
                    )}
                  </div>
                </li>
              ))}
            </ol>

            <p className="mt-6 text-xs text-stone-600 leading-relaxed">
              To watch an alert arrive live, keep a private window signed in as the regional officer while you do
              step 3. To start over, the admin can reset the clock in the simulator.
            </p>
          </div>
        </section>

        {/* 4. Demo roles */}
        <section id="demo-roles" aria-labelledby="roles-heading" className="max-w-6xl mx-auto px-4 sm:px-6 py-14 border-t border-[#E8E2D8] scroll-mt-20">
          <div className="max-w-2xl mb-8">
            <h2 id="roles-heading" className="text-2xl sm:text-3xl font-serif font-bold text-[#1C1917]">Enter as any role</h2>
            <p className="text-sm text-stone-600 mt-1">
              Each role sees only what it is allowed to. The sign-in page also has a second admin, for approving
              rule changes, and an officer who must use an authenticator app.
            </p>
          </div>

          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {DEMO_ROLES.map(({ role, label, icon: Icon, does }) => (
              <li key={role}>
                <Link
                  href={`/login?demo=${role}`}
                  className={`group h-full p-5 rounded-2xl bg-white border border-[#E8E2D8] hover:border-[#C25E26] transition shadow-2xs flex flex-col justify-between ${focusRing}`}
                >
                  <div>
                    <div className="w-10 h-10 rounded-xl bg-[#FBF0E4] text-[#C25E26] flex items-center justify-center mb-3">
                      <Icon className="w-5 h-5" aria-hidden />
                    </div>
                    <h3 className="font-serif font-bold text-base text-[#1C1917] group-hover:text-[#C25E26] transition">{label}</h3>
                    <p className="text-xs text-stone-600 mt-1.5 leading-relaxed">{does}</p>
                  </div>
                  <div className="mt-4 pt-3 border-t border-[#E8E2D8] text-xs font-semibold text-[#C25E26]">
                    Enter as {label.charAt(0).toLowerCase() + label.slice(1)}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        {/* 5. Guide and glossary */}
        <section className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
          <div className="p-7 sm:p-8 rounded-3xl bg-[#FBF0E4]/70 border border-[#F0D5BE] flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="space-y-2 max-w-2xl">
              <h2 className="text-xl sm:text-2xl font-serif font-bold text-[#1C1917]">New to AICTE terms?</h2>
              <p className="text-xs sm:text-sm text-stone-700 leading-relaxed">
                The guide explains <strong>EVC</strong>, <strong>SAC/SHC</strong>, <strong>undertakings</strong>,
                time limits and escalation, and what each role can do. Open it from the help button at the
                bottom right of every screen.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
              <button
                onClick={() => openHelpDrawer('glossary')}
                className={`w-full sm:w-auto px-5 py-2.5 rounded-full bg-white hover:bg-[#FAF7F2] border border-[#E8E2D8] text-stone-800 text-xs font-bold transition shadow-2xs flex items-center justify-center gap-2 cursor-pointer ${focusRing}`}
              >
                <BookOpen className="w-3.5 h-3.5 text-[#C25E26]" aria-hidden />
                <span>Open the glossary</span>
              </button>
              <button
                onClick={() => openHelpDrawer('roles')}
                className={`w-full sm:w-auto px-5 py-2.5 rounded-full bg-[#C25E26] hover:bg-[#A84A19] text-white text-xs font-bold transition shadow-sm flex items-center justify-center gap-2 cursor-pointer ${focusRing}`}
              >
                <UserCheck className="w-3.5 h-3.5" aria-hidden />
                <span>See what each role does</span>
              </button>
            </div>
          </div>
        </section>

        {/* 6. Workflows */}
        <section aria-labelledby="workflows-heading" className="max-w-6xl mx-auto px-4 sm:px-6 py-14 border-t border-[#E8E2D8]">
          <div className="max-w-2xl mb-8">
            <h2 id="workflows-heading" className="text-2xl sm:text-3xl font-serif font-bold text-[#1C1917]">Four workflows, days per stage</h2>
            <p className="text-sm text-stone-600 mt-1">
              The admin can change any of these. A case returned for deficiency goes to the institution for
              7 days, then to re-scrutiny for 10.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {WORKFLOWS.map((wf) => (
              <div key={wf.name} className="bg-white p-5 rounded-2xl border border-[#E8E2D8] shadow-2xs">
                <h3 className="font-serif font-bold text-base text-[#1C1917]">{wf.name}</h3>
                <ol className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
                  {wf.stages.map(([stage, days], i) => (
                    <li key={stage} className="flex items-center gap-1.5">
                      <span className="px-2.5 py-1 rounded-full bg-[#FAF7F2] border border-[#E8E2D8] text-stone-800">
                        {stage} <span className="font-mono text-stone-500">{days}d</span>
                      </span>
                      {i < wf.stages.length - 1 && <span aria-hidden className="text-stone-300">›</span>}
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        </section>

        {/* 7. Features */}
        <section id="features" aria-labelledby="features-heading" className="max-w-6xl mx-auto px-4 sm:px-6 py-14 border-t border-[#E8E2D8] scroll-mt-20">
          <div className="max-w-2xl mb-8">
            <h2 id="features-heading" className="text-2xl sm:text-3xl font-serif font-bold text-[#1C1917]">What is built</h2>
            <p className="text-sm text-stone-600 mt-1">Everything listed here works in this demo.</p>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {FEATURES.map((col) => (
              <div key={col.title}>
                <h3 className="font-serif font-bold text-lg text-[#1C1917] pb-3 border-b-2 border-[#C25E26]">{col.title}</h3>
                <ul className="divide-y divide-[#E8E2D8]">
                  {col.items.map((item) => (
                    <li key={item} className="py-3 text-sm text-stone-700 leading-relaxed">{item}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        {/* 8. Escalation */}
        <section id="escalation" aria-labelledby="escalation-heading" className="max-w-6xl mx-auto px-4 sm:px-6 py-14 border-t border-[#E8E2D8] scroll-mt-20">
          <div className="p-6 sm:p-8 rounded-3xl bg-[#1C1917] text-white">
            <div className="max-w-2xl mb-8">
              <h2 id="escalation-heading" className="text-2xl sm:text-3xl font-serif font-bold text-white">How an overdue case escalates</h2>
              <p className="text-sm text-stone-300 mt-2 leading-relaxed">
                Each level adds people and channels. The admin edits the timings and the chain, and a second admin
                must approve the change before it applies.
              </p>
            </div>
            <ol className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {ESCALATION.map((lvl) => (
                <li key={lvl.level} className="p-5 rounded-2xl bg-stone-900 border border-stone-800">
                  <div className="flex items-center justify-between gap-2 text-xs pb-3 border-b border-stone-800">
                    <span className={`font-bold ${lvl.tone}`}>Level {lvl.level} · {lvl.day}</span>
                    <span className="text-[11px] text-stone-300">{lvl.to}</span>
                  </div>
                  <ul className="mt-3.5 flex flex-wrap items-center gap-2 text-[11px] text-stone-300">
                    {lvl.channels.map(([name, Icon]) => (
                      <li key={name} className="px-2.5 py-0.5 rounded-full bg-stone-800 border border-stone-700 inline-flex items-center gap-1">
                        <Icon className="w-3 h-3" aria-hidden /> {name}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
            <p className="mt-6 text-xs text-stone-400 flex items-center gap-2">
              <CalendarCheck className="w-4 h-4" aria-hidden />
              Email and SMS carry only the reference number, the alert type and a sign-in link, never case details.
            </p>
          </div>
        </section>
      </main>

      {/* 9. Footer */}
      <footer className="border-t border-[#E8E2D8] bg-[#FAF7F2] py-8 text-xs text-stone-600">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
          <div>
            <div className="flex items-center justify-center sm:justify-start gap-2 font-bold text-stone-800">
              <img src="/nirikshan-icon.png" alt="" className="w-6 h-6 object-contain" />
              <span className="font-serif">Nirikshan</span>
              <span aria-hidden>•</span>
              <span className="text-[#C25E26]">SIH26262 prototype</span>
            </div>
            <p className="mt-1">Automation supports officers and never replaces decisions of the competent authority.</p>
            <p className="mt-0.5">All AI output is advisory.</p>
          </div>
          <div className="sm:text-right">
            <span className="inline-block px-3 py-1 rounded-full bg-white border border-[#E8E2D8] text-stone-600 font-medium shadow-2xs">
              Designed to align with the Digital Personal Data Protection Act, 2023
            </span>
          </div>
        </div>
      </footer>

      <style>{`
        @media (prefers-reduced-motion: no-preference) {
          .hero-escalation { animation: hero-escalation-in 600ms ease-out 300ms both; }
          @keyframes hero-escalation-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
        }
      `}</style>
    </div>
  );
}
