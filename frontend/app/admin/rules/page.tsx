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
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-[#E8E2D8]">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-serif font-bold text-stone-900 tracking-tight">
              Statutory Rule & Escalation Builder
            </h1>
            <span className="px-3 py-1 rounded-full text-xs font-medium bg-[#FBF0E4] text-[#C25E26] border border-[#F0D5BE]">
              Admin Only
            </span>
          </div>
          <p className="text-sm text-stone-600 mt-1.5 font-sans">
            Configure stage duration limits, reminder offsets, and multi-tier escalation authorities.
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex p-1 bg-[#FAF7F2] rounded-full border border-[#E8E2D8] shadow-2xs">
          <button
            onClick={() => setActiveTab('sla')}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold transition flex items-center gap-1.5 ${
              activeTab === 'sla'
                ? 'bg-white text-[#C25E26] shadow-2xs border border-[#E8E2D8]'
                : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            <Clock className="w-3.5 h-3.5" /> SLA Durations ({slaRules.length})
          </button>
          <button
            onClick={() => setActiveTab('escalation')}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold transition flex items-center gap-1.5 ${
              activeTab === 'escalation'
                ? 'bg-white text-[#C25E26] shadow-2xs border border-[#E8E2D8]'
                : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            <AlertOctagon className="w-3.5 h-3.5 text-rose-500" /> Escalation Chains ({escalations.length})
          </button>
        </div>
      </div>

      {/* Status Alert */}
      {statusMsg && (
        <div className={`mt-6 p-4 rounded-2xl text-sm font-medium flex items-center gap-2 border ${
          statusMsg.ok 
            ? 'bg-emerald-50/80 text-emerald-800 border-emerald-200' 
            : 'bg-rose-50/80 text-rose-800 border-rose-200'
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
                <div key={rule.scope || idx} className="bg-white p-5 rounded-2xl border border-[#E8E2D8] shadow-2xs flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <span className="font-mono text-xs px-2.5 py-0.5 rounded-full bg-[#FBF0E4] text-[#C25E26] border border-[#F0D5BE] font-bold uppercase">
                        {rule.scope}
                      </span>
                      <span className={`text-[11px] font-semibold ${rule.is_active ? 'text-emerald-700' : 'text-stone-400'}`}>
                        {rule.is_active ? 'Active rule' : 'Disabled'}
                      </span>
                    </div>

                    <h3 className="font-serif font-bold text-base text-stone-900 capitalize">
                      {rule.stage_key ? rule.stage_key.replace(/_/g, ' ') : rule.scope.replace(/_/g, ' ')}
                    </h3>

                    <div className="mt-4 space-y-3">
                      <div>
                        <label className="text-xs text-stone-600 block mb-1 font-medium">Max Duration (Days)</label>
                        <input
                          type="number"
                          value={rule.duration_days}
                          onChange={(e) => {
                            const updated = [...slaRules];
                            updated[idx].duration_days = parseInt(e.target.value) || 1;
                            setSlaRules(updated);
                          }}
                          className="w-full px-3 py-1.5 rounded-xl border border-[#E8E2D8] bg-[#FAF7F2] text-stone-900 text-sm font-bold focus:outline-none focus:border-[#C25E26]"
                        />
                      </div>

                      <div>
                        <label className="text-xs text-stone-600 block mb-1 font-medium">Reminder Offsets (Days remaining)</label>
                        <input
                          type="text"
                          value={rule.reminder_offsets_days?.join(', ') || ''}
                          onChange={(e) => {
                            const updated = [...slaRules];
                            updated[idx].reminder_offsets_days = e.target.value.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));
                            setSlaRules(updated);
                          }}
                          className="w-full px-3 py-1.5 rounded-xl border border-[#E8E2D8] bg-[#FAF7F2] text-stone-900 text-sm font-mono focus:outline-none focus:border-[#C25E26]"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 pt-3 border-t border-[#E8E2D8] flex justify-end">
                    <button
                      onClick={() => handleSaveSlaRule(rule)}
                      disabled={saving}
                      className="px-4 py-2 bg-[#C25E26] hover:bg-[#A84A19] text-white rounded-full text-xs font-semibold shadow-2xs transition flex items-center gap-1.5"
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
              <div key={chain.scope || cIdx} className="bg-white p-6 rounded-2xl border border-[#E8E2D8] shadow-2xs">
                <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-[#E8E2D8] gap-3">
                  <div>
                    <h3 className="font-serif font-bold text-base text-stone-900">
                      Escalation chain: {chain.scope}
                    </h3>
                    <p className="text-xs text-stone-500 mt-0.5">
                      Progressive notification tiers fired when SLA delays breach configured thresholds.
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <label className="text-[11px] text-stone-600 block font-semibold">Ack Timeout (Hours)</label>
                      <input
                        type="number"
                        value={chain.ack_timeout_hours || 48}
                        onChange={(e) => {
                          const updated = [...escalations];
                          updated[cIdx].ack_timeout_hours = parseInt(e.target.value) || 48;
                          setEscalations(updated);
                        }}
                        className="w-20 px-2 py-1 rounded-xl border border-[#E8E2D8] bg-[#FAF7F2] text-stone-900 text-xs font-bold text-center focus:outline-none focus:border-[#C25E26]"
                      />
                    </div>
                    <button
                      onClick={() => handleSaveEscalation(chain)}
                      disabled={saving}
                      className="px-5 py-2.5 bg-[#C25E26] hover:bg-[#A84A19] text-white rounded-full text-xs font-semibold shadow-2xs transition flex items-center gap-1.5"
                    >
                      <Save className="w-3.5 h-3.5" /> Save Chain
                    </button>
                  </div>
                </div>

                {/* Levels */}
                <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                  {(chain.levels || []).map((lvl, lIdx) => (
                    <div key={lvl.level || lIdx} className="p-4 rounded-xl bg-[#FAF7F2] border border-[#E8E2D8]">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-bold text-xs text-[#C25E26] uppercase">
                          Tier Level {lvl.level}
                        </span>
                        <span className="text-[11px] font-semibold text-stone-600">
                          +{lvl.after_days_overdue} Days Overdue
                        </span>
                      </div>
                      <div className="space-y-2 text-xs">
                        <div>
                          <span className="text-stone-500 block text-[10px] uppercase font-bold tracking-wider">Target Roles:</span>
                          <span className="font-semibold text-stone-800">
                            {lvl.notify_roles?.join(', ')}
                          </span>
                        </div>
                        <div>
                          <span className="text-stone-500 block text-[10px] uppercase font-bold tracking-wider">Notification Template:</span>
                          <span className="text-stone-600 font-mono text-[11px]">
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
