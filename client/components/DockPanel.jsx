import React, { useMemo, useState, useId, useEffect, useRef } from "react";

function getDockText(language = "") {
  if (String(language).toLowerCase().startsWith("es")) {
    return {
      title: "Análisis de Datos",
      dataTab: "Datos",
      analysisTab: "Análisis",
      graphsTab: "Gráficas",
      analysisHeading: "Análisis",
      graphsHeading: "Gráficas",
      analysisPrompt: "Solicita analizar los datos de tu tienda.",
      graphsPrompt: "Solicita crear una gráfica de tus ventas.",
      fabLabel: "Análisis",
      loading: "Analizando datos...",
      csvPreviewAria: "Vista previa del CSV",
      moreRows: "Hay más filas en el archivo; solo se muestran las primeras 100 para vista previa.",
      graphAlt: "Vista previa de la gráfica",
      openDockAria: "Open dock panel",
      dockAria: "Docked panel",
      restoreAria: "Restore panel size",
      expandAria: "Expand panel",
      restoreTitle: "Restore",
      expandTitle: "Expand",
      closeAria: "Close dock panel",
      closeTitle: "Close",
      tabsAria: "Panel tabs",
    };
  }

  return {
    title: "Data Analysis",
    dataTab: "Data",
    analysisTab: "Analysis",
    graphsTab: "Charts",
    analysisHeading: "Analysis",
    graphsHeading: "Charts",
    analysisPrompt: "Ask to analyze your store data.",
    graphsPrompt: "Ask to create a chart for your sales.",
    fabLabel: "Analysis",
    loading: "Analyzing data...",
    csvPreviewAria: "CSV preview",
    moreRows: "There are more rows in the file; only the first 100 are shown for preview.",
    graphAlt: "Chart preview",
    openDockAria: "Open dock panel",
    dockAria: "Docked panel",
    restoreAria: "Restore panel size",
    expandAria: "Expand panel",
    restoreTitle: "Restore",
    expandTitle: "Expand",
    closeAria: "Close dock panel",
    closeTitle: "Close",
    tabsAria: "Panel tabs",
  };
}

export function selectLatestAssistantFields(events = []) {
  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i];

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
        try {
          obj = JSON.parse(c);
        } catch {
          obj = null;
        }
      }
      if (!obj || typeof obj !== "object") continue;

      const hasAssistant = Object.prototype.hasOwnProperty.call(obj, "assistant_response");
      const hasPaths =
        Object.prototype.hasOwnProperty.call(obj, "file_paths") ||
        Object.prototype.hasOwnProperty.call(obj, "file_path");

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

function parseCSV(text, delimiter = ",", limit = 100) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const c = text[i];

    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === delimiter) {
      pushField();
    } else if (c === "\n") {
      pushField();
      pushRow();
      if (rows.length > limit) break;
    } else if (c !== "\r") {
      field += c;
    }
  }

  if (field !== "" || row.length) {
    pushField();
    pushRow();
  }
  return rows;
}

function detectDelimiter(sample) {
  if (sample.includes(",")) return ",";
  if (sample.includes("\t")) return "\t";
  if (sample.includes(";")) return ";";
  return ",";
}

function CSVPreview({ csvUrl: csvUrlProp, text }) {
  const [state, setState] = useState({ loading: true, error: null, headers: [], rows: [] });

  const resolvedUrl = useMemo(() => {
    if (csvUrlProp) return csvUrlProp;
    if (typeof window !== "undefined") {
      const u = new URL(window.location.href);
      const q = u.searchParams.get("csv");
      if (q) return q;
    }
    return "/data.csv";
  }, [csvUrlProp]);

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));

    fetch(resolvedUrl, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status} loading ${resolvedUrl}`);
        const csvText = await res.text();
        const firstChunk = csvText.slice(0, 2048);
        const delim = detectDelimiter(firstChunk);
        const all = parseCSV(csvText, delim, 100);
        const headers = all[0] ?? [];
        const rows = all.length > 1 ? all.slice(1) : [];
        if (!cancelled) setState({ loading: false, error: null, headers, rows });
      })
      .catch((err) => {
        if (!cancelled) {
          setState({ loading: false, error: err.message, headers: [], rows: [] });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [resolvedUrl]);

  const { headers, rows } = state;

  return (
    <div className="dock-default-pane dock-csv">
      <div className="dock-csv__scroller" role="region" aria-label={text.csvPreviewAria}>
        <table className="dock-csv__table" role="table">
          {headers.length > 0 && (
            <thead>
              <tr>
                {headers.map((h, i) => (
                  <th key={i}>{String(h ?? "")}</th>
                ))}
              </tr>
            </thead>
          )}
          <tbody>
            {rows.slice(0, 100).map((r, ri) => (
              <tr key={ri}>
                {(headers.length ? headers : r).map((_, ci) => (
                  <td key={ci}>{String(r[ci] ?? "")}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {rows.length > 100 && (
        <p style={{ marginTop: 8, opacity: 0.8 }}>{text.moreRows}</p>
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
  language = "",
  csvUrl = null,
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [loadingAnalyzer, setLoadingAnalyzer] = useState(false);
  const pendingAnalyzerRef = useRef(new Set());
  const processedIndexRef = useRef(0);

  const latestAssistant = useMemo(() => selectLatestAssistantFields(events), [events]);
  const text = useMemo(() => getDockText(language), [language]);
  const title = text.title;

  const ctx = { events, latestAssistant, expanded };
  const fallbackContent = typeof children === "function" ? children(ctx) : children;

  const userTabs =
    Array.isArray(tabs) && tabs.length > 0
      ? tabs.filter((t) => t && t.id && t.label && t.render)
      : null;

  const effectiveTabs = useMemo(() => {
    const defaults = [
      {
        id: "data",
        label: text.dataTab,
        render: () => <CSVPreview csvUrl={csvUrl} text={text} />,
      },
      {
        id: "analysis",
        label: text.analysisTab,
        render: ({ latestAssistant: latest }) => (
          <div className="dock-default-pane">
            <h3>{text.analysisHeading}</h3>
            <div className="analysis-text" style={{ whiteSpace: "pre-wrap" }}>
              {latest?.assistant_response || text.analysisPrompt}
            </div>
          </div>
        ),
      },
      {
        id: "graphs",
        label: text.graphsTab,
        render: ({ latestAssistant: latest }) => {
          const first = latest?.file_paths?.[0] || null;
          const isImage = first ? /\.(png|jpe?g|gif|webp|svg)$/i.test(first) : false;

          return (
            <div className="dock-default-pane">
              {!isImage && <h3>{text.graphsHeading}</h3>}
              {first ? (
                <div>
                  {isImage && (
                    <img
                      src={first}
                      alt={text.graphAlt}
                      style={{ maxWidth: "100%", height: "auto", display: "block" }}
                    />
                  )}
                </div>
              ) : (
                <p className="analysis-text">{text.graphsPrompt}</p>
              )}
            </div>
          );
        },
      },
    ];
    return userTabs ?? defaults;
  }, [userTabs, csvUrl, text]);

  const [activeId, setActiveId] = useState(
    initialTabId && (userTabs ?? []).concat().some((t) => t.id === initialTabId)
      ? initialTabId
      : (userTabs ?? [])[0]?.id ?? "data"
  );

  useEffect(() => {
    const curr = events?.length ?? 0;
    const prev = processedIndexRef.current || 0;
    if (curr <= prev) return;

    const newEvents = events.slice(prev, curr);

    for (const ev of newEvents) {
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

    processedIndexRef.current = curr;
  }, [events, effectiveTabs]);

  const baseId = useId();
  const tablistId = `${baseId}-dock-tabs`;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={text.openDockAria}
        className="dock-fab"
      >
        {text.fabLabel}
      </button>
    );
  }

  const currentTab = effectiveTabs.find((t) => t.id === activeId) ?? effectiveTabs[0];

  function extractPathsFromOutputPayload(payload) {
    const tryObjects = Array.isArray(payload) ? payload : [payload];
    for (const part of tryObjects) {
      let obj = part;
      if (typeof part === "string") {
        try {
          obj = JSON.parse(part);
        } catch {
          obj = null;
        }
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
    if (effectiveTabsList.some((t) => t.id === preferred)) return preferred;
    return effectiveTabsList[0]?.id ?? null;
  }

  return (
    <div
      className={`dock-panel ${className}`}
      role="dialog"
      aria-label={text.dockAria}
      data-expanded={expanded ? "true" : "false"}
    >
      <div className="dock-panel__header">
        <span className="dock-panel__title">{title}</span>
        <div className="dock-panel__actions">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-label={expanded ? text.restoreAria : text.expandAria}
            className="dock-panel__iconbtn"
            title={expanded ? text.restoreTitle : text.expandTitle}
          >
            {expanded ? "↙︎" : "↗︎"}
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label={text.closeAria}
            className="dock-panel__iconbtn"
            title={text.closeTitle}
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
          {currentTab?.render?.({ events, latestAssistant, expanded }) ?? fallbackContent ?? null}
        </div>
      </div>

      <div className="dock-tabs" aria-label={text.tabsAria}>
        <div
          className="dock-tabs__list"
          role="tablist"
          aria-orientation="horizontal"
          id={tablistId}
        >
          {effectiveTabs.map((t) => {
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
            <div style={{ fontSize: 18, fontWeight: 600 }}>{text.loading}</div>
          </div>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}
    </div>
  );
}
