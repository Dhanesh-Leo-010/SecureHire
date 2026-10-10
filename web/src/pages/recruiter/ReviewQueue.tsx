import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldAlert, ArrowRight } from 'lucide-react';
import { Card, PageHeader, Pill, Button, Skeleton, useAsync, Empty, StatusPill } from '../../components/ui';
import { Evidence } from '../../components/trust';
import { ReviewModal } from './shared';
import { api, STAGE_LABELS, timeAgo } from '../../lib/api';
import { useRealtime } from '../../lib/realtime';

export default function ReviewQueue() {
  const { data, reload } = useAsync(() => api.get('/api/recruiter/review-queue'), []);
  const [sel, setSel] = useState<any>(null);
  useRealtime((m) => { if (m.type === 'trust') reload(); }, []);
  if (!data) return <Skeleton className="h-96" />;
  return (
    <div>
      <PageHeader title="Review queue" description="Automated checks raise items here at zero points. A person confirms or dismisses each one with a reason." />
      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <div className="space-y-3">
          {data.items.length === 0 ? <Card><Empty icon={<ShieldAlert className="h-5 w-5" />} title="Nothing to review" text="New items appear here in real time." /></Card> : data.items.map((s: any) => (
            <div key={s.id} className="card flex gap-4 p-5">
              <span className={`w-1 shrink-0 rounded-full ${s.weight <= -25 ? 'bg-risk' : s.weight <= -15 ? 'bg-review' : 'bg-warn'}`} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2"><Pill>{STAGE_LABELS[s.stage]}</Pill><Link to={`/recruiter/candidates/${s.candidateId}`} className="text-sm font-medium text-ink hover:text-primary">{s.candidateName}</Link><span className="text-xs text-muted">{timeAgo(s.createdAt)}</span></div>
                <p className="mt-2 font-medium text-ink">{s.label}</p>
                <Evidence evidence={s.evidence} />
              </div>
              <div className="flex shrink-0 flex-col items-end justify-between gap-2"><span className="text-xs text-muted tnum">{s.weight} if confirmed</span><Button size="sm" onClick={() => setSel(s)}>Review</Button></div>
            </div>
          ))}
        </div>
        <div className="space-y-6">
          {data.heldOffers.length > 0 && (
            <Card title="Offers held for review">
              {data.heldOffers.map((o: any) => <Link key={o.id} to={`/recruiter/candidates/${o.candidate_id}`} className="flex items-center justify-between py-2 text-sm hover:text-primary"><span>{o.candidate_name} · {o.title}</span><ArrowRight className="h-4 w-4" /></Link>)}
            </Card>
          )}
          <Card title="Candidate responses">
            {data.appeals.filter((a: any) => a.status === 'open').length === 0 ? <p className="text-sm text-muted">No open responses.</p> : data.appeals.filter((a: any) => a.status === 'open').map((a: any) => (
              <Link key={a.id} to={`/recruiter/candidates/${a.candidate_id}`} className="block border-b border-divider py-3 last:border-0 hover:bg-page">
                <p className="text-sm font-medium text-ink">{a.candidate_name}</p>{a.signal_label && <p className="text-xs text-muted">Re: {a.signal_label}</p>}<p className="mt-1 line-clamp-2 text-sm text-body">{a.message}</p>
              </Link>
            ))}
          </Card>
          <Card title="Recently decided">
            {data.recent.length === 0 ? <p className="text-sm text-muted">No decisions yet.</p> : data.recent.map((r: any) => (
              <div key={r.id} className="border-b border-divider py-2.5 last:border-0"><div className="flex items-center justify-between gap-2"><span className="truncate text-sm text-ink">{r.label}</span><StatusPill status={r.status} /></div><p className="text-xs text-muted">{r.candidate_name} · {r.reviewer_name} · “{r.review_comment}”</p></div>
            ))}
          </Card>
        </div>
      </div>
      <ReviewModal signal={sel} onClose={() => setSel(null)} onDone={reload} />
    </div>
  );
}
