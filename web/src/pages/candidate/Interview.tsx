import React, { useEffect, useRef, useState } from 'react';
import { Video, MonitorUp, Mic, MapPin, PhoneOff, CheckCircle2, Clock, AudioLines, Loader2 } from 'lucide-react';
import { Card, PageHeader, Button, Callout, Pill, useToast, Skeleton, ExpTag, cx } from '../../components/ui';
import { CameraView } from '../../components/camera';
import { GpsOverlay, useStageLocation } from '../../components/location';
import { useCandidate } from '../../lib/candidate';
import { api } from '../../lib/api';
import { useRtc } from '../../lib/rtc';
import { describe, stopStream, loadFaceApi } from '../../lib/ai/face';
import { captureVoiceprint, levelMeter, pearson } from '../../lib/ai/voice';

export default function Interview() {
  const { data } = useCandidate();
  const [iv, setIv] = useState<any>(null);
  const [opts, setOpts] = useState({ location: true, voice: true });
  const [joined, setJoined] = useState<any>(null);
  const [cam, setCam] = useState<MediaStream | null>(null);
  const [screen, setScreen] = useState<MediaStream | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [face, setFace] = useState<any>(null);
  const [voice, setVoice] = useState<any>({ state: 'idle' });
  const [ended, setEnded] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const remoteRef = useRef<HTMLVideoElement | null>(null);
  const mouth = useRef<number[]>([]), audio = useRef<number[]>([]);
  const toast = useToast();

  useEffect(() => { api.get('/api/me/interview').then((r) => setIv(r.interview)).catch(() => {}); }, []);
  const location = useStageLocation({ stage: 'interview', sessionRef: joined?.roomId, enabled: !!joined, consented: opts.location });
  const rtc = useRtc({ room: joined?.roomId || null, role: 'candidate', iceServers: joined?.iceServers, localStreams: [cam, screen].filter(Boolean) as MediaStream[], enabled: !!joined && !!cam,
    onApp: (m) => { if (m.status?.event === 'INTERVIEW_COMPLETED') { setEnded(true); toast('The recruiter ended the interview. Thank you!'); } } });

  useEffect(() => { if (cam && screen) rtc.setMeta({ cameraStreamId: cam.id, screenStreamId: screen.id }); }, [cam, screen]);
  useEffect(() => { const v = remoteRef.current; if (v && rtc.remote[0]) { v.srcObject = rtc.remote[0]; v.play().catch(() => {}); } }, [rtc.remote]);
  useEffect(() => { if (!joined) return; const t = setInterval(() => setElapsed((x) => x + 1), 1000); return () => clearInterval(t); }, [joined]);
  // share location + verification badges with the recruiter
  const latest = useRef<any>({}); latest.current = { location, face, voice, screen: !!screen };
  useEffect(() => { if (joined) rtc.sendApp({ location }); }, [location, joined]);
  useEffect(() => { if (joined) rtc.sendApp({ face, voice, screen: !!screen }); }, [face, voice, screen, joined]);
  // re-broadcast state periodically so a recruiter who joins later (or after a reconnect) is up to date
  useEffect(() => { if (!joined) return; const t = setInterval(() => rtc.sendApp(latest.current), 4000); return () => clearInterval(t); }, [joined]);

  // face continuity every 10 s
  useEffect(() => {
    if (!joined || ended) return;
    let alive = true;
    const tick = async () => {
      if (!videoRef.current) return;
      try { const d = await describe(videoRef.current); const r = await api.post('/api/me/face/verify', { stage: 'interview', sessionRef: joined.roomId, faces: d.faces, descriptor: d.descriptor }); if (alive) setFace(r); } catch { /* transient */ }
    };
    const t0 = setTimeout(tick, 3000); const t = setInterval(tick, 10_000);
    return () => { alive = false; clearTimeout(t0); clearInterval(t); };
  }, [joined, ended]);

  // voice: enrol once, then verify every ~25 s (EXPERIMENTAL)
  useEffect(() => {
    if (!joined || !cam || !opts.voice || ended) return;
    let alive = true, timer: any;
    const loop = async () => {
      if (!alive) return;
      const v = await captureVoiceprint(cam, 6);
      if (!alive) return;
      if (v) { try { const r = await api.post(`/api/interviews/${joined.interviewId}/voice/verify`, { vector: v }); setVoice({ state: 'checked', ...r }); } catch { /* ignore */ } }
      timer = setTimeout(loop, 20_000);
    };
    (async () => {
      setVoice({ state: 'enrolling' });
      const v = await captureVoiceprint(cam, 7);
      if (!alive) return;
      if (!v) { setVoice({ state: 'retry' }); return; }
      try { await api.post(`/api/interviews/${joined.interviewId}/voice/enroll`, { vector: v }); setVoice({ state: 'enrolled' }); timer = setTimeout(loop, 15_000); } catch (e: any) { setVoice({ state: 'error', message: e.message }); }
    })();
    return () => { alive = false; clearTimeout(timer); };
  }, [joined, cam, opts.voice, ended]);

  // experimental lip-sync: correlate mouth opening with mic energy
  useEffect(() => {
    if (!joined || !cam) return;
    const meter = levelMeter(cam);
    const s = setInterval(() => { audio.current.push(meter.level()); if (audio.current.length > 150) audio.current.shift(); }, 200);
    const c = setInterval(() => {
      const r = pearson(mouth.current, audio.current);
      const speaking = audio.current.slice(-50).filter((x) => x > 0.02).length > 20;
      if (r != null && speaking && r < 0.05) api.post(`/api/interviews/${joined.interviewId}/event`, { type: 'LIP_SYNC_LOW', details: { correlation: +r.toFixed(2), experimental: true } }).catch(() => {});
    }, 20_000);
    return () => { clearInterval(s); clearInterval(c); meter.close(); };
  }, [joined, cam]);

  const join = async () => {
    setErr(null); setBusy(true);
    try {
      const c = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 }, audio: true });
      let sc: MediaStream;
      try { sc = await (navigator.mediaDevices as any).getDisplayMedia({ video: { displaySurface: 'monitor' }, audio: false }); }
      catch { stopStream(c); throw new Error('Screen sharing is required for this interview. Please share your entire screen to join.'); }
      sc.getVideoTracks()[0].addEventListener('ended', () => { setScreen(null); api.post(`/api/interviews/${iv.id}/event`, { type: 'SCREEN_SHARE_STOPPED' }).catch(() => {}); toast('Screen sharing stopped — please share again.', 'review'); });
      const consents = ['camera_mic', 'screen', ...(opts.location ? ['location'] : []), ...(opts.voice ? ['voice'] : [])];
      const j = await api.post(`/api/interviews/${iv.id}/join`, { consents });
      setCam(c); setScreen(sc); setJoined(j); loadFaceApi();
      api.post(`/api/interviews/${iv.id}/event`, { type: 'SCREEN_SHARE_STARTED' }).catch(() => {});
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const reshare = async () => {
    try {
      const sc = await (navigator.mediaDevices as any).getDisplayMedia({ video: true });
      sc.getVideoTracks()[0].addEventListener('ended', () => { setScreen(null); api.post(`/api/interviews/${iv.id}/event`, { type: 'SCREEN_SHARE_STOPPED' }).catch(() => {}); });
      setScreen(sc); api.post(`/api/interviews/${iv.id}/event`, { type: 'SCREEN_SHARE_STARTED' }).catch(() => {});
      rtc.setMeta({ cameraStreamId: cam!.id, screenStreamId: sc.id }); setTimeout(() => rtc.requestRenegotiate(), 300);
    } catch { /* declined */ }
  };
  const leave = () => { stopStream(cam); stopStream(screen); setCam(null); setScreen(null); setJoined(null); setEnded(true); };

  if (!data) return <Skeleton className="h-96" />;
  if (data.profile.stageIndex < 4) return <div className="max-w-3xl"><PageHeader title="Interview" /><Callout tone="info">Your interview opens after the assessment.</Callout></div>;
  if (!iv) return <div className="max-w-3xl"><PageHeader title="Interview" description="Stage 5 · Live one-on-one video interview." /><Card><p className="text-sm text-body">Your recruiter hasn't scheduled the interview yet. You'll see it here as soon as they do.</p></Card></div>;

  if (!joined) return (
    <div className="max-w-3xl">
      <PageHeader title="Interview" description="Stage 5 · Live one-on-one video interview with identity continuity checks." />
      {iv.status === 'completed' || ended ? <Callout tone="ok" title="Interview completed">Thank you! Your recruiter will be in touch about next steps.</Callout> : (
        <Card title="Before you join" description={`Scheduled ${new Date(iv.scheduledAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}`}>
          <ul className="space-y-3 text-sm text-body">
            <li className="flex gap-3"><Video className="h-4 w-4 text-primary" />Camera and microphone stay on. Your face is compared with your identity anchor every 10 seconds.</li>
            <li className="flex gap-3"><MonitorUp className="h-4 w-4 text-primary" />You'll be asked to share your entire screen — this is required.</li>
          </ul>
          <div className="mt-5 space-y-3 rounded-lg bg-page p-4">
            <label className="flex items-start gap-3 text-sm"><input type="checkbox" className="mt-0.5" checked={opts.location} onChange={(e) => setOpts({ ...opts, location: e.target.checked })} /><span><span className="flex items-center gap-1.5 font-medium text-ink"><MapPin className="h-3.5 w-3.5" />Share precise device location (optional)</span><span className="text-xs text-muted">Shown on a GPS-camera style overlay. If you decline, only your approximate IP region is shown — this never affects your score.</span></span></label>
            <label className="flex items-start gap-3 text-sm"><input type="checkbox" className="mt-0.5" checked={opts.voice} onChange={(e) => setOpts({ ...opts, voice: e.target.checked })} /><span><span className="flex items-center gap-1.5 font-medium text-ink"><AudioLines className="h-3.5 w-3.5" />Voice consistency check (optional) <ExpTag /></span><span className="text-xs text-muted">Short audio features (not recordings) are compared during the call.</span></span></label>
          </div>
          {err && <div className="mt-4"><Callout tone="risk">{err}</Callout></div>}
          <Button className="mt-5" onClick={join} loading={busy} icon={<Video className="h-4 w-4" />}>Agree &amp; join interview</Button>
        </Card>
      )}
    </div>
  );

  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0'), ss = String(elapsed % 60).padStart(2, '0');
  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-[#0B1120]">
      <header className="flex h-14 items-center justify-between px-5 text-white">
        <div className="flex items-center gap-3"><span className="flex h-2 w-2 rounded-full bg-red-500" /><span className="text-sm font-medium">Interview · Northwind Labs</span><span className="text-xs text-white/60 tnum">{mm}:{ss}</span></div>
        <Pill tone={rtc.state === 'connected' ? 'ok' : 'warn'}>{rtc.state === 'connected' ? 'Connected' : rtc.state === 'waiting' ? 'Waiting for recruiter…' : rtc.state}</Pill>
      </header>
      <div className="grid flex-1 gap-3 overflow-hidden p-3 lg:grid-cols-[1fr_320px]">
        <div className="relative overflow-hidden rounded-card bg-black">
          {rtc.remote[0] ? <video ref={remoteRef} playsInline autoPlay className="h-full w-full object-cover" /> : <div className="flex h-full flex-col items-center justify-center gap-3 text-white/60"><Loader2 className="h-6 w-6 animate-spin" /><span className="text-sm">Waiting for the recruiter to join…</span></div>}
          <div className="absolute bottom-4 right-4 w-72 overflow-hidden rounded-xl border border-white/10 shadow-pop">
            <CameraView stream={cam} videoRef={videoRef} mesh={false} className="aspect-video" onFrame={(s) => { if (s.m) { mouth.current.push(s.m.mouthOpen); if (mouth.current.length > 600) mouth.current.splice(0, 300); } }}>
              <GpsOverlay reading={location} compact />
            </CameraView>
          </div>
        </div>
        <aside className="space-y-3 overflow-y-auto">
          <div className="rounded-card bg-white/5 p-4 text-white">
            <p className="text-xs uppercase tracking-wide text-white/50">Verification</p>
            <Row label="Identity" ok={face?.result === 'match'} text={!face ? 'Checking…' : face.result === 'match' ? `Consistent · ${face.similarity}%` : face.result === 'no_face' ? 'Face not visible' : face.result.replace('_', ' ')} />
            <Row label="Screen share" ok={!!screen} text={screen ? 'Sharing' : 'Stopped'} />
            <Row label="Voice (exp.)" ok={voice.result === 'match' || voice.state === 'enrolled'} text={voice.state === 'enrolling' ? 'Please speak — calibrating…' : voice.state === 'retry' ? 'Could not hear enough speech' : voice.result ? `${voice.result} · ${voice.similarity}` : voice.state} />
            <Row label="Location" ok={location.source === 'device'} text={location.source === 'device' ? `GPS ±${Math.round(location.accuracy || 0)} m` : location.source === 'ip' ? 'Approximate (IP)' : 'Unavailable'} />
          </div>
          {voice.state === 'enrolling' && <div className="rounded-card bg-primary/20 p-4 text-sm text-white">Please read aloud: <i>"I confirm that I am attending this interview myself and that my answers are my own."</i></div>}
          {!screen && <Button className="w-full" onClick={reshare} icon={<MonitorUp className="h-4 w-4" />}>Share screen again</Button>}
          <Button variant="danger" className="w-full" onClick={leave} icon={<PhoneOff className="h-4 w-4" />}>Leave interview</Button>
        </aside>
      </div>
    </div>
  );
}

function Row({ label, ok, text }: { label: string; ok: boolean; text: string }) {
  return <div className="mt-3 flex items-center justify-between gap-3 text-sm"><span className="text-white/70">{label}</span><span className={cx('flex items-center gap-1.5 capitalize', ok ? 'text-green-400' : 'text-amber-300')}>{ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Clock className="h-3.5 w-3.5" />}{text}</span></div>;
}
