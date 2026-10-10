import { q, now } from '../db.js';
import { config } from '../config.js';
import { hmac, maskIp, clientIp } from '../security.js';
import { addSignal } from '../trust.js';

const geoCache = new Map();
const isPrivate = (ip) => !ip || ip === '::1' || ip === '127.0.0.1' || /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|fc|fd|fe80)/.test(ip);

async function fetchJson(url, opts = {}, timeoutMs = 2500) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { ...opts, signal: ctl.signal });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; } finally { clearTimeout(t); }
}

/**
 * Approximate IP geolocation (city level, never precise).
 * Provider: ip-api.com free tier (no key). For private/loopback IPs during local demos we look up
 * the server's own public IP and label the source accordingly.
 */
export async function geoForIp(ip) {
  if (config.geoProvider === 'none') return { source: 'disabled' };
  const key = isPrivate(ip) ? '__self__' : ip;
  const hit = geoCache.get(key);
  if (hit && Date.now() - hit.at < 3600_000) return hit.value;
  const target = isPrivate(ip) ? '' : encodeURIComponent(ip);
  const d = await fetchJson(`http://ip-api.com/json/${target}?fields=status,country,regionName,city,lat,lon,proxy,hosting,query`);
  const value = d && d.status === 'success'
    ? { city: d.city, region: d.regionName, country: d.country, lat: d.lat, lng: d.lon, proxy: !!(d.proxy || d.hosting),
        source: isPrivate(ip) ? 'Approximate (IP of local network gateway)' : 'Approximate (IP)' }
    : { source: isPrivate(ip) ? 'Local network (no public IP)' : 'Unavailable' };
  geoCache.set(key, { at: Date.now(), value });
  return value;
}

/** Reverse geocode device coordinates for the overlay (OpenStreetMap Nominatim, cached, best-effort). */
const revCache = new Map();
export async function reverseGeocode(lat, lng) {
  const key = `${lat.toFixed(3)},${lng.toFixed(3)}`;
  if (revCache.has(key)) return revCache.get(key);
  const d = await fetchJson(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=14&lat=${lat}&lon=${lng}`,
    { headers: { 'User-Agent': 'SecureHire-Hackathon/1.0 (demo)', 'Accept-Language': 'en' } }, 4000);
  const a = d?.address || {};
  const value = d ? {
    city: a.city || a.town || a.village || a.suburb || a.county || null,
    region: a.state || null, country: a.country || null,
    address: [a.road, a.suburb, a.city || a.town || a.village].filter(Boolean).join(', ') || null,
  } : null;
  if (value) revCache.set(key, value);
  return value;
}

export function haversineKm(a, b) {
  const R = 6371, toR = (x) => (x * Math.PI) / 180;
  const dLat = toR(b.lat - a.lat), dLng = toR(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toR(a.lat)) * Math.cos(toR(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Record a server-side IP observation for a candidate at a hiring stage.
 * Emits a *contextual* ip_change signal when the network changes inside a session or between stages.
 * An IP change never reduces the score on its own.
 */
export async function observeIp(req, userId, stage, sessionRef = null, { onlyIfChanged = false } = {}) {
  const ip = clientIp(req);
  const ipHash = hmac(config.aadhaarHmacKey + ':ip', ip);
  const prev = q.get('SELECT * FROM ip_observations WHERE user_id = ? ORDER BY id DESC LIMIT 1', userId);
  if (onlyIfChanged && prev && prev.ip_hash === ipHash) return { ipMasked: maskIp(ip), changed: false, geo: null };
  const geo = await geoForIp(ip);
  const changed = prev && prev.ip_hash !== ipHash ? 1 : 0;
  q.run(`INSERT INTO ip_observations (user_id, stage, session_ref, ip_hash, ip_masked, city, region, country, lat, lng, geo_source, changed, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    userId, stage, sessionRef, ipHash, maskIp(ip), geo.city ?? null, geo.region ?? null, geo.country ?? null, geo.lat ?? null, geo.lng ?? null, geo.source, changed, now());
  if (changed) {
    const sameSession = sessionRef && prev.session_ref === sessionRef;
    addSignal(userId, 'ip_change', {
      stage, sessionRef, source: 'ip_intelligence',
      label: sameSession ? 'IP address changed during session' : `IP address changed (${prev.stage} → ${stage})`,
      evidence: { previous: prev.ip_masked, current: maskIp(ip), previousStage: prev.stage, stage, sameSession, proxyIndicator: !!geo.proxy,
        note: 'Contextual only — mobile networks, VPNs and dynamic IPs commonly change addresses.' },
    });
  }
  return { ipMasked: maskIp(ip), changed: !!changed, geo };
}

/** Store a consented location checkpoint; flag large unexplained jumps as contextual. */
export async function recordLocation(userId, stage, { lat, lng, accuracy, source = 'device', sessionRef = null, place = null }) {
  const prev = q.get("SELECT * FROM location_events WHERE user_id = ? AND lat IS NOT NULL ORDER BY id DESC LIMIT 1", userId);
  q.run('INSERT INTO location_events (user_id, stage, session_ref, source, lat, lng, accuracy, place, created_at) VALUES (?,?,?,?,?,?,?,?,?)',
    userId, stage, sessionRef, source, lat, lng, accuracy ?? null, place ? JSON.stringify(place) : null, now());
  if (prev && lat != null && lng != null) {
    const km = haversineKm({ lat: prev.lat, lng: prev.lng }, { lat, lng });
    const hours = Math.max((Date.now() - Date.parse(prev.created_at)) / 3600_000, 0.01);
    const tolerance = (prev.accuracy || 0) / 1000 + (accuracy || 0) / 1000 + (source === 'ip' || prev.source === 'ip' ? 150 : 0);
    if (km - tolerance > 200) {
      addSignal(userId, 'location_change', {
        stage, sessionRef, source: 'location_intelligence',
        label: `Location changed ~${Math.round(km)} km since ${prev.stage}`,
        evidence: { distanceKm: Math.round(km), hours: +hours.toFixed(1), impliedSpeedKmh: Math.round(km / hours), from: prev.stage, to: stage,
          sources: [prev.source, source], note: 'Contextual — travel, VPNs and IP-geolocation error are common. Clarify with the candidate if relevant.' },
      });
    }
  }
}
