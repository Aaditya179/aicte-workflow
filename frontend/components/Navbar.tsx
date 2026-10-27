'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import AlertBell from './AlertBell';
import SimulatedDateBanner from './SimulatedDateBanner';
import { ShieldCheck, LogOut, User, FastForward } from 'lucide-react';

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [userRole, setUserRole] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setUserEmail(user.email || null);
        setUserRole(user.app_metadata?.role || user.user_metadata?.role || 'user');
      }
    });
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  // Don't render full navbar on login page
  if (pathname === '/login') return null;

  return (
    <>
      <SimulatedDateBanner />
      <header className="sticky top-0 z-40 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Left: Brand */}
            <div className="flex items-center gap-8">
              <Link href="/applications" className="flex items-center gap-2.5 group">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-700 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20 group-hover:scale-105 transition">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <span className="font-bold text-base tracking-tight text-slate-900 dark:text-white">AICTE</span>
                  <span className="text-xs ml-1.5 px-1.5 py-0.5 rounded font-semibold bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                    SLA Monitor
                  </span>
                </div>
              </Link>

              {/* Nav Links */}
              <nav className="hidden lg:flex items-center gap-1">
                <Link
                  href="/applications"
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                    pathname?.startsWith('/applications')
                      ? 'bg-slate-100 dark:bg-slate-800 text-blue-600 dark:text-blue-400 font-semibold'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Applications
                </Link>
                <Link
                  href="/evc"
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                    pathname?.startsWith('/evc')
                      ? 'bg-slate-100 dark:bg-slate-800 text-blue-600 dark:text-blue-400 font-semibold'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  EVC Visits
                </Link>
                <Link
                  href="/undertakings"
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                    pathname?.startsWith('/undertakings')
                      ? 'bg-slate-100 dark:bg-slate-800 text-blue-600 dark:text-blue-400 font-semibold'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Undertakings
                </Link>
                <Link
                  href="/documents"
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                    pathname?.startsWith('/documents')
                      ? 'bg-slate-100 dark:bg-slate-800 text-blue-600 dark:text-blue-400 font-semibold'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Documents
                </Link>
                <Link
                  href="/alerts"
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                    pathname?.startsWith('/alerts')
                      ? 'bg-slate-100 dark:bg-slate-800 text-blue-600 dark:text-blue-400 font-semibold'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Alerts
                </Link>
                {(userRole === 'admin' || userRole === 'bureau_officer') && (
                  <Link
                    href="/admin/simulator"
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition inline-flex items-center gap-1.5 ${
                      pathname?.startsWith('/admin/simulator')
                        ? 'bg-slate-100 dark:bg-slate-800 text-blue-600 dark:text-blue-400 font-semibold'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <FastForward className="w-3.5 h-3.5 text-amber-500" />
                    Time Simulator
                  </Link>
                )}
              </nav>
            </div>

            {/* Right: Actions */}
            <div className="flex items-center gap-3">
              <AlertBell />

              {userEmail && (
                <div className="hidden sm:flex items-center gap-2 pl-2 border-l border-slate-200 dark:border-slate-800">
                  <div className="text-right">
                    <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 leading-none">{userEmail.split('@')[0]}</p>
                    <span className="text-[10px] text-slate-400 capitalize">{userRole?.replace('_', ' ')}</span>
                  </div>
                </div>
              )}

              <button
                onClick={handleLogout}
                title="Sign out"
                className="p-2 rounded-lg text-slate-500 hover:text-red-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </header>
    </>
  );
}
