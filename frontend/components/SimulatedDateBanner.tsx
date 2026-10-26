'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { FastForward, RotateCcw } from 'lucide-react';
import { fetchApi } from '@/lib/api';

export default function SimulatedDateBanner() {
  const [clockData, setClockData] = useState<{
    clock_now: string;
    offset_days: number;
    is_simulated: boolean;
  } | null>(null);

  const checkClock = async () => {
    try {
      const { data } = await fetchApi<{
        clock_now: string;
        offset_days: number;
        is_simulated: boolean;
      }>('/admin/clock');
      if (data && data.is_simulated) {
        setClockData(data);
      } else {
        setClockData(null);
      }
    } catch {
      setClockData(null);
    }
  };

  useEffect(() => {
    checkClock();
    const interval = setInterval(checkClock, 15000);
    return () => clearInterval(interval);
  }, []);

  const resetClock = async () => {
    await fetchApi('/admin/clock/reset', { method: 'POST' });
    setClockData(null);
    window.location.reload();
  };

  if (!clockData) return null;

  return (
    <div className="bg-amber-500 text-slate-950 px-4 py-1.5 text-xs font-medium flex items-center justify-between shadow-sm transition">
      <div className="flex items-center gap-2">
        <FastForward className="w-4 h-4 animate-pulse" />
        <span>
          <strong>Time-Travel Active:</strong> Simulated date is{' '}
          <span className="font-bold underline">
            {new Date(clockData.clock_now).toLocaleDateString(undefined, {
              weekday: 'short',
              year: 'numeric',
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>{' '}
          (+{clockData.offset_days} days)
        </span>
      </div>
      <div className="flex items-center gap-3">
        <Link
          href="/admin/simulator"
          className="hover:underline font-semibold"
        >
          Open Simulator
        </Link>
        <button
          onClick={resetClock}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-black/10 hover:bg-black/20 text-slate-950 font-bold transition"
        >
          <RotateCcw className="w-3 h-3" />
          Reset Clock
        </button>
      </div>
    </div>
  );
}
