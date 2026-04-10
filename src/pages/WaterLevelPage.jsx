import { useState, useEffect } from 'react';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Legend } from 'recharts';
import { generateWaterLevelData } from '../data/mockData';

export default function WaterLevelPage() {
  const [data, setData] = useState(generateWaterLevelData());
  const [view, setView] = useState('chart');
  const [currentLevel] = useState(3.4);

  const getColor = (level) => {
    if (level >= 4.5) return '#ef4444';
    if (level >= 3.5) return '#f97316';
    if (level >= 2.5) return '#eab308';
    return '#22c55e';
  };

  return (
    <div className="fade-in">
      <div className="grid-4" style={{ marginBottom: '20px' }}>
        <StatCard label="Current Level" value={`${currentLevel}m`} color={getColor(currentLevel)} icon="📏" />
        <StatCard label="24h Peak" value="3.4m" color="var(--orange)" icon="📈" />
        <StatCard label="24h Low" value="1.6m" color="var(--green)" icon="📉" />
        <StatCard label="Rate of Rise" value="+0.12m/hr" color="var(--yellow)" icon="⚡" />
      </div>

      {/* Visual Gauge */}
      <div className="card" style={{ marginBottom: '20px' }}>
        <div className="card-title">💧 Water Level Gauge — Bicol River (Triangulo Station)</div>
        <div style={{ display: 'flex', gap: '32px', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Vertical gauge */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Level</div>
            <div style={{ position: 'relative', width: 60, height: 200, background: 'var(--blue-mid)', borderRadius: '8px', border: '2px solid var(--blue-border)', overflow: 'hidden' }}>
              {/* Fill */}
              <div style={{
                position: 'absolute', bottom: 0, left: 0, right: 0,
                height: `${(currentLevel / 6) * 100}%`,
                background: `linear-gradient(to top, ${getColor(currentLevel)}, ${getColor(currentLevel)}80)`,
                transition: 'height 1s ease',
              }} />
              {/* Threshold lines */}
              <div style={{ position: 'absolute', bottom: `${(3.5 / 6) * 100}%`, left: 0, right: 0, height: 2, background: '#f97316', opacity: 0.7 }} />
              <div style={{ position: 'absolute', bottom: `${(4.5 / 6) * 100}%`, left: 0, right: 0, height: 2, background: '#ef4444', opacity: 0.7 }} />
            </div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', fontWeight: 800, color: getColor(currentLevel) }}>
              {currentLevel}m
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

            {view === 'chart' ? (
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="wg2" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#38bdf8" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e3a5f" />
                  <XAxis dataKey="time" tick={{ fill: '#4a6080', fontSize: 9 }} interval={4} tickLine={false} />
                  <YAxis tick={{ fill: '#4a6080', fontSize: 9 }} unit="m" domain={[0, 6]} tickLine={false} />
                  <Tooltip contentStyle={{ background: '#112240', border: '1px solid #1e3a5f', borderRadius: 8, color: '#e2eaf5', fontSize: 11 }} />
                  <ReferenceLine y={3.5} stroke="#f97316" strokeWidth={1.5} strokeDasharray="4 2" label={{ value: 'Warning', fill: '#f97316', fontSize: 9, position: 'right' }} />
                  <ReferenceLine y={4.5} stroke="#ef4444" strokeWidth={1.5} strokeDasharray="4 2" label={{ value: 'Critical', fill: '#ef4444', fontSize: 9, position: 'right' }} />
                  <Area type="monotone" dataKey="level" stroke="#38bdf8" strokeWidth={2} fill="url(#wg2)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ overflowY: 'auto', maxHeight: 200 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--blue-border)' }}>
                      {['Time', 'Level (m)', 'Status'].map(h => (
                        <th key={h} style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: '0.06em' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...data].reverse().slice(0, 12).map((row, i) => {
                      const c = getColor(row.level);
                      const status = row.level >= 4.5 ? 'Critical' : row.level >= 3.5 ? 'Warning' : row.level >= 2.5 ? 'Advisory' : 'Normal';
                      return (
                        <tr key={i} style={{ borderBottom: '1px solid rgba(30,58,95,0.4)' }}>
                          <td style={{ padding: '6px 10px', color: 'var(--text-secondary)' }}>{row.time}</td>
                          <td style={{ padding: '6px 10px', color: c, fontWeight: 700 }}>{row.level}m</td>
                          <td style={{ padding: '6px 10px' }}><span style={{ color: c, fontWeight: 600, fontSize: '0.72rem' }}>{status}</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, color, icon }) {
  return (
    <div className="card">
      <div style={{ fontSize: '1.2rem', marginBottom: '8px' }}>{icon}</div>
      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, marginBottom: '4px' }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.7rem', fontWeight: 800, color }}>{value}</div>
    </div>
  );
}
