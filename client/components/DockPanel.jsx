// DockPanel.jsx
import React, { useMemo, useState, useId, useEffect, useRef } from "react";

// (unchanged) helper — optional, but handy if you’ll use it again
export function selectLatestAssistantFields(events = []) {
  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i];

    // Build a small set of candidate payloads to inspect
    const candidates = [];
    if (typeof ev === "string") {
      candidates.push(ev);
    } else if (ev && typeof ev === "object") {
      candidates.push(ev, ev.result, ev.output, ev.data);
    }

    for (const c of candidates) {
      if (!c) continue;

      let obj = c;
      if (typeof c === "string") {
        try { obj = JSON.parse(c); } catch { obj = null; }
      }
      if (!obj || typeof obj !== "object") continue;

      // Support both file_paths (array or string) and file_path (string)
      const hasAssistant = Object.prototype.hasOwnProperty.call(obj, "assistant_response");
      const hasPaths = Object.prototype.hasOwnProperty.call(obj, "file_paths")
                   || Object.prototype.hasOwnProperty.call(obj, "file_path");

      if (hasAssistant || hasPaths) {
        const assistant_response = String(obj.assistant_response ?? "");
        let paths = obj.file_paths ?? obj.file_path ?? [];
        if (!Array.isArray(paths)) paths = [paths];
        const file_paths = paths.filter(Boolean).map(String);
        return { assistant_response, file_paths };
      }
    }
  }
  return { assistant_response: "", file_paths: [] };
}

/** Lightweight CSV parser that handles quotes, commas, CRLF, and escaped quotes.
 *  Returns up to `limit`+1 rows (including header).
 */
function parseCSV(text, delimiter = ",", limit = 100) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  const pushField = () => { row.push(field); field = ""; };
  const pushRow = () => { rows.push(row); row = []; };

  for (let i = 0; i < text.length; i++) {
    const c = text[i];

    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } // escaped quote
        else { inQuotes = false; }
      } else {
        field += c;
      }
    } else {
      if (c === '"') inQuotes = true;
      else if (c === delimiter) pushField();
      else if (c === "\n") {
        pushField(); pushRow();
        if (rows.length > limit) break; // header + limit rows
      } else if (c === "\r") {
        // ignore; will be handled alongside \n for CRLF
      } else {
        field += c;
      }
    }
  }
  // trailing field/row (when file doesn't end with newline)
  if (field !== "" || row.length) { pushField(); pushRow(); }
  return rows;
}

function detectDelimiter(sample) {
  // very simple heuristic
  if (sample.includes(",")) return ",";
  if (sample.includes("\t")) return "\t";
  if (sample.includes(";")) return ";";
  return ","; // default
}

/** CSVPreview
 *  - Auto-loads CSV from:
 *      1) prop csvUrl (if provided)
 *      2) ?csv=<url> query param
 *      3) /data.csv (default)
 *  - Shows first 100 rows (excluding header)
 */
function CSVPreview({ csvUrl: csvUrlProp }) {
  const [state, setState] = useState({ loading: true, error: null, headers: [], rows: [] });

  const resolvedUrl = useMemo(() => {
    if (csvUrlProp) return csvUrlProp;
    if (typeof window !== "undefined") {
      const u = new URL(window.location.href);
      const q = u.searchParams.get("csv");
      if (q) return q;
    }
    return "/data.csv"; // default path (put the file in /public as data.csv)
  }, [csvUrlProp]);

  useEffect(() => {
    let cancelled = false;
    setState(s => ({ ...s, loading: true, error: null }));

    fetch(resolvedUrl, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status} loading ${resolvedUrl}`);
        const text = await res.text();
        const firstChunk = text.slice(0, 2048);
        const delim = detectDelimiter(firstChunk);
        const all = parseCSV(text, delim, 100); // header + 100 rows
        const headers = all[0] ?? [];
        const rows = (all.length > 1 ? all.slice(1) : []);
        if (!cancelled) setState({ loading: false, error: null, headers, rows });
      })
      .catch((err) => {
        if (!cancelled) setState({ loading: false, error: err.message, headers: [], rows: [] });
      });

    return () => { cancelled = true; };
  }, [resolvedUrl]);

  const { headers, rows } = state;

  return (
    <div className="dock-default-pane dock-csv">

      <div className="dock-csv__scroller" role="region" aria-label="CSV preview">
        <table className="dock-csv__table" role="table">
          {headers.length > 0 && (
            <thead>
              <tr>
                {headers.map((h, i) => (
                  <th key={i}>
                    {String(h ?? "")}
                  </th>
                ))}
              </tr>
            </thead>
          )}
          <tbody>
            {rows.slice(0, 100).map((r, ri) => (
              <tr key={ri}>
                {(headers.length ? headers : r).map((_, ci) => (
                  <td key={ci}>
                    {String(r[ci] ?? "")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {rows.length > 100 && (
        <p style={{ marginTop: 8, opacity: 0.8 }}>
          There are more rows in the file; only the first 100 are shown for preview.
        </p>
      )}
    </div>
  );
}

export default function DockPanel({
  events = [],
  className = "",
  defaultOpen = true,
  defaultExpanded = false,
  children,
  tabs = null,
  initialTabId = null,
  /** Optional: let callers override the CSV URL without touching App.jsx
   *  If not provided, uses ?csv=… or /data.csv
   */
  csvUrl = null,
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [expanded, setExpanded] = useState(defaultExpanded);

  /* Loading state for data_analyzer + refs to track matching call_ids + progress */
  const [loadingAnalyzer, setLoadingAnalyzer] = useState(false);
  const pendingAnalyzerRef = useRef(new Set());
  const processedIndexRef = useRef(0);

  /* Parsed assistant fields */
  const latestAssistant = useMemo(() => selectLatestAssistantFields(events), [events]);
  // Track previous event count to detect new incoming events
  const prevEventCountRef = useRef(events?.length ?? 0);

  const title = "Análisis de Datos";

  /* Add latestAssistant to ctx */
  const ctx = { events, latestAssistant, expanded };

  // Render body content when custom tabs are NOT used
  const fallbackContent =
    typeof children === "function" ? children(ctx) : children;

  // --- Tabs: force three defaults if none provided ---
  const userTabs =
    Array.isArray(tabs) && tabs.length > 0
      ? tabs.filter(t => t && t.id && t.label && t.render)
      : null;

  const effectiveTabs = useMemo(() => {
    const defaults = [
      {
        id: "data",
        label: "Datos",
        render: () => <CSVPreview csvUrl={csvUrl} />,
      },
      {
        id: "analysis",
        label: "Análisis",
        /* ✨ show assistant_response here */
        render: ({ latestAssistant }) => (
          <div className="dock-default-pane">
            <h3>Análisis</h3>
            <div className="analysis-text" style={{ whiteSpace: "pre-wrap" }}>
              {latestAssistant?.assistant_response || "Solicita analizar los datos de tu tienda."}
            </div>
          </div>
        ),
      },
      {
        id: "graphs",
        label: "Gráficas",
        render: ({ latestAssistant }) => {
          const first = latestAssistant?.file_paths?.[0] || null;
          const isImage = first ? /\.(png|jpe?g|gif|webp|svg)$/i.test(first) : false;

          return (
            <div className="dock-default-pane">
              {/* Only show heading if no image */}
              {!isImage && <h3>Gráficas</h3>}

              {first ? (
                <div>
                  {isImage && (
                    <img
                      src={first}
                      alt="Graph preview"
                      style={{ maxWidth: "100%", height: "auto", display: "block" }}
                    />
                  )}
                </div>
              ) : (
                <p className="analysis-text">Solicita crear una gráfica de tus ventas.</p>
              )}
            </div>
          );
        },
      },
    ];
    return userTabs ?? defaults;
  }, [userTabs, csvUrl]);

  const [activeId, setActiveId] = useState(
    initialTabId && (userTabs ?? []).concat().some(t => t.id === initialTabId)
      ? initialTabId
      : (userTabs ?? [])[0]?.id ?? "data"
  );

  // (REMOVED) Auto-jump when a new event arrives

  /* Detect data_analyzer start/finish from the streamed events */
  useEffect(() => {
    const curr = events?.length ?? 0;
    const prev = processedIndexRef.current || 0;
    if (curr <= prev) return; // nothing new

    const newEvents = events.slice(prev, curr);

    for (const ev of newEvents) {
      // 1) Assistant proposes function calls (from response.done)
      if (ev?.type === "response.done") {
        const output = ev?.response?.output ?? [];
        for (const item of output) {
          if (
            item?.type === "function_call" &&
            item?.name === "data_analyzer" &&
            item?.call_id
          ) {
            pendingAnalyzerRef.current.add(item.call_id);
            setLoadingAnalyzer(true);
          }
        }
      }

      // 2) Server echoes tool output (function_call_output)
      if (
        ev?.type === "conversation.item.created" &&
        ev?.item?.type === "function_call_output"
      ) {
        const callId = ev.item.call_id;
        if (pendingAnalyzerRef.current.has(callId)) {
          pendingAnalyzerRef.current.delete(callId);
          if (pendingAnalyzerRef.current.size === 0) {
            setLoadingAnalyzer(false);
          }

          // NEW: decide which tab to show based on the data_analyzer's output payload
          const paths =
            extractPathsFromOutputPayload(ev.item.output) ||
            extractPathsFromOutputPayload(ev.item.result) ||
            extractPathsFromOutputPayload(ev.item.data) ||
            [];

          const targetId = pickTargetTabId(paths.length > 0, effectiveTabs);
          if (targetId) setActiveId(targetId);
        }
      }
    }

    processedIndexRef.current = curr; // advance processed pointer
  }, [events, effectiveTabs]); // NEW: include effectiveTabs so fallback works with custom tabs

  const activeIndex = (userTabs ?? []).concat(
    userTabs ? [] : [{ id: "data" }, { id: "analysis" }, { id: "graphs" }]
  ).findIndex(t => t.id === activeId);

  // a11y ids
  const baseId = useId();
  const tablistId = `${baseId}-dock-tabs`;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open dock panel"
        className="dock-fab"
      >
        Análisis
      </button>
    );
  }

  const currentTab = effectiveTabs.find(t => t.id === activeId) ?? effectiveTabs[0];

  // NEW: helpers used to choose the tab on tool output
  function extractPathsFromOutputPayload(payload) {
    const tryObjects = Array.isArray(payload) ? payload : [payload];
    for (const part of tryObjects) {
      let obj = part;
      if (typeof part === "string") {
        try { obj = JSON.parse(part); } catch { obj = null; }
      }
      if (!obj || typeof obj !== "object") continue;

      let paths =
        obj.file_paths ??
        obj.file_path ??
        obj.data?.file_paths ??
        obj.data?.file_path ??
        null;

      if (paths != null) {
        if (!Array.isArray(paths)) paths = [paths];
        return paths.filter(Boolean).map(String);
      }
    }
    return [];
  }

  function pickTargetTabId(hasPaths, effectiveTabsList) {
    const preferred = hasPaths ? "graphs" : "analysis";
    if (effectiveTabsList.some(t => t.id === preferred)) return preferred;
    return effectiveTabsList[0]?.id ?? null;
  }

  return (
    <div
      className={`dock-panel ${className}`}
      role="dialog"
      aria-label="Docked panel"
      data-expanded={expanded ? "true" : "false"}
    >
      <div className="dock-panel__header">
        <span className="dock-panel__title">{title}</span>
        <div className="dock-panel__actions">
          <button
            type="button"
            onClick={() => setExpanded(v => !v)}
            aria-label={expanded ? "Restore panel size" : "Expand panel"}
            className="dock-panel__iconbtn"
            title={expanded ? "Restore" : "Expand"}
          >
            {expanded ? "↙︎" : "↗︎"}
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close dock panel"
            className="dock-panel__iconbtn"
            title="Close"
          >
            ×
          </button>
        </div>
      </div>

      <div className="dock-panel__body">
        <div
          role="tabpanel"
          id={`${baseId}-panel-${currentTab.id}`}
          aria-labelledby={`${baseId}-tab-${currentTab.id}`}
          className="dock-tabpanel"
        >
          {currentTab?.render?.({ events, latestAssistant, expanded }) ?? null}
        </div>
      </div>

      {/* Bottom tab strip — always present, centered, fixed count (3) */}
      <div className="dock-tabs" aria-label="Panel tabs">
        <div
          className="dock-tabs__list"
          role="tablist"
          aria-orientation="horizontal"
          id={tablistId}
        >
          {effectiveTabs.map((t, idx) => {
            const selected = t.id === activeId;
            return (
              <button
                key={t.id}
                role="tab"
                aria-selected={selected}
                aria-controls={`${baseId}-panel-${t.id}`}
                id={`${baseId}-tab-${t.id}`}
                className={`dock-tabs__btn${selected ? " is-active" : ""}`}
                onClick={() => setActiveId(t.id)}
                title={t.label}
              >
                <span className="dock-tabs__label">{t.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Full-screen loading overlay while data_analyzer runs */}
      {loadingAnalyzer && (
        <div
          className="dock-loading-overlay"
          role="status"
          aria-live="polite"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            color: "white",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: 24,
            textAlign: "center",
            backdropFilter: "blur(1px)",
          }}
        >
          <div>
            <div
              aria-hidden="true"
              style={{
                width: 40,
                height: 40,
                borderRadius: "50%",
                border: "4px solid rgba(255,255,255,0.4)",
                borderTopColor: "white",
                margin: "0 auto 12px",
                animation: "spin 1s linear infinite",
              }}
            />
            <div style={{ fontSize: 18, fontWeight: 600 }}>Analizando datos…</div>
          </div>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}
    </div>
  );
}
