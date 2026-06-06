import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { MapContainer, TileLayer, Marker, Popup, Polygon } from 'react-leaflet';
import L from 'leaflet';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const EVACUATION_CENTERS = [
  {
    id: 'jesse-robredo',
    name: 'Jesse M. Robredo Coliseum',
    type: 'Primary Evacuation Center',
    note: 'Main evacuation center for Barangay Triangulo residents during flood events',
    position: [13.620122, 123.188095],
    color: '#22c55e',
  },
];

const TRIANGULO_BOUNDARY = [
  [13.622162, 123.193368],
  [13.621778, 123.195934],
  [13.621222, 123.195882],
  [13.621053, 123.196923],
  [13.620874, 123.197226],
  [13.619826, 123.196902],
  [13.619792, 123.197160],
  [13.619419, 123.197081],
  [13.619310, 123.197670],
  [13.617688, 123.197134],
  [13.613977, 123.197774],
  [13.611311, 123.195202],
  [13.607139, 123.197145],
  [13.602733, 123.187140],
  [13.611057, 123.185706],
  [13.611714, 123.186500],
  [13.611770, 123.186722],
  [13.611529, 123.187289],
  [13.611511, 123.187524],
  [13.611704, 123.187806],
  [13.611891, 123.187920],
  [13.612091, 123.187856],
  [13.612502, 123.187898],
  [13.612609, 123.187964],
  [13.612574, 123.188154],
  [13.612936, 123.188138],
  [13.613193, 123.187934],
  [13.613532, 123.188201],
  [13.613921, 123.187954],
  [13.613929, 123.187798],
  [13.614044, 123.187740],
  [13.614219, 123.187710],
  [13.614300, 123.187333],
  [13.616435, 123.187325],
  [13.616637, 123.184921],
  [13.617106, 123.184082],
  [13.618525, 123.185204],
  [13.618746, 123.185162],
  [13.619016, 123.185245],
  [13.619187, 123.185523],
  [13.619383, 123.185558],
  [13.620149, 123.186123],
  [13.620387, 123.186049],
  [13.620389, 123.186138],
  [13.621316, 123.187165],
  [13.621189, 123.187267],
  [13.622423, 123.189744],
  [13.622633, 123.189794],
];

// Custom colored marker icons
function makeIcon(color) {
  return L.divIcon({
    className: '',
    html: `<div style="
      width: 28px; height: 28px;
      background: ${color};
      border: 3px solid #fff;
      border-radius: 50% 50% 50% 0;
      transform: rotate(-45deg);
      box-shadow: 0 2px 6px rgba(0,0,0,0.35);
    "></div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 28],
    popupAnchor: [0, -30],
  });
}

export default function FloodMapPage() {
  return (
    <div className="fade-in">

      {/* Map card */}
      <div className="card" style={{ marginBottom: '20px' }}>
        <div className="card-title">
          🚨 Evacuation Route Map — Barangay Triangulo
          <span style={{ marginLeft: 'auto', fontSize: '0.72rem', fontFamily: 'var(--font-body)', fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: 'var(--text-muted)' }}>
            Click a marker for details
          </span>
        </div>

        <MapContainer
          center={[13.6150, 123.1910]}
          zoom={14}
          style={{ width: '100%', height: 500, borderRadius: 'var(--radius-sm)', zIndex: 0 }}
          scrollWheelZoom={true}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>'
            url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
            subdomains="abcd"
            maxZoom={20}
          />

          {/* Barangay boundary */}
          <Polygon
            positions={TRIANGULO_BOUNDARY}
            pathOptions={{
              color: '#38bdf8',
              fillColor: '#38bdf8',
              fillOpacity: 0.08,
              weight: 2,
              opacity: 0.6,
              dashArray: '6 4',
            }}
          />

          {/* Evacuation center markers */}
          {EVACUATION_CENTERS.map(center => (
            <Marker
              key={center.id}
              position={center.position}
              icon={makeIcon(center.color)}
            >
              <Popup>
                <div style={{ minWidth: 180 }}>
                  <div style={{ fontWeight: 700, fontSize: '0.88rem', marginBottom: 4 }}>
                    🏫 {center.name}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#555', marginBottom: 4 }}>
                    🏷 {center.type}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#777', lineHeight: 1.4 }}>
                    {center.note}
                  </div>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>

        {/* Legend */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginTop: '10px', flexWrap: 'wrap' }}>
          {EVACUATION_CENTERS.map(center => (
            <div key={center.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 12, height: 12, borderRadius: '50%', background: center.color }} />
              <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{center.type}</span>
            </div>
          ))}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 20, height: 3, background: '#38bdf8', borderRadius: 2, opacity: 0.6 }} />
            <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Barangay Boundary</span>
          </div>
          <span style={{ marginLeft: 'auto', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
            Data: PAGASA & OCD Region V
          </span>
        </div>
      </div>

      {/* Evacuation center detail cards */}
      <div className="grid-2">
        {EVACUATION_CENTERS.map(center => (
          <div key={center.id} className="card" style={{ borderLeft: `3px solid ${center.color}` }}>
            <div className="card-title">🏫 {center.name}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Type</span>
                <span style={{
                  fontSize: '0.72rem', fontWeight: 700,
                  color: center.color,
                  background: `${center.color}15`,
                  border: `1px solid ${center.color}30`,
                  borderRadius: 4, padding: '2px 8px',
                }}>
                  {center.type}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Coordinates</span>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                  {center.position[0].toFixed(4)}, {center.position[1].toFixed(4)}
                </span>
              </div>
              <div style={{
                background: 'var(--blue-mid)', borderRadius: 'var(--radius-sm)',
                padding: '10px 12px', fontSize: '0.78rem',
                color: 'var(--text-secondary)', lineHeight: 1.5,
              }}>
                ℹ️ {center.note}
              </div>
            </div>
          </div>
        ))}
      </div>

    </div>
  );
}
