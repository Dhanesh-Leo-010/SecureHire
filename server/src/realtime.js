import { WebSocketServer } from 'ws';
import { verifyJwt, COOKIE } from './security.js';
import { q } from './db.js';

const clients = new Set(); // { ws, user }
const rooms = new Map();   // roomId -> Set(client)

function cookieToken(header = '') {
  const m = header.split(';').map(s => s.trim()).find(s => s.startsWith(COOKIE + '='));
  return m ? decodeURIComponent(m.slice(COOKIE.length + 1)) : null;
}

function send(ws, msg) { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); }

/** Broadcast to recruiters/admins (staff dashboards). */
export function toStaff(msg) {
  for (const c of clients) if (c.user.role !== 'candidate') send(c.ws, msg);
}
/** Send to a specific user (e.g. the candidate whose score changed). */
export function toUser(userId, msg) {
  for (const c of clients) if (c.user.id === userId) send(c.ws, msg);
}
export function toRoom(roomId, msg, except) {
  for (const c of rooms.get(roomId) || []) if (c !== except) send(c.ws, msg);
}

function canJoinRoom(user, roomId) {
  const iv = q.get('SELECT candidate_id FROM interviews WHERE room_id = ?', roomId);
  if (!iv) return false;
  return user.role !== 'candidate' || iv.candidate_id === user.id;
}

export function attachRealtime(server) {
  const wss = new WebSocketServer({ server, path: '/ws' });
  wss.on('connection', (ws, req) => {
    const url = new URL(req.url, 'http://x');
    const payload = verifyJwt(url.searchParams.get('token') || cookieToken(req.headers.cookie));
    if (!payload) { ws.close(4401, 'unauthorized'); return; }
    const client = { ws, user: { id: payload.sub, role: payload.role, name: payload.name }, room: null };
    clients.add(client);
    send(ws, { type: 'hello', role: client.user.role });

    ws.on('message', (raw) => {
      let msg; try { msg = JSON.parse(raw); } catch { return; }
      if (msg.type === 'join' && typeof msg.room === 'string') {
        if (!canJoinRoom(client.user, msg.room)) return send(ws, { type: 'error', error: 'not allowed in room' });
        client.room = msg.room;
        if (!rooms.has(msg.room)) rooms.set(msg.room, new Set());
        const set = rooms.get(msg.room);
        set.add(client);
        toRoom(msg.room, { type: 'peer-joined', role: client.user.role, name: client.user.name }, client);
        send(ws, { type: 'joined', room: msg.room, peers: [...set].filter(c => c !== client).map(c => ({ role: c.user.role, name: c.user.name })) });
      } else if (msg.type === 'signal' && client.room) {
        // WebRTC offer/answer/ICE relay + small in-room status messages (location, verification badges)
        toRoom(client.room, { type: 'signal', from: client.user.role, data: msg.data }, client);
      } else if (msg.type === 'ping') {
        send(ws, { type: 'pong' });
      }
    });
    ws.on('close', () => {
      clients.delete(client);
      if (client.room && rooms.has(client.room)) {
        rooms.get(client.room).delete(client);
        toRoom(client.room, { type: 'peer-left', role: client.user.role });
        if (!rooms.get(client.room).size) rooms.delete(client.room);
      }
    });
  });
  // keep-alive so proxies don't drop idle sockets
  setInterval(() => { for (const c of clients) if (c.ws.readyState === 1) c.ws.ping(); }, 25000).unref();
  return wss;
}
