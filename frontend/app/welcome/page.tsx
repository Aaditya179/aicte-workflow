'use client';

import React from 'react';
import Link from 'next/link';
import {
  ShieldCheck,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Building2,
  MapPin,
  Award,
  Settings,
  Mail,
  MessageSquare,
  FileCheck2,
  Eye,
  Scale,
  Calendar,
  Lock,
  Globe,
  HelpCircle,
  TrendingDown,
  ArrowRight,
  Sparkles,
  Layers,
  FileText,
  UserCheck,
  ShieldAlert,
  BarChart3,
  ExternalLink,
  FastForward,
  BookOpen,
  CheckSquare,
  Zap
} from 'lucide-react';

export default function WelcomePage() {
  const openHelpDrawer = (tab: 'checkpoints' | 'glossary' | 'roles' = 'checkpoints') => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('open-help-drawer', { detail: { tab } }));
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF7F2] bg-grid-texture text-[#1C1917] selection:bg-[#FBF0E4] selection:text-[#C25E26] font-sans">
      {/* 1. Invisible Header with Floating Buttons */}
      <header className="sticky top-0 z-30 w-full bg-transparent border-none pt-3 sm:pt-4 pb-2 px-4 sm:px-6 pointer-events-none">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-3">
          {/* Left: Floating Brand (no background pill) */}
          <div className="pointer-events-auto flex items-center">
            <Link
              href="/welcome"
              className="inline-flex items-center transition hover:opacity-85"
              title="Nirikshan - AICTE Approval Workflow & Compliance Monitoring System"
            >
              <img
                src="/nirikshan-header-logo.png"
                alt="Nirikshan Logo"
                className="h-9 sm:h-10 w-auto object-contain"
              />
            </Link>
          </div>

          {/* Center: Floating Navigation Island */}
          <nav className="pointer-events-auto hidden md:flex items-center gap-1.5 bg-white/95 backdrop-blur-md border border-[#E8E2D8] px-4 py-1.5 rounded-full shadow-xs text-xs font-semibold text-stone-600">
            <a href="#two-minute-path" className="px-3 py-1 rounded-full text-[#C25E26] bg-[#FBF0E4] border border-[#F0D5BE] flex items-center gap-1">
              <Zap className="w-3.5 h-3.5 text-[#C25E26]" />
              <span>2-Min Walkthrough</span>
            </a>
            <a href="#stages" className="px-3 py-1 rounded-full hover:text-[#C25E26] hover:bg-stone-100/70 transition">
              Statutory Stages
            </a>
            <a href="#features" className="px-3 py-1 rounded-full hover:text-[#C25E26] hover:bg-stone-100/70 transition">
              Key Features
            </a>
            <a href="#demo-roles" className="px-3 py-1 rounded-full hover:text-[#C25E26] hover:bg-stone-100/70 transition">
              Demo Roles
            </a>
            <button
              onClick={() => openHelpDrawer('glossary')}
              className="px-3 py-1 rounded-full hover:text-[#C25E26] hover:bg-stone-100/70 transition cursor-pointer flex items-center gap-1"
            >
              <HelpCircle className="w-3.5 h-3.5 text-[#C25E26]" />
              <span>Guide &amp; Glossary</span>
            </button>
          </nav>

          {/* Right: Floating Sign In Button */}
          <div className="pointer-events-auto flex items-center gap-2">
            <Link
              href="/login"
              className="px-5 py-2.5 rounded-full bg-[#C25E26] hover:bg-[#A84A19] text-white text-xs font-bold transition shadow-sm shadow-[#C25E26]/20 flex items-center gap-1.5 cursor-pointer"
            >
              <span>Sign In</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </header>

      {/* 2. Hero Section: Split Layout with Highlighted Walkthrough CTA */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-12 pb-16">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
          {/* Left Column: Hero Content */}
          <div className="lg:col-span-7 space-y-6">
            <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-[#FBF0E4] border border-[#F0D5BE] text-[#C25E26] text-xs font-semibold shadow-2xs">
              <Sparkles className="w-3.5 h-3.5 text-[#C25E26]" />
              <span>SIH26262 Prototype • AICTE Statutory Governance Engine</span>
            </div>

            <h1 className="text-3xl sm:text-5xl lg:text-[3.25rem] font-serif font-bold tracking-tight text-[#1C1917] leading-[1.12]">
              Every AICTE approval, monitored live against clear statutory deadlines.
            </h1>

            <p className="text-base text-stone-600 leading-relaxed max-w-xl">
              Automated stage routing, multi-channel escalation before deadlines lapse, and tamper-evident SHA-256 audit logs ensuring total accountability across all regional offices.
            </p>

            {/* Featured Action Buttons */}
            <div className="space-y-3 pt-1">
              <div className="flex flex-wrap items-center gap-3.5">
                <Link
                  href="/login?demo=regional_officer"
                  className="px-6 py-3 rounded-full bg-[#C25E26] hover:bg-[#A84A19] text-white font-medium text-sm transition shadow-sm shadow-[#C25E26]/25 flex items-center gap-2 cursor-pointer"
                >
                  <span>Enter as Regional Officer</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
                
                {/* Highlighted 2-Minute Walkthrough Button */}
                <a
                  href="#two-minute-path"
                  className="px-6 py-3 rounded-full bg-[#FBF0E4] hover:bg-[#F5EBE1] border-2 border-[#C25E26] text-[#C25E26] font-bold text-sm transition shadow-2xs flex items-center gap-2 group cursor-pointer"
                >
                  <Zap className="w-4 h-4 text-[#C25E26] group-hover:scale-110 transition-transform" />
                  <span>⚡ 2-Minute Walkthrough</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] bg-[#C25E26] text-white font-mono uppercase">
                    6 Checkpoints
                  </span>
                </a>
              </div>

              {/* Evaluator Fast-Track Hint */}
              <div className="flex items-center gap-2 text-xs text-stone-600 bg-white/80 border border-[#E8E2D8] p-2.5 rounded-xl max-w-lg">
                <span className="px-2 py-0.5 rounded bg-[#FBF0E4] text-[#C25E26] font-bold text-[10px]">
                  EVALUATORS
                </span>
                <span>In a hurry? Complete the 6-step walkthrough below or track live checkpoints in the Guide drawer.</span>
              </div>
            </div>

            <div className="pt-2 flex items-center gap-6 text-xs text-stone-500">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-[#C25E26]" />
                <span>15-Day Scrutiny SLA</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-[#C25E26]" />
                <span>Tier 1–3 Escalation</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-[#C25E26]" />
                <span>SHA-256 Chained</span>
              </div>
            </div>
          </div>

          {/* Right Column: Live Sample Case Tracker Card */}
          <div className="lg:col-span-5 bg-white rounded-2xl border border-[#E8E2D8] p-6 shadow-2xs">
            <div className="flex items-center justify-between pb-4 border-b border-[#E8E2D8]">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500 block">Sample Statutory Case</span>
                <h3 className="font-serif font-bold text-base text-[#1C1917] mt-0.5">
                  APP-2024-002 • Apex Institute
                </h3>
              </div>
              <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-[#FBF0E4] text-[#C25E26] border border-[#F0D5BE]">
                Active in EVC
              </span>
            </div>

            {/* Vertical Workflow Stepper */}
            <div className="py-5 space-y-4 relative">
              <div className="absolute left-3.5 top-6 bottom-6 w-0.5 bg-[#E8E2D8] -z-0"></div>

              {/* Stage 1: Scrutiny */}
              <div className="flex items-start gap-3 relative z-10">
                <div className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center flex-shrink-0 border border-emerald-200">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-[#1C1917]">Scrutiny Verification</p>
                    <span className="text-[10px] font-mono text-emerald-700 font-semibold">Cleared (8d)</span>
                  </div>
                  <p className="text-[11px] text-stone-500 mt-0.5">Statutory 15-day SLA met on schedule</p>
                </div>
              </div>

              {/* Stage 2: Deficiency Rectification */}
              <div className="flex items-start gap-3 relative z-10">
                <div className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center flex-shrink-0 border border-emerald-200">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-[#1C1917]">Deficiency Rectification</p>
                    <span className="text-[10px] font-mono text-emerald-700 font-semibold">Proofs Uploaded</span>
                  </div>
                  <p className="text-[11px] text-stone-500 mt-0.5">Institution submitted fire NOC &amp; undertaking</p>
                </div>
              </div>

              {/* Stage 3: EVC Inspection */}
              <div className="flex items-start gap-3 relative z-10">
                <div className="w-7 h-7 rounded-full bg-[#C25E26] text-white flex items-center justify-center flex-shrink-0 shadow-2xs">
                  <Clock className="w-4 h-4 animate-spin text-white" />
                </div>
                <div className="flex-1 bg-[#FAF7F2] p-2.5 rounded-xl border border-[#E8E2D8]">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-[#C25E26]">Expert Visit Committee (EVC)</p>
                    <span className="text-[10px] font-mono font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                      3 Days Left
                    </span>
                  </div>
                  <p className="text-[11px] text-stone-600 mt-1">
                    On-site physical inspection scheduled with geofenced attendance verification.
                  </p>
                </div>
              </div>

              {/* Stage 4: Standing Appellate Committee */}
              <div className="flex items-start gap-3 relative z-10 opacity-60">
                <div className="w-7 h-7 rounded-full bg-stone-100 text-stone-400 flex items-center justify-center flex-shrink-0 border border-[#E8E2D8]">
                  <Scale className="w-3.5 h-3.5" />
                </div>
                <div className="flex-1">
                  <p className="text-xs font-semibold text-stone-700">SAC / SHC Hearing</p>
                  <p className="text-[11px] text-stone-400">Scheduled if deficiencies remain contested</p>
                </div>
              </div>

              {/* Stage 5: Final Council Decision */}
              <div className="flex items-start gap-3 relative z-10 opacity-60">
                <div className="w-7 h-7 rounded-full bg-stone-100 text-stone-400 flex items-center justify-center flex-shrink-0 border border-[#E8E2D8]">
                  <Award className="w-3.5 h-3.5" />
                </div>
                <div className="flex-1">
                  <p className="text-xs font-semibold text-stone-700">Executive Committee Decision</p>
                  <p className="text-[11px] text-stone-400">Cryptographically signed approval or rejection order</p>
                </div>
              </div>
            </div>

            <div className="mt-2 pt-3 border-t border-[#E8E2D8] flex items-center justify-between text-xs text-stone-500">
              <span>SLA Breached?</span>
              <span className="font-semibold text-[#C25E26]">Auto-escalates to Regional Officer</span>
            </div>
          </div>
        </div>
      </section>

      {/* 3. HIGHLIGHTED 2-MINUTE EVALUATOR WALKTHROUGH SECTION */}
      <section id="two-minute-path" className="max-w-6xl mx-auto px-4 sm:px-6 py-14 border-t border-[#E8E2D8]">
        <div className="p-8 sm:p-10 rounded-3xl bg-white border-2 border-[#C25E26]/40 shadow-sm relative overflow-hidden">
          {/* Top Decorative Banner */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-[#E8E2D8]">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#FBF0E4] border border-[#F0D5BE] text-[#C25E26] text-xs font-bold mb-2">
                <Zap className="w-3.5 h-3.5" />
                <span>ESSENTIAL EVALUATOR WALKTHROUGH</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-serif font-bold text-[#1C1917] tracking-tight">
                The 2-Minute Verification Path
              </h2>
              <p className="text-sm text-stone-600 mt-1 max-w-2xl leading-relaxed">
                Follow these six fast, sequential checkpoints to experience the complete statutory loop—from live clock simulation to automated alert escalations and cryptographic audit verification.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <button
                onClick={() => openHelpDrawer('checkpoints')}
                className="px-5 py-2.5 rounded-full bg-[#C25E26] hover:bg-[#A84A19] text-white text-xs font-bold transition flex items-center gap-2 shadow-sm cursor-pointer whitespace-nowrap"
              >
                <CheckSquare className="w-4 h-4" />
                <span>Open in Guide Drawer</span>
              </button>
            </div>
          </div>

          {/* 6 Step Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 mt-6">
            {/* Step 1 */}
            <div className="p-5 rounded-2xl bg-[#FAF7F2] border border-[#E8E2D8] flex flex-col justify-between hover:border-[#C25E26] transition">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="font-mono text-xs font-bold text-[#C25E26] bg-[#FBF0E4] px-2.5 py-0.5 rounded-full border border-[#F0D5BE]">
                    Step 01
                  </span>
                  <span className="text-[10px] text-stone-500 font-semibold">Authentication</span>
                </div>
                <h4 className="font-serif font-bold text-base text-[#1C1917]">
                  Login as Regional Officer
                </h4>
                <p className="text-xs text-stone-600 mt-2 leading-relaxed">
                  Use the one-click demo login to enter the Western Region Portal with live jurisdictional statistics.
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-[#E8E2D8] flex items-center justify-between">
                <Link
                  href="/login?demo=regional_officer"
                  className="text-xs font-bold text-[#C25E26] hover:underline inline-flex items-center gap-1"
                >
                  <span>Launch Portal</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
                <span className="text-[11px] text-stone-400">10 seconds</span>
              </div>
            </div>

            {/* Step 2 */}
            <div className="p-5 rounded-2xl bg-[#FAF7F2] border border-[#E8E2D8] flex flex-col justify-between hover:border-[#C25E26] transition">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="font-mono text-xs font-bold text-[#C25E26] bg-[#FBF0E4] px-2.5 py-0.5 rounded-full border border-[#F0D5BE]">
                    Step 02
                  </span>
                  <span className="text-[10px] text-stone-500 font-semibold">Queue Monitoring</span>
                </div>
                <h4 className="font-serif font-bold text-base text-[#1C1917]">
                  Inspect Urgent Queue &amp; Case B
                </h4>
                <p className="text-xs text-stone-600 mt-2 leading-relaxed">
                  Locate DEMO-CASE-B in Scrutiny stage with real-time statutory timers and due_at calculation.
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-[#E8E2D8] flex items-center justify-between">
                <Link
                  href="/applications"
                  className="text-xs font-bold text-[#C25E26] hover:underline inline-flex items-center gap-1"
                >
                  <span>Applications Queue</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
                <span className="text-[11px] text-stone-400">20 seconds</span>
              </div>
            </div>

            {/* Step 3 */}
            <div className="p-5 rounded-2xl bg-[#FAF7F2] border border-[#E8E2D8] flex flex-col justify-between hover:border-[#C25E26] transition">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="font-mono text-xs font-bold text-[#C25E26] bg-[#FBF0E4] px-2.5 py-0.5 rounded-full border border-[#F0D5BE]">
                    Step 03
                  </span>
                  <span className="text-[10px] text-stone-500 font-semibold">Time Travel</span>
                </div>
                <h4 className="font-serif font-bold text-base text-[#1C1917]">
                  Advance Time Simulator
                </h4>
                <p className="text-xs text-stone-600 mt-2 leading-relaxed">
                  Fast-forward the statutory clock +3 or +7 days to simulate real calendar delays and trigger overdue states.
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-[#E8E2D8] flex items-center justify-between">
                <Link
                  href="/admin/simulator"
                  className="text-xs font-bold text-[#C25E26] hover:underline inline-flex items-center gap-1"
                >
                  <span>Open Simulator</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
                <span className="text-[11px] text-stone-400">20 seconds</span>
              </div>
            </div>

            {/* Step 4 */}
            <div className="p-5 rounded-2xl bg-[#FAF7F2] border border-[#E8E2D8] flex flex-col justify-between hover:border-[#C25E26] transition">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="font-mono text-xs font-bold text-[#C25E26] bg-[#FBF0E4] px-2.5 py-0.5 rounded-full border border-[#F0D5BE]">
                    Step 04
                  </span>
                  <span className="text-[10px] text-stone-500 font-semibold">Alert Matrix</span>
                </div>
                <h4 className="font-serif font-bold text-base text-[#1C1917]">
                  Inspect Multi-Tier Escalations
                </h4>
                <p className="text-xs text-stone-600 mt-2 leading-relaxed">
                  Watch automated Level 1, 2, and 3 alerts appear dynamically in the Alert Bell with simulated email/SMS logs.
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-[#E8E2D8] flex items-center justify-between">
                <Link
                  href="/alerts"
                  className="text-xs font-bold text-[#C25E26] hover:underline inline-flex items-center gap-1"
                >
                  <span>Alert Center</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
                <span className="text-[11px] text-stone-400">25 seconds</span>
              </div>
            </div>

            {/* Step 5 */}
            <div className="p-5 rounded-2xl bg-[#FAF7F2] border border-[#E8E2D8] flex flex-col justify-between hover:border-[#C25E26] transition">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="font-mono text-xs font-bold text-[#C25E26] bg-[#FBF0E4] px-2.5 py-0.5 rounded-full border border-[#F0D5BE]">
                    Step 05
                  </span>
                  <span className="text-[10px] text-stone-500 font-semibold">Cryptography</span>
                </div>
                <h4 className="font-serif font-bold text-base text-[#1C1917]">
                  Verify SHA-256 Ledger
                </h4>
                <p className="text-xs text-stone-600 mt-2 leading-relaxed">
                  Click &apos;Verify Integrity&apos; in the Audit Chain to cryptographically re-hash every sequential block from Genesis.
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-[#E8E2D8] flex items-center justify-between">
                <Link
                  href="/audit"
                  className="text-xs font-bold text-[#C25E26] hover:underline inline-flex items-center gap-1"
                >
                  <span>Audit Ledger</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
                <span className="text-[11px] text-stone-400">20 seconds</span>
              </div>
            </div>

            {/* Step 6 */}
            <div className="p-5 rounded-2xl bg-[#FAF7F2] border border-[#E8E2D8] flex flex-col justify-between hover:border-[#C25E26] transition">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="font-mono text-xs font-bold text-[#C25E26] bg-[#FBF0E4] px-2.5 py-0.5 rounded-full border border-[#F0D5BE]">
                    Step 06
                  </span>
                  <span className="text-[10px] text-stone-500 font-semibold">Executive Exports</span>
                </div>
                <h4 className="font-serif font-bold text-base text-[#1C1917]">
                  Export Statutory Reports
                </h4>
                <p className="text-xs text-stone-600 mt-2 leading-relaxed">
                  Download official Council PDF or Excel SLA matrices for regional and national pendency records.
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-[#E8E2D8] flex items-center justify-between">
                <Link
                  href="/reports"
                  className="text-xs font-bold text-[#C25E26] hover:underline inline-flex items-center gap-1"
                >
                  <span>Export Reports</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
                <span className="text-[11px] text-stone-400">15 seconds</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 4. GUIDE & GLOSSARY INFO SHOWCASE SECTION */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
        <div className="p-7 sm:p-8 rounded-3xl bg-[#FBF0E4]/70 border border-[#F0D5BE] flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-0.5 rounded-full bg-white text-[#C25E26] text-xs font-bold border border-[#F0D5BE]">
              <BookOpen className="w-3.5 h-3.5" />
              <span>PERSISTENT ON-SCREEN REFERENCE</span>
            </div>
            <h3 className="text-xl sm:text-2xl font-serif font-bold text-[#1C1917]">
              Need Help With AICTE Acronyms or Evaluation Checkpoints?
            </h3>
            <p className="text-xs sm:text-sm text-stone-700 leading-relaxed">
              Confused by terms like <strong>EVC</strong>, <strong>SAC/SHC</strong>, <strong>SLA Durations</strong>, or <strong>Undertakings</strong>? Use our built-in <strong>Guide &amp; Glossary</strong> drawer accessible via the floating button at the bottom-right of every single screen.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
            <button
              onClick={() => openHelpDrawer('glossary')}
              className="w-full sm:w-auto px-5 py-2.5 rounded-full bg-white hover:bg-[#FAF7F2] border border-[#E8E2D8] text-stone-800 text-xs font-bold transition shadow-2xs flex items-center justify-center gap-2 cursor-pointer"
            >
              <BookOpen className="w-3.5 h-3.5 text-[#C25E26]" />
              <span>View Glossary</span>
            </button>
            <button
              onClick={() => openHelpDrawer('checkpoints')}
              className="w-full sm:w-auto px-5 py-2.5 rounded-full bg-[#C25E26] hover:bg-[#A84A19] text-white text-xs font-bold transition shadow-sm flex items-center justify-center gap-2 cursor-pointer"
            >
              <CheckSquare className="w-3.5 h-3.5" />
              <span>Interactive Checkpoints</span>
            </button>
          </div>
        </div>
      </section>

      {/* 5. Statutory Approval Stages Architecture */}
      <section id="stages" className="max-w-6xl mx-auto px-4 sm:px-6 py-14 border-t border-[#E8E2D8]">
        <div className="max-w-2xl mb-10">
          <span className="text-xs font-bold text-[#C25E26] uppercase tracking-wider">Statutory Workflow Stages</span>
          <h2 className="text-2xl sm:text-3xl font-serif font-bold text-[#1C1917] mt-1.5">
            End-to-End Approval Lifecycle
          </h2>
          <p className="text-sm text-stone-600 mt-1">
            Standard operating procedure strictly adhering to the AICTE Approval Process Handbook (APH).
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-2xl border border-[#E8E2D8] shadow-2xs">
            <span className="text-xs font-mono font-bold text-[#C25E26] bg-[#FBF0E4] px-2.5 py-0.5 rounded-full border border-[#F0D5BE]">
              Stage 01
            </span>
            <h3 className="font-serif font-bold text-lg text-[#1C1917] mt-3">Scrutiny Verification</h3>
            <p className="text-xs text-stone-600 mt-2 leading-relaxed">
              Assigned scrutiny officers inspect foundational land titles, building safety certificates, and financial solvency affidavits against statutory norms.
            </p>
            <div className="mt-4 pt-3 border-t border-[#E8E2D8] flex items-center justify-between text-xs text-stone-500 font-mono">
              <span>Max Duration</span>
              <strong className="text-[#1C1917]">15 Days SLA</strong>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-[#E8E2D8] shadow-2xs">
            <span className="text-xs font-mono font-bold text-[#C25E26] bg-[#FBF0E4] px-2.5 py-0.5 rounded-full border border-[#F0D5BE]">
              Stage 02
            </span>
            <h3 className="font-serif font-bold text-lg text-[#1C1917] mt-3">Expert Visit Committee (EVC)</h3>
            <p className="text-xs text-stone-600 mt-2 leading-relaxed">
              Empaneled peer experts conduct physical site visits to verify laboratory equipment, library volumes, and faculty compliance with geo-tagged verification logs.
            </p>
            <div className="mt-4 pt-3 border-t border-[#E8E2D8] flex items-center justify-between text-xs text-stone-500 font-mono">
              <span>Report Deadline</span>
              <strong className="text-[#1C1917]">10 Days SLA</strong>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-[#E8E2D8] shadow-2xs">
            <span className="text-xs font-mono font-bold text-[#C25E26] bg-[#FBF0E4] px-2.5 py-0.5 rounded-full border border-[#F0D5BE]">
              Stage 03
            </span>
            <h3 className="font-serif font-bold text-lg text-[#1C1917] mt-3">Standing Appellate (SAC/SHC)</h3>
            <p className="text-xs text-stone-600 mt-2 leading-relaxed">
              Institutions with unresolved deficiencies appear before the Standing Hearing or Appellate Committee to submit corrective affidavits before final decision.
            </p>
            <div className="mt-4 pt-3 border-t border-[#E8E2D8] flex items-center justify-between text-xs text-stone-500 font-mono">
              <span>Hearing SLA</span>
              <strong className="text-[#1C1917]">15 Days SLA</strong>
            </div>
          </div>
        </div>
      </section>

      {/* 6. CLEAR & DETAILED FEATURES SECTION */}
      <section id="features" className="max-w-6xl mx-auto px-4 sm:px-6 py-14 border-t border-[#E8E2D8]">
        <div className="max-w-2xl mb-10">
          <span className="text-xs font-bold text-[#C25E26] uppercase tracking-wider">Comprehensive Architecture</span>
          <h2 className="text-2xl sm:text-3xl font-serif font-bold text-[#1C1917] mt-1.5">
            Key System Capabilities &amp; Governance Features
          </h2>
          <p className="text-sm text-stone-600 mt-1">
            Engineered to eliminate administrative bottlenecks while preserving legal rigor and non-delegable authority.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Feature 1 */}
          <div className="bg-white p-6 rounded-2xl border border-[#E8E2D8] shadow-2xs flex flex-col justify-between">
            <div>
              <div className="w-11 h-11 rounded-xl bg-[#FBF0E4] text-[#C25E26] flex items-center justify-center mb-4 border border-[#F0D5BE]">
                <Clock className="w-5 h-5" />
              </div>
              <h3 className="font-serif font-bold text-lg text-[#1C1917]">Autonomous SLA Clock Engine</h3>
              <p className="text-xs text-stone-600 mt-2 leading-relaxed">
                Stage timers calculated relative to UTC or simulated clock directly within PostgreSQL. Automatically flags due dates, grace intervals, and statutory expiry without manual intervention.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-[#E8E2D8] text-[11px] font-semibold text-[#C25E26]">
              Statutory 15-day / 10-day strict compliance
            </div>
          </div>

          {/* Feature 2 */}
          <div className="bg-white p-6 rounded-2xl border border-[#E8E2D8] shadow-2xs flex flex-col justify-between">
            <div>
              <div className="w-11 h-11 rounded-xl bg-[#FBF0E4] text-[#C25E26] flex items-center justify-center mb-4 border border-[#F0D5BE]">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <h3 className="font-serif font-bold text-lg text-[#1C1917]">3-Tier Multi-Channel Escalations</h3>
              <p className="text-xs text-stone-600 mt-2 leading-relaxed">
                When a statutory deadline elapses, alerts cascade automatically to assigned officers (Day 0), regional directors (Day 3), and HQ Bureau Chiefs (Day 7) across In-App, Email, and SMS.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-[#E8E2D8] text-[11px] font-semibold text-[#C25E26]">
              Proactive prevention of institutional pendency
            </div>
          </div>

          {/* Feature 3 */}
          <div className="bg-white p-6 rounded-2xl border border-[#E8E2D8] shadow-2xs flex flex-col justify-between">
            <div>
              <div className="w-11 h-11 rounded-xl bg-[#FBF0E4] text-[#C25E26] flex items-center justify-center mb-4 border border-[#F0D5BE]">
                <Lock className="w-5 h-5" />
              </div>
              <h3 className="font-serif font-bold text-lg text-[#1C1917]">Cryptographic SHA-256 Audit Chain</h3>
              <p className="text-xs text-stone-600 mt-2 leading-relaxed">
                Every workflow transition, clock advance, and officer decision is hashed with its previous block hash. Any unauthorized row modification breaks the cryptographic link immediately.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-[#E8E2D8] text-[11px] font-semibold text-[#C25E26]">
              One-click validation of all blocks from Genesis
            </div>
          </div>

          {/* Feature 4 */}
          <div className="bg-white p-6 rounded-2xl border border-[#E8E2D8] shadow-2xs flex flex-col justify-between">
            <div>
              <div className="w-11 h-11 rounded-xl bg-[#FBF0E4] text-[#C25E26] flex items-center justify-center mb-4 border border-[#F0D5BE]">
                <Sparkles className="w-5 h-5" />
              </div>
              <h3 className="font-serif font-bold text-lg text-[#1C1917]">Decision Assurance AI Assistant</h3>
              <p className="text-xs text-stone-600 mt-2 leading-relaxed">
                Embedded assistant analyzes institutional documents against statutory norms, drafts structured scrutiny reports, and flags compliance gaps. All AI output is advisory.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-[#E8E2D8] text-[11px] font-semibold text-[#C25E26]">
              Human-in-the-loop statutory decision integrity
            </div>
          </div>

          {/* Feature 5 */}
          <div className="bg-white p-6 rounded-2xl border border-[#E8E2D8] shadow-2xs flex flex-col justify-between">
            <div>
              <div className="w-11 h-11 rounded-xl bg-[#FBF0E4] text-[#C25E26] flex items-center justify-center mb-4 border border-[#F0D5BE]">
                <BarChart3 className="w-5 h-5" />
              </div>
              <h3 className="font-serif font-bold text-lg text-[#1C1917]">38 Statutory Undertakings &amp; Health Score</h3>
              <p className="text-xs text-stone-600 mt-2 leading-relaxed">
                Dynamic 0–100 institutional compliance rating evaluated continuously across building safety certificates, fire NOCs, land lease deeds, and sworn anti-ragging undertakings.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-[#E8E2D8] text-[11px] font-semibold text-[#C25E26]">
              Real-time institutional risk grading
            </div>
          </div>

          {/* Feature 6 */}
          <div className="bg-white p-6 rounded-2xl border border-[#E8E2D8] shadow-2xs flex flex-col justify-between">
            <div>
              <div className="w-11 h-11 rounded-xl bg-[#FBF0E4] text-[#C25E26] flex items-center justify-center mb-4 border border-[#F0D5BE]">
                <FastForward className="w-5 h-5" />
              </div>
              <h3 className="font-serif font-bold text-lg text-[#1C1917]">Time-Travel Simulator for Testing</h3>
              <p className="text-xs text-stone-600 mt-2 leading-relaxed">
                Enables administrators and evaluators to fast-forward the statutory clock (+1, +3, +7, +10 days) to test SLA reminder rules, overdue alerts, and multi-tier escalation cascades in seconds.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-[#E8E2D8] text-[11px] font-semibold text-[#C25E26]">
              Instant verification of time-based statutory rules
            </div>
          </div>
        </div>
      </section>

      {/* 7. Demo Roles Access Section */}
      <section id="demo-roles" className="max-w-6xl mx-auto px-4 sm:px-6 py-14 border-t border-[#E8E2D8]">
        <div className="text-center max-w-2xl mx-auto mb-10">
          <span className="text-xs font-bold text-[#C25E26] uppercase tracking-wider">One-Click Demonstration</span>
          <h2 className="text-2xl sm:text-3xl font-serif font-bold text-[#1C1917] mt-1.5">
            Test the System by Role
          </h2>
          <p className="text-sm text-stone-600 mt-1">
            Select any stakeholder persona to evaluate role-specific dashboards, permission boundaries, and alert feeds.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {/* Role 1: Bureau Officer */}
          <Link
            href="/login?demo=bureau_officer"
            className="group p-5 rounded-2xl bg-white border border-[#E8E2D8] hover:border-[#C25E26] transition shadow-2xs flex flex-col justify-between"
          >
            <div>
              <div className="w-10 h-10 rounded-xl bg-[#FBF0E4] text-[#C25E26] flex items-center justify-center mb-3">
                <Building2 className="w-5 h-5" />
              </div>
              <h3 className="font-serif font-bold text-base text-[#1C1917] group-hover:text-[#C25E26] transition">
                Bureau Officer (HQ)
              </h3>
              <p className="text-xs text-stone-600 mt-1.5 leading-relaxed">
                National SLA governance matrix, regional overdue bottlenecks, and SLA simulator controls.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-[#E8E2D8] flex items-center justify-between text-xs font-semibold text-[#C25E26]">
              <span>Launch HQ Portal</span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition" />
            </div>
          </Link>

          {/* Role 2: Regional Officer */}
          <Link
            href="/login?demo=regional_officer"
            className="group p-5 rounded-2xl bg-white border border-[#E8E2D8] hover:border-[#C25E26] transition shadow-2xs flex flex-col justify-between"
          >
            <div>
              <div className="w-10 h-10 rounded-xl bg-[#FBF0E4] text-[#C25E26] flex items-center justify-center mb-3">
                <MapPin className="w-5 h-5" />
              </div>
              <h3 className="font-serif font-bold text-base text-[#1C1917] group-hover:text-[#C25E26] transition">
                Regional Officer
              </h3>
              <p className="text-xs text-stone-600 mt-1.5 leading-relaxed">
                Zonal queue management, overdue case reassignments, and EVC expert scheduling.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-[#E8E2D8] flex items-center justify-between text-xs font-semibold text-[#C25E26]">
              <span>Launch Regional Portal</span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition" />
            </div>
          </Link>

          {/* Role 3: Scrutiny Officer */}
          <Link
            href="/login?demo=scrutiny_officer"
            className="group p-5 rounded-2xl bg-white border border-[#E8E2D8] hover:border-[#C25E26] transition shadow-2xs flex flex-col justify-between"
          >
            <div>
              <div className="w-10 h-10 rounded-xl bg-[#FBF0E4] text-[#C25E26] flex items-center justify-center mb-3">
                <UserCheck className="w-5 h-5" />
              </div>
              <h3 className="font-serif font-bold text-base text-[#1C1917] group-hover:text-[#C25E26] transition">
                Scrutiny Officer
              </h3>
              <p className="text-xs text-stone-600 mt-1.5 leading-relaxed">
                Checklist evaluation, deficiency logging, institutional response verification, and Decision Assurance.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-[#E8E2D8] flex items-center justify-between text-xs font-semibold text-[#C25E26]">
              <span>Launch Officer Portal</span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition" />
            </div>
          </Link>

          {/* Role 4: Institution */}
          <Link
            href="/login?demo=institution"
            className="group p-5 rounded-2xl bg-white border border-[#E8E2D8] hover:border-[#C25E26] transition shadow-2xs flex flex-col justify-between"
          >
            <div>
              <div className="w-10 h-10 rounded-xl bg-[#FBF0E4] text-[#C25E26] flex items-center justify-center mb-3">
                <FileText className="w-5 h-5" />
              </div>
              <h3 className="font-serif font-bold text-base text-[#1C1917] group-hover:text-[#C25E26] transition">
                Institution Principal
              </h3>
              <p className="text-xs text-stone-600 mt-1.5 leading-relaxed">
                Institutional Health Score, real-time stage progress, deficiency evidence upload, and alert inbox.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-[#E8E2D8] flex items-center justify-between text-xs font-semibold text-[#C25E26]">
              <span>Launch College Portal</span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition" />
            </div>
          </Link>
        </div>
      </section>

      {/* 8. Multi-Channel Escalation Matrix */}
      <section id="escalation" className="max-w-6xl mx-auto px-4 sm:px-6 py-14 border-t border-[#E8E2D8]">
        <div className="p-8 rounded-3xl bg-[#1C1917] text-white">
          <div className="max-w-2xl mb-8">
            <span className="text-xs font-bold text-[#C25E26] uppercase tracking-wider">Automated Escalation Matrix</span>
            <h2 className="text-2xl sm:text-3xl font-serif font-bold text-white mt-1.5">
              Proactive Multi-Channel Alerts Before Timelines Breach
            </h2>
            <p className="text-xs text-stone-400 mt-2 leading-relaxed">
              Configurable statutory escalation paths dispatch notifications automatically across in-app alerts, email, and SMS.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-5 rounded-2xl bg-stone-900 border border-stone-800">
              <div className="flex items-center justify-between text-xs pb-3 border-b border-stone-800">
                <span className="font-bold text-[#C25E26]">Level 1 • Day 0 Overdue</span>
                <span className="text-[10px] text-stone-400">Assigned Officer</span>
              </div>
              <p className="text-xs text-stone-300 mt-3 leading-relaxed">
                Dispatched immediately to the assigned scrutiny or EVC officer the moment the statutory stage SLA elapses.
              </p>
              <div className="mt-3.5 flex items-center gap-2 text-[11px] text-stone-400">
                <span className="px-2.5 py-0.5 rounded-full bg-stone-800 border border-stone-700">In-app alert</span>
                <span className="px-2.5 py-0.5 rounded-full bg-stone-800 border border-stone-700">Email</span>
              </div>
            </div>

            <div className="p-5 rounded-2xl bg-stone-900 border border-stone-800">
              <div className="flex items-center justify-between text-xs pb-3 border-b border-stone-800">
                <span className="font-bold text-amber-500">Level 2 • Day 3 Overdue</span>
                <span className="text-[10px] text-stone-400">Regional Officer</span>
              </div>
              <p className="text-xs text-stone-300 mt-3 leading-relaxed">
                Escalates to the Regional Officer with automatic workload rebalancing prompts to avoid institutional gridlock.
              </p>
              <div className="mt-3.5 flex items-center gap-2 text-[11px] text-stone-400">
                <span className="px-2.5 py-0.5 rounded-full bg-stone-800 border border-stone-700">Email</span>
                <span className="px-2.5 py-0.5 rounded-full bg-stone-800 border border-stone-700">SMS</span>
                <span className="px-2.5 py-0.5 rounded-full bg-stone-800 border border-stone-700">In-app</span>
              </div>
            </div>

            <div className="p-5 rounded-2xl bg-stone-900 border border-stone-800">
              <div className="flex items-center justify-between text-xs pb-3 border-b border-stone-800">
                <span className="font-bold text-rose-400">Level 3 • Day 7 Overdue</span>
                <span className="text-[10px] text-stone-400">HQ Bureau Officers</span>
              </div>
              <p className="text-xs text-stone-300 mt-3 leading-relaxed">
                Dispatched to AICTE HQ Bureau Officers and executive leadership, flagging the file for immediate administrative resolution.
              </p>
              <div className="mt-3.5 flex items-center gap-2 text-[11px] text-stone-400">
                <span className="px-2.5 py-0.5 rounded-full bg-stone-800 border border-stone-700">Priority Email</span>
                <span className="px-2.5 py-0.5 rounded-full bg-stone-800 border border-stone-700">HQ Dashboard</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 9. Footer */}
      <footer className="border-t border-[#E8E2D8] bg-[#FAF7F2] py-8 text-xs text-stone-500">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
          <div>
            <div className="flex items-center justify-center sm:justify-start gap-2 font-bold text-stone-800">
              <img src="/nirikshan-icon.png" alt="Nirikshan" className="w-6 h-6 object-contain" />
              <span className="font-serif">Nirikshan</span>
              <span>•</span>
              <span className="text-[#C25E26]">AICTE Statutory Prototype (SIH26262)</span>
            </div>
            <p className="mt-1">
              Automation assists officers and never replaces the statutory decisions of the competent authority.
            </p>
          </div>
          <div className="sm:text-right">
            <span className="inline-block px-3 py-1 rounded-full bg-white border border-[#E8E2D8] text-stone-600 font-medium shadow-2xs">
              Designed in alignment with the Digital Personal Data Protection Act, 2023 (DPDP Act)
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
