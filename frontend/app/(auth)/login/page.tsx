'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import {
  Building2,
  ShieldCheck,
  MapPin,
  ClipboardList,
  Award,
  Settings,
  ArrowRight,
  Loader2,
  Lock,
  Mail,
  AlertCircle,
  Eye,
  EyeOff
} from 'lucide-react';

interface DemoRole {
  role: string;
  roleLabel: string;
  title: string;
  email: string;
  description: string;
  icon: React.ElementType;
  badgeColor: string;
}

const DEMO_ROLES: DemoRole[] = [
  {
    role: 'institution',
    roleLabel: 'Institution',
    title: 'Demo Institute Principal',
    email: 'institution@demo.sih',
    description: 'Track application SLA, health score, and submit undertaking responses.',
    icon: Building2,
    badgeColor: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 border-blue-200'
  },
  {
    role: 'scrutiny_officer',
    roleLabel: 'Scrutiny Officer',
    title: 'Western Scrutiny Officer',
    email: 'scrutiny@demo.sih',
    description: 'Examine institutional submissions, verify documentation, and note deficiencies.',
    icon: ShieldCheck,
    badgeColor: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-200'
  },
  {
    role: 'regional_officer',
    roleLabel: 'Regional Officer',
    title: 'Western Regional Officer',
    email: 'regional@demo.sih',
    description: 'Monitor pendency across Western region, balance cases, and schedule EVCs.',
    icon: MapPin,
    badgeColor: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300 border-purple-200'
  },
  {
    role: 'evc_member',
    roleLabel: 'EVC Member',
    title: 'Western EVC Member',
    email: 'evc@demo.sih',
    description: 'Review visit schedule, inspect infrastructure on-site, and upload EVC reports.',
    icon: ClipboardList,
    badgeColor: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border-amber-200'
  },
  {
    role: 'bureau_officer',
    roleLabel: 'Bureau Officer',
    title: 'AICTE Bureau Officer',
    email: 'bureau@demo.sih',
    description: 'National overview, review SAC/SHC escalations, and issue final approvals.',
    icon: Award,
    badgeColor: 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300 border-rose-200'
  },
  {
    role: 'admin',
    roleLabel: 'Administrator',
    title: 'System Administrator',
    email: 'admin@demo.sih',
    description: 'Simulate time-travel, edit SLA thresholds, and verify cryptographic audit hashes.',
    icon: Settings,
    badgeColor: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300 border-slate-300'
  }
];

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('password123');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeSigningRole, setActiveSigningRole] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSignIn = async (targetEmail = email, targetPassword = password, roleKey?: string) => {
    setLoading(true);
    setErrorMessage(null);
    if (roleKey) setActiveSigningRole(roleKey);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: targetEmail,
        password: targetPassword,
      });

      if (error) {
        throw new Error(error.message);
      }

      if (data.session) {
        // Redirect to dashboard on success
        router.push('/dashboard');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Login failed. Please check credentials or run the seed script.');
    } finally {
      setLoading(false);
      setActiveSigningRole(null);
    }
  };

  const handleDemoSelect = (role: DemoRole) => {
    setEmail(role.email);
    setPassword('password123');
    handleSignIn(role.email, 'password123', role.role);
  };

  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const demoRole = params.get('demo');
      if (demoRole) {
        const found = DEMO_ROLES.find(r => r.role === demoRole);
        if (found) {
          handleDemoSelect(found);
        }
      }
    }
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-slate-100 to-slate-200 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 flex flex-col justify-between p-4 sm:p-6 lg:p-8">
      {/* Header Banner */}
      <header className="max-w-6xl mx-auto w-full pt-4 pb-6 flex items-center justify-between border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold text-lg shadow-md shadow-indigo-500/20">
            A
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
              AICTE Workflow & SLA Monitoring
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              National Approval Process & Pendency Tracking System
            </p>
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-full bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          SIH26262 Prototype
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto w-full my-auto py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column: Direct Login Form */}
          <div className="lg:col-span-5 bg-white dark:bg-slate-900 rounded-2xl p-6 sm:p-8 shadow-xl border border-slate-200/80 dark:border-slate-800">
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Sign In</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                Enter your official AICTE credentials or click a demo card on the right.
              </p>
            </div>

            {errorMessage && (
              <div className="mb-5 p-3.5 rounded-lg bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 flex items-start gap-3 text-rose-700 dark:text-rose-300 text-sm">
                <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <span>{errorMessage}</span>
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSignIn();
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@demo.sih"
                    required
                    className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    required
                    className="w-full pl-10 pr-10 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-3.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full mt-2 py-3 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-medium text-sm transition-colors shadow-lg shadow-indigo-600/20 flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer"
              >
                {loading && !activeSigningRole ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Signing in...</span>
                  </>
                ) : (
                  <>
                    <span>Enter Portal</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>

            <div className="mt-6 pt-5 border-t border-slate-100 dark:border-slate-800/80 text-center">
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Default password for all demo accounts: <code className="font-mono font-semibold text-indigo-600 dark:text-indigo-400">password123</code>
              </span>
            </div>
          </div>

          {/* Right Column: Interactive Role Switcher Cards */}
          <div className="lg:col-span-7">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                  Demo Evaluation Accounts
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Click any role card to automatically sign in and experience their dedicated workflow views.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {DEMO_ROLES.map((roleItem) => {
                const Icon = roleItem.icon;
                const isCurrentSigning = activeSigningRole === roleItem.role;

                return (
                  <button
                    key={roleItem.role}
                    type="button"
                    onClick={() => handleDemoSelect(roleItem)}
                    disabled={loading}
                    className="p-4 text-left rounded-xl bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 hover:border-indigo-400 dark:hover:border-indigo-500 hover:shadow-md transition-all duration-150 group relative overflow-hidden cursor-pointer"
                  >
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 group-hover:bg-indigo-600 group-hover:text-white transition-colors duration-150">
                        <Icon className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border ${roleItem.badgeColor}`}>
                            {roleItem.roleLabel}
                          </span>
                        </div>
                        <h4 className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                          {roleItem.title}
                        </h4>
                        <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mt-1 leading-relaxed">
                          {roleItem.description}
                        </p>
                        <div className="mt-2 text-[11px] font-mono text-slate-400 dark:text-slate-500 truncate">
                          {roleItem.email}
                        </div>
                      </div>
                    </div>

                    {isCurrentSigning && (
                      <div className="absolute inset-0 bg-indigo-600/90 backdrop-blur-xs flex items-center justify-center text-white font-medium text-xs gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Signing in as {roleItem.roleLabel}...</span>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </main>

      {/* Advisory Footer */}
      <footer className="max-w-6xl mx-auto w-full pt-6 pb-2 border-t border-slate-200 dark:border-slate-800 text-center">
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Advisory only, final decisions rest with the competent authority. • AICTE Automated Workflow Engine
        </p>
      </footer>
    </div>
  );
}
