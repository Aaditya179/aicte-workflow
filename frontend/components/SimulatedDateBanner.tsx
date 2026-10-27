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
      }>('/clock');
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
    <div className="bg-[#C25E26] text-white px-4 py-2 text-xs font-medium flex items-center justify-between shadow-sm transition">
      <div className="flex items-center gap-2">
        <FastForward className="w-4 h-4 animate-pulse text-amber-200" />
        <span>
          <strong>Time-Travel Active:</strong> Simulated date is{' '}
          <span className="font-bold underline decoration-amber-200">
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
          className="hover:underline font-semibold text-white/90 hover:text-white"
        >
          Open Simulator
        </Link>
        <button
          onClick={resetClock}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/20 hover:bg-white/30 text-white font-bold transition cursor-pointer"
        >
          <RotateCcw className="w-3 h-3" />
          Reset Clock
        </button>
      </div>
    </div>
  );
}
