'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { fetchApi } from '@/lib/api';
import { PageShell, card, btnPrimary, btnDanger, input, Notice, Badge, useMe, formatDateTime } from '@/components/ui';

interface ApprovalRequest {
  id: string;
  kind: 'rule_change' | 'revert' | 'assurance_override';
  entity_type: string | null;
  entity_id: string | null;
  payload: Record<string, any>;
  requested_by: string;
  requested_by_name: string | null;
  approved_by_name: string | null;
  status: 'pending' | 'approved' | 'rejected';
  reason: string | null;
  created_at: string;
  decided_at: string | null;
  can_decide: boolean;
}

const KIND_LABEL = { rule_change: 'Rule change', revert: 'Case revert', assurance_override: 'Assurance override' };

function Summary({ r }: { r: ApprovalRequest }) {
  if (r.kind === 'rule_change') {
    const row = r.payload?.row || {};
    const fields = Object.entries(row).filter(([k]) => !['id'].includes(k));
    return (
      <div className="text-sm text-stone-700">
        <p>Table <code className="font-mono text-xs">{r.payload?.table}</code>{row.id ? ' · update existing row' : ' · new row'}</p>
        <pre className="mt-2 max-h-48 overflow-auto rounded-lg bg-stone-50 p-3 font-mono text-xs text-stone-800">
          {JSON.stringify(Object.fromEntries(fields), null, 2)}
        </pre>
      </div>
    );
  }
  if (r.kind === 'revert') {
    return <p className="text-sm text-stone-700">Revert application to stage <strong>{r.payload?.target_stage}</strong>. Reason: {r.payload?.reason}</p>;
  }
  return <p className="text-sm text-stone-700">Override an assurance flag. Reason given: {r.payload?.reason}</p>;
}

export default function ApprovalsPage() {
  const { me } = useMe();
  const [rows, setRows] = useState<ApprovalRequest[]>([]);
  const [filter, setFilter] = useState('pending');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [makerChecker, setMakerChecker] = useState<boolean | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await fetchApi<ApprovalRequest[]>(`/admin/approvals${filter ? `?status=${filter}` : ''}`);
    if (data) setRows(data);
    else setError(error);
  }, [filter]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (me?.role === 'admin') fetchApi<{ maker_checker_for_overrides: boolean }>('/admin/settings').then(({ data }) => setMakerChecker(data?.maker_checker_for_overrides ?? null));
  }, [me]);

  async function decide(r: ApprovalRequest, decision: 'approve' | 'reject') {
    setError(null);
    setMessage(null);
    const { error } = await fetchApi(`/admin/approvals/${r.id}/${decision}`, {
      method: 'POST',
      body: JSON.stringify({ reason: reasons[r.id] || null }),
    });
    if (error) return setError(error);
    setMessage(decision === 'approve' ? 'Approved and applied.' : 'Rejected.');
    load();
  }

  async function toggleMakerChecker() {
    const next = !makerChecker;
    const { data, error } = await fetchApi<{ maker_checker_for_overrides: boolean }>('/admin/settings', {
      method: 'PUT', body: JSON.stringify({ maker_checker_for_overrides: next }),
    });
    if (error) return setError(error);
    setMakerChecker(data!.maker_checker_for_overrides);
  }

  return (
    <PageShell
      title="Approvals"
      subtitle={me?.role === 'admin'
        ? 'Rule and timeline changes apply only after a second administrator approves them.'
        : 'Case reverts and assurance overrides waiting for a bureau officer to approve.'}
    >
      {me?.role === 'admin' && makerChecker !== null && (
        <div className={`${card} mb-6 flex flex-wrap items-center justify-between gap-4`}>
          <div>
            <p className="text-sm font-semibold text-stone-900">Second approval for reverts and assurance overrides</p>
            <p className="text-xs text-stone-600">When on, a bureau officer must approve each case revert and each override of an assurance flag.</p>
          </div>
          <button className={makerChecker ? btnDanger : btnPrimary} onClick={toggleMakerChecker}>
            {makerChecker ? 'Turn off' : 'Turn on'}
          </button>
        </div>
      )}
      <div className="mb-4 flex gap-2" role="tablist" aria-label="Filter by status">
        {['pending', 'approved', 'rejected', ''].map((s) => (
          <button key={s || 'all'} role="tab" aria-selected={filter === s} onClick={() => setFilter(s)}
            className={`rounded-full px-3 py-1 text-sm ${filter === s ? 'bg-stone-900 text-white' : 'bg-white text-stone-700 border border-[#E8E2D8]'}`}>
            {s ? s[0].toUpperCase() + s.slice(1) : 'All'}
          </button>
        ))}
      </div>
      {error && <div className="mb-4"><Notice kind="error">{error}</Notice></div>}
      {message && <div className="mb-4"><Notice kind="success">{message}</Notice></div>}
      {rows.length === 0 ? <p className="text-sm text-stone-500">No requests.</p> : (
        <ul className="space-y-4">
          {rows.map((r) => (
            <li key={r.id} className={card}>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Badge tone="blue">{KIND_LABEL[r.kind]}</Badge>
                <Badge tone={r.status === 'pending' ? 'amber' : r.status === 'approved' ? 'green' : 'red'}>{r.status}</Badge>
                <span className="text-xs text-stone-500">Requested by {r.requested_by_name || 'unknown'} · {formatDateTime(r.created_at)}</span>
              </div>
              <Summary r={r} />
              {r.status !== 'pending' && (
                <p className="mt-2 text-xs text-stone-500">{r.status === 'approved' ? 'Approved' : 'Rejected'} by {r.approved_by_name || '—'} · {formatDateTime(r.decided_at)}{r.reason ? ` · ${r.reason}` : ''}</p>
              )}
              {r.status === 'pending' && (r.can_decide ? (
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <input className={`${input} max-w-sm`} placeholder="Reason (required to reject)" aria-label="Reason"
                    value={reasons[r.id] || ''} onChange={(e) => setReasons({ ...reasons, [r.id]: e.target.value })} />
                  <button className={btnPrimary} onClick={() => decide(r, 'approve')}>Approve and apply</button>
                  <button className={btnDanger} onClick={() => decide(r, 'reject')} disabled={!(reasons[r.id] || '').trim()}>Reject</button>
                </div>
              ) : (
                <p className="mt-3 text-xs text-stone-500">You made this request, so someone else has to approve it.</p>
              ))}
            </li>
          ))}
        </ul>
      )}
    </PageShell>
  );
}
