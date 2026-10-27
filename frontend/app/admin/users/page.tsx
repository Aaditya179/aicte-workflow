'use client';

import React, { useEffect, useState } from 'react';
import { fetchApi } from '@/lib/api';
import { PageShell, card, btnSecondary, Notice } from '@/components/ui';

interface UserRow {
  user_id: string;
  full_name: string;
  role: string;
  region: string | null;
  institution: string | null;
  email: string | null;
  phone: string | null;
}

/**
 * User list for administrators. Contact details are masked in the list (§15.8); revealing them
 * opens the detail record, which is audited.
 */
export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [revealed, setRevealed] = useState<Record<string, { email: string; phone: string | null }>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchApi<UserRow[]>('/admin/users').then(({ data, error }) => (data ? setUsers(data) : setError(error)));
  }, []);

  async function reveal(id: string) {
    const { data, error } = await fetchApi<{ email: string; phone: string | null }>(`/admin/users/${id}`);
    if (!data) return setError(error);
    setRevealed({ ...revealed, [id]: { email: data.email, phone: data.phone } });
  }

  return (
    <PageShell title="Users" subtitle="Emails and phone numbers are masked. Revealing them is recorded in the audit trail.">
      {error && <div className="mb-4"><Notice kind="error">{error}</Notice></div>}
      <div className={`${card} overflow-x-auto p-0`}>
        <table className="min-w-full text-sm">
          <thead className="border-b border-[#E8E2D8] bg-stone-50 text-left text-xs text-stone-600">
            <tr>
              <th scope="col" className="px-4 py-3 font-semibold">Name</th>
              <th scope="col" className="px-4 py-3 font-semibold">Role</th>
              <th scope="col" className="px-4 py-3 font-semibold">Region or institution</th>
              <th scope="col" className="px-4 py-3 font-semibold">Email</th>
              <th scope="col" className="px-4 py-3 font-semibold">Phone</th>
              <th scope="col" className="px-4 py-3"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const r = revealed[u.user_id];
              return (
                <tr key={u.user_id} className="border-b border-[#E8E2D8] last:border-0">
                  <td className="px-4 py-3 font-medium text-stone-900">{u.full_name}</td>
                  <td className="px-4 py-3 text-stone-700">{u.role.replace(/_/g, ' ')}</td>
                  <td className="px-4 py-3 text-stone-700">{u.institution || u.region || 'National'}</td>
                  <td className="px-4 py-3 font-mono text-xs text-stone-800">{r ? r.email : u.email || '—'}</td>
                  <td className="px-4 py-3 font-mono text-xs text-stone-800">{r ? r.phone || '—' : u.phone || '—'}</td>
                  <td className="px-4 py-3 text-right">
                    {!r && <button className={btnSecondary} onClick={() => reveal(u.user_id)}>Show contact</button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </PageShell>
  );
}
