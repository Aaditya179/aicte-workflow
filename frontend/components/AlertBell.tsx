'use client';

import React, { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { Bell, Check, Clock, ExternalLink } from 'lucide-react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { fetchApi } from '@/lib/api';

/** Fired on window when a realtime notification arrives, so open pages can refresh. */
export const NEW_NOTIFICATION_EVENT = 'nirikshan:notification';

interface NotificationItem {
  id: string;
  title: string;
  body: string | null;
  status: string;
  created_at: string;
  alert_id?: string;
}

export default function AlertBell() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [toast, setToast] = useState<NotificationItem | null>(null);
  const [live, setLive] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const loadNotifications = async () => {
    const { data } = await fetchApi<{ items: NotificationItem[]; unread_count: number }>('/notifications');
    if (data) {
      setNotifications(data.items || []);
      setUnreadCount(data.unread_count || 0);
    }
  };

  useEffect(() => {
    loadNotifications();

    // Supabase Realtime: new in-app notifications for this user arrive without a refresh.
    // RLS limits the stream to the user's own rows; the filter keeps the payload small.
    let channel: RealtimeChannel | null = null;
    let cancelled = false;
    supabase.auth.getSession().then(({ data: { session } }) => {
      const uid = session?.user.id;
      if (!uid || cancelled) return;
      supabase.realtime.setAuth(session.access_token);
      channel = supabase
        .channel(`notifications:${uid}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${uid}` },
          (payload) => {
            const n = payload.new as NotificationItem & { channel?: string };
            if (n.channel && n.channel !== 'in_app') return;
            setNotifications((prev) => (prev.some((p) => p.id === n.id) ? prev : [n, ...prev]));
            setUnreadCount((c) => c + 1);
            setToast(n);
            window.dispatchEvent(new CustomEvent(NEW_NOTIFICATION_EVENT, { detail: n }));
          }
        )
        .subscribe((status) => setLive(status === 'SUBSCRIBED'));
    });

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 8000);
    return () => clearTimeout(t);
  }, [toast]);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const markAsRead = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await fetchApi(`/notifications/${id}/read`, { method: 'POST' });
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, status: 'read' } : n))
    );
    setUnreadCount((c) => Math.max(0, c - 1));
  };

  const markAllRead = async () => {
    await fetchApi('/notifications/read-all', { method: 'POST' });
    setNotifications((prev) => prev.map((n) => ({ ...n, status: 'read' })));
    setUnreadCount(0);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        aria-label={`Alerts and Notifications${live ? ' (live)' : ''}`}
        title={live ? 'Live: new alerts appear instantly' : 'Connecting to live alerts…'}
        className="relative p-2 rounded-full text-stone-600 hover:text-[#C25E26] hover:bg-[#FBF0E4] transition cursor-pointer"
      >
        <Bell className="w-5 h-5" />
        <span aria-hidden className={`absolute bottom-1 right-1 w-1.5 h-1.5 rounded-full ${live ? 'bg-emerald-500' : 'bg-stone-300'}`} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 bg-[#C25E26] text-white text-[10px] font-bold rounded-full flex items-center justify-center motion-safe:animate-pulse">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-[#FAF7F2] rounded-2xl shadow-xl border border-[#E8E2D8] z-50 overflow-hidden">
          <div className="p-3.5 border-b border-[#E8E2D8] flex items-center justify-between bg-white">
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-[#1C1917]">Notifications</span>
              {unreadCount > 0 && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-[#FBF0E4] text-[#C25E26] font-semibold border border-[#F0D5BE]">
                  {unreadCount} unread
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="text-xs text-[#C25E26] hover:text-[#A84A19] font-semibold cursor-pointer"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto divide-y divide-[#E8E2D8]">
            {notifications.length === 0 ? (
              <div className="p-6 text-center text-xs text-stone-400">
                No notifications yet.
              </div>
            ) : (
              notifications.slice(0, 10).map((n) => (
                <div
                  key={n.id}
                  className={`p-3.5 text-xs transition flex gap-3 items-start ${
                    n.status !== 'read'
                      ? 'bg-white font-medium'
                      : 'bg-[#FAF7F2]/60 hover:bg-white text-stone-600'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-[#1C1917] truncate">{n.title}</p>
                    {n.body && <p className="text-stone-600 mt-0.5 line-clamp-2">{n.body}</p>}
                    <span className="text-[10px] text-stone-400 mt-1 block">
                      {new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  {n.status !== 'read' && (
                    <button
                      onClick={(e) => markAsRead(n.id, e)}
                      title="Mark as read"
                      className="p-1 rounded-full text-stone-400 hover:text-[#C25E26] hover:bg-[#FBF0E4] transition"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>

          <div className="p-2.5 border-t border-[#E8E2D8] text-center bg-white">
            <Link
              href="/alerts"
              onClick={() => setIsOpen(false)}
              className="text-xs text-[#C25E26] hover:underline font-bold inline-flex items-center gap-1"
            >
              <span>View all statutory alerts</span>
              <ExternalLink className="w-3 h-3" />
            </Link>
          </div>
        </div>
      )}

      <div aria-live="polite" className="fixed bottom-4 right-4 z-[60] w-[calc(100%-2rem)] max-w-sm">
        {toast && (
          <div role="status" className="rounded-2xl border border-[#F0D5BE] bg-white p-4 shadow-xl">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 rounded-full bg-[#FBF0E4] p-1.5 text-[#C25E26]"><Bell className="h-4 w-4" /></span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-[#1C1917]">{toast.title}</p>
                {toast.body && <p className="mt-0.5 line-clamp-3 text-xs text-stone-600">{toast.body}</p>}
                <Link
                  href={toast.alert_id ? `/alerts/${toast.alert_id}` : '/alerts'}
                  onClick={() => setToast(null)}
                  className="mt-2 inline-block text-xs font-bold text-[#C25E26] hover:underline"
                >
                  View alert
                </Link>
              </div>
              <button onClick={() => setToast(null)} aria-label="Dismiss" className="text-lg leading-none text-stone-400 hover:text-stone-700">×</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
