import { useState, useEffect, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { useModelPrediction } from '../lib/modelApi';
import { supabase } from '../lib/supabaseClient';

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGASA_THRESHOLDS = [
  { label: 'Trace',    min: 0,   max: 10,  color: '#22c55e', desc: 'No significant impact expected.' },
  { label: 'Light',    min: 10,  max: 25,  color: '#eab308', desc: 'Minor flooding in low-lying areas possible.' },
  { label: 'Moderate', min: 25,  max: 50,  color: '#f97316', desc: 'Flooding likely. Monitor water levels closely.' },
  { label: 'Heavy',    min: 50,  max: 999, color: '#ef4444', desc: 'Severe flooding. Evacuation may be required.' },
];

function getRainfallCategory(mm) {
  return PAGASA_THRESHOLDS.find(t => mm >= t.min && mm < t.max) ?? PAGASA_THRESHOLDS[0];
}

function getRainfallEmoji(mm) {
  if (mm >= 50) return '⛈';
  if (mm >= 25) return '🌧';
  if (mm >= 10) return '🌦';
  return '🌤';
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionLabel({ children }) {
  return (
    <div style={{
      fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.18em',
      textTransform: 'uppercase', color: 'var(--text-muted)',
      marginBottom: 10, paddingBottom: 6,
      borderBottom: '1px solid var(--blue-border)',
      display: 'flex', alignItems: 'center', gap: 8,
    }}>
      {children}
    </div>
  );
}

function StatusBanner({ total, peak, acc3hr, acc6hr }) {
  // Determine operational status from 3hr accumulation or total
  const ref  = acc3hr ?? total;
  const cat  = getRainfallCategory(ref);
  const emoji = getRainfallEmoji(ref);

  if (ref === 0) return null;

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 14,
      padding: '14px 18px', marginBottom: 18,
      background: `${cat.color}08`,
      border: `1px solid ${cat.color}35`,
      borderLeft: `4px solid ${cat.color}`,
      borderRadius: 'var(--radius-sm)',
    }}>
      <span style={{ fontSize: '1.6rem', flexShrink: 0 }}>{emoji}</span>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4, flexWrap: 'wrap' }}>
          <span style={{
            fontFamily: 'var(--font-display)', fontSize: '1rem', fontWeight: 900,
            color: cat.color, letterSpacing: '0.04em',
          }}>
            {cat.label.toUpperCase()} RAINFALL
          </span>
          <span style={{
            fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.06em',
            background: `${cat.color}18`, color: cat.color,
            border: `1px solid ${cat.color}40`,
            borderRadius: 4, padding: '2px 8px',
          }}>
            {ref.toFixed(1)} mm
          </span>
        </div>
        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: 4 }}>
          {cat.desc}
        </div>
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
          {acc3hr != null && <span>3-hr accumulation: <strong style={{ color: 'var(--text-secondary)' }}>{acc3hr.toFixed(1)} mm</strong></span>}
          {acc6hr != null && <span>6-hr accumulation: <strong style={{ color: 'var(--text-secondary)' }}>{acc6hr.toFixed(1)} mm</strong></span>}
          <span>Peak intensity: <strong style={{ color: 'var(--text-secondary)' }}>{peak.toFixed(1)} mm/hr</strong></span>
        </div>
      </div>
    </div>
  );
}

function CustomTooltip({ active, payload, label, period }) {
  if (!active || !payload?.length) return null;
  const val = payload[0]?.value ?? 0;
  const cat = getRainfallCategory(val);
  return (
    <div style={{
      background: '#0d1f3c', border: '1px solid #1e3a5f',
      borderRadius: 8, padding: '10px 14px', fontSize: '0.78rem',
      boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
    }}>
      <div style={{ fontWeight: 700, color: '#e2eaf5', marginBottom: 6 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <div style={{ width: 8, height: 8, borderRadius: 2, background: cat.color }} />
        <span style={{ color: '#8da4be' }}>Rainfall:</span>
        <span style={{ fontWeight: 800, color: cat.color, fontSize: '0.9rem' }}>{val} mm</span>
      </div>
      <div style={{ fontSize: '0.65rem', color: cat.color, opacity: 0.85 }}>
        {getRainfallEmoji(val)} {cat.label}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function RainfallPage() {
  const [view, setView]             = useState('chart');
  const [period, setPeriod]         = useState('hourly');
  const [dailyData, setDailyData]   = useState([]);
  const [hourlyLogs, setHourlyLogs] = useState([]);
  const [lastFetched, setLastFetched] = useState(null);

  const { prediction } = useModelPrediction();
  const liveRainfall   = prediction?.live_metrics?.rainfall_mm ?? null;

  const fetchRainfall = useCallback(async () => {
    const since        = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const [hourlyRes, dailyRpc] = await Promise.all([
      supabase
        .from('flood_snapshots')
        .select('created_at, rainfall_mm')
        .gte('created_at', since)
        .order('created_at', { ascending: true }),
      supabase.rpc('get_daily_rainfall', { days_back: 7 }),
    ]);

    if (hourlyRes.data) {
      const buckets = {};
      hourlyRes.data.forEach(row => {
        const d     = new Date(row.created_at);
        const key   = `${d.toLocaleDateString('en-PH', { timeZone: 'Asia/Manila' })}-${d.toLocaleString('en-PH', { hour: '2-digit', hour12: false, timeZone: 'Asia/Manila' })}`;
        const label = d.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Manila' });
        if (!buckets[key]) buckets[key] = { hour: label, rainfall: 0, count: 0 };
        buckets[key].rainfall += row.rainfall_mm;
        buckets[key].count    += 1;
      });
      setHourlyLogs(
        Object.values(buckets).map(b => ({
          ...b,
          rainfall: parseFloat((b.rainfall / b.count).toFixed(2)),
        }))
      );
    }

    if (dailyRpc.data) {
      setDailyData(dailyRpc.data.map(r => ({ date: r.day, rainfall: r.rainfall })));
    }

    setLastFetched(new Date());
  }, []);

  useEffect(() => {
    fetchRainfall();
    const channel = supabase
      .channel('rainfall-realtime')
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'flood_snapshots' },
        () => fetchRainfall()
      )
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [fetchRainfall]);

  // ── Derived metrics ──────────────────────────────────────────────────────────

  const data    = period === 'hourly' ? hourlyLogs : dailyData;
  const dataKey = period === 'hourly' ? 'hour'     : 'date';
  const total   = parseFloat(data.reduce((s, d) => s + d.rainfall, 0).toFixed(1));
  const peak    = parseFloat(Math.max(0, ...data.map(d => d.rainfall)).toFixed(1));

  // True 3-hr and 6-hr accumulation from hourly buckets
  const acc3hr = (() => {
    if (hourlyLogs.length === 0) return null;
    const recent = hourlyLogs.slice(-3);
    return parseFloat(recent.reduce((s, d) => s + d.rainfall, 0).toFixed(1));
  })();

  const acc6hr = (() => {
    if (hourlyLogs.length === 0) return null;
    const recent = hourlyLogs.slice(-6);
    return parseFloat(recent.reduce((s, d) => s + d.rainfall, 0).toFixed(1));
  })();

  // Staleness check
  const isStale = lastFetched
    ? (Date.now() - lastFetched.getTime()) > 5 * 60 * 1000
    : false;

  // Trend — compare last 3hr vs previous 3hr
  const trend = (() => {
    if (hourlyLogs.length < 6) return null;
    const last3  = hourlyLogs.slice(-3).reduce((s, d)  => s + d.rainfall, 0);
    const prev3  = hourlyLogs.slice(-6, -3).reduce((s, d) => s + d.rainfall, 0);
    const delta  = last3 - prev3;
    if (delta > 1)   return { label: '⬆ Increasing', color: '#ef4444' };
    if (delta < -1)  return { label: '⬇ Decreasing', color: '#22c55e' };
    return { label: '➡ Steady', color: '#8da4be' };
  })();

  const currentCat = getRainfallCategory(liveRainfall ?? 0);

  return (
    <div className="fade-in">

      {/* ── Staleness Warning ─────────────────────────────────────── */}
      {isStale && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '9px 14px', marginBottom: 14,
          background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.25)',
          borderLeft: '3px solid #ef4444', borderRadius: 'var(--radius-sm)',
          fontSize: '0.8rem', color: '#f87171',
        }}>
          ⚠ <strong>Data may be stale</strong> — last update was over 5 minutes ago. Check backend connectivity.
        </div>
      )}

      {/* ── Operational Status Banner ─────────────────────────────── */}
      <StatusBanner total={total} peak={peak} acc3hr={acc3hr} acc6hr={acc6hr} />

      {/* ── KPI Cards ─────────────────────────────────────────────── */}
      <div className="grid-4" style={{ marginBottom: 18 }}>
        {[
          {
            label: 'Total Accumulated',
            value: `${total}`,
            unit: 'mm',
            icon: '☔',
            color: 'var(--accent)',
            sub: period === 'hourly' ? 'Last 24 hours' : 'Last 7 days',
          },
          {
            label: 'Peak Intensity',
            value: `${peak}`,
            unit: 'mm/hr',
            icon: '⚡',
            color: '#f97316',
            sub: 'Highest single-hour reading',
          },
          {
            label: '3-Hr Accumulation',
            value: acc3hr != null ? `${acc3hr}` : '—',
            unit: acc3hr != null ? 'mm' : '',
            icon: '⏱',
            color: acc3hr != null ? getRainfallCategory(acc3hr).color : 'var(--text-muted)',
            sub: acc3hr != null
              ? `${getRainfallCategory(acc3hr).label} · ${trend?.label ?? ''}`
              : 'Insufficient data',
            badge: acc3hr != null ? getRainfallCategory(acc3hr).label : null,
            badgeColor: acc3hr != null ? getRainfallCategory(acc3hr).color : null,
          },
          {
            label: '6-Hr Accumulation',
            value: acc6hr != null ? `${acc6hr}` : '—',
            unit: acc6hr != null ? 'mm' : '',
            icon: '🌊',
            color: acc6hr != null ? getRainfallCategory(acc6hr).color : 'var(--text-muted)',
            sub: acc6hr != null
              ? `PAGASA Heavy threshold: 50mm`
              : 'Insufficient data',
            badge: acc6hr != null && acc6hr >= 50 ? '⚠ Above Threshold' : null,
            badgeColor: '#ef4444',
          },
        ].map(c => (
          <div key={c.label} className="card" style={{
            borderTop: `3px solid ${c.color}`,
            position: 'relative', overflow: 'hidden',
          }}>
            <div style={{
              position: 'absolute', right: 12, top: 10,
              fontSize: '2.2rem', opacity: 0.07,
              pointerEvents: 'none', userSelect: 'none',
            }}>{c.icon}</div>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8 }}>
              {c.label}
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 6 }}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: 800, color: c.color, lineHeight: 1 }}>
                {c.value}
              </span>
              {c.unit && <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600 }}>{c.unit}</span>}
            </div>
            {c.badge && (
              <div style={{
                display: 'inline-flex', alignItems: 'center',
                fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.06em',
                background: `${c.badgeColor}20`, color: c.badgeColor,
                border: `1px solid ${c.badgeColor}40`,
                borderRadius: 4, padding: '2px 7px', marginBottom: 6, width: 'fit-content',
              }}>
                {c.badge}
              </div>
            )}
            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: 'auto', paddingTop: 2 }}>
              {c.sub}
            </div>
          </div>
        ))}
      </div>

      {/* ── Main Chart Card ────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title" style={{ marginBottom: 14 }}>
          🌧 Rainfall Accumulation
          <div style={{
            marginLeft: 'auto', display: 'flex', gap: 8,
            fontFamily: 'var(--font-body)', fontWeight: 400,
            textTransform: 'none', letterSpacing: 0,
            alignItems: 'center',
          }}>
            {/* Last synced */}
            {lastFetched && (
              <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginRight: 4 }}>
                synced {lastFetched.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
            <button className={`btn ${period === 'hourly' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setPeriod('hourly')} style={{ padding: '4px 12px', fontSize: '0.75rem' }}>Hourly</button>
            <button className={`btn ${period === 'daily'  ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setPeriod('daily')}  style={{ padding: '4px 12px', fontSize: '0.75rem' }}>Daily</button>
            <button className={`btn ${view === 'chart' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setView('chart')} style={{ padding: '4px 12px', fontSize: '0.75rem' }}>📈</button>
            <button className={`btn ${view === 'table' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setView('table')} style={{ padding: '4px 12px', fontSize: '0.75rem' }}>📋</button>
          </div>
        </div>

        {data.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', padding: '40px 0', textAlign: 'center' }}>
            <div style={{ fontSize: '2rem', marginBottom: 8, opacity: 0.3 }}>🌤</div>
            No data yet — logs will appear once the backend starts recording.
          </div>
        ) : view === 'chart' ? (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e3a5f" />
              <XAxis
                dataKey={dataKey}
                tick={{ fill: '#4a6080', fontSize: 10 }}
                tickLine={false}
                interval={period === 'hourly' ? Math.floor(data.length / 8) : 0}
              />
              <YAxis tick={{ fill: '#4a6080', fontSize: 10 }} unit="mm" tickLine={false} />
              <Tooltip content={<CustomTooltip period={period} />} />
              <ReferenceLine
                y={50}
                stroke="#ef4444"
                strokeWidth={1.5}
                strokeDasharray="4 2"
                label={{ value: 'Heavy Rain (50mm)', fill: '#ef4444', fontSize: 9, position: 'insideTopRight' }}
              />
              <ReferenceLine
                y={25}
                stroke="#f97316"
                strokeWidth={1}
                strokeDasharray="3 3"
                label={{ value: 'Moderate (25mm)', fill: '#f97316', fontSize: 9, position: 'insideTopRight' }}
              />
              <ReferenceLine
                y={10}
                stroke="#eab308"
                strokeWidth={1}
                strokeDasharray="3 3"
                label={{ value: 'Light (10mm)', fill: '#eab308', fontSize: 9, position: 'insideTopRight' }}
              />
              <Bar dataKey="rainfall" fill="#38bdf8" radius={[4, 4, 0, 0]} maxBarSize={40} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div style={{ overflowY: 'auto', maxHeight: 300 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--blue-border)' }}>
                  {[period === 'hourly' ? 'Hour' : 'Date', 'Rainfall (mm)', 'Category', 'Operational Note'].map(h => (
                    <th key={h} style={{
                      padding: '8px 12px', textAlign: 'left',
                      color: 'var(--text-muted)', fontWeight: 600,
                      textTransform: 'uppercase', fontSize: '0.65rem', letterSpacing: '0.08em',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.map((row, i) => {
                  const cat = getRainfallCategory(row.rainfall);
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid rgba(30,58,95,0.4)' }}>
                      <td style={{ padding: '7px 12px', color: 'var(--text-secondary)' }}>{row[dataKey]}</td>
                      <td style={{ padding: '7px 12px', color: cat.color, fontWeight: 700 }}>{row.rainfall} mm</td>
                      <td style={{ padding: '7px 12px' }}>
                        <span style={{
                          fontSize: '0.65rem', fontWeight: 700,
                          background: `${cat.color}18`, color: cat.color,
                          border: `1px solid ${cat.color}40`,
                          borderRadius: 4, padding: '2px 7px',
                        }}>
                          {getRainfallEmoji(row.rainfall)} {cat.label}
                        </span>
                      </td>
                      <td style={{ padding: '7px 12px', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                        {cat.desc}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Threshold Reference + Source ──────────────────────────── */}
      <div className="card" style={{ padding: '14px 20px' }}>
        <SectionLabel>📏 PAGASA Rainfall Classification</SectionLabel>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
          {PAGASA_THRESHOLDS.map(t => {
            const isActive = liveRainfall != null && liveRainfall >= t.min && liveRainfall < t.max;
            return (
              <div key={t.label} style={{
                padding: '10px 12px',
                background: isActive ? `${t.color}12` : 'var(--blue-mid)',
                border: `1px solid ${isActive ? t.color + '50' : 'var(--blue-border)'}`,
                borderTop: `3px solid ${t.color}`,
                borderRadius: 'var(--radius-sm)',
                transition: 'all 0.2s',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: '0.72rem', fontWeight: 800, color: t.color, letterSpacing: '0.06em' }}>
                    {getRainfallEmoji(t.min + 1)} {t.label}
                  </span>
                  {isActive && (
                    <span style={{
                      fontSize: '0.55rem', fontWeight: 800, letterSpacing: '0.06em',
                      background: `${t.color}25`, color: t.color,
                      border: `1px solid ${t.color}40`,
                      borderRadius: 3, padding: '1px 5px',
                    }}>NOW</span>
                  )}
                </div>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontFamily: 'monospace', marginBottom: 5 }}>
                  {t.max === 999 ? `≥ ${t.min}mm/hr` : `${t.min}–${t.max}mm/hr`}
                </div>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                  {t.desc}
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ marginTop: 12, fontSize: '0.65rem', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
          <span>Classification based on PAGASA rainfall intensity guidelines</span>
          <span>{prediction ? 'Source: WeatherAPI via LSTM Backend · Poll: 30s' : 'Source: PAGASA Weather Station · Naga City'}</span>
        </div>
      </div>

    </div>
  );
}