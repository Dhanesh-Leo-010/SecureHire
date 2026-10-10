import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, CheckCircle2, Circle, Loader2, ScanFace, Sun, Users, Eye, MoveHorizontal, Crosshair } from 'lucide-react';
import { loadLandmarker, loadFaceApi, detectLandmarks, drawMesh, metrics, brightness, describe, openCamera, stopStream, type FaceMetrics } from '../lib/ai/face';
import { Button, Callout, cx } from './ui';

export type LiveState = { faces: number; light: number; m: FaceMetrics | null; ready: boolean };

/**
 * Live camera with the MediaPipe 478-point mesh drawn over the video.
 * onFrame receives per-frame metrics (faces, head pose, blink, lighting).
 */
export function CameraView({ stream, onFrame, mesh = true, className, children, mirrored = true, videoRef: extRef }: {
  stream: MediaStream | null; onFrame?: (s: LiveState) => void; mesh?: boolean; className?: string; children?: React.ReactNode; mirrored?: boolean; videoRef?: React.MutableRefObject<HTMLVideoElement | null>;
}) {
  const localRef = useRef<HTMLVideoElement | null>(null);
  const videoRef = extRef || localRef;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cb = useRef(onFrame); cb.current = onFrame;
  const [modelState, setModelState] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    const v = videoRef.current;
    if (v && stream) { v.srcObject = stream; v.play().catch(() => {}); }
  }, [stream, videoRef]);

  useEffect(() => {
    let raf = 0, alive = true, lastLight = 0, light = 0;
    loadLandmarker().then((lm) => {
      if (!alive) return;
      setModelState('ready');
      const loop = () => {
        if (!alive) return;
        const v = videoRef.current, c = canvasRef.current;
        if (v && c && v.readyState >= 2) {
          const res = detectLandmarks(lm, v);
          if (mesh) drawMesh(c, v, res);
          if (performance.now() - lastLight > 500) { light = brightness(v); lastLight = performance.now(); }
          const m = metrics(res);
          cb.current?.({ faces: m.faces, light, m, ready: true });
        }
        raf = requestAnimationFrame(loop);
      };
      loop();
    }).catch(() => setModelState('error'));
    return () => { alive = false; cancelAnimationFrame(raf); };
  }, [mesh, videoRef]);

  return (
    <div className={cx('relative overflow-hidden rounded-card bg-video', className)}>
      <video ref={videoRef} playsInline muted className={cx('h-full w-full object-cover', mirrored && 'mirror')} />
      <canvas ref={canvasRef} className={cx('mesh-canvas object-cover', mirrored && 'mirror')} style={{ objectFit: 'cover' }} />
      {modelState === 'loading' && <div className="absolute left-3 top-3 flex items-center gap-2 rounded-full bg-black/50 px-3 py-1 text-xs text-white"><Loader2 className="h-3 w-3 animate-spin" />Loading face model…</div>}
      {modelState === 'error' && <div className="absolute left-3 top-3 rounded-full bg-red-600/80 px-3 py-1 text-xs text-white">Face model failed to load</div>}
      {!stream && <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-400"><Camera className="h-8 w-8" /><span className="text-xs">Camera is off</span></div>}
      {children}
    </div>
  );
}

export function Check({ ok, label, icon, detail }: { ok: boolean | null; label: string; icon?: React.ReactNode; detail?: string }) {
  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className={cx('flex h-7 w-7 items-center justify-center rounded-full', ok ? 'bg-green-50 text-ok' : ok === false ? 'bg-orange-50 text-review' : 'bg-subtle text-muted')}>{icon}</span>
      <div className="flex-1"><p className="text-sm text-ink">{label}</p>{detail && <p className="text-xs text-muted">{detail}</p>}</div>
      {ok ? <CheckCircle2 className="h-4 w-4 text-ok" /> : <Circle className="h-4 w-4 text-line" />}
    </div>
  );
}

export function EnvChecklist({ live }: { live: LiveState | null }) {
  const faces = live?.faces ?? 0, light = live?.light ?? 0;
  return (
    <div>
      <Check ok={!!live?.ready} label="Face model running" icon={<ScanFace className="h-3.5 w-3.5" />} detail="MediaPipe Face Landmarker · 478 points" />
      <Check ok={faces >= 1 ? true : live ? false : null} label="Face detected" icon={<Crosshair className="h-3.5 w-3.5" />} />
      <Check ok={faces === 1 ? true : faces > 1 ? false : null} label="One face only" icon={<Users className="h-3.5 w-3.5" />} detail={faces > 1 ? `${faces} faces in frame` : undefined} />
      <Check ok={light >= 60 && light <= 235 ? true : live ? false : null} label="Good lighting" icon={<Sun className="h-3.5 w-3.5" />} detail={live ? (light < 60 ? 'Too dark — face a light source' : light > 235 ? 'Too bright' : `Brightness ${light}`) : undefined} />
    </div>
  );
}

// ---------------------------------------------------------------- Liveness
type Challenge = { key: 'blink' | 'turn_a' | 'turn_b' | 'center'; text: string; icon: React.ReactNode };
const CHALLENGES: Challenge[] = [
  { key: 'blink', text: 'Blink slowly twice', icon: <Eye className="h-5 w-5" /> },
  { key: 'turn_a', text: 'Turn your head slowly to one side', icon: <MoveHorizontal className="h-5 w-5" /> },
  { key: 'turn_b', text: 'Now turn to the other side', icon: <MoveHorizontal className="h-5 w-5" /> },
  { key: 'center', text: 'Look straight at the camera', icon: <Crosshair className="h-5 w-5" /> },
];

export interface LivenessResult { passed: boolean; challenges: { name: string; passed: boolean; ms: number }[]; durationMs: number }

/**
 * Guided liveness using MediaPipe landmarks + blendshapes: blink (eyeBlink blendshape), head turns to both sides
 * (nose position between cheek landmarks) and re-centering. Basic liveness — not certified anti-spoofing.
 */
export function useLiveness(onDone: (r: LivenessResult) => void) {
  const [step, setStep] = useState(-1);
  const [order, setOrder] = useState<Challenge[]>(CHALLENGES);
  const st = useRef({ step: -1, t0: 0, tStep: 0, blinkLow: false, blinks: 0, firstSide: 0 as -1 | 0 | 1, results: [] as LivenessResult['challenges'] });
  const done = useRef(onDone); done.current = onDone;

  const start = useCallback(() => {
    // randomise: blink position varies; turns stay paired, center last
    const turns = [CHALLENGES[1], CHALLENGES[2]];
    const seq = Math.random() < 0.5 ? [CHALLENGES[0], ...turns, CHALLENGES[3]] : [...turns, CHALLENGES[0], CHALLENGES[3]];
    setOrder(seq);
    st.current = { step: 0, t0: performance.now(), tStep: performance.now(), blinkLow: false, blinks: 0, firstSide: 0, results: [] };
    setStep(0);
  }, []);

  const feed = useCallback((live: LiveState) => {
    const s = st.current;
    if (s.step < 0 || s.step >= order.length || !live.m) return;
    const ch = order[s.step];
    const now = performance.now();
    const m = live.m;
    let ok = false;
    if (live.faces === 1) {
      if (ch.key === 'blink') {
        if (m.blink < 0.2) s.blinkLow = true;
        if (s.blinkLow && m.blink > 0.55) { s.blinks++; s.blinkLow = false; }
        ok = s.blinks >= 2;
      } else if (ch.key === 'turn_a' && m.yawRatio != null) {
        if (m.yawRatio < 0.33) { s.firstSide = -1; ok = true; } else if (m.yawRatio > 0.67) { s.firstSide = 1; ok = true; }
      } else if (ch.key === 'turn_b' && m.yawRatio != null) {
        ok = s.firstSide === -1 ? m.yawRatio > 0.67 : m.yawRatio < 0.33;
      } else if (ch.key === 'center' && m.yawRatio != null) {
        ok = m.yawRatio > 0.42 && m.yawRatio < 0.58 && m.blink < 0.4;
      }
    }
    if (ok) {
      s.results.push({ name: ch.key === 'turn_a' || ch.key === 'turn_b' ? (ch.key === 'turn_a' ? 'turn_first_side' : 'turn_other_side') : ch.key, passed: true, ms: Math.round(now - s.tStep) });
      s.step++; s.tStep = now; setStep(s.step);
      if (s.step >= order.length) done.current({ passed: true, challenges: s.results, durationMs: Math.round(now - s.t0) });
    } else if (now - s.tStep > 12000) {
      s.results.push({ name: ch.key, passed: false, ms: 12000 });
      s.step = order.length + 1; setStep(s.step);
      done.current({ passed: false, challenges: s.results, durationMs: Math.round(now - s.t0) });
    }
  }, [order]);

  return { step, order, start, feed, running: step >= 0 && step < order.length };
}

export function LivenessPrompt({ step, order }: { step: number; order: Challenge[] }) {
  if (step < 0 || step >= order.length) return null;
  const ch = order[step];
  return (
    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-5 text-white">
      <div className="flex items-center gap-3">
        <span className="rounded-full bg-white/15 p-2">{ch.icon}</span>
        <div className="flex-1"><p className="text-lg font-semibold">{ch.text}</p><p className="text-xs text-white/70">Step {step + 1} of {order.length}</p></div>
        <div className="flex gap-1.5">{order.map((_, i) => <span key={i} className={cx('h-2 w-2 rounded-full', i < step ? 'bg-green-400' : i === step ? 'bg-white' : 'bg-white/30')} />)}</div>
      </div>
    </div>
  );
}

/**
 * Self-contained "fresh identity check": camera → liveness → descriptor.
 * Used at offer acceptance and day-one onboarding.
 */
export function FreshFaceCheck({ onResult, busy }: { onResult: (r: { descriptor: number[] | null; faces: number; liveness: LivenessResult }) => void; busy?: boolean }) {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [live, setLive] = useState<LiveState | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [phase, setPhase] = useState<'idle' | 'live' | 'capturing' | 'done' | 'failed'>('idle');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const liveness = useLiveness(async (r) => {
    if (!r.passed) { setPhase('failed'); return; }
    setPhase('capturing');
    const d = await describe(videoRef.current!);
    setPhase('done');
    onResult({ descriptor: d.descriptor, faces: d.faces, liveness: r });
  });
  useEffect(() => () => stopStream(stream), [stream]);
  const startCam = async () => {
    setErr(null);
    try { const s = await openCamera(false); setStream(s); setPhase('live'); loadFaceApi(); } catch { setErr('Camera access was blocked. Allow camera access in your browser settings and try again.'); }
  };
  return (
    <div className="space-y-4">
      <CameraView stream={stream} videoRef={videoRef} className="aspect-video" onFrame={(s) => { setLive(s); liveness.feed(s); }}>
        <LivenessPrompt step={liveness.step} order={liveness.order} />
        {phase === 'capturing' && <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-sm text-white"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Computing face embedding…</div>}
      </CameraView>
      {err && <Callout tone="risk">{err}</Callout>}
      {phase === 'failed' && <Callout tone="review" title="Liveness not completed">Move closer to the light and try again.</Callout>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted">Images never leave your device — only an encrypted face embedding is compared.</p>
        {phase === 'idle' && <Button onClick={startCam} icon={<Camera className="h-4 w-4" />}>Start camera</Button>}
        {(phase === 'live' || phase === 'failed') && !liveness.running && <Button disabled={live?.faces !== 1} onClick={liveness.start} loading={busy}>Start liveness check</Button>}
      </div>
    </div>
  );
}
