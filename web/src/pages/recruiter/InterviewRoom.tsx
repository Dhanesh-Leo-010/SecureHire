import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Video, PhoneOff, MonitorUp, ScanFace, AudioLines, MapPin, AlertTriangle, Loader2, Mic, MicOff } from 'lucide-react';
import { Button, Pill, Callout, Skeleton, Textarea, useToast, ExpTag, cx } from '../../components/ui';
import { Gauge } from '../../components/trust';
import { GpsOverlay, type GeoReading } from '../../components/location';
import { api, bandTone, timeAgo } from '../../lib/api';
import { useRtc } from '../../lib/rtc';
import { useRealtime } from '../../lib/realtime';
import { stopStream } from '../../lib/ai/face';

export default function InterviewRoom() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const [iv, setIv] = useState<any>(null);
  const [me, setMe] = useState<MediaStream | null>(null);
  const [joined, setJoined] = useState<any>(null);
  const [meta, setMeta] = useState<any>({});
  const [status, setStatus] = useState<any>({});
  const [loc, setLoc] = useState<GeoReading>({ lat: null, lng: null, accuracy: null, source: 'none' });
  const [scores, setScores] = useState<any>(null);
  const [feed, setFeed] = useState<any[]>([]);
  const [rubric, setRubric] = useState({ technical: 3, communication: 3, problemSolving: 3 });
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [muted, setMuted] = useState(false);
  const camRef = useRef<HTMLVideoElement | null>(null), screenRef = useRef<HTMLVideoElement | null>(null), selfRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => { api.get(`/api/interviews/${id}`).then(setIv).catch((e) => toast(e.message, 'risk')); }, [id]);
  const loadScores = () => iv && api.get(`/api/recruiter/candidates/${iv.candidate_id}`).then((d) => setScores(d.scores));
  useEffect(() => { loadScores(); }, [iv?.candidate_id]);
  useEffect(() => () => stopStream(me), [me]);

  const push = (text: string, tone = 'info') => setFeed((f) => [{ text, tone, at: new Date().toISOString() }, ...f].slice(0, 50));
  useRealtime((m) => {
    if (!iv) return;
    if (m.type === 'trust' && m.candidateId === iv.candidate_id) { setScores(m.scores); if (m.signal) push(m.signal.label, m.signal.status === 'pending_review' ? 'review' : m.signal.status === 'verified' ? 'ok' : 'info'); }
    if (m.type === 'monitoring' && m.event.sessionId === iv.room_id && !m.event.type.startsWith('VOICE_M')) push(m.event.type.replace(/_/g, ' ').toLowerCase(), 'info');
  }, [iv?.candidate_id, iv?.room_id]);

  const rtc = useRtc({ room: joined?.roomId || null, role: 'recruiter', iceServers: joined?.iceServers, localStreams: me ? [me] : [], enabled: !!joined && !!me,
    onApp: (m) => {
      if (m.meta) setMeta(m.meta);
      if (m.location) setLoc(m.location);
      if (m.face || m.voice || m.screen !== undefined) setStatus((s: any) => ({ ...s, ...(m.face ? { face: m.face } : {}), ...(m.voice ? { voice: m.voice } : {}), ...(m.screen !== undefined ? { screen: m.screen } : {}) }));
      if (m.status?.event === 'SCREEN_SHARE_STOPPED') push('Candidate stopped screen sharing', 'review');
    } });

  useEffect(() => {
    const cam = rtc.remote.find((s) => s.id === meta.cameraStreamId) || rtc.remote[0];
    const scr = rtc.remote.find((s) => s.id === meta.screenStreamId) || rtc.remote.find((s) => s !== cam);
    if (camRef.current && cam && camRef.current.srcObject !== cam) { camRef.current.srcObject = cam; camRef.current.play().catch(() => {}); }
    if (screenRef.current && scr && screenRef.current.srcObject !== scr) { screenRef.current.srcObject = scr; screenRef.current.play().catch(() => {}); }
  }, [rtc.remote, meta]);
  useEffect(() => { if (selfRef.current && me) { selfRef.current.srcObject = me; selfRef.current.play().catch(() => {}); } }, [me, joined]);

  const join = async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { width: 960, height: 540 }, audio: true });
      const j = await api.post(`/api/interviews/${id}/join`);
      setMe(s); setJoined(j); push('You joined the room', 'ok');
    } catch (e: any) { toast(e.message || 'Camera/microphone unavailable', 'risk'); }
  };
  const complete = async () => {
    setBusy(true);
    try { await api.post(`/api/interviews/${id}/complete`, { notes, rubric }); toast('Interview completed — evaluation saved'); stopStream(me); nav(`/recruiter/candidates/${iv.candidate_id}`); }
    catch (e: any) { toast(e.message, 'risk'); } finally { setBusy(false); }
  };

  if (!iv) return <Skeleton className="h-96" />;
  if (!joined) return (
    <div className="mx-auto max-w-xl">
      <div className="card p-8 text-center">
        <Video className="mx-auto h-8 w-8 text-primary" />
        <h1 className="mt-4 text-xl font-semibold text-ink">Interview with {iv.candidate?.name}</h1>
        <p className="mt-1 text-sm text-body">Room {iv.room_id} · {iv.status}</p>
        <p className="mt-4 text-sm text-body">You'll see the candidate's camera with a location overlay, their shared screen and live identity continuity checks.</p>
        {iv.status === 'completed' ? <Callout tone="ok">This interview has been completed.</Callout> : <Button className="mt-6" onClick={join} icon={<Video className="h-4 w-4" />}>Join room</Button>}
      </div>
    </div>
  );

  const face = status.face, voice = status.voice;
  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-[#0B1120] text-white">
      <header className="flex h-14 items-center justify-between px-5">
        <div className="flex items-center gap-3"><span className="h-2 w-2 rounded-full bg-red-500" /><span className="text-sm font-medium">Interview · {iv.candidate?.name}</span><Pill tone={rtc.state === 'connected' ? 'ok' : 'warn'}>{rtc.state === 'connected' ? 'Connected' : rtc.state === 'waiting' ? 'Waiting for candidate' : rtc.state}</Pill></div>
        <div className="flex gap-2">
          <button onClick={() => { me?.getAudioTracks().forEach((t) => (t.enabled = muted)); setMuted(!muted); }} className="rounded-lg bg-white/10 p-2 hover:bg-white/20" aria-label="Toggle microphone">{muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}</button>
          <Button variant="danger" size="sm" icon={<PhoneOff className="h-3.5 w-3.5" />} onClick={() => { stopStream(me); nav(`/recruiter/candidates/${iv.candidate_id}`); }}>Leave</Button>
        </div>
      </header>
      <div className="grid flex-1 gap-3 overflow-hidden p-3 lg:grid-cols-[1fr_360px]">
        <div className="grid min-h-0 gap-3 lg:grid-rows-[1.3fr_1fr]">
          <div className="relative min-h-0 overflow-hidden rounded-card bg-black">
            {rtc.remote.length ? <video ref={camRef} playsInline autoPlay className="h-full w-full object-contain" /> : <div className="flex h-full flex-col items-center justify-center gap-2 text-white/60"><Loader2 className="h-6 w-6 animate-spin" /><span className="text-sm">Waiting for the candidate's camera…</span></div>}
            <GpsOverlay reading={loc} />
            <span className="absolute left-3 top-3 rounded-full bg-black/50 px-3 py-1 text-xs">Candidate camera</span>
            <div className="absolute right-3 top-3 w-40 overflow-hidden rounded-lg border border-white/10"><video ref={selfRef} muted playsInline className="mirror aspect-video w-full object-cover" /></div>
          </div>
          <div className="relative min-h-0 overflow-hidden rounded-card bg-black">
            {rtc.remote.length > 1 ? <video ref={screenRef} playsInline autoPlay muted className="h-full w-full object-contain" /> : <div className="flex h-full items-center justify-center gap-2 text-sm text-white/50"><MonitorUp className="h-4 w-4" />{status.screen === false ? 'Screen sharing stopped' : 'Waiting for screen share…'}</div>}
            <span className="absolute left-3 top-3 rounded-full bg-black/50 px-3 py-1 text-xs">Shared screen</span>
          </div>
        </div>
        <aside className="flex min-h-0 flex-col gap-3 overflow-y-auto">
          <div className="rounded-card bg-white p-4 text-ink">
            <div className="flex items-center justify-between"><span className="label">Live trust</span>{scores && <Pill tone={bandTone(scores.band.key)}>{scores.band.label.split(' —')[0]}</Pill>}</div>
            {scores && <div className="flex items-center gap-4"><Gauge score={scores.overall} size={120} /><div className="text-xs text-body">{scores.pendingReview} open item(s)<br />if confirmed: <b className="tnum">{scores.ifConfirmed}</b></div></div>}
          </div>
          <div className="rounded-card bg-white/5 p-4">
            <p className="text-xs uppercase tracking-wide text-white/50">Verification</p>
            <Badge icon={<ScanFace className="h-4 w-4" />} label="Face continuity" ok={face?.result === 'match'} text={!face ? 'Waiting…' : face.result === 'match' ? `Consistent · ${face.similarity}%` : face.result.replace('_', ' ')} />
            <Badge icon={<AudioLines className="h-4 w-4" />} label={<span className="flex items-center gap-1.5">Voice <ExpTag /></span>} ok={voice?.result === 'match'} text={!voice ? 'Waiting…' : voice.result ? `${voice.result} · ${voice.similarity}` : voice.state} />
            <Badge icon={<MonitorUp className="h-4 w-4" />} label="Screen share" ok={status.screen !== false && rtc.remote.length > 1} text={status.screen === false ? 'Stopped' : rtc.remote.length > 1 ? 'Live' : 'Waiting'} />
            <Badge icon={<MapPin className="h-4 w-4" />} label="Location" ok={loc.source === 'device'} text={loc.source === 'device' ? `GPS ±${Math.round(loc.accuracy || 0)} m` : loc.source === 'ip' ? 'Approximate (IP)' : 'Unavailable'} />
          </div>
          <div className="min-h-[120px] rounded-card bg-white/5 p-4">
            <p className="text-xs uppercase tracking-wide text-white/50">Live alerts</p>
            <div className="mt-2 space-y-2">{feed.length === 0 ? <p className="text-xs text-white/40">Events will appear here.</p> : feed.map((f, i) => <div key={i} className="flex gap-2 text-xs"><span className={cx('mt-1 h-1.5 w-1.5 shrink-0 rounded-full', f.tone === 'review' ? 'bg-orange-400' : f.tone === 'ok' ? 'bg-green-400' : 'bg-sky-400')} /><span className="flex-1 text-white/80">{f.text}</span><span className="text-white/40">{timeAgo(f.at)}</span></div>)}</div>
          </div>
          <div className="rounded-card bg-white p-4 text-ink">
            <p className="label">Evaluation</p>
            {(['technical', 'communication', 'problemSolving'] as const).map((k) => (
              <div key={k} className="mt-3 flex items-center justify-between text-sm"><span className="capitalize text-body">{k === 'problemSolving' ? 'Problem solving' : k}</span><div className="flex gap-1">{[1, 2, 3, 4, 5].map((n) => <button key={n} onClick={() => setRubric({ ...rubric, [k]: n })} className={cx('h-7 w-7 rounded-md text-xs font-medium', rubric[k] >= n ? 'bg-primary text-white' : 'bg-subtle text-muted')}>{n}</button>)}</div></div>
            ))}
            <Textarea className="mt-3" rows={3} placeholder="Interviewer notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
            <Button className="mt-3 w-full" onClick={complete} loading={busy}>Complete interview</Button>
            <p className="mt-2 text-xs text-muted">Completing records the evaluation and identity-continuity summary, and moves the candidate to the offer stage.</p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Badge({ icon, label, ok, text }: { icon: React.ReactNode; label: React.ReactNode; ok: boolean; text: string }) {
  return <div className="mt-3 flex items-center gap-3 text-sm"><span className={cx('rounded-lg p-1.5', ok ? 'bg-green-500/15 text-green-400' : 'bg-amber-500/15 text-amber-300')}>{icon}</span><span className="flex-1 text-white/80">{label}</span><span className={cx('text-xs capitalize', ok ? 'text-green-400' : 'text-amber-300')}>{text}</span></div>;
}
