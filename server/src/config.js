import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, '..');

// Minimal .env loader (no dependency). Values already in process.env win.
function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || line.trim().startsWith('#')) continue;
    if (process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
loadEnv(path.join(ROOT, '.env'));

const isProd = process.env.NODE_ENV === 'production';

// Dev convenience: generate stable local secrets if not configured. Production must set them.
function secret(name) {
  if (process.env[name]) return process.env[name];
  if (isProd) throw new Error(`${name} must be set in production`);
  const file = path.join(ROOT, 'data', '.dev-secrets.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const store = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
  if (!store[name]) {
    store[name] = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(file, JSON.stringify(store, null, 2), { mode: 0o600 });
  }
  return store[name];
}

export const config = {
  isProd,
  port: Number(process.env.PORT || 4000),
  webOrigins: (process.env.WEB_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173').split(',').map(s => s.trim()).filter(Boolean),
  publicWebUrl: process.env.PUBLIC_WEB_URL || 'http://localhost:5173',
  dbFile: process.env.DB_FILE || path.join(ROOT, 'data', 'securehire.db'),
  uploadDir: process.env.UPLOAD_DIR || path.join(ROOT, 'data', 'uploads'),
  jwtSecret: secret('JWT_SECRET'),
  aadhaarHmacKey: secret('AADHAAR_HMAC_KEY'),
  dataEncKey: secret('DATA_ENCRYPTION_KEY'), // 32-byte hex for AES-256-GCM
  offerSigningKey: secret('OFFER_SIGNING_KEY'),
  demoMode: process.env.DEMO_MODE !== 'false', // shows OTPs in UI, enables demo helpers
  trustProxy: process.env.TRUST_PROXY || 'loopback',
  geoProvider: process.env.GEO_PROVIDER || 'ip-api', // 'ip-api' | 'none'
  enableSemanticModel: process.env.ENABLE_SEMANTIC_MODEL !== 'false',
};

fs.mkdirSync(path.dirname(config.dbFile), { recursive: true });
fs.mkdirSync(config.uploadDir, { recursive: true });
