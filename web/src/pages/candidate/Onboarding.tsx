import React, { useEffect, useState } from 'react';
import { Upload, FileCheck2, ScanFace, Download, CheckCircle2, Circle } from 'lucide-react';
import { Card, PageHeader, Button, Callout, Pill, useToast, Skeleton, MockTag, StatusPill } from '../../components/ui';
import { FreshFaceCheck } from '../../components/camera';
import { useCandidate } from '../../lib/candidate';
import { api } from '../../lib/api';

const DOCS: Record<string, string> = { joining_pan: 'PAN card', joining_degree: 'Degree certificate', joining_address: 'Address proof' };

export default function Onboarding() {
  const { data, reload } = useCandidate();
  const [ob, setOb] = useState<any>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [faceOut, setFaceOut] = useState<any>(null);
  const [dl, setDl] = useState<any>(null);
  const toast = useToast();
  const load = () => api.get('/api/me/onboarding').then(setOb);
  useEffect(() => { load(); }, []);
  if (!data || !ob) return <Skeleton className="h-96" />;
  if (!ob.onboarding) return <div className="max-w-3xl"><PageHeader title="Onboarding" description="Stage 7 · Day-one verification." /><Card><p className="text-sm text-body">Onboarding opens after you accept your offer.</p></Card></div>;

  const upload = async (kind: string, f?: File) => {
    if (!f) return; setBusy(kind);
    const form = new FormData(); form.append('file', f); form.append('kind', kind);
    try { await api.upload('/api/me/onboarding/document', form); toast(`${DOCS[kind]} uploaded`); load(); } catch (e: any) { toast(e.message, 'risk'); } finally { setBusy(null); }
  };
  const digilocker = async () => { setBusy('dl'); try { setDl(await api.post('/api/me/onboarding/digilocker')); load(); reload(); } catch (e: any) { toast(e.message, 'risk'); } finally { setBusy(null); } };
  const verifyFace = async (r: any) => {
    setBusy('face');
    try { const out = await api.post('/api/me/onboarding/verify-face', { descriptor: r.descriptor, faces: r.faces, livenessPassed: r.liveness.passed }); setFaceOut(out); load(); reload(); }
    catch (e: any) { toast(e.message, 'risk'); } finally { setBusy(null); }
  };
  const st = ob.onboarding, cl = st.checklist || {};
  const docs = Object.keys(DOCS).map((k) => ({ kind: k, doc: ob.documents.find((d: any) => d.kind === k) }));
  const done = st.status === 'completed';

  return (
    <div>
      <PageHeader title="Onboarding" description="Stage 7 · Confirm the person joining is the person who was hired."
        actions={done && <a href={`/api/reports/${data.profile.id}.pdf`}><Button icon={<Download className="h-4 w-4" />}>Download verification report</Button></a>} />
      {done ? <div className="mb-6"><Callout tone="ok" title="Onboarding complete">Welcome aboard! Your verification report is ready.</Callout></div>
        : st.status === 'paused_for_review' ? <div className="mb-6"><Callout tone="review" title="Paused for a quick review">A recruiter will review your day-one identity check. You have not been rejected.</Callout></div> : null}
      <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
        <div className="space-y-6">
          <Card title="Checklist">
            {[['Joining documents uploaded', docs.every((d) => d.doc)], ['Documents verified via DigiLocker (mock)', cl.digilocker], ['Day-one identity check', cl.identity], ['Recruiter approval', done]].map(([l, ok]: any) => (
              <div key={l} className="flex items-center gap-3 py-2 text-sm">{ok ? <CheckCircle2 className="h-4 w-4 text-ok" /> : <Circle className="h-4 w-4 text-line" />}<span className={ok ? 'text-ink' : 'text-body'}>{l}</span></div>
            ))}
          </Card>
          <Card title="Joining documents" description="PDF or image, max 5 MB. Stored encrypted.">
            <div className="space-y-2">
              {docs.map(({ kind, doc }) => (
                <div key={kind} className="flex items-center justify-between gap-3 rounded-lg border border-line px-4 py-3">
                  <div><p className="text-sm font-medium text-ink">{DOCS[kind]}</p>{doc && <p className="text-xs text-muted">{doc.filename}</p>}</div>
                  <div className="flex items-center gap-2">
                    {doc && <StatusPill status={doc.status === 'verified' ? 'verified' : doc.status === 'needs_review' ? 'pending_review' : 'contextual'} />}
                    <label className="cursor-pointer"><span className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line px-3 text-xs font-medium text-ink hover:bg-page"><Upload className="h-3.5 w-3.5" />{doc ? 'Replace' : 'Upload'}</span><input type="file" accept="application/pdf,image/*" className="hidden" onChange={(e) => upload(kind, e.target.files?.[0])} /></label>
                  </div>
                </div>
              ))}
            </div>
            <Button variant="secondary" className="mt-4" onClick={digilocker} loading={busy === 'dl'} disabled={!docs.every((d) => d.doc)} icon={<FileCheck2 className="h-4 w-4" />}>Verify with DigiLocker</Button> <MockTag />
            {dl && <div className="mt-3"><Callout tone={dl.outcome === 'success' ? 'ok' : 'review'}>{dl.message}</Callout></div>}
          </Card>
        </div>
        <Card title={<span className="flex items-center gap-2"><ScanFace className="h-4 w-4 text-primary" />Day-one identity check</span>} description="Compared with the identity anchor created at Stage 2.">
          {cl.identity ? <Callout tone="ok">Identity confirmed{faceOut?.similarity ? ` · similarity ${faceOut.similarity}%` : ''}.</Callout>
            : faceOut && faceOut.result !== 'match' ? <Callout tone="review">{faceOut.message}</Callout>
            : <FreshFaceCheck onResult={verifyFace} busy={busy === 'face'} />}
        </Card>
      </div>
    </div>
  );
}
