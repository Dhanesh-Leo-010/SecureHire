/**
 * EXPERIMENTAL voiceprint: mean + standard deviation of MFCC coefficients 1–12 over voiced frames,
 * computed in-browser with Meyda. This is a classic signal-processing speaker feature, not a validated
 * speaker-verification model — results are review hints only.
 */
import Meyda from 'meyda';

export async function captureVoiceprint(stream: MediaStream, seconds = 6, onLevel?: (rms: number) => void): Promise<number[] | null> {
  const AudioCtx = (window.AudioContext || (window as any).webkitAudioContext);
  const ctx: AudioContext = new AudioCtx();
  const source = ctx.createMediaStreamSource(new MediaStream(stream.getAudioTracks()));
  const frames: number[][] = [];
  return new Promise((resolve) => {
    const analyzer = (Meyda as any).createMeydaAnalyzer({
      audioContext: ctx, source, bufferSize: 1024, numberOfMFCCCoefficients: 13,
      featureExtractors: ['mfcc', 'rms'],
      callback: (f: any) => {
        onLevel?.(f.rms);
        if (f.rms > 0.01 && Array.isArray(f.mfcc) && f.mfcc.every(Number.isFinite)) frames.push(f.mfcc.slice(1, 13));
      },
    });
    analyzer.start();
    setTimeout(() => {
      analyzer.stop();
      ctx.close();
      if (frames.length < 25) return resolve(null);
      const dims = frames[0].length;
      const mean = Array.from({ length: dims }, (_, i) => frames.reduce((a, f) => a + f[i], 0) / frames.length);
      const std = Array.from({ length: dims }, (_, i) => Math.sqrt(frames.reduce((a, f) => a + (f[i] - mean[i]) ** 2, 0) / frames.length));
      resolve([...mean, ...std].map((x) => +x.toFixed(4)));
    }, seconds * 1000);
  });
}

/** Simple RMS level meter for UI + experimental lip-sync correlation. */
export function levelMeter(stream: MediaStream) {
  const AudioCtx = (window.AudioContext || (window as any).webkitAudioContext);
  const ctx: AudioContext = new AudioCtx();
  const src = ctx.createMediaStreamSource(new MediaStream(stream.getAudioTracks()));
  const an = ctx.createAnalyser(); an.fftSize = 1024; src.connect(an);
  const buf = new Float32Array(an.fftSize);
  return {
    level() { an.getFloatTimeDomainData(buf); let s = 0; for (const v of buf) s += v * v; return Math.sqrt(s / buf.length); },
    close() { ctx.close(); },
  };
}

export function pearson(a: number[], b: number[]) {
  const n = Math.min(a.length, b.length);
  if (n < 10) return null;
  const ma = a.slice(-n).reduce((x, y) => x + y, 0) / n, mb = b.slice(-n).reduce((x, y) => x + y, 0) / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) { const x = a[a.length - n + i] - ma, y = b[b.length - n + i] - mb; num += x * y; da += x * x; db += y * y; }
  return da && db ? num / Math.sqrt(da * db) : null;
}
