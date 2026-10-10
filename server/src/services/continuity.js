import { q, now, json } from '../db.js';
import { addSignal } from '../trust.js';
import { toStaff } from '../realtime.js';

const RULES = {
  assessment: { mismatch: 'assessment_face_mismatch', multiple: 'multiple_faces' },
  interview: { mismatch: 'interview_identity_inconsistent', multiple: 'interview_multiple_faces' },
};

export function logEvent({ sessionId, userId, stage, source, type, details, idempotencyKey, clientTs }) {
  try {
    const r = q.run(`INSERT INTO monitoring_events (session_id, user_id, stage, source, event_type, details, idempotency_key, client_ts, created_at)
                     VALUES (?,?,?,?,?,?,?,?,?)`, sessionId, userId, stage, source, type, json(details || {}), idempotencyKey ?? null, clientTs ?? null, now());
    const ev = { id: r.lastInsertRowid, sessionId, userId, stage, source, type, details, createdAt: now() };
    toStaff({ type: 'monitoring', event: ev });
    return { inserted: true, ev };
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return { inserted: false, duplicate: true };
    throw e;
  }
}

/**
 * Identity-continuity rules applied after each live face check during assessment/interview.
 * Two consecutive non-matching checks (≈20 s) are needed before a review flag is raised, to absorb
 * transient misdetections (lighting, motion). Flags are pending_review — never automatic penalties.
 */
export function evaluateFaceCheck(userId, stage, sessionRef, result, distance) {
  const rules = RULES[stage];
  if (!rules || !sessionRef) return null;
  if (result === 'mismatch' || result === 'multiple_faces' || result === 'no_face') {
    logEvent({ sessionId: sessionRef, userId, stage, source: 'face-monitor', type: result === 'mismatch' ? 'FACE_MISMATCH' : result === 'multiple_faces' ? 'MULTIPLE_FACES' : 'NO_FACE', details: { distance } });
  }
  const recent = q.all('SELECT result, distance FROM face_checks WHERE user_id = ? AND stage = ? AND session_ref = ? ORDER BY id DESC LIMIT 2', userId, stage, sessionRef);
  if (recent.length === 2 && recent.every(r => r.result === 'mismatch')) {
    return addSignal(userId, rules.mismatch, { sessionRef, source: 'face-continuity', evidence: { consecutiveMismatches: 2, distances: recent.map(r => +Number(r.distance).toFixed(3)), threshold: 0.6, note: 'Live face differs from the enrolled identity anchor. Review snapshots/recording before deciding.' } });
  }
  if (recent.length === 2 && recent.every(r => r.result === 'multiple_faces')) {
    return addSignal(userId, rules.multiple, { sessionRef, source: 'face-continuity', evidence: { consecutiveChecks: 2, note: 'More than one face visible. Could be a family member passing by.' } });
  }
  return null;
}
