import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import rateLimit from 'express-rate-limit';
import { q, now, tx } from '../db.js';
import { config } from '../config.js';
import { signUser, COOKIE, audit, sha256, requireAuth } from '../security.js';
import jwt from 'jsonwebtoken';
import { ah, bad, HttpError } from '../helpers.js';
import { recordHistory } from '../trust.js';

const r = Router();
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 50, standardHeaders: true, legacyHeaders: false });

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function setCookie(res, user) {
  res.cookie(COOKIE, signUser(user), { httpOnly: true, sameSite: 'lax', secure: config.isProd, maxAge: 12 * 3600 * 1000 });
}
const publicUser = (u) => ({ id: u.id, email: u.email, name: u.name, role: u.role, emailVerified: !!u.email_verified });

export function issueEmailOtp(user) {
  const code = String(crypto.randomInt(100000, 1000000));
  q.run(`INSERT INTO email_otps (user_id, code_hash, expires_at, attempts, sent_at) VALUES (?,?,?,0,?)
         ON CONFLICT(user_id) DO UPDATE SET code_hash=excluded.code_hash, expires_at=excluded.expires_at, attempts=0, sent_at=excluded.sent_at`,
    user.id, sha256(`${user.id}:${code}`), new Date(Date.now() + 10 * 60 * 1000).toISOString(), now());
  // Development: the OTP is printed here instead of being emailed. Configure SMTP for real delivery.
  console.log(`[email-otp] ${user.email} → ${code} (valid 10 min)`);
  return code;
}

r.post('/register', limiter, ah(async (req, res) => {
  const { name, email, password, phone, jobId } = req.body || {};
  if (!name || String(name).trim().length < 2) throw bad('Please enter your full name.');
  if (!emailRe.test(email || '')) throw bad('Please enter a valid email address.');
  if (!password || password.length < 8) throw bad('Password must be at least 8 characters.');
  if (q.get('SELECT id FROM users WHERE email = ?', email)) throw new HttpError(409, 'An account with this email already exists. Sign in instead.');
  const job = jobId ? q.get('SELECT id FROM jobs WHERE id = ?', jobId) : q.get('SELECT id FROM jobs ORDER BY id LIMIT 1');
  const hash = await bcrypt.hash(password, 10);
  const user = tx(() => {
    const u = q.run('INSERT INTO users (email, password_hash, role, name, phone, created_at) VALUES (?,?,?,?,?,?)', email.trim(), hash, 'candidate', name.trim(), phone || null, now());
    q.run('INSERT INTO candidates (user_id, job_id, stage_index, applied_email, applied_phone, applied_at, updated_at) VALUES (?,?,0,?,?,?,?)',
      u.lastInsertRowid, job?.id ?? null, email.trim(), phone || null, now(), now());
    return q.get('SELECT * FROM users WHERE id = ?', u.lastInsertRowid);
  });
  recordHistory(user.id, 'Application started');
  const code = issueEmailOtp(user);
  req.user = user; audit(req, 'candidate.register', `user:${user.id}`);
  setCookie(res, user);
  res.status(201).json({ user: publicUser(user), devOtp: config.demoMode ? code : undefined });
}));

r.post('/login', limiter, ah(async (req, res) => {
  const { email, password } = req.body || {};
  const user = q.get('SELECT * FROM users WHERE email = ?', email || '');
  if (!user || !(await bcrypt.compare(password || '', user.password_hash))) throw new HttpError(401, 'Incorrect email or password.');
  if (user.status !== 'active') throw new HttpError(403, 'This account is disabled.');
  setCookie(res, user);
  req.user = user; audit(req, 'auth.login', `user:${user.id}`);
  res.json({ user: publicUser(user) });
}));

r.post('/logout', (req, res) => { res.clearCookie(COOKIE); res.json({ ok: true }); });

// Short-lived token so the web app can open the WebSocket on a different host (e.g. web on Vercel, API on Render).
r.get('/ws-token', requireAuth(), (req, res) => {
  const token = jwt.sign({ sub: req.user.id, role: req.user.role, name: req.user.name }, config.jwtSecret, { expiresIn: '2m' });
  res.json({ token });
});

r.get('/me', requireAuth(), (req, res) => {
  const u = q.get('SELECT * FROM users WHERE id = ?', req.user.id);
  res.json({ user: publicUser(u) });
});

export default r;
