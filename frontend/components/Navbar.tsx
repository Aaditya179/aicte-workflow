'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import AlertBell from './AlertBell';
import SimulatedDateBanner from './SimulatedDateBanner';
import { ShieldCheck, LogOut, User, FastForward, Globe } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { lang, toggleLang, t } = useLanguage();
  const [mounted, setMounted] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
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

  // Don't render full navbar on login or welcome page
  if (pathname === '/login' || pathname === '/welcome') return null;

  return (
    <>
      <SimulatedDateBanner />
      <header className="sticky top-0 z-40 bg-[#FAF7F2]/90 backdrop-blur-md border-b border-[#E8E2D8]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Left: Brand */}
            <div className="flex items-center gap-8">
              <Link href="/applications" className="flex items-center gap-2.5 group">
                <div className="w-9 h-9 rounded-full bg-white border border-[#E5DFD5] flex items-center justify-center text-[#C25E26] shadow-2xs group-hover:scale-105 transition">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <span className="font-extrabold text-base tracking-tight text-[#1C1917]">
                    {mounted ? t('AICTE') : 'AICTE'}
                  </span>
                  <span className="text-xs ml-1.5 px-2 py-0.5 rounded-full font-semibold bg-[#FBF0E4] text-[#C25E26] border border-[#F0D5BE]">
                    {mounted ? t('SLA Monitor') : 'SLA Monitor'}
                  </span>
                </div>
              </Link>

              {/* Nav Links */}
              <nav className="hidden lg:flex items-center gap-1">
                <Link
                  href="/dashboard"
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold transition ${
                    pathname === '/dashboard'
                      ? 'bg-[#FBF0E4] text-[#C25E26] border border-[#F0D5BE]'
                      : 'text-stone-600 hover:text-[#1C1917] hover:bg-stone-100/60'
                  }`}
                >
                  {mounted ? t('Dashboard') : 'Dashboard'}
                </Link>
                <Link
                  href="/applications"
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold transition ${
                    pathname?.startsWith('/applications')
                      ? 'bg-[#FBF0E4] text-[#C25E26] border border-[#F0D5BE]'
                      : 'text-stone-600 hover:text-[#1C1917] hover:bg-stone-100/60'
                  }`}
                >
                  {mounted ? t('Applications') : 'Applications'}
                </Link>
                <Link
                  href="/evc"
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold transition ${
                    pathname?.startsWith('/evc')
                      ? 'bg-[#FBF0E4] text-[#C25E26] border border-[#F0D5BE]'
                      : 'text-stone-600 hover:text-[#1C1917] hover:bg-stone-100/60'
                  }`}
                >
                  {mounted ? t('EVC Visits') : 'EVC Visits'}
                </Link>
                <Link
                  href="/undertakings"
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold transition ${
                    pathname?.startsWith('/undertakings')
                      ? 'bg-[#FBF0E4] text-[#C25E26] border border-[#F0D5BE]'
                      : 'text-stone-600 hover:text-[#1C1917] hover:bg-stone-100/60'
                  }`}
                >
                  {mounted ? t('Undertakings') : 'Undertakings'}
                </Link>
                <Link
                  href="/documents"
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold transition ${
                    pathname?.startsWith('/documents')
                      ? 'bg-[#FBF0E4] text-[#C25E26] border border-[#F0D5BE]'
                      : 'text-stone-600 hover:text-[#1C1917] hover:bg-stone-100/60'
                  }`}
                >
                  {mounted ? t('Documents') : 'Documents'}
                </Link>
                <Link
                  href="/alerts"
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold transition ${
                    pathname?.startsWith('/alerts')
                      ? 'bg-[#FBF0E4] text-[#C25E26] border border-[#F0D5BE]'
                      : 'text-stone-600 hover:text-[#1C1917] hover:bg-stone-100/60'
                  }`}
                >
                  {mounted ? t('Alerts') : 'Alerts'}
                </Link>
                <Link
                  href="/reports"
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold transition ${
                    pathname?.startsWith('/reports')
                      ? 'bg-[#FBF0E4] text-[#C25E26] border border-[#F0D5BE]'
                      : 'text-stone-600 hover:text-[#1C1917] hover:bg-stone-100/60'
                  }`}
                >
                  {mounted ? t('Reports') : 'Reports'}
                </Link>
                {(userRole === 'admin' || userRole === 'bureau_officer') && (
                  <>
                    <Link
                      href="/audit"
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold transition ${
                        pathname?.startsWith('/audit')
                          ? 'bg-[#FBF0E4] text-[#C25E26] border border-[#F0D5BE]'
                          : 'text-stone-600 hover:text-[#1C1917] hover:bg-stone-100/60'
                      }`}
                    >
                      {mounted ? t('Audit') : 'Audit'}
                    </Link>
                    <Link
                      href="/admin/rules"
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold transition ${
                        pathname?.startsWith('/admin/rules')
                          ? 'bg-[#FBF0E4] text-[#C25E26] border border-[#F0D5BE]'
                          : 'text-stone-600 hover:text-[#1C1917] hover:bg-stone-100/60'
                      }`}
                    >
                      {mounted ? t('Rules') : 'Rules'}
                    </Link>
                    <Link
                      href="/admin/simulator"
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold transition inline-flex items-center gap-1.5 ${
                        pathname?.startsWith('/admin/simulator')
                          ? 'bg-[#FBF0E4] text-[#C25E26] border border-[#F0D5BE]'
                          : 'text-stone-600 hover:text-[#1C1917] hover:bg-stone-100/60'
                      }`}
                    >
                      <FastForward className="w-3.5 h-3.5 text-[#C25E26]" />
                      {mounted ? t('Time Simulator') : 'Time Simulator'}
                    </Link>
                  </>
                )}
              </nav>
            </div>

            {/* Right: Actions */}
            <div className="flex items-center gap-3">
              {/* Hindi Language Toggle */}
              <button
                type="button"
                onClick={toggleLang}
                className="px-3 py-1.5 rounded-full text-xs font-bold border border-[#E8E2D8] bg-white text-stone-700 hover:border-[#C25E26] hover:text-[#C25E26] transition flex items-center gap-1.5 shadow-2xs cursor-pointer"
                title="Toggle Language / भाषा बदलें"
              >
                <Globe className="w-3.5 h-3.5 text-[#C25E26]" />
                <span>{lang === 'hi' ? 'हिन्दी (Active)' : 'English'}</span>
              </button>
              <AlertBell />

              {userEmail && (
                <div className="hidden sm:flex items-center gap-2 pl-2 border-l border-[#E8E2D8]">
                  <div className="text-right">
                    <p className="text-xs font-semibold text-stone-800 leading-none">{userEmail.split('@')[0]}</p>
                    <span className="text-[10px] text-stone-500 capitalize">{userRole?.replace('_', ' ')}</span>
                  </div>
                </div>
              )}

              <button
                onClick={handleLogout}
                title="Sign out"
                className="p-2 rounded-full text-stone-500 hover:text-[#C25E26] hover:bg-[#FBF0E4] transition cursor-pointer"
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
