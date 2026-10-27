'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import AlertBell from './AlertBell';
import SimulatedDateBanner from './SimulatedDateBanner';
import { LogOut, User, FastForward, Globe, Menu, X } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { lang, toggleLang, t } = useLanguage();
  const [mounted, setMounted] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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

  // Don't render navbar on login or welcome page
  if (pathname === '/login' || pathname === '/welcome') return null;

  return (
    <>
      <SimulatedDateBanner />
      {/* Invisible Navbar with Floating Buttons */}
      <header className="sticky top-0 z-40 w-full bg-transparent border-none pt-3 sm:pt-4 pb-2 px-4 sm:px-6 lg:px-8 pointer-events-none transition-all">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
          
          {/* Left: Floating Brand (no background pill) */}
          <div className="pointer-events-auto flex items-center">
            <Link
              href="/applications"
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
          <nav className="pointer-events-auto hidden lg:flex items-center gap-1 bg-white/95 backdrop-blur-md border border-[#E8E2D8] px-2.5 py-1.5 rounded-full shadow-xs">
            <Link
              href="/dashboard"
              className={`px-3 py-1 rounded-full text-xs font-semibold transition ${
                pathname === '/dashboard'
                  ? 'bg-[#FBF0E4] text-[#C25E26] border border-[#F0D5BE] shadow-2xs'
                  : 'text-stone-600 hover:text-[#1C1917] hover:bg-stone-100/70'
              }`}
            >
              {mounted ? t('Dashboard') : 'Dashboard'}
            </Link>
            <Link
              href="/applications"
              className={`px-3 py-1 rounded-full text-xs font-semibold transition ${
                pathname?.startsWith('/applications')
                  ? 'bg-[#FBF0E4] text-[#C25E26] border border-[#F0D5BE] shadow-2xs'
                  : 'text-stone-600 hover:text-[#1C1917] hover:bg-stone-100/70'
              }`}
            >
              {mounted ? t('Applications') : 'Applications'}
            </Link>
            <Link
              href="/evc"
              className={`px-3 py-1 rounded-full text-xs font-semibold transition ${
                pathname?.startsWith('/evc')
                  ? 'bg-[#FBF0E4] text-[#C25E26] border border-[#F0D5BE] shadow-2xs'
                  : 'text-stone-600 hover:text-[#1C1917] hover:bg-stone-100/70'
              }`}
            >
              {mounted ? t('EVC Visits') : 'EVC Visits'}
            </Link>
            <Link
              href="/undertakings"
              className={`px-3 py-1 rounded-full text-xs font-semibold transition ${
                pathname?.startsWith('/undertakings')
                  ? 'bg-[#FBF0E4] text-[#C25E26] border border-[#F0D5BE] shadow-2xs'
                  : 'text-stone-600 hover:text-[#1C1917] hover:bg-stone-100/70'
              }`}
            >
              {mounted ? t('Undertakings') : 'Undertakings'}
            </Link>
            <Link
              href="/documents"
              className={`px-3 py-1 rounded-full text-xs font-semibold transition ${
                pathname?.startsWith('/documents')
                  ? 'bg-[#FBF0E4] text-[#C25E26] border border-[#F0D5BE] shadow-2xs'
                  : 'text-stone-600 hover:text-[#1C1917] hover:bg-stone-100/70'
              }`}
            >
              {mounted ? t('Documents') : 'Documents'}
            </Link>
            <Link
              href="/alerts"
              className={`px-3 py-1 rounded-full text-xs font-semibold transition ${
                pathname?.startsWith('/alerts')
                  ? 'bg-[#FBF0E4] text-[#C25E26] border border-[#F0D5BE] shadow-2xs'
                  : 'text-stone-600 hover:text-[#1C1917] hover:bg-stone-100/70'
              }`}
            >
              {mounted ? t('Alerts') : 'Alerts'}
            </Link>
            <Link
              href="/reports"
              className={`px-3 py-1 rounded-full text-xs font-semibold transition ${
                pathname?.startsWith('/reports')
                  ? 'bg-[#FBF0E4] text-[#C25E26] border border-[#F0D5BE] shadow-2xs'
                  : 'text-stone-600 hover:text-[#1C1917] hover:bg-stone-100/70'
              }`}
            >
              {mounted ? t('Reports') : 'Reports'}
            </Link>

            {(userRole === 'admin' || userRole === 'bureau_officer') && (
              <>
                <Link
                  href="/audit"
                  className={`px-3 py-1 rounded-full text-xs font-semibold transition ${
                    pathname?.startsWith('/audit')
                      ? 'bg-[#FBF0E4] text-[#C25E26] border border-[#F0D5BE] shadow-2xs'
                      : 'text-stone-600 hover:text-[#1C1917] hover:bg-stone-100/70'
                  }`}
                >
                  {mounted ? t('Audit') : 'Audit'}
                </Link>
                <Link
                  href="/admin/rules"
                  className={`px-3 py-1 rounded-full text-xs font-semibold transition ${
                    pathname?.startsWith('/admin/rules')
                      ? 'bg-[#FBF0E4] text-[#C25E26] border border-[#F0D5BE] shadow-2xs'
                      : 'text-stone-600 hover:text-[#1C1917] hover:bg-stone-100/70'
                  }`}
                >
                  {mounted ? t('Rules') : 'Rules'}
                </Link>
                <Link
                  href="/admin/simulator"
                  className={`px-3 py-1 rounded-full text-xs font-semibold transition inline-flex items-center gap-1 ${
                    pathname?.startsWith('/admin/simulator')
                      ? 'bg-[#FBF0E4] text-[#C25E26] border border-[#F0D5BE] shadow-2xs'
                      : 'text-stone-600 hover:text-[#1C1917] hover:bg-stone-100/70'
                  }`}
                >
                  <FastForward className="w-3.5 h-3.5 text-[#C25E26]" />
                  <span>{mounted ? t('Time Simulator') : 'Time Simulator'}</span>
                </Link>
              </>
            )}
          </nav>

          {/* Right: Floating Action Buttons */}
          <div className="pointer-events-auto flex items-center gap-2">
            {/* Hindi Language Toggle Floating Pill */}
            <button
              type="button"
              onClick={toggleLang}
              className="px-3.5 py-1.5 rounded-full text-xs font-bold bg-white/95 backdrop-blur-md border border-[#E8E2D8] text-stone-700 hover:border-[#C25E26] hover:text-[#C25E26] transition flex items-center gap-1.5 shadow-xs cursor-pointer"
              title="Toggle Language / भाषा बदलें"
            >
              <Globe className="w-3.5 h-3.5 text-[#C25E26]" />
              <span className="hidden sm:inline">{lang === 'hi' ? 'हिन्दी (Active)' : 'English'}</span>
              <span className="sm:hidden">{lang === 'hi' ? 'HI' : 'EN'}</span>
            </button>

            {/* Alert Bell Floating Button */}
            <div className="bg-white/95 backdrop-blur-md border border-[#E8E2D8] rounded-full shadow-xs p-0.5">
              <AlertBell />
            </div>

            {/* User Profile Floating Badge */}
            {userEmail && (
              <div className="hidden sm:flex items-center gap-2 bg-white/95 backdrop-blur-md border border-[#E8E2D8] px-3.5 py-1.5 rounded-full shadow-xs">
                <div className="w-6 h-6 rounded-full bg-[#FBF0E4] text-[#C25E26] flex items-center justify-center font-bold text-xs uppercase">
                  {userEmail[0]}
                </div>
                <div className="text-left">
                  <p className="text-xs font-semibold text-stone-800 leading-none">{userEmail.split('@')[0]}</p>
                  <span className="text-[10px] text-stone-500 capitalize">{userRole?.replace('_', ' ')}</span>
                </div>
              </div>
            )}

            {/* Sign Out Floating Button */}
            <button
              onClick={handleLogout}
              title="Sign out"
              className="p-2 rounded-full bg-white/95 backdrop-blur-md border border-[#E8E2D8] shadow-xs text-stone-500 hover:text-[#C25E26] hover:bg-[#FBF0E4] transition cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
            </button>

            {/* Mobile Menu Toggle */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-2 rounded-full bg-white/95 backdrop-blur-md border border-[#E8E2D8] shadow-xs text-stone-700 hover:text-[#C25E26] transition cursor-pointer"
              aria-label="Toggle mobile navigation menu"
            >
              {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Mobile Floating Dropdown Island */}
        {mobileMenuOpen && (
          <div className="pointer-events-auto lg:hidden mt-2 max-w-7xl mx-auto p-4 rounded-3xl bg-white/95 backdrop-blur-md border border-[#E8E2D8] shadow-xl flex flex-col gap-1.5">
            <Link
              href="/dashboard"
              onClick={() => setMobileMenuOpen(false)}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-stone-700 hover:bg-[#FBF0E4] hover:text-[#C25E26] transition"
            >
              Dashboard
            </Link>
            <Link
              href="/applications"
              onClick={() => setMobileMenuOpen(false)}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-stone-700 hover:bg-[#FBF0E4] hover:text-[#C25E26] transition"
            >
              Applications
            </Link>
            <Link
              href="/evc"
              onClick={() => setMobileMenuOpen(false)}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-stone-700 hover:bg-[#FBF0E4] hover:text-[#C25E26] transition"
            >
              EVC Visits
            </Link>
            <Link
              href="/undertakings"
              onClick={() => setMobileMenuOpen(false)}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-stone-700 hover:bg-[#FBF0E4] hover:text-[#C25E26] transition"
            >
              Undertakings
            </Link>
            <Link
              href="/documents"
              onClick={() => setMobileMenuOpen(false)}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-stone-700 hover:bg-[#FBF0E4] hover:text-[#C25E26] transition"
            >
              Documents
            </Link>
            <Link
              href="/alerts"
              onClick={() => setMobileMenuOpen(false)}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-stone-700 hover:bg-[#FBF0E4] hover:text-[#C25E26] transition"
            >
              Alerts
            </Link>
            <Link
              href="/reports"
              onClick={() => setMobileMenuOpen(false)}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-stone-700 hover:bg-[#FBF0E4] hover:text-[#C25E26] transition"
            >
              Reports
            </Link>
            {(userRole === 'admin' || userRole === 'bureau_officer') && (
              <>
                <Link
                  href="/audit"
                  onClick={() => setMobileMenuOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-stone-700 hover:bg-[#FBF0E4] hover:text-[#C25E26] transition"
                >
                  Audit Chain
                </Link>
                <Link
                  href="/admin/rules"
                  onClick={() => setMobileMenuOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-stone-700 hover:bg-[#FBF0E4] hover:text-[#C25E26] transition"
                >
                  Rule Builder
                </Link>
                <Link
                  href="/admin/simulator"
                  onClick={() => setMobileMenuOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-stone-700 hover:bg-[#FBF0E4] hover:text-[#C25E26] transition flex items-center gap-1.5"
                >
                  <FastForward className="w-3.5 h-3.5 text-[#C25E26]" />
                  <span>Time Simulator</span>
                </Link>
              </>
            )}
          </div>
        )}
      </header>
    </>
  );
}
