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
  TrendingDown
} from 'lucide-react';

export default function WelcomePage() {
  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A] selection:bg-teal-100 selection:text-teal-900 font-sans">
      {/* 1. Header */}
      <header className="sticky top-0 z-30 bg-[#F8FAFC]/95 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#0F766E] flex items-center justify-center text-white font-bold text-sm shadow-sm">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <span className="font-bold text-lg tracking-tight text-[#0F172A]">ApprovalTrack</span>
              <span className="hidden sm:inline-block ml-2 text-xs text-slate-500 font-medium border-l border-slate-300 pl-2">
                AICTE Workflow & SLA Monitoring
              </span>
            </div>
          </div>
          <nav className="flex items-center gap-6 text-sm font-medium text-slate-600">
            <a href="#start-here" className="hover:text-[#0F766E] transition">Start here</a>
            <a href="#features" className="hover:text-[#0F766E] transition">Features</a>
            <a href="#escalation" className="hover:text-[#0F766E] transition">Escalation</a>
            <Link
              href="/login"
              className="px-3.5 py-1.5 rounded-md bg-[#0F766E] text-white text-xs font-semibold hover:bg-[#115E59] transition shadow-xs"
            >
              Sign In
            </Link>
          </nav>
        </div>
      </header>

      {/* 2. Hero Section */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-12 pb-16">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          {/* Left Column: Promise & Actions */}
          <div className="lg:col-span-7 space-y-6">
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-teal-50 border border-teal-200 text-[#0F766E] text-xs font-semibold">
              <span className="w-2 h-2 rounded-full bg-[#0F766E] animate-pulse"></span>
              Live Prototype • SIH26262 Solution
            </div>

            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-[#0F172A] leading-[1.15]">
              Every AICTE approval, monitored live against clear statutory deadlines.
            </h1>

            <p className="text-base sm:text-lg text-slate-600 leading-relaxed max-w-xl">
              Automatic stage routing, multi-channel escalation before deadlines slip, and tamper-evident audit logs that ensure accountability for every decision.
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Link
                href="/login?demo=regional_officer"
                className="px-5 py-3 rounded-md bg-[#0F766E] hover:bg-[#115E59] text-white font-medium text-sm transition shadow-sm"
              >
                Enter as Regional officer
              </Link>
              <a
                href="#two-minute-path"
                className="px-5 py-3 rounded-md bg-white border border-slate-300 hover:border-slate-400 text-slate-700 font-medium text-sm transition"
              >
                See the 2-minute path
              </a>
            </div>

            <p className="text-xs text-slate-500 leading-normal pt-2">
              Note: All evaluation data is seeded dummy data and external AICTE integrations are simulated through dedicated test adapters.
            </p>
          </div>

          {/* Right Column: Hero Stage Tracker & Memorable Escalation Card */}
          <div className="lg:col-span-5 bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div>
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Example Case</span>
                <p className="text-sm font-bold text-[#0F172A]">APP-2024-002 • Apex Institute</p>
              </div>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200">
                Action Required
              </span>
            </div>

            {/* Vertical Stage Tracker */}
            <div className="py-5 space-y-4 relative">
              <div className="absolute left-3.5 top-8 bottom-8 w-0.5 bg-slate-200 -z-0"></div>

              {/* Stage 1: Scrutiny */}
              <div className="flex items-start gap-3 relative z-10">
                <div className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center flex-shrink-0 border border-emerald-300">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-900 leading-tight">Scrutiny Verification</p>
                  <p className="text-[11px] text-slate-500">Completed in 8 days (SLA: 15 days)</p>
                </div>
              </div>

              {/* Stage 2: EVC Queue */}
              <div className="flex items-start gap-3 relative z-10">
                <div className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center flex-shrink-0 border border-emerald-300">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-900 leading-tight">EVC Queue & Member Assigned</p>
                  <p className="text-[11px] text-slate-500">Scheduled within 5 days</p>
                </div>
              </div>

              {/* Stage 3: EVC Visit (Overdue) */}
              <div className="flex items-start gap-3 relative z-10">
                <div className="w-7 h-7 rounded-full bg-rose-100 text-rose-700 flex items-center justify-center flex-shrink-0 border border-rose-300">
                  <Clock className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs font-semibold text-rose-700 leading-tight">EVC On-site Visit</p>
                    <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-rose-600 text-white">
                      3 days overdue
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500">SLA 10 days exceeded on Day 13</p>
                </div>
              </div>

              {/* Stage 4: Final Decision */}
              <div className="flex items-start gap-3 relative z-10">
                <div className="w-7 h-7 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center flex-shrink-0 border border-slate-300">
                  <div className="w-2 h-2 rounded-full bg-slate-300" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-400 leading-tight">Final Decision Committee</p>
                  <p className="text-[11px] text-slate-400">Upcoming stage</p>
                </div>
              </div>
            </div>

            {/* The One Memorable Element: Delivered Escalation Card */}
            <div className="mt-2 p-3.5 rounded-lg bg-[#0F172A] text-white border border-slate-800 shadow-md">
              <div className="flex items-center justify-between text-xs pb-2 border-b border-slate-700/80">
                <span className="font-semibold text-amber-400 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                  Level 2 Escalation Dispatched
                </span>
                <span className="text-[10px] text-slate-400 font-mono">Day 3 Overdue</span>
              </div>
              <p className="text-xs text-slate-300 pt-2 leading-relaxed">
                Escalated to <strong className="text-white">Regional Officer (Western)</strong> due to pending EVC report.
              </p>
              <div className="mt-2.5 flex items-center gap-2 text-[11px] text-emerald-400">
                <span className="flex items-center gap-1 bg-emerald-950/60 border border-emerald-800/80 px-2 py-0.5 rounded">
                  <Mail className="w-3 h-3" /> Email delivered
                </span>
                <span className="flex items-center gap-1 bg-emerald-950/60 border border-emerald-800/80 px-2 py-0.5 rounded">
                  <MessageSquare className="w-3 h-3" /> SMS delivered
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3 & 4. Start here & Try it in 2 minutes */}
      <section id="start-here" className="border-t border-slate-200 bg-white py-14">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="mb-10">
            <h2 className="text-2xl font-bold tracking-tight text-[#0F172A]">Start here</h2>
            <p className="text-sm text-slate-600 mt-1">
              Select a persona on the left to sign in instantly, then follow the numbered test path on the right.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
            {/* Left Column: 4 Demo Roles */}
            <div className="lg:col-span-5 space-y-3.5">
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                Evaluation Demo Roles
              </h3>

              {/* Institution Card */}
              <div className="p-4 rounded-lg border border-slate-200 bg-[#F8FAFC] flex flex-col justify-between hover:border-teal-500 transition">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded bg-blue-100 text-blue-700">
                    <Building2 className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">Institution</h4>
                    <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                      Submit applications, track live health score, and respond to deficiencies.
                    </p>
                  </div>
                </div>
                <div className="mt-3.5 pt-3 border-t border-slate-200 flex items-center justify-between">
                  <span className="text-[11px] font-mono text-slate-500">institution@demo.sih</span>
                  <Link
                    href="/login?demo=institution"
                    className="px-3 py-1 rounded bg-[#0F766E] hover:bg-[#115E59] text-white text-xs font-medium transition"
                  >
                    Enter as Institution
                  </Link>
                </div>
              </div>

              {/* Regional Officer Card */}
              <div className="p-4 rounded-lg border border-slate-200 bg-[#F8FAFC] flex flex-col justify-between hover:border-teal-500 transition">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded bg-purple-100 text-purple-700">
                    <MapPin className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">Regional officer</h4>
                    <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                      Monitor pendency across region, rebalance officer workload, and schedule EVCs.
                    </p>
                  </div>
                </div>
                <div className="mt-3.5 pt-3 border-t border-slate-200 flex items-center justify-between">
                  <span className="text-[11px] font-mono text-slate-500">regional@demo.sih</span>
                  <Link
                    href="/login?demo=regional_officer"
                    className="px-3 py-1 rounded bg-[#0F766E] hover:bg-[#115E59] text-white text-xs font-medium transition"
                  >
                    Enter as Regional officer
                  </Link>
                </div>
              </div>

              {/* Bureau Officer Card */}
              <div className="p-4 rounded-lg border border-slate-200 bg-[#F8FAFC] flex flex-col justify-between hover:border-teal-500 transition">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded bg-rose-100 text-rose-700">
                    <Award className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">Bureau officer</h4>
                    <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                      Review national approval rates, handle level-3 escalations, and issue final orders.
                    </p>
                  </div>
                </div>
                <div className="mt-3.5 pt-3 border-t border-slate-200 flex items-center justify-between">
                  <span className="text-[11px] font-mono text-slate-500">bureau@demo.sih</span>
                  <Link
                    href="/login?demo=bureau_officer"
                    className="px-3 py-1 rounded bg-[#0F766E] hover:bg-[#115E59] text-white text-xs font-medium transition"
                  >
                    Enter as Bureau officer
                  </Link>
                </div>
              </div>

              {/* Admin Card */}
              <div className="p-4 rounded-lg border border-slate-200 bg-[#F8FAFC] flex flex-col justify-between hover:border-teal-500 transition">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded bg-slate-200 text-slate-700">
                    <Settings className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">Admin</h4>
                    <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                      Adjust SLA rules, run the time-simulator, and verify cryptographic audit chains.
                    </p>
                  </div>
                </div>
                <div className="mt-3.5 pt-3 border-t border-slate-200 flex items-center justify-between">
                  <span className="text-[11px] font-mono text-slate-500">admin@demo.sih</span>
                  <Link
                    href="/login?demo=admin"
                    className="px-3 py-1 rounded bg-[#0F766E] hover:bg-[#115E59] text-white text-xs font-medium transition"
                  >
                    Enter as Admin
                  </Link>
                </div>
              </div>
            </div>

            {/* Right Column: Try it in 2 minutes Checklist */}
            <div id="two-minute-path" className="lg:col-span-7 bg-[#F8FAFC] p-6 rounded-xl border border-slate-200">
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-200">
                <div>
                  <h3 className="text-base font-bold text-slate-900">Try it in 2 minutes</h3>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Six fast steps designed to test every core capability on seeded data.
                  </p>
                </div>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-teal-100 text-teal-800">
                  Quick Evaluation
                </span>
              </div>

              <div className="space-y-4">
                {/* Step 1 */}
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-slate-200 text-slate-800 font-bold text-xs flex items-center justify-center flex-shrink-0 mt-0.5">
                    1
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-900">
                      Submit an application as the Institution
                    </p>
                    <p className="text-xs text-slate-600 mt-0.5">
                      Sign in as <strong>Institution</strong>, go to Applications, and submit a new approval request. Note the initial stage SLA countdown.
                    </p>
                  </div>
                </div>

                {/* Step 2 */}
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-slate-200 text-slate-800 font-bold text-xs flex items-center justify-center flex-shrink-0 mt-0.5">
                    2
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-900">
                      Advance it as the Regional officer
                    </p>
                    <p className="text-xs text-slate-600 mt-0.5">
                      Switch to <strong>Regional officer</strong>, review the case, advance it past Scrutiny, and observe the live stage tracker advance to EVC Queue.
                    </p>
                  </div>
                </div>

                {/* Step 3 */}
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-slate-200 text-slate-800 font-bold text-xs flex items-center justify-center flex-shrink-0 mt-0.5">
                    3
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-900">
                      Jump the clock 7 days in the simulator
                    </p>
                    <p className="text-xs text-slate-600 mt-0.5">
                      Sign in as <strong>Admin</strong>, open the Time Simulator at <code>/admin/simulator</code>, and advance time by +7 days to trigger automated overdue calculations.
                    </p>
                  </div>
                </div>

                {/* Step 4 */}
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-slate-200 text-slate-800 font-bold text-xs flex items-center justify-center flex-shrink-0 mt-0.5">
                    4
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-900">
                      Check Alerts as Regional officer for the overdue notice and escalation
                    </p>
                    <p className="text-xs text-slate-600 mt-0.5">
                      Open <strong>Alerts</strong> to see Case B turn critical, accompanied by the automated Level 2 escalation notification.
                    </p>
                  </div>
                </div>

                {/* Step 5 */}
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-slate-200 text-slate-800 font-bold text-xs flex items-center justify-center flex-shrink-0 mt-0.5">
                    5
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-900">
                      Open Documents as Institution and upload a renewal
                    </p>
                    <p className="text-xs text-slate-600 mt-0.5">
                      Sign in as <strong>Institution</strong>, open Documents to see the lease expiring in 28 days, and upload a renewed PDF agreement.
                    </p>
                  </div>
                </div>

                {/* Step 6 */}
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-slate-200 text-slate-800 font-bold text-xs flex items-center justify-center flex-shrink-0 mt-0.5">
                    6
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-900">
                      Open Audit as Bureau officer and press Verify Integrity
                    </p>
                    <p className="text-xs text-slate-600 mt-0.5">
                      Switch to <strong>Bureau officer</strong>, open <code>/audit</code>, and click <strong>Verify Integrity</strong> to validate the cryptographic SHA-256 hash chain.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 5. Features: Three Ruled Columns */}
      <section id="features" className="py-16 border-t border-slate-200 bg-[#F8FAFC]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="mb-10">
            <h2 className="text-2xl font-bold tracking-tight text-[#0F172A]">Core features</h2>
            <p className="text-sm text-slate-600 mt-1">
              Engineered specifically for statutory approval workflows, SLA adherence, and complete transparency.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Column 1: Run the approval */}
            <div className="border-t-2 border-[#0F766E] pt-4">
              <h3 className="text-base font-bold text-slate-900 pb-3 border-b border-slate-200">
                Run the approval
              </h3>
              <ul className="divide-y divide-slate-200 text-xs text-slate-700">
                <li className="py-3">
                  <strong className="block text-slate-900 text-sm font-semibold mb-0.5">Automated stage transitions</strong>
                  Moves to the next stage when the current stage verification is completed.
                </li>
                <li className="py-3">
                  <strong className="block text-slate-900 text-sm font-semibold mb-0.5">Return and deficiency flow</strong>
                  Officers return applications with recorded observations; institutions re-submit within window.
                </li>
                <li className="py-3">
                  <strong className="block text-slate-900 text-sm font-semibold mb-0.5">EVC inspection queue</strong>
                  Automated routing to EVC committee with conflict-of-interest prevention.
                </li>
                <li className="py-3">
                  <strong className="block text-slate-900 text-sm font-semibold mb-0.5">Undertaking verification</strong>
                  Institutions submit signed undertakings; officers verify compliance proof online.
                </li>
                <li className="py-3">
                  <strong className="block text-slate-900 text-sm font-semibold mb-0.5">Hindi and English interface</strong>
                  Full bilingual support with instantaneous toggle across all views.
                </li>
              </ul>
            </div>

            {/* Column 2: Watch every deadline */}
            <div className="border-t-2 border-amber-500 pt-4">
              <h3 className="text-base font-bold text-slate-900 pb-3 border-b border-slate-200">
                Watch every deadline
              </h3>
              <ul className="divide-y divide-slate-200 text-xs text-slate-700">
                <li className="py-3">
                  <strong className="block text-slate-900 text-sm font-semibold mb-0.5">SLA clock with real-time countdowns</strong>
                  Every stage measures elapsed calendar days against statutory limits.
                </li>
                <li className="py-3">
                  <strong className="block text-slate-900 text-sm font-semibold mb-0.5">Multi-channel escalation</strong>
                  Automated email, SMS, and in-app alerts dispatched before pendency breaches occur.
                </li>
                <li className="py-3">
                  <strong className="block text-slate-900 text-sm font-semibold mb-0.5">Delay-risk score (0–100)</strong>
                  Synthesizes stage age, officer load, return count, and institution track record.
                </li>
                <li className="py-3">
                  <strong className="block text-slate-900 text-sm font-semibold mb-0.5">Compliance health score</strong>
                  Evaluates institution compliance standing based on past delays and deficiencies.
                </li>
                <li className="py-3">
                  <strong className="block text-slate-900 text-sm font-semibold mb-0.5">Regional workload balancer</strong>
                  Identifies bottlenecks and suggests reassignment of unstarted cases.
                </li>
              </ul>
            </div>

            {/* Column 3: Keep decisions trustworthy */}
            <div className="border-t-2 border-slate-800 pt-4">
              <h3 className="text-base font-bold text-slate-900 pb-3 border-b border-slate-200">
                Keep decisions trustworthy
              </h3>
              <ul className="divide-y divide-slate-200 text-xs text-slate-700">
                <li className="py-3">
                  <strong className="block text-slate-900 text-sm font-semibold mb-0.5">Tamper-evident audit chain</strong>
                  Cryptographic SHA-256 hash chaining records every mutation, verified in one click.
                </li>
                <li className="py-3">
                  <strong className="block text-slate-900 text-sm font-semibold mb-0.5">Strict role separation</strong>
                  Admins manage SLA rules and timelines but cannot view or alter case decisions.
                </li>
                <li className="py-3">
                  <strong className="block text-slate-900 text-sm font-semibold mb-0.5">Advisory AI assistance</strong>
                  Summarizes case files and drafts deficiency notices without ever making autonomous approvals.
                </li>
                <li className="py-3">
                  <strong className="block text-slate-900 text-sm font-semibold mb-0.5">Document expiry tracking</strong>
                  Warns of expiring leases and agreements with automated verification status.
                </li>
                <li className="py-3">
                  <strong className="block text-slate-900 text-sm font-semibold mb-0.5">Data minimization</strong>
                  Personal identifiers masked in aggregate tables, revealed only when required.
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* 6. Escalation: Dark Band */}
      <section id="escalation" className="bg-[#0F172A] text-white py-14">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="max-w-2xl mb-8">
            <span className="text-xs font-semibold text-teal-400 uppercase tracking-wider">Automated Escalation</span>
            <h2 className="text-2xl font-bold tracking-tight text-white mt-1">
              When a deadline approaches, notifications escalate automatically.
            </h2>
            <p className="text-xs text-slate-400 mt-2 leading-relaxed">
              Timelines and escalation chains are configurable settings edited by administrators and enforced across all regions.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Tier 1 */}
            <div className="p-5 rounded-lg bg-slate-900 border border-slate-800">
              <div className="flex items-center justify-between text-xs pb-3 border-b border-slate-800">
                <span className="font-bold text-teal-400">Level 1 • Day 0 Overdue</span>
                <span className="text-[10px] text-slate-400">Assigned Officer</span>
              </div>
              <p className="text-xs text-slate-300 mt-3 leading-relaxed">
                Notice dispatched to the assigned scrutiny or EVC officer the moment the statutory stage SLA expires.
              </p>
              <div className="mt-3 flex items-center gap-2 text-[11px] text-slate-400">
                <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700">In-app alert</span>
                <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700">Email</span>
              </div>
            </div>

            {/* Tier 2 */}
            <div className="p-5 rounded-lg bg-slate-900 border border-slate-800">
              <div className="flex items-center justify-between text-xs pb-3 border-b border-slate-800">
                <span className="font-bold text-amber-400">Level 2 • Day 3 Overdue</span>
                <span className="text-[10px] text-slate-400">Regional Officer</span>
              </div>
              <p className="text-xs text-slate-300 mt-3 leading-relaxed">
                Escalated to the Regional Officer with a recommendation to review the case or reassign it to balance workload.
              </p>
              <div className="mt-3 flex items-center gap-2 text-[11px] text-slate-400">
                <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700">Email</span>
                <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700">SMS</span>
                <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700">In-app</span>
              </div>
            </div>

            {/* Tier 3 */}
            <div className="p-5 rounded-lg bg-slate-900 border border-slate-800">
              <div className="flex items-center justify-between text-xs pb-3 border-b border-slate-800">
                <span className="font-bold text-rose-400">Level 3 • Day 7 Overdue</span>
                <span className="text-[10px] text-slate-400">Bureau Officers</span>
              </div>
              <p className="text-xs text-slate-300 mt-3 leading-relaxed">
                Dispatched to AICTE HQ Bureau Officers and leadership, flagging the case for immediate intervention.
              </p>
              <div className="mt-3 flex items-center gap-2 text-[11px] text-slate-400">
                <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700">Priority Email</span>
                <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700">SMS</span>
                <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700">HQ Dashboard</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 7. Footer: DPDP Act 2023 & Advisory Notice */}
      <footer className="border-t border-slate-200 bg-white py-8 text-xs text-slate-500">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
          <div>
            <p className="font-semibold text-slate-700">ApprovalTrack • AICTE Prototype</p>
            <p className="mt-0.5">
              Automation supports officers and never replaces decisions of the competent authority. All AI output is advisory.
            </p>
          </div>
          <div className="sm:text-right">
            <span className="inline-block px-2.5 py-1 rounded bg-slate-100 border border-slate-200 text-slate-600 font-medium">
              Designed to align with the Digital Personal Data Protection Act, 2023
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
