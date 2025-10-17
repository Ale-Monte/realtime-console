// client/hooks/useRealtime.jsx
import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { BASE_URL, MODEL } from '../../config.js';
import { TOOL_SPEC, runToolByName } from '../utils/toolRegistry.js';

export default function useRealtime(language) {
  const [status, setStatus] = useState('idle'); // idle | connecting | connected | error
  const [muted, setMuted] = useState(false);
  const currentLocaleRef = useRef(language);

  useEffect(() => {
    currentLocaleRef.current = language;
  }, [language]);

  // Spanish labels for UI only (keep internal status values unchanged)
  const STATUS_LABELS_ES = {
    idle: 'Inactivo',
    connecting: 'Conectando',
    connected: 'Conectado',
    error: 'Error',
  };
  const statusLabel = useMemo(() => STATUS_LABELS_ES[status] ?? status, [status]);

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

  // Function Calling Helper to send JSON events to the server over the data channel
  const send = useCallback((obj) => {
    const dc = dcRef.current;
    if (!dc || dc.readyState !== 'open') {
      pushEvent(makeClientEvent('dc.send.error', { reason: 'datachannel not open', payload: obj }));
      return;
    }
    const payload = JSON.stringify(obj);
    dc.send(payload);
    // mirror to local event log
    pushEvent(makeClientEvent('client.event.sent', { payload: obj }));
  }, [pushEvent, makeClientEvent]);

  const connect = useCallback(async () => {
    if (status === 'connected' || status === 'connecting') return;
    setStatus('connecting');

    try {
      const currentLocale = currentLocaleRef.current;
      // 1) Fetch ephemeral token from server (expires ~60s)
      console.log("NEW Connecting with locale:", currentLocale);
      const tokenRes = await fetch(`/session?lang=${encodeURIComponent(currentLocale)}`);
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

      // (Function calling) When DC opens, register callable tools on the session
      dc.addEventListener('open', () => {
        pushEvent(makeClientEvent('dc.open'));
        // Advertise our tool(s) so the model can call them
        send({
          type: 'session.update',
          session: {
            tools: TOOL_SPEC,
            tool_choice: 'auto'
          }
        });
        // (Optional) seed a system note in the log
        pushEvent(makeClientEvent('session.tools.advertised', { tools: TOOL_SPEC.map(t => t.name) }));
      });


      dc.addEventListener('message', async (e) => {
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

          // --- Function-calling bridge ---
          // Look for a completed response that contains a function_call item
          if (normalized.type === 'response.done' && normalized?.response?.output?.length) {
            const fnItem = normalized.response.output.find(o => o.type === 'function_call' && o.status === 'completed');
            if (fnItem && fnItem.name && fnItem.arguments) {
              try {
                // Parse model-provided args (it's a JSON string)
                let args = {};
                try {
                  args = JSON.parse(fnItem.arguments);
                } catch (parseErr) {
                  pushEvent(makeClientEvent('tool.args.parse_error', { raw: fnItem.arguments }));
                  throw parseErr;
                }
                // Run our custom code
                const result = await runToolByName(fnItem.name, args);
                // 1) Provide results back to the model
                send({
                  type: 'conversation.item.create',
                  item: {
                    type: 'function_call_output',
                    call_id: fnItem.call_id, // must echo back to tie the result to the call
                    output: JSON.stringify(result)
                  }
                });
                // 2) Ask the model to continue, now that it has tool output
                send({ type: 'response.create' });
                pushEvent(makeClientEvent('tool.executed', {
                  name: fnItem.name,
                  args,
                  result
                }));
              } catch (toolErr) {
                pushEvent(makeClientEvent('tool.error', { name: fnItem?.name, message: toolErr.message }));
              }
            }
          }


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
  }, [status, pushEvent, makeClientEvent, send]);

  const disconnect = useCallback(async () => {
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

  const restartSession = useCallback(async () => {
    console.log("Restarting session with locale:", currentLocaleRef.current);
    await disconnect();
  }, [disconnect, connect]);

  useEffect(() => {
    if (status === 'connected') {
      restartSession();
    }
  }, [language]);

  useEffect(() => () => disconnect(), [disconnect]);

  return {
    status,        // original machine value (unchanged)
    statusLabel,   // Spanish UI label
    muted,
    events,
    connect,
    disconnect,
    toggleMute,
    restartSession,
    audioRef,
  };
}
