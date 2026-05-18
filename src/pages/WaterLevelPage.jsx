import { useState } from 'react';

export default function WaterLevelPage() {
  const [view, setView] = useState('chart');

  const getColor = (level) => {
    if (level >= 4.5) return '#ef4444';
    if (level >= 3.5) return '#f97316';
    if (level >= 2.5) return '#eab308';
    return '#22c55e';
  };

  return (
    <div className="fade-in">
      <div className="grid-4" style={{ marginBottom: '20px' }}>
        <StatCard label="Current Level" value="N/A" color="var(--text-muted)" icon="📏" noData />
        <StatCard label="24h Peak" value="N/A" color="var(--text-muted)" icon="📈" noData />
        <StatCard label="24h Low" value="N/A" color="var(--text-muted)" icon="📉" noData />
        <StatCard label="Rate of Rise" value="N/A" color="var(--text-muted)" icon="⚡" noData />
      </div>

      {/* Visual Gauge */}
      <div className="card" style={{ marginBottom: '20px' }}>
        <div className="card-title">💧 Water Level Gauge — Bicol River (Triangulo Station)</div>
        <div style={{ display: 'flex', gap: '32px', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Vertical gauge — no data state */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Level</div>
            <div style={{ position: 'relative', width: 60, height: 200, background: 'var(--blue-mid)', borderRadius: '8px', border: '2px solid var(--blue-border)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {/* Threshold lines still shown for reference */}
              <div style={{ position: 'absolute', bottom: `${(3.5 / 6) * 100}%`, left: 0, right: 0, height: 2, background: '#f97316', opacity: 0.4 }} />
              <div style={{ position: 'absolute', bottom: `${(4.5 / 6) * 100}%`, left: 0, right: 0, height: 2, background: '#ef4444', opacity: 0.4 }} />
              {/* No data indicator */}
              <div style={{ position: 'relative', zIndex: 1, fontSize: '0.65rem', color: 'var(--text-muted)', textAlign: 'center', padding: '0 4px', lineHeight: 1.4 }}>No<br/>Data</div>
            </div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-muted)' }}>
              — m
            </div>
          </div>

          {/* Scale legend */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {[
              { level: '≥ 4.5m', label: 'Critical', color: '#ef4444' },
              { level: '3.5–4.4m', label: 'Warning', color: '#f97316' },
              { level: '2.5–3.4m', label: 'Advisory', color: '#eab308' },
              { level: '< 2.5m', label: 'Normal', color: '#22c55e' },
            ].map(r => (
              <div key={r.level} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: 12, height: 12, borderRadius: '50%', background: r.color, flexShrink: 0 }} />
                <span style={{ color: r.color, fontWeight: 700, fontSize: '0.85rem', minWidth: '70px' }}>{r.level}</span>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{r.label}</span>
              </div>
            ))}
            <div style={{ marginTop: '8px', padding: '10px 14px', background: 'var(--blue-mid)', borderRadius: 'var(--radius-sm)', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
              Source: PAGASA Bicol River<br />
              Basin Data + DOST-ASTI Sensor
            </div>
          </div>

          {/* Chart fills rest */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
              <button className={`btn ${view === 'chart' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setView('chart')} style={{ padding: '6px 14px', fontSize: '0.8rem' }}>📈 Chart</button>
              <button className={`btn ${view === 'table' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setView('table')} style={{ padding: '6px 14px', fontSize: '0.8rem' }}>📋 Table</button>
            </div>

            {/* No sensor data — show placeholder for both views */}
            <div style={{
              height: 200,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              background: 'var(--blue-mid)',
              borderRadius: 'var(--radius-sm)',
              border: '1px dashed var(--blue-border)',
            }}>
              <div style={{ fontSize: '1.6rem', opacity: 0.4 }}>📡</div>
              <div style={{ fontSize: '0.88rem', color: 'var(--text-muted)', fontWeight: 600 }}>No sensor data available</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', opacity: 0.7 }}>Live readings will appear here once the sensor is connected</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, color, icon, noData }) {
  return (
    <div className="card" style={{ opacity: noData ? 0.6 : 1 }}>
      <div style={{ fontSize: '1.2rem', marginBottom: '8px' }}>{icon}</div>
      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, marginBottom: '4px' }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.7rem', fontWeight: 800, color }}>{value}</div>
      {noData && <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}><span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: 'var(--text-muted)' }} />No sensor data</div>}
    </div>
  );
}
