import { q, now, json } from '../db.js';
import { encrypt, decrypt } from '../security.js';
import { getSetting } from '../db.js';

/**
 * Face embeddings are 128-d descriptors from the pretrained face-api.js FaceRecognitionNet (ResNet-34 style,
 * dlib-compatible), computed in the candidate's browser. Only the encrypted descriptor is stored — never images.
 * Euclidean distance thresholds (dlib convention): < 0.5 match, 0.5–0.6 uncertain, > 0.6 mismatch.
 */
export const MODEL_NAME = 'face-api.js FaceRecognitionNet (128-d, pretrained)';
export const THRESHOLDS = { match: 0.5, uncertain: 0.6 };

export function validDescriptor(d) {
  return Array.isArray(d) && d.length === 128 && d.every(x => typeof x === 'number' && Number.isFinite(x));
}
export function distance(a, b) {
  let s = 0; for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2;
  return Math.sqrt(s);
}
export const similarityPct = (d) => Math.max(0, Math.round((1 - d / 1.2) * 100));
export function classify(d) { return d < THRESHOLDS.match ? 'match' : d < THRESHOLDS.uncertain ? 'uncertain' : 'mismatch'; }

export function getAnchor(userId) {
  const row = q.get('SELECT * FROM face_anchors WHERE user_id = ?', userId);
  if (!row) return null;
  return { ...row, descriptor: decrypt(row.descriptor_enc), idPhoto: row.id_photo_descriptor_enc ? decrypt(row.id_photo_descriptor_enc) : null };
}

export function storeAnchor(userId, descriptor, { idPhotoDescriptor, liveness, consentId }) {
  const days = getSetting('retention_days', {}).face ?? 180;
  const retention = new Date(Date.now() + days * 86400_000).toISOString();
  q.run(`INSERT INTO face_anchors (user_id, descriptor_enc, id_photo_descriptor_enc, model, liveness, consent_id, created_at, retention_until)
         VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET descriptor_enc=excluded.descriptor_enc,
         id_photo_descriptor_enc=COALESCE(excluded.id_photo_descriptor_enc, face_anchors.id_photo_descriptor_enc), liveness=excluded.liveness,
         consent_id=excluded.consent_id, created_at=excluded.created_at, retention_until=excluded.retention_until`,
    userId, encrypt(descriptor), idPhotoDescriptor ? encrypt(idPhotoDescriptor) : null, MODEL_NAME, json(liveness || null), consentId ?? null, now(), retention);
}

/** 1:N duplicate search over other candidates' anchors (demo scale: linear scan of decrypted vectors). */
export function findDuplicates(userId, descriptor) {
  const hits = [];
  for (const row of q.all('SELECT user_id, descriptor_enc FROM face_anchors WHERE user_id != ?', userId)) {
    const d = distance(descriptor, decrypt(row.descriptor_enc));
    if (d < 0.45) hits.push({ userId: row.user_id, distance: +d.toFixed(3) });
  }
  return hits.sort((a, b) => a.distance - b.distance);
}

export function recordCheck(userId, stage, { distance: d, faces, result, sessionRef }) {
  const r = q.run('INSERT INTO face_checks (user_id, stage, session_ref, distance, faces, result, created_at) VALUES (?,?,?,?,?,?,?)',
    userId, stage, sessionRef ?? null, d ?? null, faces ?? null, result, now());
  return r.lastInsertRowid;
}
