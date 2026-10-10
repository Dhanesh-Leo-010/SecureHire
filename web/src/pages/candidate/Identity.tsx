import React, { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, Upload, ScanFace, CheckCircle2, FileCheck2, ArrowRight, ImageIcon } from 'lucide-react';
import { Card, PageHeader, Button, Callout, MockTag, Pill, useToast, Skeleton, ExpTag } from '../../components/ui';
import { CameraView, EnvChecklist, useLiveness, LivenessPrompt, type LiveState } from '../../components/camera';
import { ConsentModal } from '../../components/consent';
import { useCandidate } from '../../lib/candidate';
import { api } from '../../lib/api';
import { openCamera, stopStream, describe, fileToImage, loadFaceApi } from '../../lib/ai/face';

export default function Identity() {
  const { data, reload } = useCandidate();
  const toast = useToast();
  const nav = useNavigate();
  const [consent, setConsent] = useState(false);
  const [docConsent, setDocConsent] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [live, setLive] = useState<LiveState | null>(null);
  const [idPhoto, setIdPhoto] = useState<{ url: string; descriptor: number[] | null; faces: number } | null>(null);
  const [phase, setPhase] = useState<'idle' | 'camera' | 'liveness' | 'saving' | 'done'>('idle');
  const [result, setResult] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [dl, setDl] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const liveness = useLiveness(async (r) => {
    if (!r.passed) { setErr('Liveness challenge timed out. Make sure your face is well lit and try again.'); setPhase('camera'); api.post('/api/me/identity/liveness-failed', { evidence: { challenges: r.challenges } }).catch(() => {}); return; }
    setPhase('saving');
    try {
      const d = await describe(videoRef.current!);
      if (d.faces !== 1 || !d.descriptor) throw new Error('Please keep exactly one face in view and try again.');
      const out = await api.post('/api/me/identity/enroll', { descriptor: d.descriptor, faces: d.faces, liveness: r, idPhotoDescriptor: idPhoto?.descriptor || undefined, consent: true });
      setResult(out); setPhase('done'); stopStream(stream); setStream(null);
      toast('Identity anchor created'); reload();
    } catch (e: any) { setErr(e.message); setPhase('camera'); }
  });

  if (!data) return <Skeleton className="h-96" />;
  if (data.profile.stageIndex < 1) return <div className="max-w-3xl"><PageHeader title="Identity" /><Callout tone="info">Complete the Apply step first.</Callout></div>;

  const startCamera = async () => {
    setConsent(false); setErr(null);
    try { const s = await openCamera(); setStream(s); setPhase('camera'); loadFaceApi(); }
    catch { setErr('Camera access was blocked. Allow camera access for this site in your browser settings.'); }
  };
  const onIdPhoto = async (f?: File) => {
    if (!f) return;
    const img = await fileToImage(f);
    const d = await describe(img);
    setIdPhoto({ url: img.src, descriptor: d.descriptor, faces: d.faces });
    if (!d.descriptor) toast('No face found in that photo — try a clearer image.', 'review');
  };
  const fetchDigiLocker = async () => {
    setBusy(true); setDocConsent(false);
    try { const r = await api.post('/api/me/identity/digilocker', { consent: true }); setDl(r); reload(); } catch (e: any) { toast(e.message, 'risk'); } finally { setBusy(false); }
  };

  const enrolled = !!data.anchor;
  const m = live?.m;
  return (
    <div>
      <PageHeader title="Identity" description="Stage 2 · Liveness and face reference. Your images stay on this device — only an encrypted face embedding is stored." />
      {enrolled && phase === 'idle' ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card title="Identity anchor" action={<Pill tone="ok" dot>Enrolled</Pill>}>
            <div className="flex items-start gap-3"><CheckCircle2 className="mt-0.5 h-5 w-5 text-ok" /><div className="text-sm text-body"><p>Created {new Date(data.anchor.created_at).toLocaleString('en-IN')}. Liveness: {data.anchor.liveness?.challenges?.length || 0} challenges in {Math.round((data.anchor.liveness?.durationMs || 0) / 1000)} s.</p><p className="mt-1 text-xs text-muted">Kept until {new Date(data.anchor.retention_until).toLocaleDateString('en-IN')} (retention policy). Used to confirm it's you at the assessment, interview, offer and onboarding.</p></div></div>
            {result?.idMatch && <p className="mt-4 text-sm">ID photo similarity: <span className="font-semibold text-ink tnum">{result.idMatch.similarity}%</span> <Pill tone={result.idMatch.result === 'match' ? 'ok' : 'review'}>{result.idMatch.result}</Pill></p>}
            <div className="mt-5 flex gap-2"><Button onClick={() => nav('/candidate/resume')} icon={<ArrowRight className="h-4 w-4" />}>Continue to resume</Button><Button variant="ghost" onClick={() => setConsent(true)}>Redo capture</Button></div>
          </Card>
          <Card title={<span className="flex items-center gap-2"><FileCheck2 className="h-4 w-4 text-primary" />DigiLocker documents <MockTag /></span>} description="Optional. Fetch issued documents to confirm your name and date of birth.">
            {dl ? (
              <div className="space-y-3">
                <Callout tone={dl.outcome === 'success' ? 'ok' : 'review'}>{dl.message}</Callout>
                {dl.data?.documents?.map((d: any) => <div key={d.type} className="flex justify-between rounded-lg border border-line px-3 py-2 text-sm"><span className="text-ink">{d.type}</span><span className="text-xs text-muted">{d.issuer} · {d.docNo}</span></div>)}
              </div>
            ) : <Button variant="secondary" onClick={() => setDocConsent(true)} loading={busy}>Fetch from DigiLocker</Button>}
          </Card>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
          <div className="space-y-4">
            <CameraView stream={stream} videoRef={videoRef} className="aspect-video" onFrame={(s) => { setLive(s); if (phase === 'liveness') liveness.feed(s); }}>
              <LivenessPrompt step={liveness.step} order={liveness.order} />
              {phase === 'saving' && <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-sm text-white">Computing face embedding and checking for duplicates…</div>}
            </CameraView>
            {err && <Callout tone="review">{err}</Callout>}
            <div className="flex flex-wrap gap-2">
              {phase === 'idle' && <Button icon={<Camera className="h-4 w-4" />} onClick={() => setConsent(true)}>Start camera</Button>}
              {phase === 'camera' && <Button icon={<ScanFace className="h-4 w-4" />} disabled={live?.faces !== 1} onClick={() => { setErr(null); setPhase('liveness'); liveness.start(); }}>Start liveness check</Button>}
            </div>
          </div>
          <div className="space-y-6">
            <Card title="Environment"><EnvChecklist live={stream ? live : null} /></Card>
            <Card title="Landmark analysis" description="MediaPipe Face Landmarker (pretrained)">
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div><dt className="label">Landmarks</dt><dd className="font-medium text-ink tnum">{m?.faces ? 478 : '—'}</dd></div>
                <div><dt className="label">Faces</dt><dd className="font-medium text-ink tnum">{live?.faces ?? '—'}</dd></div>
                <div><dt className="label">Head yaw</dt><dd className="font-medium text-ink tnum">{m?.yawDeg ?? '—'}°</dd></div>
                <div><dt className="label">Head pitch</dt><dd className="font-medium text-ink tnum">{m?.pitchDeg ?? '—'}°</dd></div>
                <div><dt className="label">Eye blink</dt><dd className="font-medium text-ink tnum">{m ? m.blink.toFixed(2) : '—'}</dd></div>
                <div><dt className="label">Brightness</dt><dd className="font-medium text-ink tnum">{live?.light ?? '—'}</dd></div>
              </dl>
              <p className="mt-3 text-xs text-muted">Facial geometry is used only to follow movement — never to judge appearance.</p>
            </Card>
            <Card title={<span className="flex items-center gap-2"><ImageIcon className="h-4 w-4 text-primary" />ID photo (optional)</span>} description="Compared 1:1 with your live face, on this device.">
              {idPhoto ? (
                <div className="flex items-center gap-3"><img src={idPhoto.url} alt="ID" className="h-14 w-14 rounded-lg object-cover" /><span className="text-sm">{idPhoto.descriptor ? <Pill tone="ok">Face found</Pill> : <Pill tone="review">No face found</Pill>}</span></div>
              ) : (
                <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-line px-4 py-5 text-sm text-body hover:border-primary">
                  <Upload className="h-4 w-4" />Upload a photo ID image
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => onIdPhoto(e.target.files?.[0])} />
                </label>
              )}
            </Card>
            <p className="text-xs text-muted">Basic liveness — not certified presentation-attack detection. <ExpTag /></p>
          </div>
        </div>
      )}

      <ConsentModal open={consent} onClose={() => setConsent(false)} onAgree={startCamera} title="Consent for face verification"
        what="Live camera frames are processed on your device to find facial landmarks and compute a 128-number face embedding. Only the encrypted embedding is sent to the server — never images."
        why="To confirm the same person continues through the assessment, interview, offer and onboarding, and to detect duplicate enrolments."
        retention="The embedding is kept for 180 days or until the hiring process ends (employer policy), then deleted automatically." />
      <ConsentModal open={docConsent} onClose={() => setDocConsent(false)} onAgree={fetchDigiLocker} title="Consent to fetch documents" agreeLabel="Fetch documents"
        what="Issued documents from DigiLocker (simulated): document type, issuer, name, date of birth and masked numbers."
        why="To confirm your profile details against issued documents." retention="Document metadata is kept for the hiring process (default 365 days)." />
    </div>
  );
}
