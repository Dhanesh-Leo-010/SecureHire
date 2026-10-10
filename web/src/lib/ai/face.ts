/**
 * Pretrained face models, all running locally in the browser (no images leave the device):
 *  - Google MediaPipe Face Landmarker (478 landmarks + 52 blendshapes + head transform) → mesh overlay, liveness, head pose.
 *  - face-api.js (TinyFaceDetector + 68-point landmarks + FaceRecognitionNet) → 128-d face descriptor for 1:1 matching.
 * Model files are served from /public/models (vendored), so the app works offline.
 */
import { FaceLandmarker, FilesetResolver, DrawingUtils, type FaceLandmarkerResult } from '@mediapipe/tasks-vision';
import * as faceapi from '@vladmandic/face-api';

let landmarkerPromise: Promise<FaceLandmarker> | null = null;
let faceApiPromise: Promise<void> | null = null;

const LOCAL_TASK = '/models/mediapipe/face_landmarker.task';
const REMOTE_TASK = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

async function createLandmarker(delegate: 'GPU' | 'CPU', modelAssetPath: string) {
  const fileset = await FilesetResolver.forVisionTasks('/models/mediapipe/wasm');
  return FaceLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath, delegate },
    runningMode: 'VIDEO', numFaces: 3,
    outputFaceBlendshapes: true, outputFacialTransformationMatrixes: true,
    minFaceDetectionConfidence: 0.5, minFacePresenceConfidence: 0.5, minTrackingConfidence: 0.5,
  });
}

export function loadLandmarker() {
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      for (const path of [LOCAL_TASK, REMOTE_TASK]) {
        for (const d of ['GPU', 'CPU'] as const) {
          try { return await createLandmarker(d, path); } catch (e) { console.warn(`[mediapipe] ${d} ${path} failed`, e); }
        }
      }
      throw new Error('Could not load the MediaPipe Face Landmarker model.');
    })();
    landmarkerPromise.catch(() => { landmarkerPromise = null; });
  }
  return landmarkerPromise;
}

export function loadFaceApi() {
  if (!faceApiPromise) {
    faceApiPromise = (async () => {
      const tf: any = (faceapi as any).tf;
      try { await tf.setBackend('webgl'); } catch { await tf.setBackend('cpu'); }
      await tf.ready();
      const base = '/models/face-api';
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(base),
        faceapi.nets.ssdMobilenetv1.loadFromUri(base),
        faceapi.nets.faceLandmark68Net.loadFromUri(base),
        faceapi.nets.faceRecognitionNet.loadFromUri(base),
      ]);
    })();
    faceApiPromise.catch(() => { faceApiPromise = null; });
  }
  return faceApiPromise;
}

export async function loadAllModels() { await Promise.all([loadLandmarker(), loadFaceApi()]); }

let lastTs = 0;
export function detectLandmarks(lm: FaceLandmarker, video: HTMLVideoElement): FaceLandmarkerResult | null {
  if (!video.videoWidth || video.readyState < 2) return null;
  let ts = performance.now();
  if (ts <= lastTs) ts = lastTs + 1;
  lastTs = ts;
  return lm.detectForVideo(video, ts);
}

/** Draw the 478-point mesh (tessellation + contours + points) on a canvas sized to the video. */
export function drawMesh(canvas: HTMLCanvasElement, video: HTMLVideoElement, result: FaceLandmarkerResult | null, opts: { points?: boolean } = {}) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  if (canvas.width !== video.videoWidth) { canvas.width = video.videoWidth; canvas.height = video.videoHeight; }
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!result?.faceLandmarks?.length) return;
  const du = new DrawingUtils(ctx);
  result.faceLandmarks.forEach((lms, i) => {
    const main = i === 0;
    du.drawConnectors(lms, FaceLandmarker.FACE_LANDMARKS_TESSELATION, { color: main ? 'rgba(129,140,248,0.35)' : 'rgba(248,113,113,0.4)', lineWidth: 0.6 });
    du.drawConnectors(lms, FaceLandmarker.FACE_LANDMARKS_FACE_OVAL, { color: main ? '#A5B4FC' : '#F87171', lineWidth: 1.5 });
    du.drawConnectors(lms, FaceLandmarker.FACE_LANDMARKS_LEFT_EYE, { color: '#C7D2FE', lineWidth: 1.2 });
    du.drawConnectors(lms, FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE, { color: '#C7D2FE', lineWidth: 1.2 });
    du.drawConnectors(lms, FaceLandmarker.FACE_LANDMARKS_LEFT_EYEBROW, { color: '#C7D2FE', lineWidth: 1.2 });
    du.drawConnectors(lms, FaceLandmarker.FACE_LANDMARKS_RIGHT_EYEBROW, { color: '#C7D2FE', lineWidth: 1.2 });
    du.drawConnectors(lms, FaceLandmarker.FACE_LANDMARKS_LIPS, { color: '#E0E7FF', lineWidth: 1.2 });
    if (opts.points !== false) du.drawLandmarks(lms, { color: main ? '#818CF8' : '#F87171', radius: 0.8, lineWidth: 0 });
  });
}

export interface FaceMetrics {
  faces: number;
  yawRatio: number | null;   // 0.5 = facing camera; > 0.65 turned to the candidate's left; < 0.35 to their right
  blink: number;             // 0..1 from blendshapes
  mouthOpen: number;         // normalised lip gap (for experimental lip-sync)
  yawDeg: number | null;
  pitchDeg: number | null;
}

export function metrics(result: FaceLandmarkerResult | null): FaceMetrics {
  const faces = result?.faceLandmarks?.length || 0;
  if (!faces) return { faces: 0, yawRatio: null, blink: 0, mouthOpen: 0, yawDeg: null, pitchDeg: null };
  const l = result!.faceLandmarks[0];
  const left = l[234], right = l[454], nose = l[1];
  const yawRatio = (nose.x - left.x) / ((right.x - left.x) || 1e-6);
  const bs = result!.faceBlendshapes?.[0]?.categories || [];
  const get = (n: string) => bs.find((c) => c.categoryName === n)?.score ?? 0;
  const blink = Math.min(get('eyeBlinkLeft'), get('eyeBlinkRight'));
  const faceH = Math.abs(l[152].y - l[10].y) || 1;
  const mouthOpen = Math.abs(l[14].y - l[13].y) / faceH;
  let yawDeg: number | null = null, pitchDeg: number | null = null;
  const m = result!.facialTransformationMatrixes?.[0]?.data;
  if (m && m.length === 16) {
    // column-major 4x4 rotation → Euler (approx.)
    yawDeg = Math.round((Math.asin(Math.max(-1, Math.min(1, -m[8]))) * 180) / Math.PI);
    pitchDeg = Math.round((Math.atan2(m[9], m[10]) * 180) / Math.PI);
  }
  return { faces, yawRatio, blink, mouthOpen, yawDeg, pitchDeg };
}

/** Average luminance (0..255) of the current frame — used for the lighting check. */
const lumCanvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
export function brightness(video: HTMLVideoElement) {
  if (!lumCanvas || !video.videoWidth) return 0;
  lumCanvas.width = 64; lumCanvas.height = 48;
  const ctx = lumCanvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(video, 0, 0, 64, 48);
  const d = ctx.getImageData(0, 0, 64, 48).data;
  let sum = 0; for (let i = 0; i < d.length; i += 4) sum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
  return Math.round(sum / (d.length / 4));
}

/** 128-d descriptor of the (single) face in a video frame or image. */
export async function describe(input: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement): Promise<{ faces: number; descriptor: number[] | null; score?: number }> {
  await loadFaceApi();
  // Fast TinyFaceDetector first; fall back to the more robust SSD MobileNet v1 (close-up or tilted faces).
  let res = await faceapi.detectAllFaces(input, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.4 })).withFaceLandmarks().withFaceDescriptors();
  if (!res.length) res = await faceapi.detectAllFaces(input, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.4 })).withFaceLandmarks().withFaceDescriptors();
  if (!res.length) return { faces: 0, descriptor: null };
  const best = res.sort((a, b) => b.detection.score - a.detection.score)[0];
  return { faces: res.length, descriptor: Array.from(best.descriptor), score: best.detection.score };
}

export async function fileToImage(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.src = url;
  await img.decode();
  return img;
}

/** Camera helper */
export async function openCamera(audio = false) {
  return navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }, audio });
}
export function stopStream(s?: MediaStream | null) { s?.getTracks().forEach((t) => t.stop()); }
