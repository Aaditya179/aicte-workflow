'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { fetchApi } from '@/lib/api';
import {
  FileText, ShieldAlert, AlertTriangle, FastForward,
  Clock, ArrowRight, UserCheck, Building2, CheckCircle2,
  ChevronRight, Sparkles, Loader2
} from 'lucide-react';

interface ProfileData {
  role: string;
  full_name: string;
  email: string;
  region_id?: string;
  institution_id?: string;
}

interface AlertCounts {
  total_open: number;
  critical: number;
  warning: number;
  info: number;
}

export default function DashboardPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [counts, setCounts] = useState<AlertCounts>({ total_open: 0, critical: 0, warning: 0, info: 0 });
  const [recentApps, setRecentApps] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }

      setProfile({
        role: user.app_metadata?.role || user.user_metadata?.role || 'user',
        full_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'Officer',
        email: user.email || '',
        region_id: user.app_metadata?.region_id,
        institution_id: user.app_metadata?.institution_id,
      });

      const [countsRes, appsRes] = await Promise.all([
        fetchApi<AlertCounts>('/alerts/counts'),
        fetchApi<any[]>('/applications?limit=5'),
      ]);

      if (countsRes.data) setCounts(countsRes.data);
      if (appsRes.data) setRecentApps(appsRes.data);
      setLoading(false);
    }

    init();
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center">
        <div className="flex items-center gap-3 text-slate-500 text-sm">
          <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
          <span>Loading your portal workspace...</span>
        </div>
      </div>
    );
  }

  const roleLabel = profile?.role?.replace('_', ' ') || 'User';

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-blue-700 via-indigo-700 to-slate-900 rounded-3xl p-6 sm:p-8 text-white shadow-xl mb-8 relative overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 opacity-10 pointer-events-none flex items-center pr-8">
          <Building2 className="w-64 h-64" />
        </div>
        <div className="relative z-10 max-w-2xl">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md text-xs font-semibold mb-3 border border-white/20">
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            AICTE National Approval Workflow
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            Welcome, {profile?.full_name}
          </h1>
          <p className="text-sm text-blue-100 mt-2 leading-relaxed">
            Logged in as <strong className="capitalize text-white">{roleLabel}</strong>. Monitor approval queues, manage SLA deadlines, and verify institutional submissions in real time.
          </p>

          <div className="flex flex-wrap items-center gap-3 mt-6">
            <Link
              href="/applications"
              className="px-4 py-2 rounded-xl bg-white text-blue-900 font-bold text-xs hover:bg-blue-50 transition shadow-sm inline-flex items-center gap-1.5"
            >
              <FileText className="w-4 h-4 text-blue-700" />
              View Applications
            </Link>
            <Link
              href="/alerts"
              className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold text-xs transition border border-white/20 inline-flex items-center gap-1.5"
            >
              <ShieldAlert className="w-4 h-4 text-amber-300" />
              Alerts Inbox ({counts.total_open})
            </Link>
            {(profile?.role === 'admin' || profile?.role === 'bureau_officer') && (
              <Link
                href="/admin/simulator"
                className="px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs transition shadow-sm inline-flex items-center gap-1.5"
              >
                <FastForward className="w-4 h-4" />
                Time Simulator
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* KPI Overview Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mb-8">
        <Link
          href="/applications"
          className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm hover:shadow-md hover:border-blue-400 dark:hover:border-blue-600 transition group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Active Queue</span>
            <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 flex items-center justify-center group-hover:scale-110 transition">
              <FileText className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-slate-900 dark:text-white mt-3">
            {recentApps.length > 0 ? recentApps.length : '1'}
          </div>
          <div className="text-xs text-blue-600 font-semibold mt-2 inline-flex items-center gap-1">
            Browse workflow cases <ChevronRight className="w-3 h-3" />
          </div>
        </Link>

        <Link
          href="/alerts?severity=critical"
          className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm hover:shadow-md hover:border-red-400 dark:hover:border-red-600 transition group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-red-600 dark:text-red-400 uppercase tracking-wider">Critical Escalations</span>
            <div className="w-8 h-8 rounded-lg bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300 flex items-center justify-center group-hover:scale-110 transition">
              <ShieldAlert className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-red-600 dark:text-red-400 mt-3">
            {counts.critical}
          </div>
          <div className="text-xs text-red-600 font-semibold mt-2 inline-flex items-center gap-1">
            Action required <ChevronRight className="w-3 h-3" />
          </div>
        </Link>

        <Link
          href="/alerts?severity=warning"
          className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm hover:shadow-md hover:border-amber-400 dark:hover:border-amber-600 transition group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider">Overdue Warnings</span>
            <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 flex items-center justify-center group-hover:scale-110 transition">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-amber-600 dark:text-amber-400 mt-3">
            {counts.warning}
          </div>
          <div className="text-xs text-amber-600 font-semibold mt-2 inline-flex items-center gap-1">
            Review breached stages <ChevronRight className="w-3 h-3" />
          </div>
        </Link>
      </div>

      {/* Main Content Columns */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Recent Applications */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">Recent Applications</h2>
              <p className="text-xs text-slate-500">Live cases progressing through AICTE templates</p>
            </div>
            <Link
              href="/applications"
              className="text-xs font-semibold text-blue-600 hover:underline inline-flex items-center gap-1"
            >
              View All <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {recentApps.map((a) => (
              <Link
                key={a.id}
                href={`/applications/${a.id}`}
                className="py-3.5 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/40 px-3 rounded-xl transition group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 font-bold text-xs">
                    {a.application_no?.slice(-3) || 'APP'}
                  </div>
                  <div>
                    <p className="font-semibold text-sm text-slate-900 dark:text-slate-100 group-hover:text-blue-600 transition">
                      {a.application_no}
                    </p>
                    <p className="text-xs text-slate-400 capitalize">
                      {a.application_type?.replace(/_/g, ' ')} · Stage: <strong className="text-slate-700 dark:text-slate-300">{a.current_stage}</strong>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full capitalize ${
                    a.status === 'in_progress'
                      ? 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                      : a.status === 'returned'
                      ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                      : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                  }`}>
                    {a.status?.replace('_', ' ')}
                  </span>
                  <ChevronRight className="w-4 h-4 text-slate-400 group-hover:translate-x-0.5 transition" />
                </div>
              </Link>
            ))}
            {recentApps.length === 0 && (
              <div className="py-8 text-center text-xs text-slate-400">
                No applications loaded.
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Portal Shortcuts & Actions */}
        <div className="space-y-5">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
            <h2 className="text-base font-bold text-slate-900 dark:text-white mb-1">Quick Links</h2>
            <p className="text-xs text-slate-500 mb-4">Direct navigation to active modules</p>

            <div className="space-y-2.5">
              <Link
                href="/applications"
                className="p-3 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 hover:bg-blue-50/50 dark:hover:bg-blue-950/20 hover:border-blue-300 flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-200 transition"
              >
                <span className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-blue-600" />
                  Application Workflow Table
                </span>
                <ChevronRight className="w-4 h-4 text-slate-400" />
              </Link>

              <Link
                href="/alerts"
                className="p-3 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 hover:bg-amber-50/50 dark:hover:bg-amber-950/20 hover:border-amber-300 flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-200 transition"
              >
                <span className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                  SLA Breaches & Alerts Inbox
                </span>
                <ChevronRight className="w-4 h-4 text-slate-400" />
              </Link>

              {(profile?.role === 'admin' || profile?.role === 'bureau_officer') && (
                <Link
                  href="/admin/simulator"
                  className="p-3 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 hover:bg-purple-50/50 dark:hover:bg-purple-950/20 hover:border-purple-300 flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-200 transition"
                >
                  <span className="flex items-center gap-2">
                    <FastForward className="w-4 h-4 text-purple-600" />
                    Time-Travel Simulator
                  </span>
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                </Link>
              )}
            </div>
          </div>

          {/* Session Profile Card */}
          <div className="bg-slate-100 dark:bg-slate-800/50 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300">
            <span className="font-semibold text-slate-800 dark:text-slate-100 block mb-2">Active Session</span>
            <p className="truncate"><strong>Email:</strong> {profile?.email}</p>
            <p className="capitalize mt-1"><strong>Role:</strong> {roleLabel}</p>
            <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700 text-[11px] text-slate-400">
              Complies with AICTE Approval Process Handbook (APH) 2024–2027.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
