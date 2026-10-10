import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, MessageSquare, PartyPopper, Download, Clock } from 'lucide-react';
import { Card, PageHeader, Pill, Button, Skeleton, Modal, Textarea, Callout, useToast, StatusPill } from '../../components/ui';
import { StageStepper, Gauge, ScoreDisclaimer } from '../../components/trust';
import { useCandidate } from '../../lib/candidate';
import { api, STAGES, STAGE_LABELS, timeAgo } from '../../lib/api';

const NEXT: Record<number, { to: string; title: string; text: string }> = {
  0: { to: '/candidate/apply', title: 'Verify your email and identity', text: 'Confirm your email and complete the Aadhaar OTP check (simulated in this demo).' },
  1: { to: '/candidate/identity', title: 'Set up your identity check', text: 'A quick liveness check creates the face reference used at later stages.' },
  2: { to: '/candidate/resume', title: 'Upload your resume', text: 'We compare your claims with verified records and show you exactly what we found.' },
  3: { to: '/candidate/assessment', title: 'Take your assessment', text: 'Install the SecureHire extension, then complete a 15-minute screening test.' },
  4: { to: '/candidate/interview', title: 'Join your interview', text: 'Your recruiter will meet you in a live video room with screen sharing.' },
  5: { to: '/candidate/offer', title: 'Review your offer', text: 'Confirm it is you with a fresh identity check, then accept.' },
  6: { to: '/candidate/onboarding', title: 'Complete onboarding', text: 'Upload joining documents and do a day-one identity check.' },
};

export default function Dashboard() {
  const { data, reload } = useCandidate();
  const [respond, setRespond] = useState<any>(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const nav = useNavigate();
  if (!data) return <div className="space-y-4"><Skeleton className="h-10 w-72" /><Skeleton className="h-28" /><Skeleton className="h-64" /></div>;
  const p = data.profile, s = data.scores;
  const next = NEXT[p.stageIndex];
  const flagged: Record<string, number> = {};
  data.signals.filter((x: any) => x.status === 'pending_review').forEach((x: any) => { flagged[x.stage] = (flagged[x.stage] || 0) + 1; });
  const needsAttention = data.signals.filter((x: any) => x.status === 'pending_review' || x.status === 'confirmed');
  const requests = data.appeals.filter((a: any) => a.status === 'clarification_requested');

  const sendAppeal = async () => {
    setBusy(true);
    try { await api.post('/api/me/appeals', { signalId: respond?.id, message: msg }); toast('Your response was sent to the recruiter.'); setRespond(null); setMsg(''); reload(); }
    catch (e: any) { toast(e.message, 'risk'); } finally { setBusy(false); }
  };

  return (
    <div>
      <PageHeader title={`Welcome, ${p.name.split(' ')[0]}`} description={`${data.job?.title || 'Application'} · ${data.job?.location || ''}`}
        actions={p.stageIndex >= 7 && <a href={`/api/reports/${p.id}.pdf`}><Button variant="secondary" icon={<Download className="h-4 w-4" />}>Verification report</Button></a>} />
      {p.holdReason && <div className="mb-6"><Callout tone="review" title="Action needed">{p.holdReason} Contact the recruiter or use account recovery — nothing has been rejected.</Callout></div>}
      {requests.map((r: any) => <div key={r.id} className="mb-4"><Callout tone="info" title="The recruiter asked for clarification">{r.message.replace('[Recruiter request] ', '')}</Callout></div>)}

      <Card className="mb-6"><StageStepper stageIndex={p.stageIndex} flagged={flagged} onSelect={(st) => nav(`/candidate/${st}`)} /></Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {next ? (
            <div className="card flex flex-wrap items-center justify-between gap-4 p-6">
              <div><Pill tone="primary">Your next step</Pill><h2 className="mt-3 text-lg font-semibold text-ink">{next.title}</h2><p className="mt-1 text-sm text-body">{next.text}</p></div>
              <Link to={next.to}><Button icon={<ArrowRight className="h-4 w-4" />}>Continue</Button></Link>
            </div>
          ) : (
            <div className="card flex items-center gap-4 p-6"><PartyPopper className="h-8 w-8 text-primary" /><div><h2 className="text-lg font-semibold text-ink">You're all set</h2><p className="text-sm text-body">Onboarding is complete. Welcome aboard!</p></div></div>
          )}

          {needsAttention.length > 0 && (
            <Card title="Items under review" description="A recruiter reviews each item. You can explain or correct anything below.">
              <div className="divide-y divide-divider">
                {needsAttention.map((x: any) => (
                  <div key={x.id} className="flex flex-wrap items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
                    <div className="min-w-0"><p className="text-sm font-medium text-ink">{x.label}</p><p className="mt-0.5 text-xs text-muted">{STAGE_LABELS[x.stage]} · {timeAgo(x.createdAt)}{x.evidence?.note ? ` · ${x.evidence.note}` : ''}</p></div>
                    <div className="flex items-center gap-2"><StatusPill status={x.status} /><Button size="sm" variant="secondary" icon={<MessageSquare className="h-3.5 w-3.5" />} onClick={() => setRespond(x)}>Respond</Button></div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <Card title="Recent verification activity">
            {data.signals.length === 0 ? <p className="text-sm text-muted">Nothing yet — start with your first step.</p> : (
              <ul className="space-y-3">
                {data.signals.slice(0, 8).map((x: any) => (
                  <li key={x.id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="flex min-w-0 items-center gap-2.5"><span className={`h-2 w-2 shrink-0 rounded-full ${x.status === 'verified' ? 'bg-ok' : x.status === 'contextual' ? 'bg-info' : x.status === 'dismissed' ? 'bg-neutral' : 'bg-review'}`} /><span className="truncate text-body">{x.label}</span></span>
                    <span className="shrink-0 text-xs text-muted">{timeAgo(x.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <div className="card p-6 text-center">
            <p className="label">Verification progress</p>
            <div className="mt-3 flex justify-center"><Gauge score={s.overall} size={150} /></div>
            <p className="mt-1 text-xs text-muted">{s.evidenceCompleteness}% of stages have verified evidence</p>
            <div className="mt-4 grid grid-cols-2 gap-2 text-left text-xs">
              {STAGES.map((st) => <div key={st} className="flex justify-between rounded-md bg-page px-2.5 py-1.5"><span className="text-body">{STAGE_LABELS[st]}</span><span className="font-medium text-ink tnum">{s.stages[st].score ?? '—'}</span></div>)}
            </div>
            <div className="mt-4 text-left"><ScoreDisclaimer /></div>
          </div>
          <Card title="Your interview" description={data.interview ? undefined : 'Scheduled after your assessment.'}>
            {data.interview ? <div className="flex items-center gap-3 text-sm"><Clock className="h-4 w-4 text-muted" /><span className="text-ink">{new Date(data.interview.scheduled_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</span><Pill tone={data.interview.status === 'completed' ? 'ok' : 'primary'}>{data.interview.status}</Pill></div> : <p className="text-sm text-muted">No interview yet.</p>}
          </Card>
        </div>
      </div>

      <Modal open={!!respond} onClose={() => setRespond(null)} title="Respond to a review item" footer={<><Button variant="ghost" onClick={() => setRespond(null)}>Cancel</Button><Button onClick={sendAppeal} loading={busy} disabled={msg.trim().length < 5}>Send to recruiter</Button></>}>
        <p className="text-sm text-ink">{respond?.label}</p>
        <p className="mt-1 text-xs text-muted">Explain the context or tell us what should be corrected. A person will read this before any decision.</p>
        <Textarea className="mt-4" rows={4} value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="e.g. I switched from Wi-Fi to mobile data during the test." />
      </Modal>
    </div>
  );
}
