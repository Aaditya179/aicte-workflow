'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  Sliders, 
  GitBranch, 
  Clock, 
  AlertOctagon, 
  Plus, 
  CheckCircle2, 
  Save, 
  RotateCcw,
  Shield,
  Layers
} from 'lucide-react';

interface SLARule {
  id?: string;
  scope: string;
  stage_key?: string;
  template_code?: string;
  duration_days: number;
  reminder_offsets_days: number[];
  is_active: boolean;
}

interface EscalationChain {
  id?: string;
  scope: string;
  levels: Array<{ level: number; after_days_overdue: number; notify_roles: string[]; template: string }>;
  ack_timeout_hours: number;
}

export default function AdminRulesPage() {
  const [activeTab, setActiveTab] = useState<'sla' | 'escalation'>('sla');
  const [slaRules, setSlaRules] = useState<SLARule[]>([]);
  const [escalations, setEscalations] = useState<EscalationChain[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const apiBase = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1').replace(/\/api\/v1\/?$/, '');

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || '';

      const [resSla, resEsc] = await Promise.all([
        fetch(`${apiBase}/api/v1/admin/sla-rules`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch(`${apiBase}/api/v1/admin/escalation-chains`, {
          headers: { Authorization: `Bearer ${token}` }
        })
      ]);

      if (resSla.ok) setSlaRules(await resSla.json());
      if (resEsc.ok) setEscalations(await resEsc.json());
    } catch (e) {
      console.error('Failed to load rules:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSaveSlaRule = async (rule: SLARule) => {
    setSaving(true);
    setStatusMsg(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || '';

      const res = await fetch(`${apiBase}/api/v1/admin/sla-rules`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(rule)
      });
      if (res.ok) {
        setStatusMsg({ text: `SLA rule '${rule.scope}' successfully updated.`, ok: true });
        fetchData();
      } else {
        setStatusMsg({ text: 'Failed to update rule.', ok: false });
      }
    } catch (e) {
      setStatusMsg({ text: 'Error contacting backend.', ok: false });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveEscalation = async (chain: EscalationChain) => {
    setSaving(true);
    setStatusMsg(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || '';

      const res = await fetch(`${apiBase}/api/v1/admin/escalation-chains`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(chain)
      });
      if (res.ok) {
        setStatusMsg({ text: `Escalation chain '${chain.scope}' successfully updated.`, ok: true });
        fetchData();
      } else {
        setStatusMsg({ text: 'Failed to update escalation chain.', ok: false });
      }
    } catch (e) {
      setStatusMsg({ text: 'Error contacting backend.', ok: false });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
              Statutory Rule & Escalation Builder
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
              Admin Only
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Configure stage duration limits, reminder offsets, and multi-tier escalation authorities.
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
          <button
            onClick={() => setActiveTab('sla')}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
              activeTab === 'sla'
                ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            <Clock className="w-3.5 h-3.5" /> SLA Durations ({slaRules.length})
          </button>
          <button
            onClick={() => setActiveTab('escalation')}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
              activeTab === 'escalation'
                ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            <AlertOctagon className="w-3.5 h-3.5 text-rose-500" /> Escalation Chains ({escalations.length})
          </button>
        </div>
      </div>

      {/* Status Alert */}
      {statusMsg && (
        <div className={`mt-6 p-4 rounded-xl text-sm font-semibold flex items-center gap-2 border ${
          statusMsg.ok 
            ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800' 
            : 'bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/30 dark:border-rose-800'
        }`}>
          <CheckCircle2 className="w-4 h-4" />
          {statusMsg.text}
        </div>
      )}

      {/* Rules Content */}
      <div className="mt-8">
        {activeTab === 'sla' ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {slaRules.map((rule, idx) => (
                <div key={rule.scope || idx} className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <span className="font-mono text-xs px-2 py-0.5 rounded bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 font-bold uppercase">
                        {rule.scope}
                      </span>
                      <span className={`text-[11px] font-semibold ${rule.is_active ? 'text-emerald-600' : 'text-slate-400'}`}>
                        {rule.is_active ? 'Active Rule' : 'Disabled'}
                      </span>
                    </div>

                    <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200 capitalize">
                      {rule.stage_key ? rule.stage_key.replace(/_/g, ' ') : rule.scope.replace(/_/g, ' ')}
                    </h3>

                    <div className="mt-4 space-y-3">
                      <div>
                        <label className="text-xs text-slate-500 block mb-1">Max Duration (Days)</label>
                        <input
                          type="number"
                          value={rule.duration_days}
                          onChange={(e) => {
                            const updated = [...slaRules];
                            updated[idx].duration_days = parseInt(e.target.value) || 1;
                            setSlaRules(updated);
                          }}
                          className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-bold"
                        />
                      </div>

                      <div>
                        <label className="text-xs text-slate-500 block mb-1">Reminder Offsets (Days remaining)</label>
                        <input
                          type="text"
                          value={rule.reminder_offsets_days?.join(', ') || ''}
                          onChange={(e) => {
                            const updated = [...slaRules];
                            updated[idx].reminder_offsets_days = e.target.value.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));
                            setSlaRules(updated);
                          }}
                          className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-mono"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end">
                    <button
                      onClick={() => handleSaveSlaRule(rule)}
                      disabled={saving}
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-sm transition flex items-center gap-1.5"
                    >
                      <Save className="w-3.5 h-3.5" /> Save Rule
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {escalations.map((chain, cIdx) => (
              <div key={chain.scope || cIdx} className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800 gap-3">
                  <div>
                    <h3 className="font-bold text-base text-slate-900 dark:text-white uppercase font-mono">
                      Escalation Chain: {chain.scope}
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Progressive notification tiers fired when SLA delays breach configured thresholds.
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <label className="text-[11px] text-slate-400 block font-semibold">Ack Timeout (Hours)</label>
                      <input
                        type="number"
                        value={chain.ack_timeout_hours || 48}
                        onChange={(e) => {
                          const updated = [...escalations];
                          updated[cIdx].ack_timeout_hours = parseInt(e.target.value) || 48;
                          setEscalations(updated);
                        }}
                        className="w-20 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold text-center"
                      />
                    </div>
                    <button
                      onClick={() => handleSaveEscalation(chain)}
                      disabled={saving}
                      className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-md shadow-rose-500/20 transition flex items-center gap-1.5"
                    >
                      <Save className="w-3.5 h-3.5" /> Save Chain
                    </button>
                  </div>
                </div>

                {/* Levels */}
                <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                  {(chain.levels || []).map((lvl, lIdx) => (
                    <div key={lvl.level || lIdx} className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-black text-xs text-rose-600 dark:text-rose-400 uppercase">
                          Tier Level {lvl.level}
                        </span>
                        <span className="text-[11px] font-bold text-slate-500">
                          +{lvl.after_days_overdue} Days Overdue
                        </span>
                      </div>
                      <div className="space-y-2 text-xs">
                        <div>
                          <span className="text-slate-400 block text-[10px] uppercase font-bold">Target Roles:</span>
                          <span className="font-semibold text-slate-700 dark:text-slate-300">
                            {lvl.notify_roles?.join(', ')}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[10px] uppercase font-bold">Notification Template:</span>
                          <span className="text-slate-500 dark:text-slate-400 font-mono text-[11px]">
                            {lvl.template}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
