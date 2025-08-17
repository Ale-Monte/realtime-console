// useRealtime.jsx
import { useCallback, useEffect, useRef, useState } from 'react';
import { BASE_URL, MODEL } from '../../config.js';

export default function useRealtime() {
  const [status, setStatus] = useState('idle'); // idle | connecting | connected | error
  const [muted, setMuted] = useState(false);

  // Sstructured events for UI
  const [events, setEvents] = useState([]);
  const pushEvent = useCallback((ev) => {
    setEvents((prev) => [...prev, ev]);
  }, []);
  // Helper to mark client-originated events (ids must NOT start with "event_")
  const makeClientEvent = useCallback((type, data = {}) => ({
    event_id: `client_${Math.random().toString(36).slice(2)}`,
    type,
    timestamp: new Date().toISOString(),
    ...data,
  }), []);

  const audioRef = useRef(null);
  const pcRef = useRef(null);
  const dcRef = useRef(null);
  const micTrackRef = useRef(null);

  const connect = useCallback(async () => {
    if (status === 'connected' || status === 'connecting') return;
    setStatus('connecting');

    try {
      // 1) Fetch ephemeral token from server (expires ~60s)
      const tokenRes = await fetch('/session');
      const tokenJson = await tokenRes.json();
      if (!tokenRes.ok) throw new Error(tokenJson.error || 'Failed to get session token');
      const EPHEMERAL_KEY = tokenJson?.client_secret?.value;
      if (!EPHEMERAL_KEY) throw new Error('No ephemeral key in response');

      // 2) Create RTCPeerConnection
      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      // 3) Remote audio (model -> browser)
      const audioEl = audioRef.current || document.createElement('audio');
      audioEl.autoplay = true;
      pc.ontrack = (e) => {
        audioEl.srcObject = e.streams[0];
      };
      audioRef.current = audioEl;

      // 4) Local mic (browser -> model)
      const ms = await navigator.mediaDevices.getUserMedia({ audio: true });
      const [micTrack] = ms.getTracks();
      micTrackRef.current = micTrack;
      pc.addTrack(micTrack, ms);

      // 5) Data channel for events
      const dc = pc.createDataChannel('oai-events');
      dcRef.current = dc;
      dc.addEventListener('message', (e) => {
        // replaced logger: record server event as structured JSON if possible
        try {
          const ev = JSON.parse(e.data);
          const normalized = {
            event_id: ev.event_id ?? `event_${Math.random().toString(36).slice(2)}`, // "event_" => server
            type: ev.type ?? 'server.event',
            timestamp: ev.timestamp ?? new Date().toISOString(),
            ...ev,
          };
          pushEvent(normalized);

          if (normalized.type === 'response.done') {
            // optionally surface a compact summary as a client-side note
            pushEvent(makeClientEvent('response.done.summary', {
              summary: JSON.stringify(normalized.response?.output?.[0] ?? normalized.response),
            }));
          }
        } catch {
          // non-JSON event
          pushEvent({
            event_id: `event_${Math.random().toString(36).slice(2)}`,
            type: 'server.message',
            timestamp: new Date().toISOString(),
            payload: e.data,
          });
        }
      });

      // 6) Offer/Answer SDP with Realtime API
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const sdpRes = await fetch(`${BASE_URL}?model=${encodeURIComponent(MODEL)}`, {
        method: 'POST',
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${EPHEMERAL_KEY}`,
          'Content-Type': 'application/sdp',
        },
      });

      if (!sdpRes.ok) {
        const txt = await sdpRes.text();
        throw new Error(`SDP exchange failed: ${sdpRes.status} ${txt}`);
      }

      const answer = { type: 'answer', sdp: await sdpRes.text() };
      await pc.setRemoteDescription(answer);

      pc.onconnectionstatechange = () => {
        // replaced logger: record pc state as a client event
        pushEvent(makeClientEvent('pc.state', { state: pc.connectionState }));
        if (pc.connectionState === 'connected') setStatus('connected');
        if (['failed', 'closed', 'disconnected'].includes(pc.connectionState)) {
          setStatus('idle');
        }
      };

      setStatus('connected');
      // replaced logger: record session created
      pushEvent(makeClientEvent('session.created', { note: 'waiting for events...' }));
    } catch (err) {
      console.error(err);
      // replaced logger: record error as a client event
      pushEvent(makeClientEvent('session.error', { message: err.message || String(err) }));
      setStatus('error');
    }
  }, [status, pushEvent, makeClientEvent]);

  const disconnect = useCallback(() => {
    try {
      dcRef.current?.close();
      pcRef.current?.getSenders()?.forEach((s) => s.track && s.track.stop());
      pcRef.current?.close();
    } catch {}
    dcRef.current = null;
    pcRef.current = null;
    micTrackRef.current = null;
    setStatus('idle');
    // replaced logger: record disconnect
    pushEvent(makeClientEvent('session.disconnected'));
  }, [pushEvent, makeClientEvent]);

  const toggleMute = useCallback(() => {
    const track = micTrackRef.current;
    if (!track) return;
    track.enabled = !track.enabled;
    setMuted(!track.enabled);
    // optional: record mute state as client events
    pushEvent(makeClientEvent(track.enabled ? 'mic.unmuted' : 'mic.muted'));
  }, [pushEvent, makeClientEvent]);

  useEffect(() => () => disconnect(), [disconnect]);

  return {
    status,
    muted,
    events,
    connect,
    disconnect,
    toggleMute,
    audioRef,
  };
}