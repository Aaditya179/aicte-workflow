'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import AlertBell from './AlertBell';
import SimulatedDateBanner from './SimulatedDateBanner';
import { LogOut, FastForward, Globe, Menu, X } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';

type NavLink = { href: string; label: string };

const L = {
  dashboard: { href: '/dashboard', label: 'Dashboard' },
  applications: { href: '/applications', label: 'Applications' },
  calendar: { href: '/compliance-calendar', label: 'Calendar' },
  evc: { href: '/evc', label: 'EVC Visits' },
  availability: { href: '/evc/availability', label: 'Availability' },
  undertakings: { href: '/undertakings', label: 'Undertakings' },
  documents: { href: '/documents', label: 'Documents' },
  alerts: { href: '/alerts', label: 'Alerts' },
  reports: { href: '/reports', label: 'Reports' },
  audit: { href: '/audit', label: 'Audit' },
  adminHome: { href: '/admin', label: 'Overview' },
  approvals: { href: '/admin/approvals', label: 'Approvals' },
  rules: { href: '/admin/rules', label: 'Rules' },
  users: { href: '/admin/users', label: 'Users' },
  simulator: { href: '/admin/simulator', label: 'Time Simulator' },
} satisfies Record<string, NavLink>;

// Each role sees only the pages it can use; the administrator and auditor have no case pages (§15.0)
const NAV_LINKS: Record<string, NavLink[]> = {
  institution: [L.dashboard, L.applications, L.calendar, L.undertakings, L.documents, L.alerts],
  scrutiny_officer: [L.dashboard, L.applications, L.undertakings, L.documents, L.alerts, L.reports],
  regional_officer: [L.dashboard, L.applications, L.evc, L.undertakings, L.documents, L.alerts, L.reports],
  evc_member: [L.dashboard, L.applications, L.evc, L.availability, L.alerts],
  sac_shc_member: [L.dashboard, L.applications, L.alerts],
  bureau_officer: [L.dashboard, L.applications, L.evc, L.undertakings, L.documents, L.alerts, L.reports, L.audit, L.approvals],
  auditor: [L.audit, L.reports],
  admin: [L.adminHome, L.rules, L.approvals, L.users, L.simulator, L.audit],
};

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

  // Don't render navbar on login, MFA or welcome page
  if (pathname === '/login' || pathname === '/welcome' || pathname === '/mfa') return null;

  const links = NAV_LINKS[userRole || ''] || [];
  const home = links[0]?.href || '/dashboard';
  // The longest matching link is the active one, so /evc/availability does not also light up /evc
  const active = links
    .filter((l) => pathname === l.href || pathname?.startsWith(`${l.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    <>
      <SimulatedDateBanner />
      {/* Invisible Navbar with Floating Buttons */}
      <header className="sticky top-0 z-40 w-full bg-transparent border-none pt-3 sm:pt-4 pb-2 px-4 sm:px-6 lg:px-8 pointer-events-none transition-all">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">

          {/* Left: Floating Brand (no background pill) */}
          <div className="pointer-events-auto flex items-center">
            <Link
              href={home}
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
          <nav aria-label="Main" className="pointer-events-auto hidden lg:flex items-center gap-1 bg-white/95 backdrop-blur-md border border-[#E8E2D8] px-2.5 py-1.5 rounded-full shadow-xs">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                aria-current={active === l.href ? 'page' : undefined}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition inline-flex items-center gap-1 ${
                  active === l.href
                    ? 'bg-[#FBF0E4] text-[#C25E26] border border-[#F0D5BE] shadow-2xs'
                    : 'text-stone-600 hover:text-[#1C1917] hover:bg-stone-100/70'
                }`}
              >
                {l.href === L.simulator.href && <FastForward className="w-3.5 h-3.5 text-[#C25E26]" />}
                <span>{mounted ? t(l.label) : l.label}</span>
              </Link>
            ))}
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
                  <span className="text-[10px] text-stone-500 capitalize">{userRole?.replace(/_/g, ' ')}</span>
                </div>
              </div>
            )}

            {/* Sign Out Floating Button */}
            <button
              onClick={handleLogout}
              title="Sign out"
              aria-label="Sign out"
              className="p-2 rounded-full bg-white/95 backdrop-blur-md border border-[#E8E2D8] shadow-xs text-stone-500 hover:text-[#C25E26] hover:bg-[#FBF0E4] transition cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
            </button>

            {/* Mobile Menu Toggle */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-2 rounded-full bg-white/95 backdrop-blur-md border border-[#E8E2D8] shadow-xs text-stone-700 hover:text-[#C25E26] transition cursor-pointer"
              aria-label="Toggle mobile navigation menu"
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Mobile Floating Dropdown Island */}
        {mobileMenuOpen && (
          <div className="pointer-events-auto lg:hidden mt-2 max-w-7xl mx-auto p-4 rounded-3xl bg-white/95 backdrop-blur-md border border-[#E8E2D8] shadow-xl flex flex-col gap-1.5">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setMobileMenuOpen(false)}
                aria-current={active === l.href ? 'page' : undefined}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-stone-700 hover:bg-[#FBF0E4] hover:text-[#C25E26] transition flex items-center gap-1.5"
              >
                {l.href === L.simulator.href && <FastForward className="w-3.5 h-3.5 text-[#C25E26]" />}
                <span>{mounted ? t(l.label) : l.label}</span>
              </Link>
            ))}
          </div>
        )}
      </header>
    </>
  );
}
