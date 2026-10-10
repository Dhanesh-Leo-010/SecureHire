import { q, now, parse } from './db.js';

export const STAGE_INDEX = { apply: 0, identity: 1, resume: 2, assessment: 3, interview: 4, offer: 5, onboarding: 6 };

export class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
export const bad = (msg) => new HttpError(400, msg);

/** Wrap async route handlers so errors reach the error middleware. */
export const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export function advanceStage(userId, toIndex) {
  q.run('UPDATE candidates SET stage_index = MAX(stage_index, ?), updated_at = ? WHERE user_id = ?', toIndex, now(), userId);
}
export function candidateRow(userId) {
  return q.get('SELECT c.*, u.name, u.email, u.phone, u.email_verified, u.created_at AS registered_at, u.is_demo FROM candidates c JOIN users u ON u.id = c.user_id WHERE c.user_id = ?', userId);
}
export function requireStage(userId, minIndex) {
  const c = candidateRow(userId);
  if (!c) throw new HttpError(404, 'Candidate profile not found.');
  if (c.stage_index < minIndex) throw new HttpError(409, 'Please complete the earlier verification steps first.');
  return c;
}
export function hasConsent(userId, purpose) {
  const r = q.get('SELECT granted, withdrawn_at FROM consents WHERE user_id = ? AND purpose = ? ORDER BY id DESC LIMIT 1', userId, purpose);
  return !!(r && r.granted && !r.withdrawn_at);
}
export function grantConsent(userId, purpose, granted = true) {
  const r = q.run('INSERT INTO consents (user_id, purpose, granted, version, created_at) VALUES (?,?,?,?,?)', userId, purpose, granted ? 1 : 0, 'v1', now());
  return r.lastInsertRowid;
}
export function needConsent(userId, purpose) {
  if (!hasConsent(userId, purpose)) throw new HttpError(428, `Consent required: ${purpose}`);
}
export const CONSENT_PURPOSES = {
  identity: 'Identity verification (Aadhaar OTP via mock provider, name/DOB match)',
  biometric: 'Face landmarks, liveness and face-embedding comparison across hiring stages',
  documents: 'Fetching documents and academic records (mock DigiLocker / APAAR)',
  monitoring: 'Assessment monitoring: tab, focus, fullscreen and copy/paste attempts (never clipboard contents)',
  camera_mic: 'Camera and microphone checks during assessment and interview',
  screen: 'Screen sharing during the interview',
  location: 'Precise device location at verification checkpoints (optional)',
  voice: 'Voice sample comparison during the interview (experimental)',
};
export { parse };
