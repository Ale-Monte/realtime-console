// src/components/HoroscopePanel.jsx
import React, { useMemo } from "react";

// Optionally export if you want to reuse the selector elsewhere
export function selectLatestHoroscope(events) {
  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i];
    if (ev.type === "tool.executed" && ev.name === "generate_horoscope") {
      return { sign: ev.args?.sign, horoscope: ev.result?.horoscope };
    }
  }
  return null;
}

export default function HoroscopePanel({ events, className = "" }) {
  const latest = useMemo(() => selectLatestHoroscope(events), [events]);

  if (!latest) {
    return (
      <div className={`p-4 rounded-xl border opacity-70 ${className}`}>
        No horoscope yet.
      </div>
    );
  }

  return (
    <div className={`p-4 rounded-xl border ${className}`}>
      <div className="text-xs uppercase opacity-70">
        {latest.sign} — Today’s Horoscope
      </div>
      <div className="text-lg mt-1">{latest.horoscope}</div>
    </div>
  );
}
