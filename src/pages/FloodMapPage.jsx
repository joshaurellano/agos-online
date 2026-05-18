import { useState } from 'react';
import { FLOOD_ZONES } from '../data/mockData';
import Swal from 'sweetalert2';
import { useAuth } from '../hooks/useAuth';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';

// Fix Leaflet's broken default icon paths when bundled with Vite
// This must be at the TOP LEVEL, outside any function
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

function TrianguloMap({ activeZone, onZoneClick }) {
  return (
    <MapContainer
      center={[13.6192, 123.1814]}
      zoom={16}
      style={{ width: '100%', height: 340, borderRadius: 'var(--radius)', zIndex: 0 }}
      scrollWheelZoom={false}
    >
      <TileLayer
        attribution='&copy; OpenStreetMap contributors &copy; CARTO'
        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
        subdomains="abcd"
        maxZoom={20}
      />
      <Marker position={[13.6192, 123.1814]}>
        <Popup>
          <b>Barangay Triangulo</b><br />Flood Monitoring Station.
        </Popup>
      </Marker>
    </MapContainer>
  );
}

export default function FloodMapPage() {
  const { user } = useAuth();
  const isResident = user?.role_id === 7;
  const [activeZone, setActiveZone] = useState('Z3');

  const selectedZone = FLOOD_ZONES.find(z => z.id === activeZone);
  const riskColors = { LOW: '#22c55e', MODERATE: '#eab308', HIGH: '#f97316', CRITICAL: '#ef4444' };

  const handleEvacuate = (zone) => {
    Swal.fire({
      title: `🚨 Evacuate ${zone.name}?`,
      html: `<p style="color:#8da4be">Send evacuation order for <strong style="color:#e2eaf5">${zone.name}</strong> — ${zone.households} households will be notified.</p>`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#1e3a5f',
      confirmButtonText: 'Send Evacuation Order',
      background: '#0d1f3c',
      color: '#e2eaf5',
    }).then(r => {
      if (r.isConfirmed) {
        Swal.fire({
          title: '✅ Evacuation Order Sent',
          html: `<p style="color:#8da4be">${zone.households} households in ${zone.name} have been notified.</p>`,
          icon: 'success',
          background: '#0d1f3c',
          color: '#e2eaf5',
          confirmButtonColor: '#0ea5e9',
        });
      }
    });
  };

  return (
    <div className="fade-in">
      <div className="grid-2" style={{ marginBottom: '20px', alignItems: 'start' }}>
        {/* Map */}
        <div className="card">
          <div className="card-title">🗺 Color-Coded Flood Zone Map — Click a Zone</div>
          <TrianguloMap activeZone={activeZone} onZoneClick={setActiveZone} />
          <div style={{ marginTop: '12px', fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center' }}>
            Simulated map · Data from PAGASA & OCD Region V
          </div>
        </div>

        {/* Zone Detail */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {selectedZone && (
            <div className="card" style={{ border: `2px solid ${riskColors[selectedZone.risk]}50` }}>
              <div className="card-title">{selectedZone.name} — Details</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Flood Risk</span>
                  <span className="badge" style={{ background: `${riskColors[selectedZone.risk]}20`, color: riskColors[selectedZone.risk], border: `1px solid ${riskColors[selectedZone.risk]}40` }}>
                    {selectedZone.risk}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Households</span>
                  <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{selectedZone.households}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Est. Residents</span>
                  <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{(selectedZone.households * 4.2).toFixed(0)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Near Bicol River</span>
                  <span style={{ fontWeight: 700, color: selectedZone.id === 'Z3' ? 'var(--orange)' : 'var(--text-primary)' }}>
                    {selectedZone.id === 'Z3' ? '⚠️ Yes (< 200m)' : selectedZone.id === 'Z2' ? '≈ 400m' : '> 600m'}
                  </span>
                </div>
                <div style={{ background: 'var(--blue-mid)', borderRadius: 'var(--radius-sm)', padding: '10px 14px', fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  {selectedZone.risk === 'HIGH'
                    ? '⚠️ This zone is at HIGH risk of flooding. It is the nearest to the Bicol River bank. Preemptive evacuation is recommended when water level exceeds 3.5m.'
                    : selectedZone.risk === 'MODERATE'
                    ? 'ℹ️ This zone has moderate flood risk due to proximity to drainage channels. Monitor during heavy rainfall events.'
                    : 'ℹ️ This zone has low flood risk. Occasional waterlogging possible during extreme rainfall.'}
                </div>
                {!isResident && (
                  <button className="btn btn-danger" style={{ width: '100%', justifyContent: 'center' }} onClick={() => handleEvacuate(selectedZone)}>
                    🚨 Evacuate {selectedZone.name}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* All zones summary */}
          <div className="card">
            <div className="card-title">📊 All Zones Summary</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {FLOOD_ZONES.map(z => (
                <div
                  key={z.id}
                  onClick={() => setActiveZone(z.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '12px',
                    padding: '10px 14px', borderRadius: 'var(--radius-sm)',
                    background: activeZone === z.id ? `${riskColors[z.risk]}15` : 'var(--blue-mid)',
                    border: `1px solid ${activeZone === z.id ? riskColors[z.risk] + '50' : 'var(--blue-border)'}`,
                    cursor: 'pointer', transition: 'all 0.15s',
                  }}
                >
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: riskColors[z.risk] }} />
                  <span style={{ fontWeight: 700, color: 'var(--text-primary)', minWidth: 55 }}>{z.name}</span>
                  <span className="badge" style={{ background: `${riskColors[z.risk]}20`, color: riskColors[z.risk], fontSize: '0.65rem' }}>{z.risk}</span>
                  <span style={{ marginLeft: 'auto', fontSize: '0.78rem', color: 'var(--text-muted)' }}>{z.households} HH</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}