'use client';

import React, { useState, useEffect } from 'react';
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
  ChevronRight,
  CheckSquare,
  Square,
  Sparkles,
  ArrowRight,
  RotateCcw
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

interface WalkthroughCheckpoint {
  id: string;
  stepNum: string;
  title: string;
  description: string;
  linkText: string;
  linkHref: string;
}

const WALKTHROUGH_CHECKPOINTS: WalkthroughCheckpoint[] = [
  {
    id: 'step-1',
    stepNum: '01',
    title: 'Enter as Regional Officer',
    description: 'Use the one-click demo login to access the Western Region administrative portal.',
    linkText: 'Launch Portal',
    linkHref: '/login?demo=regional_officer'
  },
  {
    id: 'step-2',
    stepNum: '02',
    title: 'Inspect Urgent Queue & Case B',
    description: 'View DEMO-CASE-B in Scrutiny stage with live SLA countdowns and days remaining.',
    linkText: 'Applications Queue',
    linkHref: '/applications'
  },
  {
    id: 'step-3',
    stepNum: '03',
    title: 'Advance Time Simulator',
    description: 'Shift the simulated clock +3 or +7 days in the admin simulator to breach statutory SLAs.',
    linkText: 'Open Simulator',
    linkHref: '/admin/simulator'
  },
  {
    id: 'step-4',
    stepNum: '04',
    title: 'Inspect Multi-Tier Escalations',
    description: 'Observe Level 1, 2, and 3 automated alerts dispatched across in-app, email, and SMS.',
    linkText: 'View Alerts Feed',
    linkHref: '/alerts'
  },
  {
    id: 'step-5',
    stepNum: '05',
    title: 'Cryptographic Ledger Audit',
    description: 'Click "Verify Integrity" to validate the tamper-evident SHA-256 blockchain from Genesis.',
    linkText: 'Audit Ledger',
    linkHref: '/audit'
  },
  {
    id: 'step-6',
    stepNum: '06',
    title: 'Generate Official Statutory Report',
    description: 'Download the comprehensive PDF or Excel SLA compliance report for committee records.',
    linkText: 'Export Reports',
    linkHref: '/reports'
  }
];

export default function HelpDrawer() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'checkpoints' | 'glossary' | 'roles'>('checkpoints');
  const [completedSteps, setCompletedSteps] = useState<Record<string, boolean>>({});

  useEffect(() => {
    // Load persisted completed checkpoints
    try {
      const saved = localStorage.getItem('aicte_walkthrough_checkpoints');
      if (saved) {
        setCompletedSteps(JSON.parse(saved));
      }
    } catch (e) {
      // Ignore localStorage errors
    }

    const handleCustomOpen = (e: any) => {
      setIsOpen(true);
      if (e.detail?.tab) {
        setActiveTab(e.detail.tab);
      }
    };

    window.addEventListener('open-help-drawer', handleCustomOpen);
    return () => window.removeEventListener('open-help-drawer', handleCustomOpen);
  }, []);

  const toggleStep = (id: string) => {
    const next = { ...completedSteps, [id]: !completedSteps[id] };
    setCompletedSteps(next);
    try {
      localStorage.setItem('aicte_walkthrough_checkpoints', JSON.stringify(next));
    } catch (e) {
      // Ignore
    }
  };

  const resetCheckpoints = () => {
    setCompletedSteps({});
    try {
      localStorage.removeItem('aicte_walkthrough_checkpoints');
    } catch (e) {
      // Ignore
    }
  };

  const completedCount = Object.values(completedSteps).filter(Boolean).length;
  const progressPct = Math.round((completedCount / WALKTHROUGH_CHECKPOINTS.length) * 100);

  return (
    <>
      {/* Floating Help Trigger Button */}
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-5 right-5 z-40 px-4 py-2.5 rounded-full bg-[#C25E26] hover:bg-[#A84A19] text-white text-xs font-semibold shadow-lg shadow-[#C25E26]/25 transition-all duration-200 flex items-center gap-2 group cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#C25E26] focus:ring-offset-2"
        aria-label="Open In-App Guide, Glossary, and Walkthrough Checkpoints"
      >
        <HelpCircle className="w-4 h-4 group-hover:rotate-12 transition-transform" />
        <span className="hidden sm:inline">Guide &amp; Glossary</span>
        {completedCount > 0 && (
          <span className="w-5 h-5 rounded-full bg-white text-[#C25E26] text-[10px] font-bold flex items-center justify-center">
            {completedCount}
          </span>
        )}
      </button>

      {/* Backdrop */}
      {isOpen && (
        <div
          onClick={() => setIsOpen(false)}
          className="fixed inset-0 bg-stone-900/40 backdrop-blur-xs z-50 transition-opacity"
        />
      )}

      {/* Drawer Panel */}
      <aside
        className={`fixed top-0 right-0 bottom-0 w-full sm:w-[480px] bg-[#FAF7F2] shadow-2xl z-50 transform transition-transform duration-300 ease-in-out border-l border-[#E8E2D8] flex flex-col ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
        aria-hidden={!isOpen}
      >
        {/* Drawer Header */}
        <div className="p-4 sm:p-5 border-b border-[#E8E2D8] bg-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#FBF0E4] text-[#C25E26] flex items-center justify-center border border-[#F0D5BE]">
              <BookOpen className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#1C1917] font-serif">Nirikshan Guide &amp; Glossary</h2>
              <p className="text-[11px] text-stone-500">Evaluator walkthrough, role matrix &amp; statutory terms</p>
            </div>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="p-1.5 rounded-full text-stone-400 hover:text-[#1C1917] hover:bg-stone-100 transition cursor-pointer"
            aria-label="Close Help Drawer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="px-5 pt-3 border-b border-[#E8E2D8] bg-white/70 flex gap-4 text-xs font-semibold overflow-x-auto">
          <button
            onClick={() => setActiveTab('checkpoints')}
            className={`pb-2.5 border-b-2 transition cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'checkpoints'
                ? 'border-[#C25E26] text-[#C25E26]'
                : 'border-transparent text-stone-500 hover:text-[#1C1917]'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>2-Min Walkthrough</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-[#FBF0E4] text-[#C25E26] font-mono">
              {completedCount}/{WALKTHROUGH_CHECKPOINTS.length}
            </span>
          </button>
          <button
            onClick={() => setActiveTab('glossary')}
            className={`pb-2.5 border-b-2 transition cursor-pointer whitespace-nowrap ${
              activeTab === 'glossary'
                ? 'border-[#C25E26] text-[#C25E26]'
                : 'border-transparent text-stone-500 hover:text-[#1C1917]'
            }`}
          >
            Glossary of Terms
          </button>
          <button
            onClick={() => setActiveTab('roles')}
            className={`pb-2.5 border-b-2 transition cursor-pointer whitespace-nowrap ${
              activeTab === 'roles'
                ? 'border-[#C25E26] text-[#C25E26]'
                : 'border-transparent text-stone-500 hover:text-[#1C1917]'
            }`}
          >
            Role Playbook
          </button>
        </div>

        {/* Drawer Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* TAB 1: 2-MINUTE WALKTHROUGH CHECKPOINTS */}
          {activeTab === 'checkpoints' && (
            <div className="space-y-4">
              {/* Progress Summary Card */}
              <div className="p-4 rounded-2xl bg-white border border-[#E8E2D8] shadow-2xs space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-stone-700">Evaluation Progress</span>
                  <span className="font-mono font-bold text-[#C25E26]">{completedCount} of 6 Completed ({progressPct}%)</span>
                </div>
                {/* Progress bar */}
                <div className="w-full h-2 rounded-full bg-[#FAF7F2] border border-[#E8E2D8] overflow-hidden">
                  <div
                    className="h-full bg-[#C25E26] transition-all duration-300 rounded-full"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[11px] text-stone-500 pt-0.5">
                  <span>Track each step as you evaluate the prototype</span>
                  {completedCount > 0 && (
                    <button
                      onClick={resetCheckpoints}
                      className="text-stone-400 hover:text-[#C25E26] flex items-center gap-1 cursor-pointer transition"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Reset</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Checkpoint Items */}
              <div className="space-y-3">
                {WALKTHROUGH_CHECKPOINTS.map((cp) => {
                  const isDone = !!completedSteps[cp.id];
                  return (
                    <div
                      key={cp.id}
                      className={`p-3.5 rounded-xl border transition-all ${
                        isDone
                          ? 'bg-[#FBF0E4]/50 border-[#F0D5BE]'
                          : 'bg-white border-[#E8E2D8] shadow-2xs'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <button
                          onClick={() => toggleStep(cp.id)}
                          className="mt-0.5 text-stone-400 hover:text-[#C25E26] transition cursor-pointer flex-shrink-0"
                          aria-label={`Mark step ${cp.stepNum} as ${isDone ? 'incomplete' : 'complete'}`}
                        >
                          {isDone ? (
                            <CheckSquare className="w-5 h-5 text-[#C25E26]" />
                          ) : (
                            <Square className="w-5 h-5 text-stone-300 hover:text-stone-500" />
                          )}
                        </button>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-mono font-bold text-[#C25E26] bg-[#FAF7F2] px-1.5 py-0.5 rounded border border-[#E8E2D8]">
                              Step {cp.stepNum}
                            </span>
                            <h4 className={`text-xs font-bold ${isDone ? 'line-through text-stone-400' : 'text-[#1C1917]'}`}>
                              {cp.title}
                            </h4>
                          </div>
                          <p className={`text-xs mt-1 leading-relaxed ${isDone ? 'text-stone-400' : 'text-stone-600'}`}>
                            {cp.description}
                          </p>
                          <div className="mt-2.5 flex items-center justify-between">
                            <Link
                              href={cp.linkHref}
                              onClick={() => setIsOpen(false)}
                              className="text-xs font-semibold text-[#C25E26] hover:underline inline-flex items-center gap-1"
                            >
                              <span>{cp.linkText}</span>
                              <ArrowRight className="w-3 h-3" />
                            </Link>
                            <button
                              onClick={() => toggleStep(cp.id)}
                              className="text-[11px] text-stone-500 hover:text-stone-800 cursor-pointer"
                            >
                              {isDone ? 'Mark Incomplete' : 'Mark Done'}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 2: GLOSSARY OF TERMS */}
          {activeTab === 'glossary' && (
            <div className="space-y-3.5">
              <p className="text-xs text-stone-500 leading-relaxed">
                Key AICTE regulatory terminology and system operational concepts:
              </p>
              {GLOSSARY.map((item) => (
                <div
                  key={item.term}
                  className="p-3.5 rounded-xl bg-white border border-[#E8E2D8] shadow-2xs space-y-1"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold font-mono text-[#C25E26]">
                      {item.term}
                    </span>
                    <span className="text-xs font-semibold text-[#1C1917]">
                      • {item.full}
                    </span>
                  </div>
                  <p className="text-xs text-stone-600 leading-relaxed">
                    {item.definition}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* TAB 3: ROLE PLAYBOOK */}
          {activeTab === 'roles' && (
            <div className="space-y-4">
              <p className="text-xs text-stone-500 leading-relaxed">
                What each participant role is empowered to inspect and perform:
              </p>
              {ROLES.map((r) => (
                <div
                  key={r.role}
                  className="p-3.5 rounded-xl bg-white border border-[#E8E2D8] shadow-2xs space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[#1C1917]">
                      {r.role}
                    </span>
                    <span className="text-[10px] text-stone-500 font-medium">
                      {r.title}
                    </span>
                  </div>
                  <ul className="space-y-1">
                    {r.actions.map((act, i) => (
                      <li key={i} className="text-xs text-stone-600 flex items-start gap-1.5 leading-normal">
                        <ChevronRight className="w-3.5 h-3.5 text-[#C25E26] flex-shrink-0 mt-0.5" />
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
        <div className="p-4 border-t border-[#E8E2D8] bg-white text-xs text-stone-500 flex items-center justify-between">
          <Link
            href="/welcome"
            onClick={() => setIsOpen(false)}
            className="text-[#C25E26] hover:underline font-semibold flex items-center gap-1"
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
