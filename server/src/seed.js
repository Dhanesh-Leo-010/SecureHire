/**
 * Synthetic demo data (clearly labelled). Run `npm run seed` to reset the database to this state.
 * Face/voice vectors for seeded people are random synthetic vectors — they are not anyone's biometrics.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'node:url';
import { db, q, json } from './db.js';
import { config, ROOT } from './config.js';
import { hmac, encrypt, sha256, randomId, maskAadhaar } from './security.js';
import { addSignal, rebuildHistory, ensureWeights } from './trust.js';
import { DEMO_AADHAAR } from './providers/mockData.js';
import { analyzeResume } from './services/resumeVerify.js';
import { initDefaults } from './app.js';

const PASSWORD = 'Demo@1234';
const DAY = 86400_000;
const t = (daysAgo, h = 10, m = 0) => { const d = new Date(Date.now() - daysAgo * DAY); d.setHours(h, m, 0, 0); return d.toISOString(); };
const SAMPLE_DIR = path.resolve(ROOT, '..', 'docs', 'sample-resumes');

function randomDescriptor(seed) {
  const rng = crypto.createHash('sha256').update(String(seed)).digest();
  const out = []; for (let i = 0; i < 128; i++) out.push(((rng[i % 32] ^ (i * 37)) % 200 - 100) / 400);
  return out;
}

export async function seedDemo() {
  ensureWeights(); initDefaults();
  const hash = await bcrypt.hash(PASSWORD, 10);
  const org = q.run('INSERT INTO organizations (name, created_at) VALUES (?, ?)', 'Northwind Labs (Demo Org)', t(30)).lastInsertRowid;
  const user = (email, name, role, phone, at) => q.run('INSERT INTO users (org_id, email, password_hash, role, name, phone, email_verified, is_demo, created_at) VALUES (?,?,?,?,?,?,?,1,?)',
    role === 'candidate' ? null : org, email, hash, role, name, phone || null, role === 'candidate' ? 0 : 1, at).lastInsertRowid;

  const admin = user('admin@securehire.dev', 'Asha Menon', 'admin', null, t(30));
  const rec = user('recruiter@securehire.dev', 'Dev Malhotra', 'recruiter', null, t(30));
  const job = q.run('INSERT INTO jobs (org_id, title, location, description, hiring_type, created_by, created_at) VALUES (?,?,?,?,?,?,?)',
    org, 'Software Engineer — Platform', 'Remote · India', 'Build trustworthy hiring infrastructure.', 'remote', rec, t(28)).lastInsertRowid;
  q.run('INSERT INTO jobs (org_id, title, location, description, hiring_type, created_by, created_at) VALUES (?,?,?,?,?,?,?)',
    org, 'Data Analyst', 'Bengaluru · Hybrid', 'Analytics for hiring funnels.', 'enterprise', rec, t(27));

  // Assessment
  const asmt = q.run('INSERT INTO assessments (job_id, title, duration_sec, created_by, created_at) VALUES (?,?,?,?,?)', job, 'Platform Engineer Screening', 15 * 60, rec, t(27)).lastInsertRowid;
  const QS = [
    ['mcq', 'Which HTTP status code indicates that a new resource was created?', ['200 OK', '201 Created', '204 No Content', '302 Found'], '1', 1],
    ['mcq', 'In React, which hook runs side effects after render?', ['useMemo', 'useEffect', 'useRef', 'useId'], '1', 1],
    ['mcq', 'What is the time complexity of binary search on a sorted array?', ['O(n)', 'O(log n)', 'O(n log n)', 'O(1)'], '1', 1],
    ['mcq', 'Which SQL clause filters groups after aggregation?', ['WHERE', 'HAVING', 'ORDER BY', 'LIMIT'], '1', 1],
    ['mcq', 'Which of these is NOT a JavaScript primitive type?', ['string', 'symbol', 'object', 'bigint'], '2', 1],
    ['mcq', 'Why should an API endpoint that records payments be idempotent?', ['To make it faster', 'So retries do not create duplicates', 'To avoid authentication', 'To allow caching'], '1', 1],
    ['code', 'Write a JavaScript function isPalindrome(s) that returns true when s reads the same forwards and backwards (ignore case).', null, JSON.stringify(['function', 'return', 'tolowercase', 'reverse']), 2],
  ];
  QS.forEach(([type, prompt, options, answer, points], i) => q.run('INSERT INTO assessment_questions (assessment_id, position, type, prompt, options, answer, points) VALUES (?,?,?,?,?,?,?)', asmt, i + 1, type, prompt, json(options), answer, points));

  const candidate = (email, name, phone, stage, daysAgo) => {
    const id = user(email, name, 'candidate', phone, t(daysAgo));
    q.run('INSERT INTO candidates (user_id, job_id, stage_index, applied_email, applied_phone, applied_at, updated_at) VALUES (?,?,?,?,?,?,?)', id, job, stage, email, phone, t(daysAgo), t(1));
    return id;
  };
  const sig = (uid, name, at, opts = {}) => addSignal(uid, name, { ...opts, at, silent: true, allowRepeat: opts.allowRepeat ?? true });
  const review = (signal, decision, comment, at) => q.run('UPDATE trust_signals SET status = ?, reviewed_by = ?, review_comment = ?, reviewed_at = ? WHERE id = ?', decision, rec, comment, at, signal.id);
  const consent = (uid, purposes, at) => purposes.forEach(p => q.run('INSERT INTO consents (user_id, purpose, granted, version, created_at) VALUES (?,?,1,?,?)', uid, p, 'v1', at));
  const identity = (uid, aadhaar, recordName, at) => {
    q.run('INSERT INTO identities (user_id, aadhaar_hmac, aadhaar_masked, provider, record_name, verified_at) VALUES (?,?,?,?,?,?)', uid, hmac(config.aadhaarHmacKey, aadhaar), maskAadhaar(aadhaar), 'mock-aadhaar', recordName, at);
    q.run('UPDATE users SET email_verified = 1 WHERE id = ?', uid);
  };
  const anchor = (uid, at) => q.run('INSERT INTO face_anchors (user_id, descriptor_enc, id_photo_descriptor_enc, model, liveness, created_at, retention_until) VALUES (?,?,?,?,?,?,?)',
    uid, encrypt(randomDescriptor(uid)), encrypt(randomDescriptor(uid + 'id')), 'face-api.js FaceRecognitionNet (128-d, pretrained) — SYNTHETIC seed vector', json({ passed: true, challenges: ['blink', 'turn_left', 'turn_right'], durationMs: 9400 }), at, new Date(Date.now() + 180 * DAY).toISOString());
  const ip = (uid, stage, ref, raw, geo, at, changed = 0) => q.run(`INSERT INTO ip_observations (user_id, stage, session_ref, ip_hash, ip_masked, city, region, country, lat, lng, geo_source, changed, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    uid, stage, ref, hmac(config.aadhaarHmacKey + ':ip', raw), raw.split('.').slice(0, 2).join('.') + '.x.x', geo[0], geo[1], 'India', geo[2], geo[3], 'Approximate (IP)', changed, at);
  const loc = (uid, stage, ref, lat, lng, acc, place, at, source = 'device') => q.run('INSERT INTO location_events (user_id, stage, session_ref, source, lat, lng, accuracy, place, created_at) VALUES (?,?,?,?,?,?,?,?,?)',
    uid, stage, ref, source, lat, lng, acc, json(place), at);
  const face = (uid, stage, ref, dist, result, at, faces = 1) => q.run('INSERT INTO face_checks (user_id, stage, session_ref, distance, faces, result, created_at) VALUES (?,?,?,?,?,?,?)', uid, stage, ref, dist, faces, result, at);
  const ev = (sid, uid, stage, source, type, details, at) => q.run('INSERT INTO monitoring_events (session_id, user_id, stage, source, event_type, details, idempotency_key, client_ts, created_at) VALUES (?,?,?,?,?,?,?,?,?)', sid, uid, stage, source, type, json(details), crypto.randomUUID(), at, at);
  const session = (uid, at, endAt, score, status = 'submitted') => { const id = randomId('AS-', 6); q.run(`INSERT INTO assessment_sessions (id, user_id, assessment_id, token_hash, status, consent, started_at, ended_at, expires_at, extension_version, score, max_score) VALUES (?,?,?,?,?,1,?,?,?,?,?,?)`, id, uid, asmt, sha256(crypto.randomUUID()), status, at, endAt, endAt, '1.0.0', score, 8); return id; };
  const resume = async (uid, file, apaarId, at) => {
    const u = q.get('SELECT id, name, email FROM users WHERE id = ?', uid);
    const before = q.get('SELECT COALESCE(MAX(id),0) AS m FROM trust_signals').m;
    await analyzeResume({ user: u, text: fs.readFileSync(path.join(SAMPLE_DIR, file), 'utf8'), documentId: null, apaarId });
    q.run('UPDATE trust_signals SET created_at = ? WHERE candidate_id = ? AND id > ?', at, uid, before);
    q.run('UPDATE resumes SET created_at = ? WHERE user_id = ?', at, uid);
    return q.all('SELECT * FROM trust_signals WHERE candidate_id = ? AND id > ?', uid, before);
  };
  const CHENNAI = ['Chennai', 'Tamil Nadu', 13.0827, 80.2707], BLR = ['Bengaluru', 'Karnataka', 12.9716, 77.5946], PUNE = ['Pune', 'Maharashtra', 18.5204, 73.8567], KOCHI = ['Kochi', 'Kerala', 9.9312, 76.2673], DELHI = ['New Delhi', 'Delhi', 28.6139, 77.209], COIMBATORE = ['Coimbatore', 'Tamil Nadu', 11.0168, 76.9558];
  const ALL = ['identity', 'biometric', 'documents', 'monitoring', 'camera_mic', 'screen', 'location', 'voice'];

  // ── Scenario 1 & 8: Priya — genuine, hired, report available ─────────────────────────
  const priya = candidate('priya@demo.securehire.dev', 'Priya Raman', '+919000011111', 7, 21);
  consent(priya, ALL, t(21, 9));
  identity(priya, DEMO_AADHAAR[0], 'Priya Raman', t(21, 9, 20));
  sig(priya, 'email_verified', t(21, 9, 10), { source: 'email_otp' });
  sig(priya, 'aadhaar_verified', t(21, 9, 20), { source: 'mock-aadhaar', evidence: { aadhaarMasked: maskAadhaar(DEMO_AADHAAR[0]), provider: 'MOCK' } });
  ip(priya, 'apply', null, '49.204.11.20', CHENNAI, t(21, 9, 20));
  anchor(priya, t(20, 11));
  sig(priya, 'liveness_passed', t(20, 11), { source: 'mediapipe-liveness', evidence: { challenges: ['blink', 'turn_left', 'turn_right'] } });
  sig(priya, 'face_match', t(20, 11, 1), { source: 'face-api', evidence: { distance: 0.36, similarity: 70 } });
  face(priya, 'identity', 'id-photo', 0.36, 'match', t(20, 11, 1));
  sig(priya, 'digilocker_verified', t(20, 11, 5), { source: 'mock-digilocker', evidence: { documents: ['Aadhaar (e-Aadhaar XML)', 'PAN Card', 'Degree Certificate'] } });
  await resume(priya, 'priya_raman.txt', '100000000001', t(19, 15));
  const ps = session(priya, t(15, 10), t(15, 10, 14), 7.5);
  ip(priya, 'assessment', ps, '49.204.11.20', CHENNAI, t(15, 10));
  loc(priya, 'assessment', ps, 13.0418, 80.2341, 18, { city: 'Chennai', region: 'Tamil Nadu', country: 'India', address: 'T. Nagar, Chennai' }, t(15, 10));
  ev(ps, priya, 'assessment', 'server', 'SESSION_START', { extensionVersion: '1.0.0' }, t(15, 10)); ev(ps, priya, 'assessment', 'extension', 'WINDOW_BLUR', {}, t(15, 10, 6)); ev(ps, priya, 'assessment', 'extension', 'WINDOW_FOCUS', {}, t(15, 10, 6)); ev(ps, priya, 'assessment', 'server', 'SESSION_END', { score: 7.5, max: 8 }, t(15, 10, 14));
  for (let i = 0; i < 6; i++) face(priya, 'assessment', ps, 0.31 + i * 0.01, 'match', t(15, 10, 1 + i * 2));
  sig(priya, 'monitoring_event', t(15, 10, 14), { sessionRef: ps, label: 'Assessment monitoring summary: 2 event(s)', evidence: { counts: { WINDOW_BLUR: 1, WINDOW_FOCUS: 1 } } });
  sig(priya, 'clean_session', t(15, 10, 14), { evidence: { sessionId: ps, faceChecksMatched: 6, score: '7.5/8' } });
  const proom = randomId('ROOM-', 8);
  q.run('INSERT INTO interviews (candidate_id, recruiter_id, scheduled_at, room_id, status, started_at, ended_at, notes, rubric, verification) VALUES (?,?,?,?,?,?,?,?,?,?)', priya, rec, t(12, 15), proom, 'completed', t(12, 15), t(12, 15, 45),
    'Strong system design; clear communication.', json({ technical: 5, communication: 4, problemSolving: 5 }), json({ summary: { face: { match: 14 }, voice: { VOICE_MATCH: 6 } } }));
  ip(priya, 'interview', proom, '49.204.11.20', CHENNAI, t(12, 15));
  loc(priya, 'interview', proom, 13.0418, 80.2341, 22, { city: 'Chennai', region: 'Tamil Nadu', country: 'India' }, t(12, 15));
  for (let i = 0; i < 6; i++) { face(priya, 'interview', proom, 0.33, 'match', t(12, 15, 5 + i * 5)); ev(proom, priya, 'interview', 'voice', 'VOICE_MATCH', { similarity: 0.95 }, t(12, 15, 5 + i * 5)); }
  ev(proom, priya, 'interview', 'page', 'SCREEN_SHARE_STARTED', {}, t(12, 15, 1));
  sig(priya, 'interview_identity_consistent', t(12, 15, 45), { evidence: { faceMatches: 14, voiceChecks: { VOICE_MATCH: 6 } } });
  const offerP = { id: 'OFR-PRIYA1', candidate_id: priya, org_name: 'Northwind Labs (Demo Org)', title: 'Software Engineer — Platform', salary: '₹ 28,00,000 per annum', start_date: t(-14).slice(0, 10), issued_at: t(9, 12), expires_at: t(-5, 12) };
  const canon = (o) => JSON.stringify({ id: o.id, candidate_id: o.candidate_id, org_name: o.org_name, title: o.title, salary: o.salary, start_date: o.start_date, issued_at: o.issued_at, expires_at: o.expires_at });
  q.run('INSERT INTO offers (id, candidate_id, org_name, title, salary, start_date, issued_by, issued_at, expires_at, status, content_hash, signature, accepted_at, acceptance) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
    offerP.id, priya, offerP.org_name, offerP.title, offerP.salary, offerP.start_date, rec, offerP.issued_at, offerP.expires_at, 'accepted', sha256(canon(offerP)), hmac(config.offerSigningKey, canon(offerP)), t(8, 18), json({ face: { distance: 0.34, result: 'match' }, sameIdentity: true }));
  face(priya, 'offer', offerP.id, 0.34, 'match', t(8, 18));
  sig(priya, 'offer_identity_consistent', t(8, 18), { evidence: { face: { distance: 0.34, result: 'match' }, sameIdentity: true } });
  q.run('INSERT INTO onboarding (candidate_id, status, checklist, joined_at, approved_by, updated_at) VALUES (?,?,?,?,?,?)', priya, 'completed', json({ identity: true, digilocker: true, documents: ['joining_pan', 'joining_degree', 'joining_address'] }), t(1, 9, 30), rec, t(1, 9, 30));
  face(priya, 'onboarding', 'day-one', 0.32, 'match', t(1, 9));
  sig(priya, 'onboarding_verified', t(1, 9), { evidence: { distance: 0.32, reference: 'Identity anchor' } });
  sig(priya, 'onboarding_documents_verified', t(1, 9, 10), { evidence: { documents: 3 } });
  ip(priya, 'onboarding', null, '49.204.11.20', CHENNAI, t(1, 9));

  // ── Scenario 2: Kiran — duplicate identity attempt (Priya's Aadhaar) ─────────────────
  const kiran = candidate('kiran@demo.securehire.dev', 'Kiran Rao', '+919812345678', 0, 3);
  q.run('UPDATE users SET email_verified = 1 WHERE id = ?', kiran);
  q.run('UPDATE candidates SET hold_reason = ? WHERE user_id = ?', 'This identity is already registered with another account.', kiran);
  consent(kiran, ['identity'], t(3, 16));
  sig(kiran, 'email_verified', t(3, 16, 2), { source: 'email_otp' });
  sig(kiran, 'duplicate_identity', t(3, 16, 5), { source: 'identity_uniqueness', evidence: { aadhaarMasked: maskAadhaar(DEMO_AADHAAR[0]), existingAccount: `#${priya} (p***@demo.securehire.dev)`, note: 'Same identity already registered. Could be a duplicate account or a legitimate email change — use account recovery.' } });
  ip(kiran, 'apply', null, '103.21.58.9', BLR, t(3, 16));

  // ── Scenario 3: Arjun — fake academic claim (graduation year) ─────────────────────────
  const arjun = candidate('arjun@demo.securehire.dev', 'Arjun Kumar', '+919876543210', 3, 9);
  consent(arjun, ['identity', 'biometric', 'documents'], t(9, 11));
  identity(arjun, DEMO_AADHAAR[1], 'Arjun Kumar', t(9, 11, 5));
  sig(arjun, 'email_verified', t(9, 11, 2)); sig(arjun, 'aadhaar_verified', t(9, 11, 5), { evidence: { provider: 'MOCK' } });
  ip(arjun, 'apply', null, '117.193.40.12', COIMBATORE, t(9, 11));
  anchor(arjun, t(8, 14)); sig(arjun, 'liveness_passed', t(8, 14)); face(arjun, 'identity', 'id-photo', 0.41, 'match', t(8, 14)); sig(arjun, 'face_match', t(8, 14, 1), { evidence: { distance: 0.41 } });
  await resume(arjun, 'arjun_kumar.txt', '100000000002', t(7, 17));

  // ── Scenario 4 (+ SecureHire "Candidate B"): Rahul — proxy assessment, tab switches, IP change ──
  const rahul = candidate('rahul@demo.securehire.dev', 'Rahul Sharma', '+919123456780', 4, 12);
  consent(rahul, ['identity', 'biometric', 'documents', 'monitoring', 'camera_mic'], t(12, 10));
  identity(rahul, DEMO_AADHAAR[2], 'Rahul Sharma', t(12, 10, 5));
  sig(rahul, 'email_verified', t(12, 10, 2)); sig(rahul, 'aadhaar_verified', t(12, 10, 5));
  ip(rahul, 'apply', null, '182.70.12.5', PUNE, t(12, 10));
  anchor(rahul, t(11, 12)); sig(rahul, 'liveness_passed', t(11, 12)); face(rahul, 'identity', 'id-photo', 0.38, 'match', t(11, 12)); sig(rahul, 'face_match', t(11, 12, 1), { evidence: { distance: 0.38 } });
  await resume(rahul, 'rahul_sharma.txt', '100000000003', t(10, 13));
  const rs = session(rahul, t(2, 14), t(2, 14, 13), 8);
  ip(rahul, 'assessment', rs, '182.70.12.5', PUNE, t(2, 14));
  ev(rs, rahul, 'assessment', 'server', 'SESSION_START', { extensionVersion: '1.0.0' }, t(2, 14));
  face(rahul, 'assessment', rs, 0.35, 'match', t(2, 14, 1)); face(rahul, 'assessment', rs, 0.37, 'match', t(2, 14, 2));
  for (const [m, type] of [[3, 'TAB_HIDDEN'], [3, 'TAB_VISIBLE'], [4, 'TAB_HIDDEN'], [4, 'TAB_VISIBLE'], [4, 'WINDOW_BLUR'], [5, 'PASTE_ATTEMPT'], [5, 'TAB_HIDDEN'], [6, 'TAB_VISIBLE'], [9, 'FULLSCREEN_EXIT']]) ev(rs, rahul, 'assessment', 'extension', type, {}, t(2, 14, m));
  ip(rahul, 'assessment', rs, '106.51.77.140', PUNE, t(2, 14, 7), 1);
  ev(rs, rahul, 'assessment', 'server', 'IP_CHANGE', { current: '106.51.x.x' }, t(2, 14, 7));
  sig(rahul, 'ip_change', t(2, 14, 7), { stage: 'assessment', sessionRef: rs, label: 'IP address changed during session', evidence: { previous: '182.70.x.x', current: '106.51.x.x', sameSession: true, note: 'Contextual only — mobile networks, VPNs and dynamic IPs commonly change addresses.' } });
  sig(rahul, 'assessment_integrity_review', t(2, 14, 5), { sessionRef: rs, label: '5 tab/focus changes within 2 minutes', evidence: { counts: { TAB_HIDDEN: 3, WINDOW_BLUR: 1, PASTE_ATTEMPT: 1 }, note: 'Needs review — not a cheating finding.' } });
  for (const [m, d] of [[8, 0.71], [9, 0.74], [10, 0.69]]) { face(rahul, 'assessment', rs, d, 'mismatch', t(2, 14, m)); ev(rs, rahul, 'assessment', 'face-monitor', 'FACE_MISMATCH', { distance: d }, t(2, 14, m)); }
  sig(rahul, 'assessment_face_mismatch', t(2, 14, 9), { sessionRef: rs, source: 'face-continuity', evidence: { consecutiveMismatches: 2, distances: [0.71, 0.74], threshold: 0.6, note: 'Live face differs from the enrolled identity anchor.' } });
  ev(rs, rahul, 'assessment', 'server', 'SESSION_END', { score: 8, max: 8 }, t(2, 14, 13));
  sig(rahul, 'assessment_behavior_anomaly', t(2, 14, 13), { sessionRef: rs, evidence: { anomalies: ['4 correct answers in under 3 seconds each'], score: 8, max: 8 } });
  sig(rahul, 'monitoring_event', t(2, 14, 13), { sessionRef: rs, label: 'Assessment monitoring summary: 12 event(s)', evidence: {} });

  // ── Scenarios 5 & 6: Meera — interview voice anomaly + location anomaly ───────────────
  const meera = candidate('meera@demo.securehire.dev', 'Meera Nair', '+919447012345', 5, 14);
  consent(meera, ALL, t(14, 10));
  identity(meera, DEMO_AADHAAR[3], 'Meera Nair', t(14, 10, 5));
  sig(meera, 'email_verified', t(14, 10, 2)); sig(meera, 'aadhaar_verified', t(14, 10, 5));
  ip(meera, 'apply', null, '117.216.5.33', KOCHI, t(14, 10));
  anchor(meera, t(13, 9)); sig(meera, 'liveness_passed', t(13, 9)); face(meera, 'identity', 'id-photo', 0.33, 'match', t(13, 9)); sig(meera, 'face_match', t(13, 9, 1));
  sig(meera, 'digilocker_verified', t(13, 9, 5));
  await resume(meera, 'meera_nair.txt', '100000000004', t(12, 16));
  const ms = session(meera, t(6, 11), t(6, 11, 12), 6);
  ip(meera, 'assessment', ms, '117.216.5.33', KOCHI, t(6, 11));
  loc(meera, 'assessment', ms, 9.9816, 76.2999, 25, { city: 'Kochi', region: 'Kerala', country: 'India', address: 'Kaloor, Kochi' }, t(6, 11));
  for (let i = 0; i < 5; i++) face(meera, 'assessment', ms, 0.34, 'match', t(6, 11, 1 + i * 2));
  ev(ms, meera, 'assessment', 'server', 'SESSION_START', {}, t(6, 11)); ev(ms, meera, 'assessment', 'server', 'SESSION_END', { score: 6, max: 8 }, t(6, 11, 12));
  sig(meera, 'clean_session', t(6, 11, 12), { evidence: { sessionId: ms, faceChecksMatched: 5 } });
  const mroom = randomId('ROOM-', 8);
  q.run('INSERT INTO interviews (candidate_id, recruiter_id, scheduled_at, room_id, status, started_at, ended_at, notes, rubric, verification) VALUES (?,?,?,?,?,?,?,?,?,?)', meera, rec, t(1, 16), mroom, 'completed', t(1, 16), t(1, 16, 40),
    'Good analytics depth. Voice check flagged mid-way — ask about audio setup.', json({ technical: 4, communication: 3, problemSolving: 4 }), json({ summary: { face: { match: 8 }, voice: { VOICE_MATCH: 3, VOICE_MISMATCH: 3 } } }));
  ip(meera, 'interview', mroom, '49.36.180.4', DELHI, t(1, 16), 1);
  sig(meera, 'ip_change', t(1, 16), { stage: 'interview', sessionRef: mroom, label: 'IP address changed (assessment → interview)', evidence: { previous: '117.216.x.x', current: '49.36.x.x', previousStage: 'assessment', sameSession: false } });
  loc(meera, 'interview', mroom, 28.6315, 77.2167, 30, { city: 'New Delhi', region: 'Delhi', country: 'India', address: 'Connaught Place, New Delhi' }, t(1, 16));
  sig(meera, 'location_change', t(1, 16, 1), { stage: 'interview', sessionRef: mroom, label: 'Location changed ~2,070 km since assessment', evidence: { distanceKm: 2071, hours: 125, from: 'assessment', to: 'interview', sources: ['device', 'device'], note: 'Contextual — travel is common. Clarify with the candidate if relevant.' } });
  for (let i = 0; i < 8; i++) face(meera, 'interview', mroom, 0.35, 'match', t(1, 16, 3 + i * 4));
  for (const [m, type, s] of [[5, 'VOICE_MATCH', 0.94], [10, 'VOICE_MATCH', 0.93], [15, 'VOICE_MATCH', 0.92], [20, 'VOICE_MISMATCH', 0.71], [25, 'VOICE_MISMATCH', 0.68], [30, 'VOICE_MISMATCH', 0.7]]) ev(mroom, meera, 'interview', 'voice', type, { similarity: s }, t(1, 16, m));
  sig(meera, 'voice_mismatch', t(1, 16, 25), { sessionRef: mroom, evidence: { similarity: 0.68, threshold: 0.8, method: 'MFCC voiceprint (EXPERIMENTAL)', note: 'Microphone changes, noise and illness affect voice features. Never conclusive on its own.' } });

  // ── Scenario 7: Vikram — identity substitution at offer ───────────────────────────────
  const vikram = candidate('vikram@demo.securehire.dev', 'Vikram Iyer', '+919840022334', 5, 18);
  consent(vikram, ALL, t(18, 10));
  identity(vikram, DEMO_AADHAAR[4], 'Vikram Iyer', t(18, 10, 5));
  sig(vikram, 'email_verified', t(18, 10, 2)); sig(vikram, 'aadhaar_verified', t(18, 10, 5));
  ip(vikram, 'apply', null, '49.205.90.7', CHENNAI, t(18, 10));
  anchor(vikram, t(17, 12)); sig(vikram, 'liveness_passed', t(17, 12)); face(vikram, 'identity', 'id-photo', 0.4, 'match', t(17, 12)); sig(vikram, 'face_match', t(17, 12, 1));
  await resume(vikram, 'vikram_iyer.txt', null, t(16, 10));
  const vs = session(vikram, t(10, 15), t(10, 15, 11), 6.5);
  for (let i = 0; i < 5; i++) face(vikram, 'assessment', vs, 0.37, 'match', t(10, 15, 1 + i * 2));
  sig(vikram, 'clean_session', t(10, 15, 11), { evidence: { sessionId: vs } });
  const vroom = randomId('ROOM-', 8);
  q.run('INSERT INTO interviews (candidate_id, recruiter_id, scheduled_at, room_id, status, started_at, ended_at, notes, rubric) VALUES (?,?,?,?,?,?,?,?,?)', vikram, rec, t(6, 11), vroom, 'completed', t(6, 11), t(6, 11, 35), 'Solid accessibility knowledge.', json({ technical: 4, communication: 4, problemSolving: 3 }));
  for (let i = 0; i < 5; i++) face(vikram, 'interview', vroom, 0.36, 'match', t(6, 11, 3 + i * 5));
  sig(vikram, 'interview_identity_consistent', t(6, 11, 35), { evidence: { faceMatches: 5 } });
  const offerV = { id: 'OFR-VIKRAM', candidate_id: vikram, org_name: 'Northwind Labs (Demo Org)', title: 'Frontend Engineer', salary: '₹ 18,00,000 per annum', start_date: t(-20).slice(0, 10), issued_at: t(2, 12), expires_at: t(-12, 12) };
  q.run('INSERT INTO offers (id, candidate_id, org_name, title, salary, start_date, issued_by, issued_at, expires_at, status, content_hash, signature, acceptance) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
    offerV.id, vikram, offerV.org_name, offerV.title, offerV.salary, offerV.start_date, rec, offerV.issued_at, offerV.expires_at, 'held_for_review', sha256(canon(offerV)), hmac(config.offerSigningKey, canon(offerV)),
    json({ face: { distance: 0.78, similarity: 35, result: 'mismatch' }, sameIdentity: true, contactChanges: ['phone'] }));
  face(vikram, 'offer', offerV.id, 0.78, 'mismatch', t(1, 19));
  ip(vikram, 'offer', offerV.id, '157.45.2.81', BLR, t(1, 19), 1);
  q.run("UPDATE users SET phone = '+919999900000' WHERE id = ?", vikram);
  sig(vikram, 'contact_change', t(1, 19), { sessionRef: offerV.id, evidence: { changed: ['phone'], explanation: null } });
  sig(vikram, 'identity_substitution', t(1, 19, 1), { sessionRef: offerV.id, evidence: { face: { distance: 0.78, similarity: 35, result: 'mismatch' }, crossStage: [{ stage: 'interview', avg: 0.36 }], note: 'Acceptance held for human review — the candidate is not rejected.' } });

  // A historical reviewed example (shows confirm/dismiss in the audit trail)
  const dismissed = sig(arjun, 'ip_change', t(8, 14), { stage: 'identity', label: 'IP address changed (apply → identity)', evidence: { previous: '117.193.x.x', current: '106.200.x.x' } });
  const flag = q.get("SELECT * FROM trust_signals WHERE candidate_id = ? AND signal_name = 'credential_mismatch'", arjun);
  if (flag) q.run('INSERT INTO appeals (candidate_id, signal_id, message, status, created_at) VALUES (?,?,?,?,?)', arjun, flag.id, 'I listed my expected graduation year incorrectly — I am in my final year (2026). I will upload a corrected resume.', 'open', t(5, 20));
  const rahulTab = q.get("SELECT * FROM trust_signals WHERE candidate_id = ? AND signal_name = 'date_conflict'", rahul);
  if (rahulTab) review(rahulTab, 'dismissed', 'Candidate confirmed notice-period overlap; Infosys relieving letter shows Dec 2021. Acceptable.', t(9, 12));

  for (const id of [priya, kiran, arjun, rahul, meera, vikram]) rebuildHistory(id);
  q.run('INSERT INTO audit_logs (actor_id, actor_role, action, target, details, created_at) VALUES (?,?,?,?,?,?)', admin, 'admin', 'seed.demo_data', 'system', json({ note: 'Synthetic demo data loaded' }), new Date().toISOString());
  return { admin, rec, priya, kiran, arjun, rahul, meera, vikram };
}

// CLI: `npm run seed` → wipe and reseed
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  db.exec('PRAGMA foreign_keys = OFF');
  for (const { name } of db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != 'schema_migrations'").all()) db.exec(`DELETE FROM ${name}`);
  db.exec('PRAGMA foreign_keys = ON');
  for (const f of fs.readdirSync(config.uploadDir)) fs.unlinkSync(path.join(config.uploadDir, f));
  const out = await seedDemo();
  console.log('Seeded synthetic demo data:', out);
  console.log(`All demo accounts use password ${PASSWORD}`);
  process.exit(0);
}
