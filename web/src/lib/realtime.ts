import { useEffect, useRef } from 'react';

// VITE_WS_URL (e.g. wss://securehire-api.onrender.com/ws) is set when the website and API are on different hosts.
const WS_BASE: string = (import.meta as any).env?.VITE_WS_URL || '';
async function wsUrl() {
  if (!WS_BASE) return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
  try {
    const r = await fetch('/api/auth/ws-token', { credentials: 'include' });
    const { token } = await r.json();
    return `${WS_BASE}?token=${encodeURIComponent(token)}`;
  } catch { return WS_BASE; }
}

type Handler = (msg: any) => void;
const handlers = new Set<Handler>();
let socket: WebSocket | null = null;
let retry = 0;
let wanted = false;

let connecting = false;
async function connect() {
  if (!wanted || connecting || (socket && socket.readyState <= 1)) return;
  connecting = true;
  const url = await wsUrl();
  connecting = false;
  if (!wanted) return;
  socket = new WebSocket(url);
  socket.onopen = () => { retry = 0; };
  socket.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch { return; } handlers.forEach((h) => h(m)); };
  socket.onclose = () => { socket = null; if (wanted) setTimeout(connect, Math.min(10000, 500 * 2 ** retry++)); };
}

export function startRealtime() { wanted = true; connect(); }
export function stopRealtime() { wanted = false; socket?.close(); socket = null; }
export function sendRealtime(msg: any) { if (socket?.readyState === 1) socket.send(JSON.stringify(msg)); }
export function realtimeReady() { return socket?.readyState === 1; }

/** Subscribe to realtime messages for the lifetime of a component. */
export function useRealtime(handler: Handler, deps: any[] = []) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    const h = (m: any) => ref.current(m);
    handlers.add(h);
    startRealtime();
    return () => { handlers.delete(h); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/** Dedicated socket for an interview room (signaling + in-room status). */
export function openRoomSocket(room: string, onMessage: Handler) {
  let ws: WebSocket | null = null;
  let closed = false;
  wsUrl().then((url) => {
    if (closed) return;
    ws = new WebSocket(url);
    ws.onopen = () => ws!.send(JSON.stringify({ type: 'join', room }));
    ws.onmessage = (e) => { try { onMessage(JSON.parse(e.data)); } catch { /* ignore */ } };
  });
  return {
    signal: (data: any) => ws?.readyState === 1 && ws.send(JSON.stringify({ type: 'signal', data })),
    close: () => { closed = true; ws?.close(); },
    get open() { return ws?.readyState === 1; },
  };
}
