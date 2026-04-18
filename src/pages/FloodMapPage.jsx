import { useState } from 'react';
import { FLOOD_ZONES, ALERT_LEVELS } from '../data/mockData';
import Swal from 'sweetalert2';
import { useAuth } from '../hooks/useAuth';

function TrianguloMap({ activeZone, onZoneClick }) {

  const zones = [
    {
      id: 'Z1', name: 'Zone 1', risk: 'LOW', color: '#22c55e',
      path: 'M 80 60 L 200 60 L 200 160 L 80 160 Z',
      labelX: 140, labelY: 115,
    },
    {
      id: 'Z2', name: 'Zone 2', risk: 'MODERATE', color: '#eab308',
      path: 'M 200 60 L 340 60 L 340 160 L 200 160 Z',
      labelX: 270, labelY: 115,
    },
    {
      id: 'Z3', name: 'Zone 3', risk: 'HIGH', color: '#f97316',
      path: 'M 80 160 L 270 160 L 270 280 L 80 280 Z',
      labelX: 175, labelY: 225,
    },
    {
      id: 'Z4', name: 'Zone 4', risk: 'LOW', color: '#22c55e',
      path: 'M 270 160 L 380 160 L 380 280 L 270 280 Z',
      labelX: 325, labelY: 225,
    },
  ];

  return (
    <svg viewBox="0 0 460 340" style={{ width: '100%', maxWidth: 460, height: 'auto' }}>
      {/* Background */}
      <rect width="460" height="340" fill="#0a1628" rx="8" />

      {/* River (Bicol River) */}
      <path
        d="M 0 195 Q 60 185 100 200 Q 160 218 220 205 Q 290 190 360 210 Q 420 225 460 215"
        stroke="#38bdf8" strokeWidth="14" fill="none" opacity="0.4" strokeLinecap="round"
      />
      <path
        d="M 0 195 Q 60 185 100 200 Q 160 218 220 205 Q 290 190 360 210 Q 420 225 460 215"
        stroke="#38bdf8" strokeWidth="4" fill="none" opacity="0.7" strokeLinecap="round"
      />

      {/* Zone shapes */}
      {zones.map(z => (
        <g key={z.id} onClick={() => onZoneClick(z.id)} style={{ cursor: 'pointer' }}>
          <path
            d={z.path}
            fill={`${z.color}${activeZone === z.id ? '55' : '25'}`}
            stroke={z.color}
            strokeWidth={activeZone === z.id ? 3 : 1.5}
            strokeOpacity={0.8}
          />
          <text x={z.labelX} y={z.labelY - 10} textAnchor="middle" fill={z.color} fontSize="13" fontWeight="800" fontFamily="Syne, sans-serif">
            {z.name}
          </text>
          <text x={z.labelX} y={z.labelY + 8} textAnchor="middle" fill={z.color} fontSize="10" fontFamily="DM Sans, sans-serif" opacity="0.8">
            {z.risk} RISK
          </text>
        </g>
      ))}

      {/* Barangay label */}
      <text x="230" y="22" textAnchor="middle" fill="#8da4be" fontSize="10" fontFamily="DM Sans, sans-serif" letterSpacing="2">
        BARANGAY TRIANGULO, NAGA CITY
      </text>

      {/* River label */}
      <text x="380" y="238" fill="#38bdf8" fontSize="9" fontFamily="DM Sans, sans-serif" opacity="0.7">Bicol River</text>

      {/* Compass */}
      <text x="430" y="310" fill="#4a6080" fontSize="12" textAnchor="middle">N</text>
      <line x1="430" y1="295" x2="430" y2="315" stroke="#4a6080" strokeWidth="1" />
      <polygon points="430,290 426,300 434,300" fill="#4a6080" />

      {/* Legend */}
      <rect x="10" y="295" width="8" height="8" fill="#22c55e" opacity="0.6" />
      <text x="22" y="303" fill="#8da4be" fontSize="9">Low</text>
      <rect x="50" y="295" width="8" height="8" fill="#eab308" opacity="0.6" />
      <text x="62" y="303" fill="#8da4be" fontSize="9">Moderate</text>
      <rect x="110" y="295" width="8" height="8" fill="#f97316" opacity="0.6" />
      <text x="122" y="303" fill="#8da4be" fontSize="9">High</text>
    </svg>
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
          {/* Selected zone info */}
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

                { !isResident &&(
                  <button className="btn btn-danger" style={{ width: '100%', justifyContent: 'center' }} onClick={() => handleEvacuate(selectedZone)}>
                    🚨 Evacuate {selectedZone.name}
                  </button>
                  )
                }

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
