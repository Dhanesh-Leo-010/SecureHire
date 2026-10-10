import { useEffect, useRef, useState } from 'react';
import { openRoomSocket } from './realtime';

/**
 * One-on-one WebRTC call over the SecureHire WebSocket signaling channel.
 * The candidate is always the offerer (when it joins, or when the recruiter joins after it).
 * Extra application messages (location, verification badges) travel on the same channel as { app: {...} }.
 */
export function useRtc({ room, role, iceServers, localStreams, enabled, onApp }: {
  room: string | null; role: 'candidate' | 'recruiter'; iceServers?: RTCIceServer[]; localStreams: MediaStream[]; enabled: boolean; onApp?: (m: any) => void;
}) {
  const [remote, setRemote] = useState<MediaStream[]>([]);
  const [state, setState] = useState<'idle' | 'waiting' | 'connecting' | 'connected' | 'disconnected'>('idle');
  const [peerPresent, setPeerPresent] = useState(false);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const sockRef = useRef<ReturnType<typeof openRoomSocket> | null>(null);
  const appCb = useRef(onApp); appCb.current = onApp;
  const metaRef = useRef<any>({});
  const streamsRef = useRef(localStreams); streamsRef.current = localStreams;

  useEffect(() => {
    if (!enabled || !room) return;
    let closed = false;
    const makePc = () => {
      pcRef.current?.close();
      const pc = new RTCPeerConnection({ iceServers: iceServers || [{ urls: 'stun:stun.l.google.com:19302' }] });
      pcRef.current = pc;
      streamsRef.current.forEach((s) => s.getTracks().forEach((t) => pc.addTrack(t, s)));
      pc.onicecandidate = (e) => e.candidate && sock.signal({ ice: e.candidate });
      pc.ontrack = (e) => {
        const s = e.streams[0];
        if (!s) return;
        setRemote((prev) => (prev.some((x) => x.id === s.id) ? [...prev] : [...prev, s]));
      };
      pc.onconnectionstatechange = () => {
        const st = pc.connectionState;
        setState(st === 'connected' ? 'connected' : st === 'failed' || st === 'disconnected' ? 'disconnected' : 'connecting');
      };
      return pc;
    };
    const call = async () => {
      const pc = makePc();
      setRemote([]); setState('connecting');
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      sock.signal({ sdp: pc.localDescription, meta: metaRef.current });
    };
    const sock = openRoomSocket(room, async (m) => {
      if (closed) return;
      if (m.type === 'joined') { const has = m.peers.length > 0; setPeerPresent(has); setState(has ? 'connecting' : 'waiting'); if (has && role === 'candidate') call(); }
      else if (m.type === 'peer-joined') { setPeerPresent(true); if (role === 'candidate') call(); }
      else if (m.type === 'peer-left') { setPeerPresent(false); setState('waiting'); setRemote([]); }
      else if (m.type === 'status') appCb.current?.({ status: m });
      else if (m.type === 'signal') {
        const d = m.data || {};
        if (d.app) { appCb.current?.(d.app); return; }
        if (d.sdp) {
          if (d.sdp.type === 'offer') {
            const pc = makePc(); setRemote([]);
            if (d.meta) appCb.current?.({ meta: d.meta });
            await pc.setRemoteDescription(d.sdp);
            const ans = await pc.createAnswer();
            await pc.setLocalDescription(ans);
            sock.signal({ sdp: pc.localDescription });
          } else if (d.sdp.type === 'answer') await pcRef.current?.setRemoteDescription(d.sdp);
        } else if (d.ice) { try { await pcRef.current?.addIceCandidate(d.ice); } catch { /* late candidate */ } }
        else if (d.renegotiate && role === 'candidate') call();
      }
    });
    sockRef.current = sock;
    return () => { closed = true; sock.close(); pcRef.current?.close(); pcRef.current = null; setRemote([]); setState('idle'); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, room, role]);

  return {
    remote, state, peerPresent,
    sendApp: (app: any) => sockRef.current?.signal({ app }),
    setMeta: (meta: any) => { metaRef.current = meta; },
    requestRenegotiate: () => sockRef.current?.signal({ renegotiate: true }),
  };
}
