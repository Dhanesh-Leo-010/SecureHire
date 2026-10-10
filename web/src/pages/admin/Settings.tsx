import React, { useEffect, useState } from 'react';
import { Save, Trash2, Cpu } from 'lucide-react';
import { Card, PageHeader, Button, Input, Pill, Skeleton, useToast, useAsync, MockTag, Callout } from '../../components/ui';
import { api, STAGES, STAGE_LABELS } from '../../lib/api';

export default function Settings() {
  const { data, reload } = useAsync(() => api.get('/api/admin/settings'), []);
  const sys = useAsync(() => api.get('/api/admin/system'), []);
  const [s, setS] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [ret, setRet] = useState<any>(null);
  const toast = useToast();
  useEffect(() => { if (data) setS(JSON.parse(JSON.stringify(data))); }, [data]);
  if (!s) return <Skeleton className="h-96" />;
  const save = async () => {
    setBusy(true);
    try { await api.put('/api/admin/settings', { weights: s.weights.map((w: any) => ({ signal_name: w.signal_name, delta: Number(w.delta) })), stageWeights: s.stageWeights, retention: s.retention, allowlist: s.allowlist, monitoring: s.monitoring }); toast('Settings saved'); reload(); }
    catch (e: any) { toast(e.message, 'risk'); } finally { setBusy(false); }
  };
  const totalW = STAGES.reduce((a, k) => a + Number(s.stageWeights[k] || 0), 0);
  return (
    <div>
      <PageHeader title="Scoring & policies" description="Transparent, configurable rules. Changes apply to future score calculations and are audit-logged." actions={<Button onClick={save} loading={busy} icon={<Save className="h-4 w-4" />}>Save changes</Button>} />
      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <Card title="Signal weights" description="Positive signals apply when verified. Risk weights apply only after a reviewer confirms. Context signals never change the score." pad={false}>
          <div className="max-h-[640px] overflow-y-auto">
            <table className="w-full"><thead className="sticky top-0 border-y border-divider bg-white"><tr><th className="th">Stage</th><th className="th">Signal</th><th className="th">Kind</th><th className="th w-24 text-right">Points</th></tr></thead>
              <tbody>{s.weights.map((w: any, i: number) => (
                <tr key={w.signal_name} className="border-b border-divider last:border-0">
                  <td className="td text-xs text-muted">{STAGE_LABELS[w.stage]}</td>
                  <td className="td"><p className="text-sm text-ink">{w.label}</p><p className="text-xs text-muted"><code>{w.signal_name}</code></p></td>
                  <td className="td"><Pill tone={w.kind === 'positive' ? 'ok' : w.kind === 'risk' ? 'review' : 'info'}>{w.kind}</Pill></td>
                  <td className="td text-right"><Input type="number" disabled={w.kind === 'context'} className="h-8 w-20 text-right tnum" value={w.delta} onChange={(e) => { const c = [...s.weights]; c[i] = { ...w, delta: e.target.value }; setS({ ...s, weights: c }); }} /></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </Card>
        <div className="space-y-6">
          <Card title="Stage weights" description={`Overall = weighted average of completed stages (total ${totalW}).`}>
            <div className="grid grid-cols-2 gap-3">{STAGES.map((k) => <label key={k} className="flex items-center justify-between gap-2 text-sm"><span className="text-body">{STAGE_LABELS[k]}</span><Input type="number" className="h-8 w-20 text-right tnum" value={s.stageWeights[k]} onChange={(e) => setS({ ...s, stageWeights: { ...s.stageWeights, [k]: Number(e.target.value) } })} /></label>)}</div>
          </Card>
          <Card title="Data retention (days)">
            <div className="grid grid-cols-2 gap-3">{Object.entries(s.retention).map(([k, v]: any) => <label key={k} className="flex items-center justify-between gap-2 text-sm"><span className="capitalize text-body">{k.replace(/([A-Z])/g, ' $1')}</span><Input type="number" className="h-8 w-20 text-right tnum" value={v} onChange={(e) => setS({ ...s, retention: { ...s.retention, [k]: Number(e.target.value) } })} /></label>)}</div>
            <div className="mt-4 flex items-center gap-3"><Button variant="secondary" size="sm" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={async () => setRet(await api.post('/api/admin/retention/run'))}>Run retention now</Button>{ret && <span className="text-xs text-muted">Deleted {Object.values(ret.deleted).reduce((a: any, b: any) => a + b, 0) as any} record(s)</span>}</div>
          </Card>
          <Card title="Assessment allowlist" description="Origins where the SecureHire extension monitors sessions.">
            <textarea className="h-24 w-full rounded-lg border border-line p-3 font-mono text-xs" value={s.allowlist.join('\n')} onChange={(e) => setS({ ...s, allowlist: e.target.value.split('\n').map((x) => x.trim()).filter(Boolean) })} />
          </Card>
          <Card title="Monitoring policy">
            <div className="space-y-2.5 text-sm">
              <label className="flex items-center justify-between"><span className="text-body">Face check interval (s)</span><Input type="number" className="h-8 w-20 text-right" value={s.monitoring.faceCheckSeconds} onChange={(e) => setS({ ...s, monitoring: { ...s.monitoring, faceCheckSeconds: Number(e.target.value) } })} /></label>
              <label className="flex items-center justify-between"><span className="text-body">Focus events before review</span><Input type="number" className="h-8 w-20 text-right" value={s.monitoring.focusEventsForReview} onChange={(e) => setS({ ...s, monitoring: { ...s.monitoring, focusEventsForReview: Number(e.target.value) } })} /></label>
              <label className="flex items-center justify-between"><span className="text-body">Require extension</span><input type="checkbox" checked={!!s.monitoring.requireExtension} onChange={(e) => setS({ ...s, monitoring: { ...s.monitoring, requireExtension: e.target.checked } })} /></label>
            </div>
          </Card>
          <Card title={<span className="flex items-center gap-2"><Cpu className="h-4 w-4 text-primary" />Integrations &amp; models</span>}>
            <div className="space-y-2 text-sm">
              {['aadhaar', 'digilocker', 'apaar', 'employment'].map((k) => <div key={k} className="flex justify-between"><span className="capitalize text-body">{k}</span><MockTag /></div>)}
              <div className="flex justify-between"><span className="text-body">Semantic model</span><Pill tone={s.integrations.semanticModel.loaded ? 'ok' : 'warn'}>{s.integrations.semanticModel.loaded ? 'loaded' : 'fallback'}</Pill></div>
              <p className="text-xs text-muted">{s.integrations.semanticModel.model}</p>
            </div>
            {sys.data && <div className="mt-4 grid grid-cols-2 gap-2 border-t border-divider pt-4 text-xs">{Object.entries(sys.data.counts).map(([k, v]: any) => <div key={k} className="flex justify-between"><span className="text-muted">{k.replace('_', ' ')}</span><span className="tnum text-ink">{v}</span></div>)}</div>}
          </Card>
          <Callout tone="info">Required checks per hiring type: {Object.keys(s.requiredChecks || {}).join(', ')}.</Callout>
        </div>
      </div>
    </div>
  );
}
