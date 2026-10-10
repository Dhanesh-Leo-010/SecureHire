import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import { useRealtime } from './realtime';

/** Loads the candidate's own overview and refreshes it whenever their trust signals change (WebSocket push). */
export function useCandidate() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    try { setData(await api.get('/api/me/overview')); setError(null); } catch (e: any) { setError(e.message); }
  }, []);
  useEffect(() => { reload(); }, [reload]);
  useRealtime((m) => { if (m.type === 'trust') reload(); }, []);
  return { data, error, reload };
}

export async function getPublicConfig() {
  try { return await api.get('/api/public/config'); } catch { return { demoMode: false }; }
}
