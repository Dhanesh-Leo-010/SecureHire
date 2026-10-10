import { Router } from 'express';
import { q, now, json, parse, getSetting } from '../db.js';
import { requireAuth, encrypt, decrypt, randomId, audit } from '../security.js';
import { ah, bad, HttpError, advanceStage, grantConsent, STAGE_INDEX, candidateRow } from '../helpers.js';
import { addSignal } from '../trust.js';
import { observeIp, haversineKm } from '../services/network.js';
import { logEvent } from '../services/continuity.js';
import { toStaff, toRoom } from '../realtime.js';

const r = Router();

function loadInterview(req, id) {
  const iv = q.get('SELECT * FROM interviews WHERE id = ?', id);
  if (!iv) throw new HttpError(404, 'Interview not found.');
  if (req.user.role === 'candidate' && iv.candidate_id !== req.user.id) throw new HttpError(403, 'Not your interview.');
  return iv;
}

// Voice: EXPERIMENTAL MFCC voiceprint (mean+std of MFCC 1–13 computed in-browser with Meyda).
// Classic signal-processing features, not a validated speaker-verification model.
const cosine = (a, b) => { let d = 0, na = 0, nb = 0; for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] ** 2; nb += b[i] ** 2; } return d / (Math.sqrt(na * nb) || 1); };
const validVoice = (v) => Array.isArray(v) && v.length >= 12 && v.length <= 64 && v.every(Number.isFinite);
const VOICE = { match: 0.9, uncertain: 0.8 };

export function interviewSummary(iv) {
  const room = iv.room_id;
  const face = q.all("SELECT result, COUNT(*) AS n FROM face_checks WHERE user_id = ? AND stage = 'interview' AND session_ref = ? GROUP BY result", iv.candidate_id, room);
  const voice = q.all("SELECT event_type, COUNT(*) AS n FROM monitoring_events WHERE session_id = ? AND event_type IN ('VOICE_MATCH','VOICE_UNCERTAIN','VOICE_MISMATCH') GROUP BY event_type", room);
  const events = q.all('SELECT event_type, details, created_at FROM monitoring_events WHERE session_id = ? ORDER BY id DESC LIMIT 100', room).map(e => ({ ...e, details: parse(e.details, {}) }));
  return { face: Object.fromEntries(face.map(x => [x.result, x.n])), voice: Object.fromEntries(voice.map(x => [x.event_type, x.n])), events };
}

/** Assessment vs interview comparison (identity, network, location). Differences are context for reviewers. */
function compareStages(candidateId, room) {
  const lastIp = (stage, ref) => q.get(`SELECT * FROM ip_observations WHERE user_id = ? AND stage = ? ${ref ? 'AND session_ref = ?' : ''} ORDER BY id DESC LIMIT 1`, ...[candidateId, stage, ...(ref ? [ref] : [])]);
  const aIp = lastIp('assessment'), iIp = lastIp('interview');
  const loc = (stage) => q.get('SELECT * FROM location_events WHERE user_id = ? AND stage = ? ORDER BY id DESC LIMIT 1', candidateId, stage);
  const aLoc = loc('assessment') || (aIp?.lat ? { lat: aIp.lat, lng: aIp.lng, source: 'ip' } : null);
  const iLoc = loc('interview') || (iIp?.lat ? { lat: iIp.lat, lng: iIp.lng, source: 'ip' } : null);
  const faceA = q.get("SELECT AVG(distance) AS d, COUNT(*) AS n FROM face_checks WHERE user_id = ? AND stage = 'assessment' AND distance IS NOT NULL", candidateId);
  const faceI = q.get("SELECT AVG(distance) AS d, COUNT(*) AS n FROM face_checks WHERE user_id = ? AND stage = 'interview' AND session_ref = ? AND distance IS NOT NULL", candidateId, room);
  return {
    network: { assessment: aIp ? `${aIp.ip_masked} (${aIp.city || '?'})` : null, interview: iIp ? `${iIp.ip_masked} (${iIp.city || '?'})` : null, sameNetwork: aIp && iIp ? aIp.ip_hash === iIp.ip_hash : null },
    location: aLoc && iLoc ? { distanceKm: Math.round(haversineKm(aLoc, iLoc)), sources: [aLoc.source, iLoc.source] } : null,
    face: { assessmentAvgDistance: faceA.n ? +faceA.d.toFixed(3) : null, interviewAvgDistance: faceI.n ? +faceI.d.toFixed(3) : null },
    note: 'Network and location differences are contextual (travel, mobile data, VPN). Face distances are relative to the same identity anchor.',
  };
}

// ------------------------------------------------------------------ scheduling (recruiter)
r.post('/interviews', requireAuth('recruiter', 'admin'), ah(async (req, res) => {
  const { candidateId, scheduledAt } = req.body || {};
  const c = candidateRow(Number(candidateId));
  if (!c) throw bad('Candidate not found.');
  if (c.stage_index < STAGE_INDEX.interview) throw new HttpError(409, 'Candidate has not completed the assessment yet.');
  const room = randomId('ROOM-', 8);
  const rr = q.run('INSERT INTO interviews (candidate_id, recruiter_id, scheduled_at, room_id, status) VALUES (?,?,?,?,?)',
    c.user_id, req.user.id, scheduledAt || now(), room, 'scheduled');
  audit(req, 'interview.schedule', `user:${c.user_id}`, { interviewId: rr.lastInsertRowid });
  res.status(201).json(q.get('SELECT * FROM interviews WHERE id = ?', rr.lastInsertRowid));
}));

r.get('/me/interview', requireAuth('candidate'), ah(async (req, res) => {
  const iv = q.get("SELECT * FROM interviews WHERE candidate_id = ? ORDER BY id DESC LIMIT 1", req.user.id);
  res.json({ interview: iv ? { id: iv.id, scheduledAt: iv.scheduled_at, status: iv.status, roomId: iv.room_id, voiceEnrolled: !!q.get('SELECT 1 FROM voice_prints WHERE user_id = ?', req.user.id) } : null });
}));

r.get('/interviews/:id', requireAuth(), ah(async (req, res) => {
  const iv = loadInterview(req, req.params.id);
  const out = { ...iv, rubric: parse(iv.rubric), verification: parse(iv.verification) };
  if (req.user.role !== 'candidate') {
    const c = candidateRow(iv.candidate_id);
    out.candidate = { id: c.user_id, name: c.name, email: c.email };
    out.summary = interviewSummary(iv);
    out.comparison = compareStages(iv.candidate_id, iv.room_id);
  }
  res.json(out);
}));

r.post('/interviews/:id/join', requireAuth(), ah(async (req, res) => {
  const iv = loadInterview(req, req.params.id);
  if (iv.status === 'completed') throw new HttpError(409, 'This interview has ended.');
  if (req.user.role === 'candidate') {
    const { consents = [] } = req.body || {};
    for (const p of consents) if (['camera_mic', 'screen', 'location', 'voice'].includes(p)) grantConsent(req.user.id, p);
    await observeIp(req, req.user.id, 'interview', iv.room_id);
    logEvent({ sessionId: iv.room_id, userId: iv.candidate_id, stage: 'interview', source: 'server', type: 'CANDIDATE_JOINED', details: {} });
  }
  if (iv.status === 'scheduled') q.run("UPDATE interviews SET status = 'live', started_at = ? WHERE id = ?", now(), iv.id);
  res.json({ roomId: iv.room_id, interviewId: iv.id, iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }] });
}));

r.post('/interviews/:id/event', requireAuth('candidate'), ah(async (req, res) => {
  const iv = loadInterview(req, req.params.id);
  const type = String(req.body?.type || '').toUpperCase();
  const allowed = ['SCREEN_SHARE_STARTED', 'SCREEN_SHARE_STOPPED', 'CAMERA_OFF', 'CAMERA_ON', 'MIC_OFF', 'MIC_ON', 'TAB_HIDDEN', 'TAB_VISIBLE', 'LIP_SYNC_LOW'];
  if (!allowed.includes(type)) throw bad('Unsupported event.');
  logEvent({ sessionId: iv.room_id, userId: iv.candidate_id, stage: 'interview', source: 'page', type, details: req.body?.details || {} });
  if (type === 'SCREEN_SHARE_STOPPED' && iv.status === 'live')
    addSignal(iv.candidate_id, 'screen_share_stopped', { sessionRef: iv.room_id, source: 'interview-room', evidence: { at: now(), note: 'Could be accidental. Ask the candidate to re-share.' } });
  toRoom(iv.room_id, { type: 'status', event: type });
  res.json({ ok: true });
}));

// ------------------------------------------------------------------ voice (EXPERIMENTAL)
r.post('/interviews/:id/voice/enroll', requireAuth('candidate'), ah(async (req, res) => {
  const iv = loadInterview(req, req.params.id);
  const { vector } = req.body || {};
  if (!validVoice(vector)) throw bad('Voice sample was too short or silent. Please read the sentence again.');
  grantConsent(req.user.id, 'voice');
  const days = getSetting('retention_days', {}).voice ?? 90;
  q.run(`INSERT INTO voice_prints (user_id, vector_enc, method, created_at, retention_until) VALUES (?,?,?,?,?)
         ON CONFLICT(user_id) DO UPDATE SET vector_enc=excluded.vector_enc, created_at=excluded.created_at, retention_until=excluded.retention_until`,
    req.user.id, encrypt(vector), 'MFCC mean/std voiceprint (Meyda) — EXPERIMENTAL', now(), new Date(Date.now() + days * 86400_000).toISOString());
  logEvent({ sessionId: iv.room_id, userId: req.user.id, stage: 'interview', source: 'voice', type: 'VOICE_ENROLLED', details: {} });
  res.json({ enrolled: true });
}));

r.post('/interviews/:id/voice/verify', requireAuth('candidate'), ah(async (req, res) => {
  const iv = loadInterview(req, req.params.id);
  const vp = q.get('SELECT vector_enc FROM voice_prints WHERE user_id = ?', req.user.id);
  if (!vp) throw new HttpError(409, 'No voice sample enrolled.');
  const { vector } = req.body || {};
  if (!validVoice(vector)) return res.json({ result: 'insufficient_speech' });
  const sim = cosine(vector, decrypt(vp.vector_enc));
  const result = sim >= VOICE.match ? 'match' : sim >= VOICE.uncertain ? 'uncertain' : 'mismatch';
  logEvent({ sessionId: iv.room_id, userId: req.user.id, stage: 'interview', source: 'voice', type: result === 'match' ? 'VOICE_MATCH' : result === 'uncertain' ? 'VOICE_UNCERTAIN' : 'VOICE_MISMATCH', details: { similarity: +sim.toFixed(3) } });
  const last = q.all("SELECT event_type FROM monitoring_events WHERE session_id = ? AND event_type LIKE 'VOICE_%' AND event_type != 'VOICE_ENROLLED' ORDER BY id DESC LIMIT 2", iv.room_id);
  if (last.length === 2 && last.every(e => e.event_type === 'VOICE_MISMATCH'))
    addSignal(iv.candidate_id, 'voice_mismatch', { sessionRef: iv.room_id, source: 'voice-experimental', evidence: { similarity: +sim.toFixed(3), threshold: VOICE.uncertain, method: 'MFCC voiceprint (EXPERIMENTAL)', note: 'Microphone changes, noise and illness affect voice features. Never conclusive on its own.' } });
  toRoom(iv.room_id, { type: 'status', event: 'VOICE', result, similarity: +sim.toFixed(3) });
  res.json({ result, similarity: +sim.toFixed(3) });
}));

// ------------------------------------------------------------------ complete (recruiter)
r.post('/interviews/:id/complete', requireAuth('recruiter', 'admin'), ah(async (req, res) => {
  const iv = loadInterview(req, req.params.id);
  const { notes, rubric } = req.body || {};
  const summary = interviewSummary(iv);
  const comparison = compareStages(iv.candidate_id, iv.room_id);
  const risks = q.get("SELECT COUNT(*) AS n FROM trust_signals WHERE candidate_id = ? AND session_ref = ? AND status IN ('pending_review','confirmed')", iv.candidate_id, iv.room_id).n;
  const matches = summary.face.match || 0;
  const voiceOk = (summary.voice.VOICE_MATCH || 0) + (summary.voice.VOICE_UNCERTAIN || 0);
  if (!risks && matches >= 2) addSignal(iv.candidate_id, 'interview_identity_consistent', { source: 'interview-room', evidence: { faceMatches: matches, voiceChecks: summary.voice, room: iv.room_id } });
  q.run("UPDATE interviews SET status = 'completed', ended_at = ?, notes = ?, rubric = ?, verification = ? WHERE id = ?",
    now(), notes || null, json(rubric || null), json({ summary: { face: summary.face, voice: summary.voice }, comparison, voiceOk }), iv.id);
  advanceStage(iv.candidate_id, STAGE_INDEX.offer);
  audit(req, 'interview.complete', `user:${iv.candidate_id}`, { interviewId: iv.id, rubric });
  toRoom(iv.room_id, { type: 'status', event: 'INTERVIEW_COMPLETED' });
  toStaff({ type: 'interview', action: 'completed', candidateId: iv.candidate_id });
  res.json({ ok: true, summary, comparison });
}));

export default r;
