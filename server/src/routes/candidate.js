import { Router } from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { q, now, json, parse, getSetting } from '../db.js';
import { config } from '../config.js';
import { requireAuth, audit, sha256, hmac, maskAadhaar, isValidAadhaar, encryptBuffer, maskIp, clientIp } from '../security.js';
import { ah, bad, HttpError, advanceStage, candidateRow, requireStage, grantConsent, hasConsent, needConsent, CONSENT_PURPOSES, STAGE_INDEX } from '../helpers.js';
import { addSignal, computeScores, signalsFor, STAGES } from '../trust.js';
import { providers } from '../providers/index.js';
import { issueEmailOtp } from './auth.js';
import { observeIp, recordLocation, reverseGeocode, geoForIp } from '../services/network.js';
import { validDescriptor, storeAnchor, findDuplicates, distance, classify, similarityPct, getAnchor, recordCheck, MODEL_NAME } from '../services/face.js';
import { extractText } from '../services/resumeParser.js';
import { analyzeResume, latestResumeReport } from '../services/resumeVerify.js';
import { evaluateFaceCheck } from '../services/continuity.js';

const r = Router();
r.use(requireAuth('candidate'));
export const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

export function storeDocument(userId, kind, file, retentionDays = 365) {
  const stored = `${crypto.randomUUID()}.bin`;
  fs.writeFileSync(path.join(config.uploadDir, stored), encryptBuffer(file.buffer));
  const res = q.run('INSERT INTO documents (user_id, kind, filename, stored_name, mime, size, created_at, retention_until) VALUES (?,?,?,?,?,?,?,?)',
    userId, kind, file.originalname.slice(0, 120), stored, file.mimetype, file.size, now(), new Date(Date.now() + retentionDays * 86400_000).toISOString());
  return res.lastInsertRowid;
}

// ------------------------------------------------------------------ overview
r.get('/overview', ah(async (req, res) => {
  const c = candidateRow(req.user.id);
  const scores = computeScores(req.user.id);
  const identity = q.get('SELECT aadhaar_masked, provider, record_name, verified_at FROM identities WHERE user_id = ?', req.user.id);
  const anchor = q.get('SELECT created_at, retention_until, liveness, id_photo_descriptor_enc IS NOT NULL AS has_id_photo FROM face_anchors WHERE user_id = ?', req.user.id);
  const consents = Object.keys(CONSENT_PURPOSES).map(p => ({ purpose: p, description: CONSENT_PURPOSES[p], granted: hasConsent(req.user.id, p) }));
  res.json({
    profile: { id: c.user_id, name: c.name, email: c.email, phone: c.phone, emailVerified: !!c.email_verified, stageIndex: c.stage_index, stage: STAGES[Math.min(c.stage_index, 6)], holdReason: c.hold_reason, appliedAt: c.applied_at, isDemo: !!c.is_demo },
    job: q.get('SELECT id, title, location FROM jobs WHERE id = ?', c.job_id),
    scores, identity, anchor: anchor ? { ...anchor, liveness: parse(anchor.liveness) } : null,
    signals: signalsFor(req.user.id).map(s => ({ ...s, evidence: s.status === 'contextual' ? s.evidence : s.evidence })),
    consents,
    ipObservations: q.all('SELECT stage, ip_masked, city, region, country, geo_source, changed, created_at FROM ip_observations WHERE user_id = ? ORDER BY id DESC LIMIT 20', req.user.id),
    locations: q.all('SELECT stage, source, lat, lng, accuracy, place, created_at FROM location_events WHERE user_id = ? ORDER BY id DESC LIMIT 20', req.user.id).map(l => ({ ...l, place: parse(l.place) })),
    appeals: q.all('SELECT * FROM appeals WHERE candidate_id = ? ORDER BY id DESC', req.user.id),
    interview: q.get("SELECT id, scheduled_at, status, room_id FROM interviews WHERE candidate_id = ? ORDER BY id DESC LIMIT 1", req.user.id),
    offer: q.get('SELECT id, title, org_name, status, issued_at, expires_at FROM offers WHERE candidate_id = ? ORDER BY issued_at DESC LIMIT 1', req.user.id),
    onboarding: q.get('SELECT status, joined_at FROM onboarding WHERE candidate_id = ?', req.user.id),
    assessment: q.get('SELECT id, status, score, max_score, started_at, ended_at FROM assessment_sessions WHERE user_id = ? ORDER BY started_at DESC LIMIT 1', req.user.id),
    demoMode: config.demoMode,
  });
}));

// ------------------------------------------------------------------ consents
r.post('/consents', ah(async (req, res) => {
  const { purpose, granted } = req.body || {};
  if (!CONSENT_PURPOSES[purpose]) throw bad('Unknown consent purpose.');
  if (granted) grantConsent(req.user.id, purpose, true);
  else q.run('UPDATE consents SET withdrawn_at = ? WHERE user_id = ? AND purpose = ? AND withdrawn_at IS NULL', now(), req.user.id, purpose);
  audit(req, granted ? 'consent.grant' : 'consent.withdraw', `user:${req.user.id}`, { purpose });
  res.json({ purpose, granted: hasConsent(req.user.id, purpose) });
}));

// ------------------------------------------------------------------ Stage 1: Apply
r.post('/apply/email/send', ah(async (req, res) => {
  const u = q.get('SELECT * FROM users WHERE id = ?', req.user.id);
  if (u.email_verified) return res.json({ alreadyVerified: true });
  const last = q.get('SELECT sent_at FROM email_otps WHERE user_id = ?', u.id);
  if (last && Date.now() - Date.parse(last.sent_at) < 30_000) throw new HttpError(429, 'Please wait 30 seconds before requesting another code.');
  const code = issueEmailOtp(u);
  res.json({ sent: true, devOtp: config.demoMode ? code : undefined });
}));

r.post('/apply/email/verify', ah(async (req, res) => {
  const { code } = req.body || {};
  const row = q.get('SELECT * FROM email_otps WHERE user_id = ?', req.user.id);
  if (!row) throw bad('Request a verification code first.');
  if (row.attempts >= 5) throw new HttpError(429, 'Too many attempts. Request a new code.');
  if (Date.parse(row.expires_at) < Date.now()) throw bad('This code has expired. Request a new one.');
  if (sha256(`${req.user.id}:${String(code).trim()}`) !== row.code_hash) {
    q.run('UPDATE email_otps SET attempts = attempts + 1 WHERE user_id = ?', req.user.id);
    throw bad('That code is not correct.');
  }
  q.run('DELETE FROM email_otps WHERE user_id = ?', req.user.id);
  q.run('UPDATE users SET email_verified = 1 WHERE id = ?', req.user.id);
  addSignal(req.user.id, 'email_verified', { source: 'email_otp', evidence: { method: '6-digit OTP', verifiedAt: now() } });
  await observeIp(req, req.user.id, 'apply');
  maybeCompleteApply(req.user.id);
  res.json({ verified: true });
}));

function maybeCompleteApply(userId) {
  const u = q.get('SELECT email_verified FROM users WHERE id = ?', userId);
  const id = q.get('SELECT 1 FROM identities WHERE user_id = ?', userId);
  if (u.email_verified && id) advanceStage(userId, STAGE_INDEX.identity);
}

r.post('/apply/aadhaar/request', ah(async (req, res) => {
  const { aadhaar, consent } = req.body || {};
  if (consent) grantConsent(req.user.id, 'identity');
  needConsent(req.user.id, 'identity');
  const n = String(aadhaar || '').replace(/\s|-/g, '');
  if (!isValidAadhaar(n)) throw bad('Enter a valid 12-digit Aadhaar number (checksum failed).');
  const digest = hmac(config.aadhaarHmacKey, n);
  const existing = q.get('SELECT user_id FROM identities WHERE aadhaar_hmac = ?', digest);
  if (existing && existing.user_id !== req.user.id) {
    // One Aadhaar ↔ one account. Block, explain, and flag for human review (never auto-reject).
    const other = q.get('SELECT email FROM users WHERE id = ?', existing.user_id);
    addSignal(req.user.id, 'duplicate_identity', {
      source: 'identity_uniqueness', evidence: { aadhaarMasked: maskAadhaar(n), existingAccount: `#${existing.user_id} (${other.email.replace(/^(.).*(@.*)$/, '$1***$2')})`, note: 'Same identity already registered. Could be a duplicate account or a legitimate email change — use account recovery.' },
    });
    q.run('UPDATE candidates SET hold_reason = ? WHERE user_id = ?', 'This identity is already registered with another account.', req.user.id);
    audit(req, 'identity.duplicate_blocked', `user:${req.user.id}`, { existingUserId: existing.user_id });
    throw new HttpError(409, 'This identity is already registered — please recover your existing account. A recruiter has been notified to help.');
  }
  const out = await providers.aadhaar.requestOtp(n);
  if (out.outcome !== 'success') return res.status(out.outcome === 'failure' ? 400 : 202).json({ outcome: out.outcome, message: out.message, simulated: true });
  q.run(`INSERT INTO pending_aadhaar (user_id, aadhaar_hmac, aadhaar_masked, txn_id, expires_at) VALUES (?,?,?,?,?)
         ON CONFLICT(user_id) DO UPDATE SET aadhaar_hmac=excluded.aadhaar_hmac, aadhaar_masked=excluded.aadhaar_masked, txn_id=excluded.txn_id, expires_at=excluded.expires_at`,
    req.user.id, digest, maskAadhaar(n), out.data.txnId, new Date(Date.now() + 10 * 60 * 1000).toISOString());
  // keep the plaintext only in this request's memory to complete the mock OTP step
  pendingPlain.set(req.user.id, { n, at: Date.now() });
  res.json({ outcome: 'success', txnId: out.data.txnId, mobileHint: out.data.mobileHint, simulated: true, devOtp: config.demoMode ? '123456' : undefined });
}));
const pendingPlain = new Map(); // userId -> { n } (in-memory only, 10 min)
setInterval(() => { for (const [k, v] of pendingPlain) if (Date.now() - v.at > 600_000) pendingPlain.delete(k); }, 60_000).unref();

r.post('/apply/aadhaar/verify', ah(async (req, res) => {
  const { otp } = req.body || {};
  const pend = q.get('SELECT * FROM pending_aadhaar WHERE user_id = ?', req.user.id);
  const plain = pendingPlain.get(req.user.id);
  if (!pend || !plain || Date.parse(pend.expires_at) < Date.now()) throw bad('Your verification session expired. Enter your Aadhaar number again.');
  const out = await providers.aadhaar.verifyOtp(plain.n, otp);
  if (out.outcome !== 'success') throw bad(out.message || 'Verification failed.');
  pendingPlain.delete(req.user.id);
  q.run('DELETE FROM pending_aadhaar WHERE user_id = ?', req.user.id);
  q.run(`INSERT INTO identities (user_id, aadhaar_hmac, aadhaar_masked, provider, record_name, record_dob, verified_at) VALUES (?,?,?,?,?,?,?)
         ON CONFLICT(user_id) DO UPDATE SET aadhaar_hmac=excluded.aadhaar_hmac, aadhaar_masked=excluded.aadhaar_masked, verified_at=excluded.verified_at, record_name=excluded.record_name, record_dob=excluded.record_dob`,
    req.user.id, pend.aadhaar_hmac, pend.aadhaar_masked, out.provider, out.data?.name ?? null, out.data?.dob ?? null, now());
  addSignal(req.user.id, 'aadhaar_verified', { source: 'mock-aadhaar', evidence: { aadhaarMasked: pend.aadhaar_masked, provider: 'MOCK — not real UIDAI verification' } });
  const c = candidateRow(req.user.id);
  if (out.data?.name && out.data.name.toLowerCase() !== c.name.toLowerCase())
    addSignal(req.user.id, 'identity_data_mismatch', { source: 'mock-aadhaar', evidence: { profileName: c.name, recordName: out.data.name } });
  q.run('UPDATE candidates SET hold_reason = NULL, dob = COALESCE(dob, ?) WHERE user_id = ?', out.data?.dob ?? null, req.user.id);
  await observeIp(req, req.user.id, 'apply');
  maybeCompleteApply(req.user.id);
  res.json({ verified: true, aadhaarMasked: pend.aadhaar_masked, simulated: true });
}));

// ------------------------------------------------------------------ Stage 2: Identity
r.post('/identity/enroll', ah(async (req, res) => {
  requireStage(req.user.id, STAGE_INDEX.identity);
  const { descriptor, idPhotoDescriptor, liveness, faces, consent } = req.body || {};
  if (consent) grantConsent(req.user.id, 'biometric');
  needConsent(req.user.id, 'biometric');
  if (!validDescriptor(descriptor)) throw bad('Face descriptor missing or invalid. Please retry the capture.');
  if (faces !== 1) throw bad('Exactly one face must be visible.');
  if (!liveness?.passed) {
    addSignal(req.user.id, 'liveness_failed', { source: 'mediapipe-liveness', evidence: { challenges: liveness?.challenges, note: 'Retry allowed. Basic liveness — not certified anti-spoofing.' } });
    throw bad('Liveness challenge not completed — please try again.');
  }
  const consentRow = q.get("SELECT id FROM consents WHERE user_id = ? AND purpose = 'biometric' ORDER BY id DESC LIMIT 1", req.user.id);
  storeAnchor(req.user.id, descriptor, { idPhotoDescriptor: validDescriptor(idPhotoDescriptor) ? idPhotoDescriptor : null, liveness, consentId: consentRow?.id });
  addSignal(req.user.id, 'liveness_passed', { source: 'mediapipe-liveness', evidence: { challenges: liveness.challenges, durationMs: liveness.durationMs, model: 'MediaPipe Face Landmarker (478 landmarks + blendshapes)', note: 'Basic liveness — not certified presentation-attack detection.' } });
  const result = { anchor: true, model: MODEL_NAME };
  if (validDescriptor(idPhotoDescriptor)) {
    const d = distance(descriptor, idPhotoDescriptor);
    const cls = classify(d);
    result.idMatch = { distance: +d.toFixed(3), similarity: similarityPct(d), result: cls };
    recordCheck(req.user.id, 'identity', { distance: d, faces, result: cls, sessionRef: 'id-photo' });
    if (cls === 'match') addSignal(req.user.id, 'face_match', { source: 'face-api', evidence: { distance: +d.toFixed(3), similarity: similarityPct(d), reference: 'Uploaded ID photo (descriptor only, image not stored)' } });
    else addSignal(req.user.id, 'face_mismatch', { source: 'face-api', evidence: { distance: +d.toFixed(3), similarity: similarityPct(d), result: cls, note: cls === 'uncertain' ? 'Borderline similarity — lighting or photo age can cause this.' : 'Low similarity to ID photo.' } });
  }
  const dups = findDuplicates(req.user.id, descriptor);
  if (dups.length) addSignal(req.user.id, 'possible_duplicate_face', { source: 'face-api', evidence: { matches: dups.slice(0, 3).map(d => ({ candidateId: d.userId, distance: d.distance })), note: 'Similar faces occur (e.g. twins). Human review required.' } });
  result.duplicates = dups.length;
  await observeIp(req, req.user.id, 'identity');
  advanceStage(req.user.id, STAGE_INDEX.resume);
  audit(req, 'identity.anchor_enrolled', `user:${req.user.id}`);
  res.json(result);
}));

r.post('/identity/liveness-failed', ah(async (req, res) => {
  addSignal(req.user.id, 'liveness_failed', { source: 'mediapipe-liveness', evidence: req.body?.evidence || {} });
  res.json({ recorded: true });
}));

r.post('/identity/digilocker', ah(async (req, res) => {
  if (req.body?.consent) grantConsent(req.user.id, 'documents');
  needConsent(req.user.id, 'documents');
  const c = candidateRow(req.user.id);
  const idRow = q.get('SELECT record_name, record_dob FROM identities WHERE user_id = ?', req.user.id);
  const out = await providers.digilocker.fetchDocuments({ name: c.name, dob: c.dob, recordName: idRow?.record_name, recordDob: idRow?.record_dob, apaarId: req.body?.apaarId });
  if (out.outcome === 'success') addSignal(req.user.id, 'digilocker_verified', { source: 'mock-digilocker', evidence: { documents: out.data.documents.map(d => d.type), provider: 'MOCK DigiLocker' } });
  else if (out.outcome === 'mismatch') addSignal(req.user.id, 'identity_data_mismatch', { source: 'mock-digilocker', label: 'Name on DigiLocker documents differs from profile', evidence: { message: out.message } });
  res.json(out);
}));

// ------------------------------------------------------------------ Continuity face checks (any later stage)
r.post('/face/verify', ah(async (req, res) => {
  const { descriptor, faces, stage, sessionRef } = req.body || {};
  if (!['assessment', 'interview', 'offer', 'onboarding', 'identity'].includes(stage)) throw bad('Unknown stage.');
  const anchor = getAnchor(req.user.id);
  if (!anchor) throw new HttpError(409, 'No identity anchor enrolled yet.');
  if (!faces) {
    recordCheck(req.user.id, stage, { faces: 0, result: 'no_face', sessionRef });
    evaluateFaceCheck(req.user.id, stage, sessionRef, 'no_face', null);
    return res.json({ result: 'no_face' });
  }
  if (faces === 1 && !validDescriptor(descriptor)) throw bad('Invalid descriptor.');
  const d = validDescriptor(descriptor) ? distance(descriptor, anchor.descriptor) : null;
  const cls = faces > 1 ? 'multiple_faces' : classify(d);
  const id = recordCheck(req.user.id, stage, { distance: d, faces, result: cls, sessionRef });
  const flagged = evaluateFaceCheck(req.user.id, stage, sessionRef, cls, d);
  res.json({ checkId: id, result: cls, distance: d != null ? +d.toFixed(3) : null, similarity: d != null ? similarityPct(d) : null, flagged: !!(flagged && !flagged.duplicate) });
}));

// ------------------------------------------------------------------ Stage 3: Resume
r.post('/resume', upload.single('file'), ah(async (req, res) => {
  requireStage(req.user.id, STAGE_INDEX.resume);
  if (!req.file) throw bad('Choose a PDF or DOCX file to upload.');
  const apaarId = (req.body?.apaarId || '').replace(/\s/g, '') || null;
  if (req.body?.consent === 'true' || req.body?.consent === true) grantConsent(req.user.id, 'documents');
  if (apaarId) needConsent(req.user.id, 'documents');
  const text = await extractText(req.file.buffer, req.file.originalname, req.file.mimetype);
  if (!text || text.trim().length < 40) throw bad('Could not read text from this file. If it is a scanned image, upload a text-based PDF or DOCX.');
  const documentId = storeDocument(req.user.id, 'resume', req.file);
  const user = q.get('SELECT id, name, email FROM users WHERE id = ?', req.user.id);
  const out = await analyzeResume({ user, text, documentId, apaarId });
  await observeIp(req, req.user.id, 'resume');
  advanceStage(req.user.id, STAGE_INDEX.assessment);
  res.json(latestResumeReport(req.user.id));
}));
r.get('/resume', ah(async (req, res) => res.json(latestResumeReport(req.user.id))));

// ------------------------------------------------------------------ Location & network
r.post('/location', ah(async (req, res) => {
  const { stage, lat, lng, accuracy, sessionRef } = req.body || {};
  if (!STAGES.includes(stage)) throw bad('Unknown stage.');
  if (typeof lat !== 'number' || typeof lng !== 'number' || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw bad('Invalid coordinates.');
  needConsent(req.user.id, 'location');
  const place = await reverseGeocode(lat, lng);
  await recordLocation(req.user.id, stage, { lat, lng, accuracy, source: 'device', sessionRef, place });
  res.json({ place });
}));
r.post('/location/denied', ah(async (req, res) => {
  // Declining location is never a negative signal; we just note the source used instead.
  res.json({ ok: true, note: 'Location declined — approximate IP region will be shown instead. This does not affect your score.' });
}));
r.get('/geo/ip', ah(async (req, res) => {
  const geo = await geoForIp(clientIp(req));
  res.json({ ipMasked: maskIp(clientIp(req)), ...geo });
}));
r.get('/geo/reverse', ah(async (req, res) => {
  const lat = Number(req.query.lat), lng = Number(req.query.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw bad('lat/lng required');
  res.json({ place: await reverseGeocode(lat, lng) });
}));

// ------------------------------------------------------------------ Profile & appeals
r.patch('/profile', ah(async (req, res) => {
  const { phone, explanation } = req.body || {};
  if (phone && !/^\+?[\d\s-]{8,16}$/.test(phone)) throw bad('Enter a valid phone number.');
  const before = q.get('SELECT phone FROM users WHERE id = ?', req.user.id);
  q.run('UPDATE users SET phone = ? WHERE id = ?', phone || null, req.user.id);
  audit(req, 'profile.update', `user:${req.user.id}`, { phoneChanged: before.phone !== phone, explanation: explanation || null });
  res.json({ ok: true });
}));

r.post('/appeals', ah(async (req, res) => {
  const { signalId, message } = req.body || {};
  if (!message || message.trim().length < 5) throw bad('Please describe the correction or explanation.');
  if (signalId && !q.get('SELECT 1 FROM trust_signals WHERE id = ? AND candidate_id = ?', signalId, req.user.id)) throw bad('Unknown signal.');
  const a = q.run('INSERT INTO appeals (candidate_id, signal_id, message, status, created_at) VALUES (?,?,?,?,?)', req.user.id, signalId || null, message.trim().slice(0, 2000), 'open', now());
  audit(req, 'appeal.create', `user:${req.user.id}`, { appealId: a.lastInsertRowid });
  res.status(201).json({ id: a.lastInsertRowid });
}));

export default r;
