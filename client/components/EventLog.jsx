// EventLog.jsx
import React, { useMemo, useState, useRef, useEffect } from "react";
import PropTypes from "prop-types";
import getUtterances from "../utils/logger.js"; // expects { id, role: 'user'|'assistant', text, at }

function ConversationTurn({ turn, rawEvent }) {
  const [open, setOpen] = useState(false);
  const label = turn.role === "user"
   ? "Usuario"
   : turn.role === "assistant"
   ? "Lupita"
   : "Herramienta"; // handle "tool"

  return (
    <div className={`turn ${turn.role}`} data-open={open ? "true" : "false"}>
      <button
        type="button"
        className="turn-row"
        aria-expanded={open}
        onClick={() => setOpen(v => !v)}
      >
        <div className="role">{label}</div>
        <div className="text">
         {typeof turn.text === "string" ? turn.text : JSON.stringify(turn.text)}
         </div>
        <time className="timestamp" dateTime={turn.at}>
          {new Date(turn.at).toLocaleString()}
        </time>
      </button>

      <div className="turn-details" hidden={!open}>
        <pre className="turn-json">
{JSON.stringify(rawEvent ?? {}, null, 2)}
        </pre>
      </div>
    </div>
  );
}

ConversationTurn.propTypes = {
  turn: PropTypes.shape({
    id: PropTypes.string.isRequired,
    role: PropTypes.oneOf(["user", "assistant", "tool"]).isRequired,
    // Tool outputs might not be plain strings once you start passing objects
    text: PropTypes.oneOfType([PropTypes.string, PropTypes.object]).isRequired,
    at: PropTypes.string.isRequired,
  }).isRequired,
  rawEvent: PropTypes.object, // original event for this turn (shown when expanded)
};

export default function EventLog({ status, statusLabel, events = [] }) {
  // Build compact conversation turns
  const turns = useMemo(() => getUtterances(events), [events]);

  // Fast lookup from event_id -> raw event (so we can show JSON on expand)
  const eventById = useMemo(() => {
    const m = new Map();
    for (const ev of events) m.set(ev.event_id, ev);
    return m;
  }, [events]);

  // Auto-scroll to the latest turn
  const prevCount = useRef(0);

  useEffect(() => {
    // Only autoscroll when new items are added
    if (turns.length > prevCount.current) {
      const prefersReduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

      // Optional: only autoscroll if user is already near the bottom
      const nearBottom =
        window.innerHeight + window.scrollY >=
        document.documentElement.scrollHeight - 200;

      if (nearBottom) {
        window.scrollTo({
          top: document.documentElement.scrollHeight,
          behavior: prefersReduced ? "auto" : "smooth",
        });
      }
    }
    prevCount.current = turns.length;
  }, [turns.length]);

  return (
    <section className="event-log" aria-label="Event log">
      <div className="status-pill" data-status={status} role="status" aria-live="polite">
        {/* Keep data-status as the machine value for styling/logic */}
        Estado: {statusLabel ?? status ?? "—"}
      </div>

      <h3 className="heading">Conversación</h3>

      <div className="events-container" aria-live="polite">
        {turns.length === 0 ? (
          <div className="empty">Esperando conversación……</div>
        ) : (
          turns.map(t => (
            <ConversationTurn
              key={t.id}
              turn={t}
              rawEvent={eventById.get(t.id)}
            />
          ))
        )}
      </div>
    </section>
  );
}

EventLog.propTypes = {
  status: PropTypes.string,
  statusLabel: PropTypes.string,
  events: PropTypes.arrayOf(PropTypes.object),
};
