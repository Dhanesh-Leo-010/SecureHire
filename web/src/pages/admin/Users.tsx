import React from 'react';
import { PageHeader, Pill, Skeleton, useAsync, useToast, Select } from '../../components/ui';
import { api, fmtDate } from '../../lib/api';
import { useAuth } from '../../lib/auth';

export default function Users() {
  const { data, reload } = useAsync(() => api.get('/api/admin/users'), []);
  const { user } = useAuth();
  const toast = useToast();
  if (!data) return <Skeleton className="h-96" />;
  const update = async (id: number, body: any) => { try { await api.patch(`/api/admin/users/${id}`, body); toast('User updated'); reload(); } catch (e: any) { toast(e.message, 'risk'); } };
  return (
    <div>
      <PageHeader title="Users & roles" description="Role-based access. Changes are audit-logged." />
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[720px]">
          <thead className="border-b border-divider"><tr><th className="th">User</th><th className="th">Role</th><th className="th">Status</th><th className="th">Email</th><th className="th">Created</th></tr></thead>
          <tbody>{data.users.map((u: any) => (
            <tr key={u.id} className="border-b border-divider last:border-0">
              <td className="td"><p className="font-medium text-ink">{u.name}{u.is_demo ? <span className="ml-2 text-[10px] text-muted">SYNTHETIC</span> : null}</p><p className="text-xs text-muted">{u.email}</p></td>
              <td className="td"><Select className="h-8 w-32 text-xs" disabled={u.id === user?.id} value={u.role} onChange={(e) => update(u.id, { role: e.target.value })}><option value="candidate">Candidate</option><option value="recruiter">Recruiter</option><option value="admin">Admin</option></Select></td>
              <td className="td"><button disabled={u.id === user?.id} onClick={() => update(u.id, { status: u.status === 'active' ? 'disabled' : 'active' })}><Pill tone={u.status === 'active' ? 'ok' : 'neutral'} dot>{u.status}</Pill></button></td>
              <td className="td">{u.email_verified ? <Pill tone="ok">verified</Pill> : <Pill>unverified</Pill>}</td>
              <td className="td text-xs text-muted">{fmtDate(u.created_at, false)}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}
