import React from 'react';
import { Download } from 'lucide-react';
import { Card, PageHeader, Button, Pill, Skeleton, useToast } from '../../components/ui';
import { useCandidate } from '../../lib/candidate';
import { api, fmtDate, STAGE_LABELS } from '../../lib/api';

export default function Privacy() {
  const { data, reload } = useCandidate();
  const toast = useToast();
  if (!data) return <Skeleton className="h-96" />;
  const toggle = async (purpose: string, granted: boolean) => {
    try { await api.post('/api/me/consents', { purpose, granted }); toast(granted ? 'Consent granted' : 'Consent withdrawn'); reload(); } catch (e: any) { toast(e.message, 'risk'); }
  };
  return (
    <div>
      <PageHeader title="Privacy & consent" description="See and control what SecureHire collects about you." actions={<a href={`/api/reports/${data.profile.id}.pdf`}><Button variant="secondary" icon={<Download className="h-4 w-4" />}>Download my verification report</Button></a>} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Consents" description="Withdrawing consent stops future collection for that purpose. Declining optional checks never lowers your score.">
          <div className="divide-y divide-divider">
            {data.consents.map((c: any) => (
              <div key={c.purpose} className="flex items-center justify-between gap-4 py-3">
                <div><p className="text-sm font-medium capitalize text-ink">{c.purpose.replace('_', ' & ')}</p><p className="text-xs text-muted">{c.description}</p></div>
                <button onClick={() => toggle(c.purpose, !c.granted)} className={`relative h-6 w-11 shrink-0 rounded-full transition ${c.granted ? 'bg-primary' : 'bg-line'}`} aria-label={`${c.granted ? 'Withdraw' : 'Grant'} ${c.purpose}`}>
                  <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${c.granted ? 'left-[22px]' : 'left-0.5'}`} />
                </button>
              </div>
            ))}
          </div>
        </Card>
        <div className="space-y-6">
          <Card title="What we store">
            <ul className="space-y-2 text-sm text-body">
              <li>• Aadhaar: {data.identity ? <span className="tnum">{data.identity.aadhaar_masked}</span> : 'not provided'} — kept only as a keyed hash plus the last four digits.</li>
              <li>• Face: {data.anchor ? `an encrypted 128-number embedding (no images), kept until ${fmtDate(data.anchor.retention_until, false)}` : 'nothing yet'}.</li>
              <li>• Monitoring events: tab/focus/paste attempts during your assessment — never clipboard contents.</li>
              <li>• Network: masked IP addresses and approximate city at checkpoints.</li>
            </ul>
          </Card>
          <Card title="Network observations" pad={false}>
            <table className="w-full"><thead className="border-y border-divider"><tr><th className="th">Stage</th><th className="th">IP</th><th className="th">Approx. location</th><th className="th">When</th></tr></thead>
              <tbody>{data.ipObservations.length ? data.ipObservations.map((o: any, i: number) => <tr key={i} className="border-b border-divider last:border-0"><td className="td">{STAGE_LABELS[o.stage]}</td><td className="td tnum">{o.ip_masked}{o.changed ? <Pill tone="info" className="ml-2">changed</Pill> : null}</td><td className="td text-xs">{[o.city, o.region].filter(Boolean).join(', ') || o.geo_source}</td><td className="td text-xs text-muted">{fmtDate(o.created_at)}</td></tr>)
                : <tr><td className="td text-muted" colSpan={4}>None yet.</td></tr>}</tbody>
            </table>
          </Card>
          <Card title="Your responses & requests">
            {data.appeals.length === 0 ? <p className="text-sm text-muted">You haven't sent any responses.</p> : data.appeals.map((a: any) => (
              <div key={a.id} className="border-b border-divider py-3 last:border-0"><div className="flex items-center justify-between"><Pill tone={a.status === 'open' ? 'warn' : a.status === 'clarification_requested' ? 'info' : 'ok'}>{a.status.replace('_', ' ')}</Pill><span className="text-xs text-muted">{fmtDate(a.created_at)}</span></div><p className="mt-2 text-sm text-ink">{a.message}</p>{a.response && <p className="mt-1 text-xs text-body">Recruiter: {a.response}</p>}</div>
            ))}
          </Card>
        </div>
      </div>
    </div>
  );
}
