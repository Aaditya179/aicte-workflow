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
import { formatDateTime, formatTime } from '@/components/ui';

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
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-6 border-b border-[#E8E2D8]">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-serif font-bold text-stone-900 tracking-tight">
              Audit trail
            </h1>
            <span className="px-3 py-1 rounded-full text-xs font-medium bg-[#FBF0E4] text-[#C25E26] border border-[#F0D5BE] flex items-center gap-1.5 shadow-2xs">
              <Lock className="w-3 h-3 text-[#C25E26]" /> Tamper-evident
            </span>
          </div>
          <p className="text-sm text-stone-600 mt-1.5 font-sans">
            Every stage move, decision, document action and rule change, in order. Each entry is linked to the one before it by a SHA-256 hash, so any edit breaks the chain.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchAuditLog}
            disabled={loading}
            className="p-2.5 border border-[#E8E2D8] bg-white rounded-xl hover:bg-[#FAF7F2] transition text-stone-600 shadow-2xs"
            title="Refresh Ledger"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-[#C25E26]' : ''}`} />
          </button>
          
          <button
            onClick={verifyIntegrity}
            disabled={verifying}
            className="px-5 py-2.5 bg-[#C25E26] hover:bg-[#A84A19] text-white rounded-full font-medium text-sm shadow-sm flex items-center gap-2 transition"
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
            ? 'bg-emerald-50/80 border-emerald-200 text-emerald-800' 
            : 'bg-rose-50/80 border-rose-200 text-rose-800'
        }`}>
          <div className="flex items-start gap-3">
            {verifyResult.ok ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 mt-0.5 flex-shrink-0" />
            ) : (
              <ShieldAlert className="w-5 h-5 text-rose-600 mt-0.5 flex-shrink-0" />
            )}
            <div className="flex-1 text-sm">
              <h4 className="font-bold text-base font-serif">
                {verifyResult.ok ? 'Every entry checks out: nothing has been changed' : 'Check failed: an entry has been changed'}
              </h4>
              <p className="mt-0.5 text-stone-700">
                {verifyResult.ok 
                  ? `Successfully validated all ${verifyResult.entries_verified} sequential blocks from GENESIS. Every previous hash matches.`
                  : `Hash sequence mismatch at Seq #${verifyResult.broken_at_seq}. Expected: ${verifyResult.expected} | Found: ${verifyResult.found}`
                }
              </p>
            </div>
            <button 
              onClick={() => setVerifyResult(null)} 
              className="text-xs font-medium text-stone-500 hover:text-stone-900 underline"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3.5 top-3 text-stone-400" />
          <input
            type="text"
            placeholder="Search action, entity or hash..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-full border border-[#E8E2D8] bg-white text-stone-800 text-sm focus:outline-none focus:border-[#C25E26] shadow-2xs"
          />
        </div>

        <div>
          <select
            value={filterAction}
            onChange={(e) => setFilterAction(e.target.value)}
            className="w-full px-4 py-2 rounded-full border border-[#E8E2D8] bg-white text-stone-800 text-sm focus:outline-none focus:border-[#C25E26] shadow-2xs capitalize"
          >
            <option value="all">All Actions ({entries.length})</option>
            {actionsList.map(a => (
              <option key={a} value={a}>{a.replace(/_/g, ' ')}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center text-xs text-stone-500 justify-end">
          Showing {filteredEntries.length} of {entries.length} audit entries
        </div>
      </div>

      {/* Main Ledger & Diff Explorer */}
      <div className="mt-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Entries Table */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-[#E8E2D8] overflow-hidden shadow-2xs">
          <div className="overflow-x-auto max-h-[650px] overflow-y-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#FAF7F2] sticky top-0 border-b border-[#E8E2D8] text-stone-600 font-semibold uppercase text-[11px]">
                <tr>
                  <th className="py-3 px-3">Seq</th>
                  <th className="py-3 px-3">Action</th>
                  <th className="py-3 px-3">Entity</th>
                  <th className="py-3 px-3">Actor</th>
                  <th className="py-3 px-3">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8E2D8]">
                {filteredEntries.map(entry => {
                  const isSelected = selectedEntry?.seq === entry.seq;
                  return (
                    <tr
                      key={entry.seq}
                      onClick={() => setSelectedEntry(entry)}
                      className={`cursor-pointer transition hover:bg-[#FAF7F2] ${
                        isSelected ? 'bg-[#FBF0E4]/70 font-medium' : ''
                      }`}
                    >
                      <td className="py-2.5 px-3 font-mono font-bold text-[#C25E26]">
                        #{entry.seq}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="font-semibold text-stone-900">
                          {entry.action}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-stone-600">
                        <span className="px-2 py-0.5 rounded-md bg-stone-100 text-stone-700 text-[10px] font-mono border border-stone-200">
                          {entry.entity_type}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-stone-600 capitalize">
                        {entry.actor_role?.replace('_', ' ')}
                      </td>
                      <td className="py-2.5 px-3 text-stone-400 whitespace-nowrap">
                        {formatTime(entry.created_at)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Selected Entry Detail & Diff View */}
        <div className="lg:col-span-5 bg-white rounded-2xl border border-[#E8E2D8] p-5 shadow-2xs">
          {selectedEntry ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-[#E8E2D8]">
                <div>
                  <h3 className="font-serif font-bold text-base text-stone-900 flex items-center gap-2">
                    Block #{selectedEntry.seq}: {selectedEntry.action}
                  </h3>
                  <p className="text-xs text-stone-500 mt-0.5 font-mono">
                    {formatDateTime(selectedEntry.created_at)}
                  </p>
                </div>
                <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-[#FBF0E4] text-[#C25E26] border border-[#F0D5BE]">
                  {selectedEntry.actor_role}
                </span>
              </div>

              {/* Cryptographic Hashes */}
              <div className="space-y-2 p-3.5 rounded-xl bg-[#FAF7F2] border border-[#E8E2D8] font-mono text-[11px]">
                <div>
                  <span className="text-stone-400 block text-[10px] uppercase font-bold tracking-wider">Block Hash:</span>
                  <span className="text-[#C25E26] break-all select-all font-semibold">
                    {selectedEntry.hash}
                  </span>
                </div>
                <div>
                  <span className="text-stone-400 block text-[10px] uppercase font-bold tracking-wider">Previous Hash:</span>
                  <span className="text-stone-600 break-all select-all">
                    {selectedEntry.prev_hash}
                  </span>
                </div>
              </div>

              {/* Reason / Notes */}
              {selectedEntry.reason && (
                <div className="p-3.5 rounded-xl bg-amber-50/80 border border-amber-200 text-xs text-amber-900">
                  <span className="font-bold block mb-0.5">Recorded Rationale:</span>
                  {selectedEntry.reason}
                </div>
              )}

              {/* State Before / After Diff */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-stone-700 flex items-center gap-1.5">
                  <FileCode className="w-3.5 h-3.5 text-[#C25E26]" /> Before and after
                </h4>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="text-[11px] font-bold text-rose-700 block mb-1">State Before:</span>
                    <pre className="p-2.5 rounded-xl bg-[#FAF7F2] border border-[#E8E2D8] font-mono text-[10px] overflow-x-auto max-h-48 text-stone-700">
                      {selectedEntry.before ? JSON.stringify(typeof selectedEntry.before === 'string' ? JSON.parse(selectedEntry.before) : selectedEntry.before, null, 2) : 'null (Created)'}
                    </pre>
                  </div>
                  <div>
                    <span className="text-[11px] font-bold text-emerald-700 block mb-1">State After:</span>
                    <pre className="p-2.5 rounded-xl bg-[#FAF7F2] border border-[#E8E2D8] font-mono text-[10px] overflow-x-auto max-h-48 text-stone-700">
                      {selectedEntry.after ? JSON.stringify(typeof selectedEntry.after === 'string' ? JSON.parse(selectedEntry.after) : selectedEntry.after, null, 2) : 'null (Deleted)'}
                    </pre>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="py-20 text-center text-stone-400 text-sm">
              Select an audit block on the left to inspect its cryptographic payload and diff.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
