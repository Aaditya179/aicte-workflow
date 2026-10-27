'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  HelpCircle,
  X,
  BookOpen,
  Shield,
  Layers,
  Clock,
  AlertTriangle,
  HeartPulse,
  ExternalLink,
  ChevronRight
} from 'lucide-react';

interface GlossaryItem {
  term: string;
  full: string;
  definition: string;
}

const GLOSSARY: GlossaryItem[] = [
  {
    term: 'EVC',
    full: 'Expert Visit Committee',
    definition: 'A panel of domain experts and academics deputed by AICTE to conduct on-site physical inspection and verification of institutional infrastructure.'
  },
  {
    term: 'SAC / SHC',
    full: 'Standing Appellate / Hearing Committee',
    definition: 'Quasi-judicial committee at AICTE headquarters providing opportunities of personal hearing to institutions before final rejection or punitive measures.'
  },
  {
    term: 'Undertaking',
    full: 'Statutory Compliance Undertaking',
    definition: 'Formal sworn declarations submitted by institute management (e.g. anti-ragging, land safety, faculty cadres) verifiable by officers online.'
  },
  {
    term: 'SLA',
    full: 'Service Level Agreement',
    definition: 'Fixed statutory calendar windows allocated to each stage (e.g. 15 days for scrutiny, 10 days for EVC scheduling). When exceeded, escalation triggers.'
  },
  {
    term: 'Escalation',
    full: 'Multi-tier Notification Protocol',
    definition: 'Automated warnings sent through in-app alerts, email, and SMS reaching higher administrative tiers (Officer -> Regional Director -> Bureau Chief) as pendency increases.'
  },
  {
    term: 'Health Score',
    full: 'Institutional Compliance Score (0–100)',
    definition: 'A composite metric assessing an institution’s historical responsiveness, document validity, and active non-compliances.'
  }
];

interface RoleGuide {
  role: string;
  title: string;
  actions: string[];
}

const ROLES: RoleGuide[] = [
  {
    role: 'Institution',
    title: 'Applicant College / Polytechnic',
    actions: [
      'Submit new course, intake, or establishment applications',
      'Track real-time SLA progress across each review stage',
      'Upload renewed lease deeds and resolve deficient undertakings'
    ]
  },
  {
    role: 'Regional Officer',
    title: 'Regional Office Administrator',
    actions: [
      'Monitor regional backlog and overdue cases',
      'Use the Workload Balancer to reassign pending cases',
      'Queue and assign approved EVC inspection committees'
    ]
  },
  {
    role: 'Bureau Officer',
    title: 'AICTE HQ Directorate',
    actions: [
      'Monitor national approval statistics and pendency curves',
      'Intervene on Level-3 critical escalated applications',
      'Verify the tamper-evident cryptographic SHA-256 audit log'
    ]
  },
  {
    role: 'Administrator',
    title: 'System & Policy Configurator',
    actions: [
      'Configure stage SLAs, reminder offsets, and escalation chains',
      'Advance or reset the system clock in the Time Simulator',
      'Ensure strict separation: cannot modify or override case decisions'
    ]
  }
];

export default function HelpDrawer() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'glossary' | 'roles'>('glossary');

  return (
    <>
      {/* Floating Help Trigger Button */}
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-5 right-5 z-40 px-3.5 py-2.5 rounded-full bg-[#0F766E] hover:bg-[#115E59] text-white text-xs font-semibold shadow-lg hover:shadow-xl transition-all duration-200 flex items-center gap-2 group cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#0F766E] focus:ring-offset-2"
        aria-label="Open In-App Help and Glossary"
      >
        <HelpCircle className="w-4 h-4 group-hover:rotate-12 transition-transform" />
        <span className="hidden sm:inline">Guide & Glossary</span>
      </button>

      {/* Backdrop */}
      {isOpen && (
        <div
          onClick={() => setIsOpen(false)}
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 transition-opacity"
        />
      )}

      {/* Drawer Panel */}
      <aside
        className={`fixed top-0 right-0 bottom-0 w-full sm:w-[440px] bg-white dark:bg-slate-900 shadow-2xl z-50 transform transition-transform duration-300 ease-in-out border-l border-slate-200 dark:border-slate-800 flex flex-col ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
        aria-hidden={!isOpen}
      >
        {/* Drawer Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-teal-100 dark:bg-teal-950 text-[#0F766E] dark:text-teal-400 flex items-center justify-center">
              <BookOpen className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">ApprovalTrack Guide</h2>
              <p className="text-[11px] text-slate-500">Evaluation reference & terminology</p>
            </div>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            aria-label="Close Help Drawer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="px-5 pt-3 border-b border-slate-100 dark:border-slate-800 flex gap-4 text-xs font-semibold">
          <button
            onClick={() => setActiveTab('glossary')}
            className={`pb-2.5 border-b-2 transition cursor-pointer ${
              activeTab === 'glossary'
                ? 'border-[#0F766E] text-[#0F766E] dark:text-teal-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            Glossary of Terms
          </button>
          <button
            onClick={() => setActiveTab('roles')}
            className={`pb-2.5 border-b-2 transition cursor-pointer ${
              activeTab === 'roles'
                ? 'border-[#0F766E] text-[#0F766E] dark:text-teal-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            Role Playbook
          </button>
        </div>

        {/* Drawer Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {activeTab === 'glossary' && (
            <div className="space-y-3.5">
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Key AICTE terminology and system operational concepts:
              </p>
              {GLOSSARY.map((item) => (
                <div
                  key={item.term}
                  className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 space-y-1"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold font-mono text-[#0F766E] dark:text-teal-400">
                      {item.term}
                    </span>
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                      • {item.full}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                    {item.definition}
                  </p>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'roles' && (
            <div className="space-y-4">
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                What each participant role is empowered to inspect and perform:
              </p>
              {ROLES.map((r) => (
                <div
                  key={r.role}
                  className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900 dark:text-white">
                      {r.role}
                    </span>
                    <span className="text-[10px] text-slate-500 font-medium">
                      {r.title}
                    </span>
                  </div>
                  <ul className="space-y-1">
                    {r.actions.map((act, i) => (
                      <li key={i} className="text-xs text-slate-600 dark:text-slate-300 flex items-start gap-1.5 leading-normal">
                        <ChevronRight className="w-3.5 h-3.5 text-[#0F766E] flex-shrink-0 mt-0.5" />
                        <span>{act}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Drawer Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/80 text-xs text-slate-500 flex items-center justify-between">
          <Link
            href="/welcome"
            onClick={() => setIsOpen(false)}
            className="text-[#0F766E] hover:underline font-semibold flex items-center gap-1"
          >
            <span>Landing Page</span>
            <ExternalLink className="w-3 h-3" />
          </Link>
          <span>SIH26262 Prototype</span>
        </div>
      </aside>
    </>
  );
}
