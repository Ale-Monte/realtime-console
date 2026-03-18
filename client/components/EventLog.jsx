import React, { useMemo, useState, useRef, useEffect } from "react";
import PropTypes from "prop-types";
import getUtterances from "../utils/logger.js";

function getEventLogText(language = "") {
  if (String(language).toLowerCase().startsWith("es")) {
    return {
      eventLogAria: "Registro de eventos",
      statusPrefix: "Estado:",
      heading: "Conversación",
      empty: "Esperando conversación...",
      user: "Usuario",
      assistant: "Lupita",
      tool: "Herramienta",
      missingStatus: "—",
    };
  }

  return {
    eventLogAria: "Event log",
    statusPrefix: "Status:",
    heading: "Conversation",
    empty: "Waiting for conversation...",
    user: "User",
    assistant: "Lupita",
    tool: "Tool",
    missingStatus: "—",
  };
}

function ConversationTurn({ turn, rawEvent, text }) {
  const [open, setOpen] = useState(false);
  const label =
    turn.role === "user"
      ? text.user
      : turn.role === "assistant"
        ? text.assistant
        : text.tool;

  return (
    <div className={`turn ${turn.role}`} data-open={open ? "true" : "false"}>
      <button
        type="button"
        className="turn-row"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
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
    text: PropTypes.oneOfType([PropTypes.string, PropTypes.object]).isRequired,
    at: PropTypes.string.isRequired,
  }).isRequired,
  rawEvent: PropTypes.object,
  text: PropTypes.shape({
    user: PropTypes.string.isRequired,
    assistant: PropTypes.string.isRequired,
    tool: PropTypes.string.isRequired,
  }).isRequired,
};

export default function EventLog({ status, statusLabel, events = [], language = "" }) {
  const turns = useMemo(() => getUtterances(events), [events]);
  const text = useMemo(() => getEventLogText(language), [language]);

  const eventById = useMemo(() => {
    const m = new Map();
    for (const ev of events) m.set(ev.event_id, ev);
    return m;
  }, [events]);

  const prevCount = useRef(0);

  useEffect(() => {
    if (turns.length > prevCount.current) {
      const prefersReduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
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
    <section className="event-log" aria-label={text.eventLogAria}>
      <div className="status-pill" data-status={status} role="status" aria-live="polite">
        {text.statusPrefix} {statusLabel ?? status ?? text.missingStatus}
      </div>

      <h3 className="heading">{text.heading}</h3>

      <div className="events-container" aria-live="polite">
        {turns.length === 0 ? (
          <div className="empty">{text.empty}</div>
        ) : (
          turns.map((t) => (
            <ConversationTurn
              key={t.id}
              turn={t}
              rawEvent={eventById.get(t.id)}
              text={text}
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
  language: PropTypes.string,
};
