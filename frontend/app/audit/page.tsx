'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  ShieldCheck, 
  ShieldAlert, 
  RefreshCw, 
  Search, 
  Filter, 
  CheckCircle2, 
  AlertTriangle,
  FileCode,
  ArrowRight,
  Database,
  Lock
} from 'lucide-react';

interface AuditEntry {
  seq: number;
  actor_id: string;
  actor_role: string;
  action: string;
  entity_type: string;
  entity_id: string;
  before: any;
  after: any;
  reason: string;
  ip?: string;
  prev_hash: string;
  hash: string;
  created_at: string;
}

interface VerificationResult {
  ok: boolean;
  entries_verified?: number;
  broken_at_seq?: number;
  expected?: string;
  found?: string;
  message?: string;
}

export default function AuditLogPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<VerificationResult | null>(null);
  const [filterAction, setFilterAction] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedEntry, setSelectedEntry] = useState<AuditEntry | null>(null);

  const apiBase = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1').replace(/\/api\/v1\/?$/, '');

  const fetchAuditLog = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || '';

      const res = await fetch(`${apiBase}/api/v1/audit`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setEntries(data.entries || []);
        if (data.entries?.length > 0 && !selectedEntry) {
          setSelectedEntry(data.entries[0]);
        }
      }
    } catch (e) {
      console.error('Failed to load audit logs:', e);
    } finally {
      setLoading(false);
    }
  };

  const verifyIntegrity = async () => {
    setVerifying(true);
    setVerifyResult(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || '';

      const res = await fetch(`${apiBase}/api/v1/audit/verify`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const result = await res.json();
        setVerifyResult(result);
      } else {
        setVerifyResult({ ok: false, message: 'Verification endpoint returned an error.' });
      }
    } catch (e) {
      setVerifyResult({ ok: false, message: 'Failed to contact verification service.' });
    } finally {
      setVerifying(false);
    }
  };

  useEffect(() => {
    fetchAuditLog();
  }, []);

  const filteredEntries = entries.filter(e => {
    const matchesAction = filterAction === 'all' || e.action === filterAction;
    const matchesSearch = !searchTerm || 
      e.action?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      e.entity_type?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      e.actor_role?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      e.hash?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesAction && matchesSearch;
  });

  const actionsList = Array.from(new Set(entries.map(e => e.action))).filter(Boolean);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header & Verification Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-6 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
              Cryptographic Audit Chain
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300 flex items-center gap-1">
              <Lock className="w-3 h-3" /> SHA-256 Chained
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Tamper-evident sequential ledger of every application transition, clock shift, and administrative decision.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchAuditLog}
            disabled={loading}
            className="p-2.5 border border-slate-200 dark:border-slate-800 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition text-slate-600 dark:text-slate-300"
            title="Refresh Ledger"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          
          <button
            onClick={verifyIntegrity}
            disabled={verifying}
            className="px-4 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl font-bold text-sm shadow-md shadow-blue-500/20 flex items-center gap-2 transition"
          >
            {verifying ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" /> Verifying Hashes...
              </>
            ) : (
              <>
                <ShieldCheck className="w-4 h-4" /> Verify Integrity
              </>
            )}
          </button>
        </div>
      </div>

      {/* Verification Result Banner */}
      {verifyResult && (
        <div className={`mt-6 p-4 rounded-2xl border transition-all ${
          verifyResult.ok 
            ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/50 text-emerald-800 dark:text-emerald-300' 
            : 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800/50 text-rose-800 dark:text-rose-300'
        }`}>
          <div className="flex items-start gap-3">
            {verifyResult.ok ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 mt-0.5 flex-shrink-0" />
            ) : (
              <ShieldAlert className="w-5 h-5 text-rose-600 dark:text-rose-400 mt-0.5 flex-shrink-0" />
            )}
            <div className="flex-1 text-sm">
              <h4 className="font-bold text-base">
                {verifyResult.ok ? 'Ledger Integrity Cryptographically Verified' : 'Integrity Check Failed - Tampering Detected'}
              </h4>
              <p className="mt-0.5">
                {verifyResult.ok 
                  ? `Successfully validated all ${verifyResult.entries_verified} sequential blocks from GENESIS. Every previous hash matches.`
                  : `Hash sequence mismatch at Seq #${verifyResult.broken_at_seq}. Expected: ${verifyResult.expected} | Found: ${verifyResult.found}`
                }
              </p>
            </div>
            <button 
              onClick={() => setVerifyResult(null)} 
              className="text-xs font-semibold underline opacity-75 hover:opacity-100"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
          <input
            type="text"
            placeholder="Search action, entity or hash..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <select
            value={filterAction}
            onChange={(e) => setFilterAction(e.target.value)}
            className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 capitalize"
          >
            <option value="all">All Actions ({entries.length})</option>
            {actionsList.map(a => (
              <option key={a} value={a}>{a.replace(/_/g, ' ')}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center text-xs text-slate-500 justify-end">
          Showing {filteredEntries.length} of {entries.length} audit entries
        </div>
      </div>

      {/* Main Ledger & Diff Explorer */}
      <div className="mt-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Entries Table */}
        <div className="lg:col-span-7 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
          <div className="overflow-x-auto max-h-[650px] overflow-y-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/60 sticky top-0 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-semibold uppercase">
                <tr>
                  <th className="py-3 px-3">Seq</th>
                  <th className="py-3 px-3">Action</th>
                  <th className="py-3 px-3">Entity</th>
                  <th className="py-3 px-3">Actor</th>
                  <th className="py-3 px-3">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredEntries.map(entry => {
                  const isSelected = selectedEntry?.seq === entry.seq;
                  return (
                    <tr
                      key={entry.seq}
                      onClick={() => setSelectedEntry(entry)}
                      className={`cursor-pointer transition hover:bg-blue-50/50 dark:hover:bg-slate-800/50 ${
                        isSelected ? 'bg-blue-50 dark:bg-blue-950/40 font-medium' : ''
                      }`}
                    >
                      <td className="py-2.5 px-3 font-mono font-bold text-blue-600 dark:text-blue-400">
                        #{entry.seq}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                          {entry.action}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400">
                        <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px] font-mono">
                          {entry.entity_type}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-500 capitalize">
                        {entry.actor_role?.replace('_', ' ')}
                      </td>
                      <td className="py-2.5 px-3 text-slate-400 whitespace-nowrap">
                        {new Date(entry.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Selected Entry Detail & Diff View */}
        <div className="lg:col-span-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
          {selectedEntry ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                <div>
                  <h3 className="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
                    Block #{selectedEntry.seq}: {selectedEntry.action}
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5 font-mono">
                    {new Date(selectedEntry.created_at).toLocaleString()}
                  </p>
                </div>
                <span className="px-2 py-1 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                  {selectedEntry.actor_role}
                </span>
              </div>

              {/* Cryptographic Hashes */}
              <div className="space-y-2 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 font-mono text-[11px]">
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Block Hash:</span>
                  <span className="text-blue-600 dark:text-blue-400 break-all select-all font-semibold">
                    {selectedEntry.hash}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Previous Hash:</span>
                  <span className="text-slate-500 dark:text-slate-400 break-all select-all">
                    {selectedEntry.prev_hash}
                  </span>
                </div>
              </div>

              {/* Reason / Notes */}
              {selectedEntry.reason && (
                <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 text-xs text-amber-800 dark:text-amber-300">
                  <span className="font-bold block">Recorded Rationale:</span>
                  {selectedEntry.reason}
                </div>
              )}

              {/* State Before / After Diff */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                  <FileCode className="w-3.5 h-3.5" /> State Transition Payload
                </h4>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="text-[11px] font-bold text-rose-600 block mb-1">State Before:</span>
                    <pre className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono text-[10px] overflow-x-auto max-h-48 text-slate-600 dark:text-slate-400">
                      {selectedEntry.before ? JSON.stringify(typeof selectedEntry.before === 'string' ? JSON.parse(selectedEntry.before) : selectedEntry.before, null, 2) : 'null (Created)'}
                    </pre>
                  </div>
                  <div>
                    <span className="text-[11px] font-bold text-emerald-600 block mb-1">State After:</span>
                    <pre className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono text-[10px] overflow-x-auto max-h-48 text-slate-600 dark:text-slate-400">
                      {selectedEntry.after ? JSON.stringify(typeof selectedEntry.after === 'string' ? JSON.parse(selectedEntry.after) : selectedEntry.after, null, 2) : 'null (Deleted)'}
                    </pre>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="py-20 text-center text-slate-400 text-sm">
              Select an audit block on the left to inspect its cryptographic payload and diff.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
