import { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { supabase } from '../lib/supabaseClient';

const SEVERITY_COLORS = {
  CRITICAL: '#ef4444',
  WARNING:  '#f97316',
  ADVISORY: '#eab308',
  NORMAL:   '#22c55e',
};

export default function HistoricalPage() {
  const [selected,       setSelected]       = useState(null);
  const [filterSeverity, setFilterSeverity] = useState('ALL');
  const [floods,         setFloods]         = useState([]);
  const [loading,        setLoading]        = useState(true);

  useEffect(() => {
    supabase
      .from('flood_events')
      .select('*')
      .order('id', { ascending: false })
      .then(({ data, error }) => {
        if (error) console.error('flood_events fetch error:', error.message);
        else setFloods(data ?? []);
        setLoading(false);
      });
  }, []);

  const filtered  = floods.filter(f => filterSeverity === 'ALL' || f.severity === filterSeverity);
  const chartData = floods.map(f => ({
    name:      f.typhoon.replace('Typhoon ', '').replace('Tropical Storm ', 'TS '),
    displaced: f.displaced,
    hours:     f.duration_hours,
    level:     parseFloat(f.max_water_level),
  }));

  return (
    <div className="fade-in">

      {/* Filter Bar */}
      <div className="card" style={{ marginBottom: '16px', padding: '12px 20px' }}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', marginRight: '4px' }}>Filter:</span>
          {['ALL', 'CRITICAL', 'WARNING', 'ADVISORY', 'NORMAL'].map(s => (
            <button
              key={s}
              className={`btn ${filterSeverity === s ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setFilterSeverity(s)}
              style={{ padding: '4px 12px', fontSize: '0.75rem' }}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div className="card" style={{ marginBottom: '16px' }}>
        <div className="card-title">📊 Historical Flood Impact</div>
        {loading ? (
          <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', padding: '40px 0', textAlign: 'center' }}>Loading...</div>
        ) : chartData.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', padding: '40px 0', textAlign: 'center' }}>No records found.</div>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e3a5f" />
              <XAxis dataKey="name" tick={{ fill: '#4a6080', fontSize: 10 }} tickLine={false} />
              <YAxis tick={{ fill: '#4a6080', fontSize: 10 }} tickLine={false} />
              <Tooltip
                contentStyle={{ background: '#112240', border: '1px solid #1e3a5f', borderRadius: 8, color: '#e2eaf5', fontSize: 12 }}
                formatter={(v, name) => [v, name === 'displaced' ? 'Displaced' : name === 'hours' ? 'Duration (hrs)' : 'Water Level (m)']}
              />
              <Bar dataKey="displaced" fill="#38bdf8" radius={[4, 4, 0, 0]} maxBarSize={40} />
              <Bar dataKey="level"     fill="#f97316" radius={[4, 4, 0, 0]} maxBarSize={40} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Event List */}
      <div className="card">
        <div className="card-title">🌊 Flood Event Records</div>
        {loading ? (
          <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', padding: '40px 0', textAlign: 'center' }}>Loading records...</div>
        ) : filtered.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', padding: '40px 0', textAlign: 'center' }}>No events match the selected filter.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {filtered.map(f => (
              <div
                key={f.id}
                onClick={() => setSelected(selected?.id === f.id ? null : f)}
                style={{
                  background: 'var(--blue-mid)',
                  border: `1px solid ${selected?.id === f.id ? SEVERITY_COLORS[f.severity] : 'var(--blue-border)'}`,
                  borderRadius: 'var(--radius-sm)',
                  padding: '14px 16px',
                  cursor: 'pointer',
                  transition: 'border-color 0.2s',
                }}
              >
                {/* Row summary */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                  <div>
                    <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.9rem' }}>{f.typhoon}</span>
                    <span style={{ marginLeft: '10px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>{f.date}</span>
                  </div>
                  <span style={{
                    fontSize: '0.7rem', fontWeight: 700, padding: '3px 10px',
                    borderRadius: '999px', background: SEVERITY_COLORS[f.severity] + '22',
                    color: SEVERITY_COLORS[f.severity], border: `1px solid ${SEVERITY_COLORS[f.severity]}44`,
                  }}>
                    {f.severity}
                  </span>
                </div>

                {/* Expanded detail */}
                {selected?.id === f.id && (
                  <div style={{ marginTop: '12px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px' }}>
                    {[
                      { label: 'Max Water Level', value: `${f.max_water_level}m` },
                      { label: 'Displaced',        value: f.displaced.toLocaleString() },
                      { label: 'Casualties',       value: f.casualties },
                      { label: 'Duration',         value: `${f.duration_hours} hrs` },
                      { label: 'Zones Affected',   value: (f.affected_zones ?? []).join(', ') || '—' },
                    ].map(item => (
                      <div key={item.label}>
                        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, marginBottom: '2px' }}>{item.label}</div>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 600 }}>{item.value}</div>
                      </div>
                    ))}
                    {f.notes && (
                      <div style={{ gridColumn: '1 / -1', marginTop: '4px' }}>
                        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, marginBottom: '2px' }}>Notes</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{f.notes}</div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}