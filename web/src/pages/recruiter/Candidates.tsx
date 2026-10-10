import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { PageHeader, Pill, Skeleton, useAsync, Input, cx, Empty } from '../../components/ui';
import { api, STAGE_LABELS, timeAgo, bandTone } from '../../lib/api';
import { useRealtime } from '../../lib/realtime';

const FILTERS = [{ k: 'all', l: 'All' }, { k: 'review', l: 'Needs review' }, { k: 'high', l: 'High trust' }, { k: 'hired', l: 'Hired' }];

export default function Candidates() {
  const { data, reload } = useAsync(() => api.get('/api/recruiter/candidates'), []);
  const [q, setQ] = useState('');
  const [f, setF] = useState('all');
  const nav = useNavigate();
  useRealtime((m) => { if (m.type === 'trust') reload(); }, []);
  const rows = useMemo(() => (data?.candidates || []).filter((c: any) =>
    (!q || `${c.name} ${c.email}`.toLowerCase().includes(q.toLowerCase())) &&
    (f === 'all' || (f === 'review' && c.pendingReview > 0) || (f === 'high' && c.band.key === 'high' && !c.pendingReview) || (f === 'hired' && c.stage === 'hired'))), [data, q, f]);
  return (
    <div>
      <PageHeader title="Candidates" description="Every candidate's trust indicator, stage and open review items." />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs"><Search className="absolute left-3 top-3 h-4 w-4 text-muted" /><Input className="pl-9" placeholder="Search by name or email" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <div className="flex gap-1.5">{FILTERS.map((x) => <button key={x.k} onClick={() => setF(x.k)} className={cx('h-8 rounded-full px-3 text-xs font-medium transition', f === x.k ? 'bg-primary-soft text-primary' : 'text-body hover:bg-subtle')}>{x.l}</button>)}</div>
      </div>
      <div className="card overflow-x-auto">
        {!data ? <div className="space-y-2 p-6">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}</div> : rows.length === 0 ? <Empty title="No candidates match" /> : (
          <table className="w-full min-w-[760px]">
            <thead className="border-b border-divider"><tr><th className="th">Candidate</th><th className="th">Role</th><th className="th">Stage</th><th className="th">Trust</th><th className="th">Open items</th><th className="th">Last activity</th></tr></thead>
            <tbody>
              {rows.map((c: any) => (
                <tr key={c.id} onClick={() => nav(`/recruiter/candidates/${c.id}`)} className="h-14 cursor-pointer border-b border-divider last:border-0 hover:bg-page">
                  <td className="td"><div className="flex items-center gap-3"><div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary">{c.name.split(' ').map((x: string) => x[0]).slice(0, 2).join('')}</div><div><p className="font-medium text-ink">{c.name}</p><p className="text-xs text-muted">{c.email}</p></div></div></td>
                  <td className="td text-body">{c.jobTitle || '—'}</td>
                  <td className="td"><Pill tone={c.stage === 'hired' ? 'ok' : 'primary'}>{STAGE_LABELS[c.stage]}</Pill></td>
                  <td className="td"><div className="flex items-center gap-2"><span className="w-7 font-semibold text-ink tnum">{c.overall}</span><Pill tone={bandTone(c.band.key)}>{c.band.label.split(' —')[0]}</Pill></div></td>
                  <td className="td">{c.pendingReview ? <Pill tone="review" dot>{c.pendingReview} to review</Pill> : <span className="text-xs text-muted">None</span>}</td>
                  <td className="td text-xs text-muted">{timeAgo(c.lastActivity)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
