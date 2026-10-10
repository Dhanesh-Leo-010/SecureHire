import React, { useEffect, useRef, useState } from 'react';
import { MapPin } from 'lucide-react';
import { api } from '../lib/api';

export type GeoReading = { lat: number | null; lng: number | null; accuracy: number | null; source: 'device' | 'ip' | 'none'; place?: any; updatedAt?: number; permission?: string; ipLabel?: string };

const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;
const tzAbbr = () => new Date().toLocaleTimeString('en-US', { timeZoneName: 'short' }).split(' ').pop();

/**
 * Consent-based location for a stage. Device GPS via watchPosition (stopped on unmount / session end);
 * falls back to clearly labelled approximate IP location. Never invents coordinates.
 */
export function useStageLocation({ stage, sessionRef, enabled, consented }: { stage: string; sessionRef?: string; enabled: boolean; consented: boolean }) {
  const [reading, setReading] = useState<GeoReading>({ lat: null, lng: null, accuracy: null, source: 'none', permission: 'prompt' });
  const lastSent = useRef(0);
  useEffect(() => {
    if (!enabled) return;
    let watchId: number | null = null, alive = true;
    api.get('/api/me/geo/ip').then((g) => {
      if (!alive) return;
      setReading((r) => (r.source === 'device' ? { ...r, ipLabel: g.city ? `${g.city}, ${g.region}` : g.source } : { lat: g.lat ?? null, lng: g.lng ?? null, accuracy: null, source: g.lat ? 'ip' : 'none', place: { city: g.city, region: g.region, country: g.country }, updatedAt: Date.now(), permission: consented ? 'prompt' : 'not requested', ipLabel: g.source }));
    }).catch(() => {});
    if (consented && navigator.geolocation) {
      watchId = navigator.geolocation.watchPosition(async (pos) => {
        const { latitude: lat, longitude: lng, accuracy } = pos.coords;
        setReading((r) => ({ ...r, lat, lng, accuracy, source: 'device', updatedAt: Date.now(), permission: 'granted' }));
        if (Date.now() - lastSent.current > 60_000) {
          lastSent.current = Date.now();
          try { const out = await api.post('/api/me/location', { stage, lat, lng, accuracy, sessionRef }); if (alive && out.place) setReading((r) => ({ ...r, place: out.place })); } catch { /* best effort */ }
        }
      }, (err) => {
        setReading((r) => ({ ...r, permission: err.code === 1 ? 'denied' : 'unavailable' }));
        if (err.code === 1) api.post('/api/me/location/denied', { stage }).catch(() => {});
      }, { enableHighAccuracy: true, maximumAge: 30_000, timeout: 20_000 });
    }
    return () => { alive = false; if (watchId != null) navigator.geolocation.clearWatch(watchId); };
  }, [enabled, consented, stage, sessionRef]);
  return reading;
}

/** GPS Map Camera-style overlay for a live video. */
export function GpsOverlay({ reading, compact }: { reading: GeoReading; compact?: boolean }) {
  const [now, setNow] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  const p = reading.place || {};
  const placeLine = [p.city, p.region, p.country].filter(Boolean).join(', ') || (reading.source === 'none' ? 'Location unavailable' : 'Resolving place…');
  const sourceLabel = reading.source === 'device' ? 'Device Geolocation' : reading.source === 'ip' ? 'Approximate (IP)' : 'Not available';
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-black/55 px-4 py-2.5 text-white backdrop-blur-[2px]">
      <div className="flex items-start gap-2.5">
        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-red-400" fill="currentColor" />
        <div className={compact ? 'text-[11px] leading-snug' : 'text-[12.5px] leading-snug'}>
          <p className="font-semibold">{placeLine}</p>
          {p.address && reading.source === 'device' && !compact && <p className="text-white/80">{p.address}</p>}
          {reading.lat != null && reading.source === 'device' ? (
            <p className="tnum">Lat {reading.lat.toFixed(6)}°  Long {reading.lng!.toFixed(6)}°</p>
          ) : reading.lat != null ? <p className="tnum text-white/80">≈ {reading.lat.toFixed(2)}°, {reading.lng!.toFixed(2)}° (city-level only)</p> : null}
          <p className="tnum">{now.toLocaleDateString('en-GB', { weekday: 'long' })}, {now.toLocaleDateString('en-GB')}  {now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })} {tzAbbr()} <span className="text-white/60">({TZ})</span></p>
          <p className="text-white/75">
            Source: {sourceLabel}{reading.accuracy != null && reading.source === 'device' ? ` · ±${Math.round(reading.accuracy)} m` : ''}
            {reading.updatedAt ? ` · updated ${Math.max(0, Math.round((now.getTime() - reading.updatedAt) / 1000))}s ago` : ''}
            {reading.permission === 'denied' ? ' · GPS declined (no effect on score)' : ''}
          </p>
        </div>
      </div>
    </div>
  );
}
