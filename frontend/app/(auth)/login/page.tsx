'use client';

import React, { useState } from 'react';
import Link from 'next/link';
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
    badgeColor: 'bg-[#FBF0E4] text-[#C25E26] border-[#F0D5BE]'
  },
  {
    role: 'scrutiny_officer',
    roleLabel: 'Scrutiny Officer',
    title: 'Western Scrutiny Officer',
    email: 'scrutiny@demo.sih',
    description: 'Examine institutional submissions, verify documentation, and note deficiencies.',
    icon: ShieldCheck,
    badgeColor: 'bg-emerald-50 text-emerald-800 border-emerald-200'
  },
  {
    role: 'regional_officer',
    roleLabel: 'Regional Officer',
    title: 'Western Regional Officer',
    email: 'regional@demo.sih',
    description: 'Monitor pendency across Western region, balance cases, and schedule EVCs.',
    icon: MapPin,
    badgeColor: 'bg-stone-100 text-stone-800 border-stone-300'
  },
  {
    role: 'evc_member',
    roleLabel: 'EVC Member',
    title: 'Western EVC Member',
    email: 'evc@demo.sih',
    description: 'Review visit schedule, inspect infrastructure on-site, and upload EVC reports.',
    icon: ClipboardList,
    badgeColor: 'bg-amber-50 text-amber-800 border-amber-200'
  },
  {
    role: 'bureau_officer',
    roleLabel: 'Bureau Officer',
    title: 'AICTE Bureau Officer',
    email: 'bureau@demo.sih',
    description: 'National overview, review SAC/SHC escalations, and issue final approvals.',
    icon: Award,
    badgeColor: 'bg-rose-50 text-rose-800 border-rose-200'
  },
  {
    role: 'admin',
    roleLabel: 'Administrator',
    title: 'System Administrator',
    email: 'admin@demo.sih',
    description: 'Simulate time-travel, edit SLA thresholds, and verify cryptographic audit hashes.',
    icon: Settings,
    badgeColor: 'bg-stone-100 text-stone-700 border-stone-300'
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
    <div className="min-h-screen bg-[#FAF7F2] bg-grid-texture text-[#1C1917] selection:bg-[#FBF0E4] selection:text-[#C25E26] flex flex-col justify-between p-4 sm:p-6 lg:p-8 font-sans">
      {/* Header Banner */}
      <header className="max-w-6xl mx-auto w-full pt-4 pb-6 flex items-center justify-between">
        {/* Floating Brand (no background pill) */}
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
        <div className="flex items-center gap-2 text-xs font-semibold px-4 py-1.5 rounded-full bg-white/95 backdrop-blur-md border border-[#E8E2D8] text-[#C25E26] shadow-xs">
          <span className="w-2 h-2 rounded-full bg-[#C25E26] animate-pulse"></span>
          SIH26262 Prototype
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto w-full my-auto py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column: Direct Login Form */}
          <div className="lg:col-span-5 bg-white rounded-2xl p-6 sm:p-8 shadow-xs border border-[#E8E2D8]">
            <div className="mb-6">
              <h2 className="text-2xl font-bold font-serif text-[#1C1917]">Sign In</h2>
              <p className="text-sm text-stone-500 mt-1">
                Enter your official AICTE credentials or click any demo role on the right.
              </p>
            </div>

            {errorMessage && (
              <div className="mb-5 p-3.5 rounded-xl bg-rose-50 border border-rose-200 flex items-start gap-3 text-rose-700 text-sm">
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
                <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1.5">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-stone-400 absolute left-3.5 top-3.5" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@demo.sih"
                    required
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-[#E8E2D8] bg-[#FAF7F2] text-[#1C1917] text-sm focus:outline-none focus:ring-2 focus:ring-[#C25E26] transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-stone-400 absolute left-3.5 top-3.5" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    required
                    className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-[#E8E2D8] bg-[#FAF7F2] text-[#1C1917] text-sm focus:outline-none focus:ring-2 focus:ring-[#C25E26] transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-3.5 text-stone-400 hover:text-stone-600 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full mt-2 py-3 px-4 rounded-full bg-[#C25E26] hover:bg-[#A84A19] active:bg-[#8F3D13] text-white font-bold text-sm transition-all shadow-md shadow-[#C25E26]/20 flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer"
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

            <div className="mt-6 pt-5 border-t border-[#E8E2D8] text-center">
              <span className="text-xs text-stone-500">
                Default password for all demo accounts: <code className="font-mono font-bold text-[#C25E26]">password123</code>
              </span>
            </div>
          </div>

          {/* Right Column: Interactive Role Switcher Cards */}
          <div className="lg:col-span-7">
            <div className="mb-4">
              <h3 className="text-lg font-bold font-serif text-[#1C1917]">
                Demo Evaluation Accounts
              </h3>
              <p className="text-xs text-stone-500">
                Click any role card to automatically sign in and experience their dedicated workflow views.
              </p>
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
                    className="p-4 text-left rounded-2xl bg-white border border-[#E8E2D8] hover:border-[#C25E26] hover:shadow-xs transition-all duration-150 group relative overflow-hidden cursor-pointer"
                  >
                    <div className="flex items-start gap-3">
                      <div className="p-2.5 rounded-full bg-[#FAF7F2] border border-[#EAE4D9] text-[#C25E26] group-hover:bg-[#C25E26] group-hover:text-white transition-colors duration-150">
                        <Icon className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${roleItem.badgeColor}`}>
                            {roleItem.roleLabel}
                          </span>
                        </div>
                        <h4 className="text-sm font-bold text-[#1C1917] truncate font-serif">
                          {roleItem.title}
                        </h4>
                        <p className="text-xs text-stone-500 line-clamp-2 mt-1 leading-relaxed">
                          {roleItem.description}
                        </p>
                        <div className="mt-2 text-[11px] font-mono text-stone-400 truncate">
                          {roleItem.email}
                        </div>
                      </div>
                    </div>

                    {isCurrentSigning && (
                      <div className="absolute inset-0 bg-[#C25E26]/95 backdrop-blur-xs flex items-center justify-center text-white font-medium text-xs gap-2">
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
      <footer className="max-w-6xl mx-auto w-full pt-6 pb-2 border-t border-[#E8E2D8] text-center">
        <p className="text-xs text-stone-500">
          Advisory only, final decisions rest with the competent authority. • AICTE Automated Workflow Engine
        </p>
      </footer>
    </div>
  );
}
