import { Router } from 'express';
import QRCode from 'qrcode';
import { q, now, json, parse } from '../db.js';
import { config } from '../config.js';
import { requireAuth, audit, sha256, hmac, randomId, isValidAadhaar } from '../security.js';
import { ah, bad, HttpError, advanceStage, candidateRow, STAGE_INDEX, grantConsent, hasConsent } from '../helpers.js';
import { addSignal } from '../trust.js';
import { observeIp } from '../services/network.js';
import { validDescriptor, getAnchor, distance, classify, similarityPct, recordCheck } from '../services/face.js';
import { MOCK_AADHAAR_OTP } from '../providers/mockData.js';
import { upload, storeDocument } from './candidate.js';
import { providers } from '../providers/index.js';

const r = Router();

// ---------- tamper-evident offer records ----------
const canonical = (o) => JSON.stringify({ id: o.id, candidate_id: o.candidate_id, org_name: o.org_name, title: o.title, salary: o.salary, start_date: o.start_date, issued_at: o.issued_at, expires_at: o.expires_at });
const signOffer = (o) => hmac(config.offerSigningKey, canonical(o));
const verifyUrl = (o) => `${config.publicWebUrl}/verify/${o.id}?s=${o.signature.slice(0, 16)}`;

export function offerVerification(o, sigFragment) {
  if (!o) return { status: 'unknown', valid: false, message: 'No offer exists with this verification ID. Treat the letter as unverified and contact the employer directly.' };
  const hashOk = sha256(canonical(o)) === o.content_hash && signOffer(o) === o.signature;
  if (!hashOk) return { status: 'tampered', valid: false, message: 'The stored record failed its integrity check.' };
  if (sigFragment && !o.signature.startsWith(sigFragment)) return { status: 'tampered', valid: false, message: 'The signature on this letter does not match the issued offer — the letter may have been altered.' };
  if (o.status === 'revoked') return { status: 'revoked', valid: false, message: `This offer was revoked on ${o.revoked_at?.slice(0, 10)}.` };
  if (o.status !== 'accepted' && Date.parse(o.expires_at) < Date.now()) return { status: 'expired', valid: false, message: `This offer expired on ${o.expires_at.slice(0, 10)}.` };
  return { status: o.status, valid: true, message: o.status === 'accepted' ? 'Authentic offer — accepted by the candidate.' : 'Authentic offer issued through SecureHire.' };
}

// ---------- recruiter: issue / revoke ----------
r.post('/offers', requireAuth('recruiter', 'admin'), ah(async (req, res) => {
  const { candidateId, title, salary, startDate, expiresInDays = 14, overrideComment } = req.body || {};
  const c = candidateRow(Number(candidateId));
  if (!c) throw bad('Candidate not found.');
  if (!title) throw bad('Offer title is required.');
  if (c.stage_index < STAGE_INDEX.offer) throw new HttpError(409, 'The interview must be completed before an offer is released.');
  // Release gate: unresolved high-risk flags must be reviewed (or explicitly overridden with a reason, audit-logged).
  const unresolved = q.all("SELECT s.id, s.label, w.delta FROM trust_signals s JOIN signal_weights w ON w.signal_name = s.signal_name WHERE s.candidate_id = ? AND s.status = 'pending_review' AND w.delta <= -20", c.user_id);
  if (unresolved.length && !(overrideComment && overrideComment.trim().length >= 10))
    return res.status(409).json({ error: 'Unresolved high-risk flags must be reviewed before releasing an offer.', unresolved });
  const existing = q.get("SELECT id FROM offers WHERE candidate_id = ? AND status IN ('issued','accepted','held_for_review')", c.user_id);
  if (existing) throw new HttpError(409, `An active offer already exists (${existing.id}). Revoke it first.`);
  const o = { id: randomId('OFR-', 5), candidate_id: c.user_id, org_name: q.get('SELECT name FROM organizations ORDER BY id LIMIT 1')?.name || 'SecureHire Demo Org', title, salary: salary || null, start_date: startDate || null, issued_at: now(), expires_at: new Date(Date.now() + Number(expiresInDays) * 86400_000).toISOString() };
  o.content_hash = sha256(canonical(o)); o.signature = signOffer(o);
  q.run('INSERT INTO offers (id, candidate_id, org_name, title, salary, start_date, issued_by, issued_at, expires_at, status, content_hash, signature) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
    o.id, o.candidate_id, o.org_name, o.title, o.salary, o.start_date, req.user.id, o.issued_at, o.expires_at, 'issued', o.content_hash, o.signature);
  audit(req, unresolved.length ? 'offer.issue_override' : 'offer.issue', `user:${c.user_id}`, { offerId: o.id, overrideComment: overrideComment || null, unresolved: unresolved.map(u => u.id) });
  res.status(201).json({ ...o, status: 'issued', verifyUrl: verifyUrl(o) });
}));

r.post('/offers/:id/revoke', requireAuth('recruiter', 'admin'), ah(async (req, res) => {
  const o = q.get('SELECT * FROM offers WHERE id = ?', req.params.id);
  if (!o) throw new HttpError(404, 'Offer not found.');
  q.run("UPDATE offers SET status = 'revoked', revoked_at = ? WHERE id = ?", now(), o.id);
  audit(req, 'offer.revoke', `user:${o.candidate_id}`, { offerId: o.id, reason: req.body?.reason || null });
  res.json({ ok: true });
}));

// ---------- public verification (QR target) ----------
r.get('/public/offers/:id', ah(async (req, res) => {
  const o = q.get('SELECT * FROM offers WHERE id = ?', String(req.params.id).toUpperCase());
  const v = offerVerification(o, req.query.s ? String(req.query.s) : null);
  const c = o ? q.get('SELECT name FROM users WHERE id = ?', o.candidate_id) : null;
  res.json({ verification: v, offer: o && v.status !== 'unknown' ? { id: o.id, org: o.org_name, title: o.title, candidate: c?.name?.replace(/(\w)\w+$/, '$1.'), issuedAt: o.issued_at, expiresAt: o.expires_at, status: o.status } : null });
}));

// ---------- candidate ----------
r.get('/me/offer', requireAuth('candidate'), ah(async (req, res) => {
  const o = q.get('SELECT * FROM offers WHERE candidate_id = ? ORDER BY issued_at DESC LIMIT 1', req.user.id);
  if (!o) return res.json({ offer: null });
  const url = verifyUrl(o);
  res.json({ offer: { id: o.id, org: o.org_name, title: o.title, salary: o.salary, startDate: o.start_date, issuedAt: o.issued_at, expiresAt: o.expires_at, status: o.status, contentHash: o.content_hash, verifyUrl: url, qr: await QRCode.toDataURL(url, { margin: 1, width: 220 }) }, verification: offerVerification(o) });
}));

r.post('/me/offer/:id/accept', requireAuth('candidate'), ah(async (req, res) => {
  const o = q.get('SELECT * FROM offers WHERE id = ? AND candidate_id = ?', req.params.id, req.user.id);
  if (!o) throw new HttpError(404, 'Offer not found.');
  const v = offerVerification(o);
  if (!v.valid || o.status !== 'issued') throw new HttpError(409, v.message || 'This offer cannot be accepted.');
  const { descriptor, faces, aadhaar, aadhaarOtp, livenessPassed } = req.body || {};
  // 1) mock Aadhaar re-verification: same identity HMAC as at application
  const n = String(aadhaar || '').replace(/\s|-/g, '');
  const identity = q.get('SELECT aadhaar_hmac FROM identities WHERE user_id = ?', req.user.id);
  if (!isValidAadhaar(n) || String(aadhaarOtp) !== MOCK_AADHAAR_OTP) throw bad('Aadhaar re-verification failed (MOCK: use your registered number and OTP 123456).');
  const sameIdentity = identity && hmac(config.aadhaarHmacKey, n) === identity.aadhaar_hmac;
  // 2) fresh face vs anchor
  const anchor = getAnchor(req.user.id);
  if (!anchor) throw new HttpError(409, 'No identity anchor on file.');
  if (faces !== 1 || !validDescriptor(descriptor)) throw bad('Exactly one face must be visible for the identity check.');
  if (!livenessPassed) throw bad('Please complete the liveness challenge.');
  const d = distance(descriptor, anchor.descriptor);
  const cls = classify(d);
  recordCheck(req.user.id, 'offer', { distance: d, faces, result: cls, sessionRef: o.id });
  // 3) cross-stage: compare with assessment & interview face history
  const history = q.all("SELECT stage, AVG(distance) AS avg, COUNT(*) AS n FROM face_checks WHERE user_id = ? AND distance IS NOT NULL AND stage IN ('identity','assessment','interview') GROUP BY stage", req.user.id);
  // 4) contact consistency
  const c = candidateRow(req.user.id);
  const contactChanges = [];
  if (c.applied_email && c.applied_email.toLowerCase() !== c.email.toLowerCase()) contactChanges.push('email');
  if ((c.applied_phone || null) !== (c.phone || null)) contactChanges.push('phone');
  await observeIp(req, req.user.id, 'offer', o.id);
  const acceptance = { at: now(), face: { distance: +d.toFixed(3), similarity: similarityPct(d), result: cls }, sameIdentity, crossStage: history, contactChanges, explanation: req.body?.contactExplanation || null };
  if (contactChanges.length) addSignal(req.user.id, 'contact_change', { sessionRef: o.id, source: 'offer-verification', evidence: { changed: contactChanges, explanation: acceptance.explanation } });
  if (cls === 'match' && sameIdentity) {
    q.run("UPDATE offers SET status = 'accepted', accepted_at = ?, acceptance = ? WHERE id = ?", now(), json(acceptance), o.id);
    addSignal(req.user.id, 'offer_identity_consistent', { source: 'offer-verification', evidence: acceptance });
    advanceStage(req.user.id, STAGE_INDEX.onboarding);
    q.run(`INSERT INTO onboarding (candidate_id, status, checklist, updated_at) VALUES (?, 'in_progress', ?, ?) ON CONFLICT(candidate_id) DO NOTHING`,
      req.user.id, json({ identity: false, documents: [], digilocker: false }), now());
    return res.json({ accepted: true, acceptance });
  }
  q.run("UPDATE offers SET status = 'held_for_review', acceptance = ? WHERE id = ?", json(acceptance), o.id);
  addSignal(req.user.id, 'identity_substitution', { sessionRef: o.id, source: 'offer-verification', evidence: { ...acceptance, note: 'Acceptance held for human review — the candidate is not rejected.' } });
  res.status(202).json({ accepted: false, heldForReview: true, message: 'We could not confirm your identity automatically. A recruiter will review and contact you — nothing has been rejected.' });
}));

// recruiter resolves a held offer after review
r.post('/offers/:id/release-hold', requireAuth('recruiter', 'admin'), ah(async (req, res) => {
  const o = q.get('SELECT * FROM offers WHERE id = ?', req.params.id);
  if (!o || o.status !== 'held_for_review') throw new HttpError(409, 'Offer is not held for review.');
  const { decision, comment } = req.body || {};
  if (!comment || comment.length < 5) throw bad('A review comment is required.');
  if (decision === 'accept') {
    q.run("UPDATE offers SET status = 'accepted', accepted_at = ? WHERE id = ?", now(), o.id);
    advanceStage(o.candidate_id, STAGE_INDEX.onboarding);
    q.run(`INSERT INTO onboarding (candidate_id, status, checklist, updated_at) VALUES (?, 'in_progress', ?, ?) ON CONFLICT(candidate_id) DO NOTHING`, o.candidate_id, json({ identity: false, documents: [], digilocker: false }), now());
  } else q.run("UPDATE offers SET status = 'issued' WHERE id = ?", o.id); // candidate may retry acceptance
  audit(req, 'offer.hold_resolved', `user:${o.candidate_id}`, { offerId: o.id, decision, comment });
  res.json({ ok: true });
}));

// ------------------------------------------------------------------ Stage 7: Onboarding
r.get('/me/onboarding', requireAuth('candidate'), ah(async (req, res) => {
  const ob = q.get('SELECT * FROM onboarding WHERE candidate_id = ?', req.user.id);
  const docs = q.all("SELECT id, kind, filename, status, verification, created_at FROM documents WHERE user_id = ? AND kind LIKE 'joining_%'", req.user.id).map(d => ({ ...d, verification: parse(d.verification) }));
  res.json({ onboarding: ob ? { ...ob, checklist: parse(ob.checklist, {}) } : null, documents: docs, required: ['joining_pan', 'joining_degree', 'joining_address'] });
}));

r.post('/me/onboarding/document', requireAuth('candidate'), upload.single('file'), ah(async (req, res) => {
  const ob = q.get('SELECT * FROM onboarding WHERE candidate_id = ?', req.user.id);
  if (!ob) throw new HttpError(409, 'Onboarding starts after you accept an offer.');
  const kind = String(req.body?.kind || '');
  if (!['joining_pan', 'joining_degree', 'joining_address'].includes(kind)) throw bad('Unknown document type.');
  if (!req.file) throw bad('Choose a file.');
  if (!/pdf|image\//.test(req.file.mimetype)) throw bad('Upload a PDF or image.');
  q.run("DELETE FROM documents WHERE user_id = ? AND kind = ?", req.user.id, kind);
  const id = storeDocument(req.user.id, kind, req.file, 365);
  res.status(201).json({ id });
}));

r.post('/me/onboarding/digilocker', requireAuth('candidate'), ah(async (req, res) => {
  const ob = q.get('SELECT * FROM onboarding WHERE candidate_id = ?', req.user.id);
  if (!ob) throw new HttpError(409, 'Onboarding has not started.');
  grantConsent(req.user.id, 'documents');
  const c = candidateRow(req.user.id);
  const idRow = q.get('SELECT record_name, record_dob FROM identities WHERE user_id = ?', req.user.id);
  const out = await providers.digilocker.fetchDocuments({ name: c.name, dob: c.dob, recordName: idRow?.record_name, recordDob: idRow?.record_dob });
  const earlier = q.get("SELECT 1 FROM trust_signals WHERE candidate_id = ? AND signal_name = 'digilocker_verified' AND status = 'verified'", req.user.id);
  for (const kind of ['joining_pan', 'joining_degree', 'joining_address'])
    q.run('UPDATE documents SET status = ?, verification = ? WHERE user_id = ? AND kind = ?', out.outcome === 'success' ? 'verified' : 'needs_review', json({ provider: 'MOCK DigiLocker', outcome: out.outcome, consistentWithEarlier: !!earlier }), req.user.id, kind);
  const cl = parse(ob.checklist, {}); cl.digilocker = out.outcome === 'success';
  q.run('UPDATE onboarding SET checklist = ?, updated_at = ? WHERE candidate_id = ?', json(cl), now(), req.user.id);
  const uploaded = q.get("SELECT COUNT(*) AS n FROM documents WHERE user_id = ? AND kind LIKE 'joining_%'", req.user.id).n;
  if (out.outcome === 'success' && uploaded >= 3) addSignal(req.user.id, 'onboarding_documents_verified', { source: 'mock-digilocker', evidence: { documents: uploaded, consistentWithEarlier: !!earlier } });
  res.json(out);
}));

r.post('/me/onboarding/verify-face', requireAuth('candidate'), ah(async (req, res) => {
  const ob = q.get('SELECT * FROM onboarding WHERE candidate_id = ?', req.user.id);
  if (!ob) throw new HttpError(409, 'Onboarding has not started.');
  const { descriptor, faces, livenessPassed } = req.body || {};
  const anchor = getAnchor(req.user.id);
  if (faces !== 1 || !validDescriptor(descriptor)) throw bad('Exactly one face must be visible.');
  if (!livenessPassed) throw bad('Please complete the liveness challenge.');
  const d = distance(descriptor, anchor.descriptor);
  const cls = classify(d);
  recordCheck(req.user.id, 'onboarding', { distance: d, faces, result: cls, sessionRef: 'day-one' });
  const offerFace = q.get("SELECT distance FROM face_checks WHERE user_id = ? AND stage = 'offer' ORDER BY id DESC LIMIT 1", req.user.id);
  await observeIp(req, req.user.id, 'onboarding');
  const evidence = { distance: +d.toFixed(3), similarity: similarityPct(d), offerStageDistance: offerFace?.distance ?? null, reference: 'Identity anchor (enrolled at Stage 2)' };
  const cl = parse(ob.checklist, {});
  if (cls === 'match') {
    cl.identity = true;
    q.run("UPDATE onboarding SET checklist = ?, updated_at = ? WHERE candidate_id = ?", json(cl), now(), req.user.id);
    addSignal(req.user.id, 'onboarding_verified', { source: 'onboarding', evidence });
    return res.json({ result: 'match', ...evidence });
  }
  q.run("UPDATE onboarding SET status = 'paused_for_review', updated_at = ? WHERE candidate_id = ?", now(), req.user.id);
  addSignal(req.user.id, 'onboarding_identity_inconsistent', { source: 'onboarding', evidence: { ...evidence, result: cls } });
  res.status(202).json({ result: cls, message: 'Onboarding is paused until a recruiter reviews the identity check. You have not been rejected.' });
}));

r.post('/onboarding/:candidateId/approve', requireAuth('recruiter', 'admin'), ah(async (req, res) => {
  const ob = q.get('SELECT * FROM onboarding WHERE candidate_id = ?', req.params.candidateId);
  if (!ob) throw new HttpError(404, 'No onboarding record.');
  const pending = q.get("SELECT COUNT(*) AS n FROM trust_signals WHERE candidate_id = ? AND status = 'pending_review'", req.params.candidateId).n;
  if (pending && !(req.body?.comment && req.body.comment.length >= 10)) return res.status(409).json({ error: `${pending} review item(s) are still open. Resolve them or add an approval comment.` });
  q.run("UPDATE onboarding SET status = 'completed', joined_at = ?, approved_by = ?, updated_at = ? WHERE candidate_id = ?", now(), req.user.id, now(), req.params.candidateId);
  q.run('UPDATE candidates SET stage_index = 7, updated_at = ? WHERE user_id = ?', now(), req.params.candidateId);
  audit(req, 'onboarding.approve', `user:${req.params.candidateId}`, { comment: req.body?.comment || null });
  res.json({ ok: true });
}));

export default r;
