import React, { useState } from 'react';
import { PageHeader, Skeleton, useAsync, Input } from '../../components/ui';
import { api, fmtDate } from '../../lib/api';

export default function Audit() {
  const { data } = useAsync(() => api.get('/api/admin/audit'), []);
  const [q, setQ] = useState('');
  if (!data) return <Skeleton className="h-96" />;
  const rows = data.logs.filter((l: any) => !q || JSON.stringify(l).toLowerCase().includes(q.toLowerCase()));
  return (
    <div>
      <PageHeader title="Audit log" description="Every login, review decision, override, data access and deletion." />
      <Input className="mb-4 max-w-xs" placeholder="Filter (e.g. signal.confirm)" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[760px]">
          <thead className="border-b border-divider"><tr><th className="th">When</th><th className="th">Actor</th><th className="th">Action</th><th className="th">Target</th><th className="th">Details</th><th className="th">IP</th></tr></thead>
          <tbody>{rows.map((l: any) => (
            <tr key={l.id} className="border-b border-divider last:border-0">
              <td className="td whitespace-nowrap text-xs text-muted">{fmtDate(l.created_at)}</td>
              <td className="td text-sm">{l.actor_name || l.actor_role}</td>
              <td className="td"><code className="rounded bg-subtle px-1.5 py-0.5 text-xs">{l.action}</code></td>
              <td className="td text-xs">{l.target}</td>
              <td className="td max-w-sm truncate text-xs text-muted" title={l.details ? JSON.stringify(l.details) : ''}>{l.details ? JSON.stringify(l.details) : ''}</td>
              <td className="td text-xs text-muted tnum">{l.ip_masked}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}
