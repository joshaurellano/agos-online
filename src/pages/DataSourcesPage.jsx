import { DATA_SOURCES } from '../data/mockData';

const SOURCE_ICONS = {
  rainfall: '🌧',
  water_level: '💧',
  sensor: '📡',
  local: '🏘',
  advisory: '📢',
  lgu: '🏛',
};

const STATUS_INFO = {
  live: { label: 'Live', color: '#22c55e', desc: 'Data stream active and current.' },
  delayed: { label: 'Delayed', color: '#f97316', desc: 'Data is delayed beyond expected interval. Manual check recommended.' },
  simulated: { label: 'Simulated', color: '#eab308', desc: 'Prototype mode: data is simulated for demonstration.' },
};

export default function DataSourcesPage() {
  const liveCount = DATA_SOURCES.filter(s => s.status === 'live').length;

  return (
    <div className="fade-in">
      <div className="grid-3" style={{ marginBottom: '20px' }}>
        {[
          { label: 'Sources Live', value: `${liveCount}/${DATA_SOURCES.length}`, icon: '📡', color: 'var(--green)' },
          { label: 'Delayed Sources', value: DATA_SOURCES.filter(s => s.status === 'delayed').length, icon: '⚠️', color: 'var(--orange)' },
          { label: 'Simulated', value: DATA_SOURCES.filter(s => s.status === 'simulated').length, icon: '🔬', color: 'var(--yellow)' },
        ].map(c => (
          <div key={c.label} className="card">
            <div style={{ fontSize: '1.2rem', marginBottom: '8px' }}>{c.icon}</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 600, marginBottom: '4px' }}>{c.label}</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.8rem', fontWeight: 800, color: c.color }}>{c.value}</div>
          </div>
        ))}
      </div>

      <div className="card" style={{ marginBottom: '20px' }}>
        <div className="card-title">📡 Data Source Status Panel</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {DATA_SOURCES.map((src, i) => {
            const si = STATUS_INFO[src.status];
            return (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: '14px',
                padding: '14px 16px', borderRadius: 'var(--radius-sm)',
                background: 'var(--blue-mid)', border: `1px solid var(--blue-border)`,
              }}>
                <span style={{ fontSize: '1.3rem' }}>{SOURCE_ICONS[src.type]}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.88rem' }}>{src.name}</div>
                  <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)', marginTop: '2px' }}>{si.desc}</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'flex-end', marginBottom: '3px' }}>
                    <span className={`status-dot ${src.status}`} style={src.status === 'live' ? { background: si.color } : { background: si.color }} />
                    <span style={{ fontSize: '0.78rem', fontWeight: 700, color: si.color }}>{si.label}</span>
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Updated: {src.last_update}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Sources explanation */}
      <div className="card">
        <div className="card-title">ℹ️ About Data Sources</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          {[
            { icon: '🌧', name: 'PAGASA', desc: 'Philippine Atmospheric, Geophysical and Astronomical Services Administration. Primary source for rainfall data, weather forecasts, and weather advisories for Bicol Region.' },
            { icon: '💧', name: 'Bicol River Gauge Station', desc: 'PAGASA-managed river monitoring station tracking water levels along Bicol River. Critical for early warning trigger thresholds.' },
            { icon: '📡', name: 'DOST-ASTI', desc: 'Department of Science and Technology – Advanced Science and Technology Institute. Manages flood early warning sensor networks across Bicol barangays.' },
            { icon: '📢', name: 'OCD Region V', desc: 'Office of Civil Defense Region 5. Issues disaster risk management advisories and coordinates DRRM activities in the Bicol Region.' },
            { icon: '🏛', name: 'LGU Naga City', desc: 'Local Government Unit of Naga City. Provides ground-truth reports, evacuation status, and local situational updates.' },
            { icon: '🏘', name: 'Local Sensor (Simulated)', desc: 'Prototype placeholder for a proposed barangay-level IoT water sensor node for hyper-local real-time data. To be deployed in production.' },
          ].map(s => (
            <div key={s.name} style={{ display: 'flex', gap: '12px', padding: '12px 14px', background: 'var(--blue-mid)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--blue-border)' }}>
              <span style={{ fontSize: '1.2rem', flexShrink: 0 }}>{s.icon}</span>
              <div>
                <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: '3px', fontSize: '0.85rem' }}>{s.name}</div>
                <div>{s.desc}</div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: '16px', padding: '12px 16px', background: 'rgba(56,189,248,0.05)', border: '1px solid rgba(56,189,248,0.2)', borderRadius: 'var(--radius-sm)', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          ⚠️ <strong style={{ color: 'var(--accent)' }}>Prototype Note:</strong> PAGASA data covers regional stations. Real-time hyper-local data for Barangay Triangulo specifically would require deployment of a dedicated IoT sensor node (Assumption 1 of the study). This prototype uses simulated data to demonstrate system behavior.
        </div>
      </div>
    </div>
  );
}
