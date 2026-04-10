import { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { HISTORICAL_FLOODS, ALERT_LEVELS } from '../data/mockData';

const SEVERITY_COLORS = {
  CRITICAL: '#ef4444',
  WARNING: '#f97316',
  ADVISORY: '#eab308',
  NORMAL: '#22c55e',
};

export default function HistoricalPage() {
  const [selected, setSelected] = useState(null);
  const [filterSeverity, setFilterSeverity] = useState('ALL');

  const filtered = HISTORICAL_FLOODS.filter(f => filterSeverity === 'ALL' || f.severity === filterSeverity);

  const chartData = HISTORICAL_FLOODS.map(f => ({
    name: f.typhoon.replace('Typhoon ', '').replace('Tropical Storm ', 'TS '),
    displaced: f.displaced,
    hours: f.duration_hours,
    level: parseFloat(f.max_water_level),
  }));

  return (
    <div className="fade-in">
      {/* Summary stats */}
      <div className="grid-4" style={{ marginBottom: '20px' }}>
        {[
          { label: 'Flood Events Recorded', value: HISTORICAL_FLOODS.length, icon: '📋', color: 'var(--accent)' },
          { label: 'Total Families Displaced', value: HISTORICAL_FLOODS.reduce((s, f) => s + f.displaced, 0), icon: '🏘', color: 'var(--orange)' },
          { label: 'Avg. Duration (hrs)', value: (HISTORICAL_FLOODS.reduce((s, f) => s + f.duration_hours, 0) / HISTORICAL_FLOODS.length).toFixed(1), icon: '⏱', color: 'var(--yellow)' },
          { label: 'Highest Water Level', value: '6.0m', icon: '💧', color: 'var(--red)' },
        ].map(c => (
          <div key={c.label} className="card">
            <div style={{ fontSize: '1.2rem', marginBottom: '8px' }}>{c.icon}</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 600, marginBottom: '4px' }}>{c.label}</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.7rem', fontWeight: 800, color: c.color }}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* Chart */}
      <div className="card" style={{ marginBottom: '20px' }}>
        <div className="card-title">📊 Displaced Families per Flood Event</div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e3a5f" />
            <XAxis dataKey="name" tick={{ fill: '#4a6080', fontSize: 9 }} tickLine={false} angle={-20} textAnchor="end" />
            <YAxis tick={{ fill: '#4a6080', fontSize: 10 }} tickLine={false} />
            <Tooltip contentStyle={{ background: '#112240', border: '1px solid #1e3a5f', borderRadius: 8, color: '#e2eaf5', fontSize: 12 }} />
            <Bar dataKey="displaced" fill="#f97316" radius={[4, 4, 0, 0]} name="Families Displaced" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Filter + Table */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
          <div className="card-title" style={{ margin: 0 }}>📋 Historical Flood Events Timeline</div>
          <div style={{ display: 'flex', gap: '6px' }}>
            {['ALL', 'CRITICAL', 'WARNING', 'ADVISORY'].map(s => (
              <button
                key={s}
                className={`btn ${filterSeverity === s ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setFilterSeverity(s)}
                style={{ padding: '5px 12px', fontSize: '0.73rem' }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {filtered.map(flood => {
            const color = SEVERITY_COLORS[flood.severity];
            const isOpen = selected === flood.id;
            return (
              <div key={flood.id} style={{ borderRadius: 'var(--radius-sm)', border: `1px solid ${isOpen ? color + '60' : 'var(--blue-border)'}`, overflow: 'hidden', transition: 'all 0.2s' }}>
                <div
                  onClick={() => setSelected(isOpen ? null : flood.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '14px',
                    padding: '14px 16px', cursor: 'pointer',
                    background: isOpen ? `${color}10` : 'var(--blue-mid)',
                    transition: 'background 0.15s',
                  }}
                >
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.9rem' }}>{flood.typhoon}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{flood.date}</div>
                  </div>
                  <span className="badge hide-mobile" style={{ background: `${color}20`, color, border: `1px solid ${color}30` }}>{flood.severity}</span>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>{flood.displaced} displaced</span>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>{isOpen ? '▲' : '▼'}</span>
                </div>

                {isOpen && (
                  <div style={{ padding: '16px', background: 'var(--blue-card)', borderTop: `1px solid ${color}30` }} className="slide-in">
                    <div className="grid-3" style={{ gap: '12px', marginBottom: '12px' }}>
                      {[
                        { label: 'Peak Water Level', value: flood.max_water_level },
                        { label: 'Duration', value: `${flood.duration_hours} hours` },
                        { label: 'Casualties', value: flood.casualties === 0 ? '✅ None' : flood.casualties },
                      ].map(d => (
                        <div key={d.label} style={{ background: 'var(--blue-mid)', borderRadius: 'var(--radius-sm)', padding: '10px 14px' }}>
                          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '4px' }}>{d.label}</div>
                          <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{d.value}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ marginBottom: '8px' }}>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Affected Zones: </span>
                      {flood.affected_zones.map(z => (
                        <span key={z} className="badge" style={{ background: 'rgba(56,189,248,0.1)', color: 'var(--accent)', border: '1px solid rgba(56,189,248,0.2)', marginRight: 4, fontSize: '0.7rem' }}>{z}</span>
                      ))}
                    </div>
                    <div style={{ fontSize: '0.83rem', color: 'var(--text-secondary)', background: 'var(--blue-mid)', borderRadius: 'var(--radius-sm)', padding: '10px 14px' }}>
                      📝 {flood.notes}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
