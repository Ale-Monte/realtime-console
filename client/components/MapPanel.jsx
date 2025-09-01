// src/components/MapPanel.jsx
import React, { useMemo, useState, useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap, Tooltip } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

/**
 * Selects the most recent checa_precios tool execution from an events array.
 * It tolerates the result being a JSON string or an object.
 */
export function selectLatestPriceCheck(events = []) {
  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i];
    if (ev?.type === "tool.executed" && ev?.name === "checa_precios") {
      let res = ev.result ?? ev.output ?? ev.data ?? null;
      if (typeof res === "string") {
        try {
          res = JSON.parse(res);
        } catch {
          res = null;
        }
      }
      if (res && Array.isArray(res.stores)) {
        return { item: res.item ?? "", stores: res.stores };
      }
    }
  }
  return null;
}

// ---------- Leaflet icon helpers ----------
const makeMarkerIcon = (hex = "#4f46e5") =>
  L.icon({
    iconUrl:
      "data:image/svg+xml;charset=UTF-8," +
      encodeURIComponent(`
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 36">
          <path fill="${hex}" d="M12 0c6.1 0 11 4.9 11 11 0 8.6-11 25-11 25S1 19.6 1 11C1 4.9 5.9 0 12 0z"/>
          <circle cx="12" cy="11" r="4.5" fill="white" fill-opacity="0.9"/>
        </svg>
      `),
    iconSize: [24, 36],
    iconAnchor: [12, 36],
    popupAnchor: [0, -30],
  });

const defaultIcon = makeMarkerIcon("#ea4335");

// ---------- Map utilities ----------
function InvalidateOnChange({ deps }) {
  const map = useMap();
  useEffect(() => {
    const t = setTimeout(() => map.invalidateSize(), 150);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return null;
}

// Fit map to all current locations (runs on data changes and panel resize)
function FitToLocations({ locations, trigger, padding = [48, 48], maxZoom = 16 }) {
  const map = useMap();

  useEffect(() => {
    if (!locations?.length) return;

    // Deduplicate identical coords (multiple prices at same store)
    const unique = [];
    const seen = new Set();
    for (const { position } of locations) {
      const key = `${position[0].toFixed(6)},${position[1].toFixed(6)}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(L.latLng(position[0], position[1]));
      }
    }

    if (unique.length === 1) {
      map.setView(unique[0], Math.min(map.getMaxZoom() || 18, maxZoom), { animate: true });
    } else {
      const bounds = L.latLngBounds(unique);
      map.fitBounds(bounds, { padding, maxZoom, animate: true });
    }
  }, [map, locations, trigger, padding, maxZoom]);

  return null;
}

const formatMXN = (value) => {
  if (typeof value !== "number" || Number.isNaN(value)) return "—";
  try {
    return value.toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 2 });
  } catch {
    return `$${value.toFixed(2)}`;
  }
};

// ---------- Component ----------
export default function MapPanel({ events = [], className = "" }) {
  const [open, setOpen] = useState(true);
  const [expanded, setExpanded] = useState(false);

  const latest = useMemo(() => selectLatestPriceCheck(events), [events]);

  // Build markers strictly from checa_precios result; NO placeholders
  const locations = useMemo(() => {
    if (latest?.stores?.length) {
      return latest.stores
        .filter(
          (s) =>
            typeof s?.latitude === "number" &&
            typeof s?.longitude === "number" &&
            !Number.isNaN(s.latitude) &&
            !Number.isNaN(s.longitude)
        )
        .map((s, i) => ({
          id: `store-${i}`,
          name: s.store || "Tienda",
          price: formatMXN(s.price),
          position: [s.latitude, s.longitude],
        }));
    }
    return []; // <<— no demo markers
  }, [latest]);

  // Initial center: Mexico City; if we have locations, average them
  const center = useMemo(() => {
    if (!locations.length) return [19.4326, -99.1332]; // CDMX center
    const lat = locations.reduce((s, l) => s + l.position[0], 0) / locations.length;
    const lng = locations.reduce((s, l) => s + l.position[1], 0) / locations.length;
    return [lat, lng];
  }, [locations]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open locations map"
        className="map-fab"
      >
        Map
      </button>
    );
  }

  // ---------- Title building with truncation when panel is small ----------
  const PREFIX = "Precios para: ";
  const rawItem = latest?.item?.toString().trim() || "";
  const fullTitle = rawItem ? `${PREFIX}${rawItem}` : "Consulta el precio de un producto";

  const ellipsize = (str, max) =>
    typeof str === "string" && str.length > max ? str.slice(0, max - 1).trimEnd() + "…" : str;

  const maxChars = expanded ? 64 : 28;

  const title = rawItem
    ? `${PREFIX}${ellipsize(rawItem, Math.max(10, maxChars - PREFIX.length))}`
    : "Consulta el precio de un producto";

  return (
    <div
      className={`map-panel ${className}`}
      role="dialog"
      aria-label="Locations map"
      data-expanded={expanded ? "true" : "false"}
    >
      <div className="map-panel__header">
        <span className="map-panel__title" title={fullTitle}>
          {title}
        </span>

        <div className="map-panel__actions">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-label={expanded ? "Restore map size" : "Expand map"}
            className="map-panel__iconbtn"
            title={expanded ? "Restore" : "Expand"}
          >
            {expanded ? "↙︎" : "↗︎"}
          </button>

          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close map panel"
            className="map-panel__iconbtn"
            title="Close"
          >
            ×
          </button>
        </div>
      </div>

      <div className="map-panel__body">
        <MapContainer center={center} zoom={12} scrollWheelZoom style={{ height: "100%" }}>
          <InvalidateOnChange deps={[expanded]} />
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {/* Auto-fit whenever locations change, and also when panel expands */}
          <FitToLocations locations={locations} trigger={expanded} />

          {/* Render markers only when we actually have locations */}
          {locations.map((loc) => (
            <Marker key={loc.id} position={loc.position} icon={defaultIcon}>
              <Tooltip
                permanent
                direction="top"
                offset={[0, -32]}
                className="map-label"
                interactive={false}
              >
                <div className="map-label__row">
                  <span className="map-label__name">{loc.name}</span>
                  <span className="map-label__dot" aria-hidden="true">•</span>
                  <span className="map-label__price">{loc.price}</span>
                </div>
              </Tooltip>

              <Popup>
                <strong>{loc.name}</strong>
                <div style={{ fontSize: 12, opacity: 0.8 }}>
                  {loc.position[0].toFixed(4)}, {loc.position[1].toFixed(4)}
                </div>
                <div style={{ marginTop: 6 }}>
                  Precio: <strong>{loc.price}</strong>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
    </div>
  );
}
