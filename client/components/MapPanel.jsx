import React, { useMemo, useState, useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap, Tooltip } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Fix default marker icon paths (Leaflet + bundlers)
const makeMarkerIcon = (hex = "#4f46e5") =>
  L.icon({
    // Tiny colorable SVG pin (24x36)
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
    // no shadow for a cleaner, minimalist look
  });

// Single color for all markers:
const defaultIcon = makeMarkerIcon("#ea4335"); // ← change this hex to recolor

// Helper child: invalidate Leaflet size when panel size changes
function InvalidateOnChange({ deps }) {
  const map = useMap();
  useEffect(() => {
    const t = setTimeout(() => map.invalidateSize(), 150);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return null;
}

export default function MapPanel() {
  const [open, setOpen] = useState(true);
  const [expanded, setExpanded] = useState(false);

  // Three hardcoded markers with name + price
  const locations = useMemo(
    () => [
      { id: "loc-1", name: "Chapultepec", price: "$259", position: [19.426282, -99.188012] },
      { id: "loc-2", name: "Revolución", price: "$329", position: [19.435322, -99.154089] },
      { id: "loc-3", name: "Condesa", price: "$189", position: [19.414220, -99.171619] },
    ],
    []
  );

  const center = useMemo(() => {
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

  return (
    <div
      className="map-panel"
      role="dialog"
      aria-label="Locations map"
      data-expanded={expanded ? "true" : "false"}
    >
      <div className="map-panel__header">
        <span className="map-panel__title">Locations</span>

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

          {locations.map((loc) => (
            <Marker key={loc.id} position={loc.position} icon={defaultIcon}>
              {/* Minimal, always-visible label above the marker */}
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

              {/* Click-to-open details still available */}
              <Popup>
                <strong>{loc.name}</strong>
                <div style={{ fontSize: 12, opacity: 0.8 }}>
                  {loc.position[0].toFixed(4)}, {loc.position[1].toFixed(4)}
                </div>
                <div style={{ marginTop: 6 }}>Price: <strong>{loc.price}</strong></div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
    </div>
  );
}
