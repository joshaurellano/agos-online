import { useState } from 'react';
import { MapContainer, TileLayer, Polygon as LeafletPolygon, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import EvacuationMap3D from '../components/EvacuationMap3D';
import { SectionLabel } from '../components/ui';

// ─── Evacuation Centers ─────────────────────────────────────────────────────
const EVACUATION_CENTERS = [
  {
    id: 'jesse-robredo',
    name: 'Jesse M. Robredo Coliseum',
    type: 'Primary Evacuation Center',
    position: { lat: 13.620122, lng: 123.188095 },
    address:'Ninoy and Cory Ave, Naga City, Camarines Sur',
    color: '#ef4444',
  },
  {
    id: 'triangulo-elem',
    name: 'Triangulo Elementary School',
    type: 'School Evacuation Center',
    position: { lat: 13.6165193, lng: 123.1878926 },
    address:'CBD II, Diversion Road, Barangay Triangulo, Naga City, 4400 Camarines Sur',
    color: '#3b82f6',
  },
  {
    id: 'jose-rizal-elem',
    name: 'Jose Rizal Elementary School',
    type: 'School Evacuation Center',
    position: { lat: 13.6194395, lng: 123.1933071 },
    address: ' J59W+Q9C, Ilang-ilang St, Barangay Triangulo, Naga City, 4400 Camarines Sur',
    color: '#3b82f6',
  },
];

// ─── Barangay Boundary ────────────────────────────────────────────────────────
const TRIANGULO_BOUNDARY = [
  { lat: 13.622162, lng: 123.193368 },
  { lat: 13.621778, lng: 123.195934 },
  { lat: 13.621222, lng: 123.195882 },
  { lat: 13.621053, lng: 123.196923 },
  { lat: 13.620874, lng: 123.197226 },
  { lat: 13.619826, lng: 123.196902 },
  { lat: 13.619792, lng: 123.197160 },
  { lat: 13.619419, lng: 123.197081 },
  { lat: 13.619310, lng: 123.197670 },
  { lat: 13.617688, lng: 123.197134 },
  { lat: 13.613977, lng: 123.197774 },
  { lat: 13.611311, lng: 123.195202 },
  { lat: 13.607139, lng: 123.197145 },
  { lat: 13.602733, lng: 123.187140 },
  { lat: 13.611057, lng: 123.185706 },
  { lat: 13.611714, lng: 123.186500 },
  { lat: 13.611770, lng: 123.186722 },
  { lat: 13.611529, lng: 123.187289 },
  { lat: 13.611511, lng: 123.187524 },
  { lat: 13.611704, lng: 123.187806 },
  { lat: 13.611891, lng: 123.187920 },
  { lat: 13.612091, lng: 123.187856 },
  { lat: 13.612502, lng: 123.187898 },
  { lat: 13.612609, lng: 123.187964 },
  { lat: 13.612574, lng: 123.188154 },
  { lat: 13.612936, lng: 123.188138 },
  { lat: 13.613193, lng: 123.187934 },
  { lat: 13.613532, lng: 123.188201 },
  { lat: 13.613921, lng: 123.187954 },
  { lat: 13.613929, lng: 123.187798 },
  { lat: 13.614044, lng: 123.187740 },
  { lat: 13.614219, lng: 123.187710 },
  { lat: 13.614300, lng: 123.187333 },
  { lat: 13.616435, lng: 123.187325 },
  { lat: 13.616637, lng: 123.184921 },
  { lat: 13.617106, lng: 123.184082 },
  { lat: 13.618525, lng: 123.185204 },
  { lat: 13.618746, lng: 123.185162 },
  { lat: 13.619016, lng: 123.185245 },
  { lat: 13.619187, lng: 123.185523 },
  { lat: 13.619383, lng: 123.185558 },
  { lat: 13.620149, lng: 123.186123 },
  { lat: 13.620387, lng: 123.186049 },
  { lat: 13.620389, lng: 123.186138 },
  { lat: 13.621316, lng: 123.187165 },
  { lat: 13.621189, lng: 123.187267 },
  { lat: 13.622423, lng: 123.189744 },
  { lat: 13.622633, lng: 123.189794 },
];

// ─── Custom pin icon (label + colored pin), replaces the Google AdvancedMarker's
//     custom child markup. Anchor sits at the pin's tip so it points exactly at
//     the marker's coordinates regardless of label width. ─────────────────────
function createCenterIcon(center) {
  const html = `
    <div style="width:140px; display:flex; flex-direction:column; align-items:center;">
      <div style="
        background:${center.color}; color:#fff; font-size:10px; font-weight:700;
        padding:2px 7px; border-radius:4px; white-space:nowrap; margin-bottom:4px;
        box-shadow:0 1px 4px rgba(0,0,0,0.25);
      ">
        ${center.name}
      </div>
      <svg width="24" height="32" viewBox="0 0 24 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 0C5.37 0 0 5.37 0 12c0 8.25 12 20 12 20s12-11.75 12-20C24 5.37 18.63 0 12 0z" fill="${center.color}" />
        <circle cx="12" cy="12" r="4" fill="white" />
      </svg>
    </div>
  `;
  return L.divIcon({
    html,
    className: '', // clears Leaflet's default white-square marker background
    iconSize: [140, 56],
    iconAnchor: [70, 56],   // bottom-center of the box = pin's tip
    popupAnchor: [0, -60],  // pop the popup up above the label
  });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function LegendItem({ color, label, shape = 'circle' }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{
        width: shape === 'circle' ? 10 : 20,
        height: shape === 'circle' ? 10 : 3,
        borderRadius: shape === 'circle' ? '50%' : 2,
        background: color,
        opacity: shape === 'line' ? 0.6 : 1,
        flexShrink: 0,
      }} />
      <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{label}</span>
    </div>
  );
}

function EvacuationCenterCard({ center }) {
  return (
    <div className="card" style={{
      borderTop: `3px solid ${center.color}`,
      display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{
          width: 34, height: 34, borderRadius: 8, flexShrink: 0,
          background: `${center.color}18`, border: `1px solid ${center.color}40`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '1.1rem',
        }}>
          🏫
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.3 }}>
            {center.name}
          </div>
          <div style={{
            display: 'inline-flex', marginTop: 4,
            fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.06em',
            background: `${center.color}18`, color: center.color,
            border: `1px solid ${center.color}40`,
            borderRadius: 4, padding: '2px 7px',
          }}>
            {center.type.toUpperCase()}
          </div>
        </div>
      </div>

      <div style={{
        display: 'flex', flexDirection: 'column', gap: 8,
        background: 'var(--blue-mid)', border: '1px solid var(--blue-border)',
        borderRadius: 6, padding: '8px 12px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Coordinates
          </span>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
            {center.position.lat.toFixed(4)}, {center.position.lng.toFixed(4)}
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', flexShrink: 0 }}>
            Address
          </span>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', textAlign: 'right' }}>
            {center.address}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function FloodMapPage() {
  const [mapView, setMapView] = useState('2d'); // '2d' | '3d'
  const boundaryPositions = TRIANGULO_BOUNDARY.map(p => [p.lat, p.lng]);

  return (
    <div className="fade-in">
      <div className="card" style={{ marginBottom: 18, padding: 0, overflow: 'hidden' }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 18px', borderBottom: '1px solid var(--blue-border)', flexWrap: 'wrap', gap: 10,
        }}>
          <div>
            <div className="card-title" style={{ marginBottom: 2 }}>
              🚨 Evacuation Route Map — Barangay Triangulo
            </div>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
              Tap a marker for details
            </div>
          </div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <LegendItem color="#ef4444" label="Primary Evacuation Center" />
            <LegendItem color="#3b82f6" label="School Evacuation Center" />
            <LegendItem color="#38bdf8" label="Barangay Boundary" shape="line" />
            <div style={{ display: 'flex', gap: 0, background: 'var(--blue-mid)', border: '1px solid var(--blue-border)', borderRadius: 6, overflow: 'hidden' }}>
              {['2d', '3d'].map(v => (
                <button key={v} onClick={() => setMapView(v)} style={{
                  padding: '5px 14px', fontSize: '0.7rem', fontWeight: 700,
                  letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer', border: 'none',
                  background: mapView === v ? 'var(--accent)' : 'transparent',
                  color: mapView === v ? '#fff' : 'var(--text-muted)',
                  transition: 'all 0.2s',
                }}>
                  {v === '2d' ? 'Street View' : '3D View'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {mapView === '2d' ? (
          <MapContainer
            center={[13.618, 123.1905]}
            zoom={15.5}
            scrollWheelZoom={true}
            style={{ width: '100%', height: 500 }}
          >
            <TileLayer
              // OpenStreetMap standard tiles — free, no API key required
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            />

            <LeafletPolygon
              positions={boundaryPositions}
              pathOptions={{
                color: '#38bdf8',
                weight: 2,
                opacity: 0.8,
                fillColor: '#38bdf8',
                fillOpacity: 0.08,
              }}
            />

            {EVACUATION_CENTERS.map((center) => (
              <Marker
                key={center.id}
                position={[center.position.lat, center.position.lng]}
                icon={createCenterIcon(center)}
              >
                <Popup>
                  <div style={{ minWidth: 200, padding: '4px 2px' }}>
                    <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: 4 }}>
                      🏫 {center.name}
                    </div>
                    <div style={{
                      display: 'inline-block', fontSize: '0.65rem', fontWeight: 700,
                      color: center.color, background: `${center.color}18`,
                      border: `1px solid ${center.color}40`, borderRadius: 4,
                      padding: '2px 6px', marginBottom: 6,
                    }}>
                      {center.type}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#333', lineHeight: 1.4, marginTop: 2 }}>
                      📍 {center.address}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: '#666', fontFamily: 'monospace', marginTop: 6 }}>
                      {center.position.lat.toFixed(4)}, {center.position.lng.toFixed(4)}
                    </div>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        ) : (
          <EvacuationMap3D boundary={TRIANGULO_BOUNDARY} evacuationCenters={EVACUATION_CENTERS} />
        )}
      </div>

      <SectionLabel>📍 Evacuation Center Details</SectionLabel>
      <div className="grid-2">
        {EVACUATION_CENTERS.map(center => (
          <EvacuationCenterCard key={center.id} center={center} />
        ))}
      </div>
    </div>
  );
}
