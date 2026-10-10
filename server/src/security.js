import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { config } from './config.js';
import { q, now } from './db.js';

// ---------- Hashing / encryption ----------
export const hmac = (key, value) => crypto.createHmac('sha256', key).update(String(value)).digest('hex');
export const sha256 = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');
export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');
export const randomId = (prefix, bytes = 6) => `${prefix}${crypto.randomBytes(bytes).toString('hex').toUpperCase()}`;

const encKey = crypto.createHash('sha256').update(config.dataEncKey).digest(); // 32 bytes

/** AES-256-GCM. Output: base64(iv | tag | ciphertext). */
export function encrypt(plain) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', encKey, iv);
  const data = Buffer.concat([c.update(typeof plain === 'string' ? plain : JSON.stringify(plain), 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), data]).toString('base64');
}
export function decrypt(blob, asJson = true) {
  const buf = Buffer.from(blob, 'base64');
  const d = crypto.createDecipheriv('aes-256-gcm', encKey, buf.subarray(0, 12));
  d.setAuthTag(buf.subarray(12, 28));
  const out = Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString('utf8');
  return asJson ? JSON.parse(out) : out;
}
export const encryptBuffer = (buf) => {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', encKey, iv);
  const data = Buffer.concat([c.update(buf), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), data]);
};

// ---------- IP masking ----------
export function maskIp(ip = '') {
  if (!ip) return 'unknown';
  const v4 = ip.replace('::ffff:', '');
  if (/^\d+\.\d+\.\d+\.\d+$/.test(v4)) { const p = v4.split('.'); return `${p[0]}.${p[1]}.x.x`; }
  return ip.split(':').slice(0, 3).join(':') + ':…';
}
export const clientIp = (req) => (req.ip || req.socket?.remoteAddress || '').replace('::ffff:', '');

// ---------- Auth ----------
export const COOKIE = 'sh_session';
export function signUser(user) {
  return jwt.sign({ sub: user.id, role: user.role, name: user.name }, config.jwtSecret, { expiresIn: '12h' });
}
export function verifyJwt(token) {
  try { return jwt.verify(token, config.jwtSecret); } catch { return null; }
}
function tokenFrom(req) {
  const h = req.headers.authorization || '';
  if (h.startsWith('Bearer ')) return h.slice(7);
  return req.cookies?.[COOKIE];
}
export function authenticate(req, _res, next) {
  const payload = verifyJwt(tokenFrom(req));
  if (payload) {
    const user = q.get('SELECT id, email, role, name, status, email_verified FROM users WHERE id = ?', payload.sub);
    if (user && user.status === 'active') req.user = user;
  }
  next();
}
export const requireAuth = (...roles) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'Please sign in.' });
  if (roles.length && !roles.includes(req.user.role)) return res.status(403).json({ error: 'You do not have access to this resource.' });
  next();
};

// ---------- Audit ----------
export function audit(req, action, target, details) {
  q.run(
    'INSERT INTO audit_logs (actor_id, actor_role, action, target, details, ip_masked, created_at) VALUES (?,?,?,?,?,?,?)',
    req?.user?.id ?? null, req?.user?.role ?? 'system', action, target ?? null,
    details ? JSON.stringify(details) : null, req ? maskIp(clientIp(req)) : null, now(),
  );
}

// ---------- Verhoeff (Aadhaar checksum) ----------
const D = [[0,1,2,3,4,5,6,7,8,9],[1,2,3,4,0,6,7,8,9,5],[2,3,4,0,1,7,8,9,5,6],[3,4,0,1,2,8,9,5,6,7],[4,0,1,2,3,9,5,6,7,8],[5,9,8,7,6,0,4,3,2,1],[6,5,9,8,7,1,0,4,3,2],[7,6,5,9,8,2,1,0,4,3],[8,7,6,5,9,3,2,1,0,4],[9,8,7,6,5,4,3,2,1,0]];
const P = [[0,1,2,3,4,5,6,7,8,9],[1,5,7,6,2,8,3,0,9,4],[5,8,0,3,7,9,6,1,4,2],[8,9,1,6,0,4,3,5,2,7],[9,4,5,3,1,2,6,8,7,0],[4,2,8,6,5,7,3,9,0,1],[2,7,9,3,8,0,6,4,1,5],[7,0,4,6,9,1,3,2,5,8]];
const INV = [0,4,3,2,1,5,6,7,8,9];
export function verhoeffValid(num) {
  let c = 0;
  const digits = String(num).split('').reverse().map(Number);
  digits.forEach((d, i) => { c = D[c][P[i % 8][d]]; });
  return c === 0;
}
export function verhoeffDigit(num) {
  let c = 0;
  const digits = String(num).split('').reverse().map(Number);
  digits.forEach((d, i) => { c = D[c][P[(i + 1) % 8][d]]; });
  return INV[c];
}
export function isValidAadhaar(n) {
  const s = String(n).replace(/\s|-/g, '');
  return /^[2-9]\d{11}$/.test(s) && verhoeffValid(s);
}
export const maskAadhaar = (n) => `XXXX-XXXX-${String(n).replace(/\s|-/g, '').slice(-4)}`;
