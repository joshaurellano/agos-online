import { useState, useEffect, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Cell,
} from 'recharts';
import { supabase } from '../lib/supabaseClient';
import { SectionLabel } from '../components/ui';
import { LuChartColumn, LuTable, LuTimer, LuGauge, LuCloudRain, LuCloudOff, LuDroplets, LuSun, LuTrendingUp } from 'react-icons/lu';

// ─── Constants ────────────────────────────────────────────────────────────────

// PAGASA hourly rainfall intensity thresholds (mm/hr)
// Source: PAGASA Rainfall Advisory System
// Reference: https://www.pagasa.dost.gov.ph/information/rainfall-information
const PAGASA_HOURLY_THRESHOLDS = [
  {
    label: 'Light',
    min: 0, max: 2.5,
    color: '#22c55e',
    desc: 'No significant flood impact expected. Normal activities may continue.',
    pagasa: 'PAGASA Light Rain · < 2.5 mm/hr',
  },
  {
    label: 'Moderate',
    min: 2.5, max: 7.5,
    color: '#eab308',
    desc: 'Minor flooding possible in low-lying and flood-prone areas of Barangay Triangulo.',
    pagasa: 'PAGASA Moderate Rain · 2.5–7.5 mm/hr',
  },
  {
    label: 'Heavy',
    min: 7.5, max: 15,
    color: '#f97316',
    desc: 'Flooding likely. Residents in flood-prone zones should monitor water levels and prepare go-bags.',
    pagasa: 'PAGASA Heavy Rain · 7.5–15 mm/hr',
  },
  {
    label: 'Intense',
    min: 15, max: 30,
    color: '#ef4444',
    desc: 'Severe flooding expected. BDRRMC should activate response protocols and prepare evacuation centers.',
    pagasa: 'PAGASA Intense Rain · 15–30 mm/hr',
  },
  {
    label: 'Torrential',
    min: 30, max: 9999,
    color: '#7c3aed',
    desc: 'Extreme flooding imminent. Immediate evacuation of at-risk residents required.',
    pagasa: 'PAGASA Torrential Rain · > 30 mm/hr',
  },
];

// PAGASA 24-hour accumulated rainfall thresholds (mm/24hr)
// Source: PAGASA Flood Advisory — Accumulated Rainfall Classification
// Reference: https://www.pagasa.dost.gov.ph/information/rainfall-information
const PAGASA_DAILY_THRESHOLDS = [
  {
    label: 'Light',
    min: 0, max: 10,
    color: '#22c55e',
    desc: 'No significant flood impact expected for the day.',
    pagasa: 'PAGASA Light · < 10 mm/24hr',
  },
  {
    label: 'Moderate',
    min: 10, max: 25,
    color: '#eab308',
    desc: 'Minor flooding possible in low-lying areas. Monitor drainage and creek levels.',
    pagasa: 'PAGASA Moderate · 10–25 mm/24hr',
  },
  {
    label: 'Heavy',
    min: 25, max: 50,
    color: '#f97316',
    desc: 'Flooding likely in Barangay Triangulo flood-prone zones. Activate monitoring teams.',
    pagasa: 'PAGASA Heavy · 25–50 mm/24hr',
  },
  {
    label: 'Intense',
    min: 50, max: 100,
    color: '#ef4444',
    desc: 'Severe flooding expected. Evacuation of riverside and low-lying residents advised.',
    pagasa: 'PAGASA Intense · 50–100 mm/24hr',
  },
  {
    label: 'Torrential',
    min: 100, max: 9999,
    color: '#7c3aed',
    desc: 'Catastrophic flooding. Immediate evacuation required. Coordinate with MDRRMO.',
    pagasa: 'PAGASA Torrential · > 100 mm/24hr',
  },
];

function getThresholds(period) {
  return period === 'hourly' ? PAGASA_HOURLY_THRESHOLDS : PAGASA_DAILY_THRESHOLDS;
}

function getRainfallCategory(mm, period = 'hourly') {
  const thresholds = getThresholds(period);
  return thresholds.find(t => mm >= t.min && mm < t.max) ?? thresholds[0];
}

function getRainfallEmoji(mm, period = 'hourly') {
  const cat = getRainfallCategory(mm, period);
  if (cat.label === 'Torrential') return '';
  if (cat.label === 'Intense')    return '';
  if (cat.label === 'Heavy')      return '';
  if (cat.label === 'Moderate')   return '';
  return '';
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusBanner({ total, peak, acc3hr, acc6hr, period, hasData }) {
  const ref  = acc3hr ?? total;
  const cat  = getRainfallCategory(ref, 'hourly');
  const emoji = getRainfallEmoji(ref, 'hourly');

  // Never claim "dry" when there are simply no readings yet.
  if (!hasData) return null;

  if (ref === 0) {
    return (
      <div className="rain-banner calm" role="status">
        <span className="rain-banner-icon"><LuSun size={22} aria-hidden="true" /></span>
        <div>
          <div className="rain-banner-title">No rainfall detected</div>
          <div className="rain-banner-text">No significant flood impact expected. Normal activities may continue.</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 14,
      padding: '14px 18px', marginBottom: 18,
      background: `${cat.color}08`,
      border: `1px solid ${cat.color}35`,
      borderRadius: 'var(--radius-sm)',
    }}>
      <span className="rain-banner-icon" style={{ color: cat.color, background: `${cat.color}1f` }}><LuCloudRain size={22} aria-hidden="true" /></span>
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
            {ref.toFixed(1)} mm/hr
          </span>
          <span style={{
            fontSize: '0.6rem', color: 'var(--text-muted)',
            background: 'var(--blue-mid)', border: '1px solid var(--blue-border)',
            borderRadius: 4, padding: '2px 8px',
          }}>
            {cat.pagasa}
          </span>
        </div>
        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: 4 }}>
          {cat.desc}
        </div>
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
          {acc3hr != null && (
            <span>3-hr accumulation: <strong style={{ color: 'var(--text-secondary)' }}>{acc3hr.toFixed(1)} mm</strong></span>
          )}
          {acc6hr != null && (
            <span>6-hr accumulation: <strong style={{ color: 'var(--text-secondary)' }}>{acc6hr.toFixed(1)} mm</strong></span>
          )}
          <span>Peak intensity: <strong style={{ color: 'var(--text-secondary)' }}>{peak.toFixed(1)} mm/hr</strong></span>
        </div>
      </div>
    </div>
  );
}

function CustomTooltip({ active, payload, label, period }) {
  if (!active || !payload?.length) return null;
  const val = payload[0]?.value ?? 0;
  const cat = getRainfallCategory(val, period);
  return (
    <div style={{
      background: 'var(--blue-card)', border: '1px solid var(--blue-border)',
      borderRadius: 8, padding: '10px 14px', fontSize: '0.78rem',
      boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
    }}>
      <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <div style={{ width: 8, height: 8, borderRadius: 2, background: cat.color }} />
        <span style={{ color: 'var(--text-secondary)' }}>Rainfall:</span>
        <span style={{ fontWeight: 800, color: cat.color, fontSize: '0.9rem' }}>
          {val} {period === 'hourly' ? 'mm/hr' : 'mm'}
        </span>
      </div>
      <div style={{ fontSize: '0.65rem', color: cat.color, opacity: 0.9, marginBottom: 4 }}>
        {getRainfallEmoji(val, period)} {cat.label}
      </div>
      <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', borderTop: '1px solid var(--blue-border)', paddingTop: 5, marginTop: 4 }}>
        {cat.pagasa}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function RainfallPage() {
  const [view, setView]               = useState('chart');
  const [period, setPeriod]           = useState('hourly');
  const [dailyData, setDailyData]     = useState([]);
  const [hourlyLogs, setHourlyLogs]   = useState([]);
  const [lastFetched, setLastFetched] = useState(null);

  const { prediction } = useOutletContext();
  const liveRainfall   = prediction?.live_metrics?.rainfall_mm ?? null;

  const fetchRainfall = useCallback(async () => {
    const since        = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

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

  // ── Derived metrics ───────────────────────────────────────────────────────────

  const data    = period === 'hourly' ? hourlyLogs : dailyData;
  const dataKey = period === 'hourly' ? 'hour'     : 'date';
  const total   = parseFloat(data.reduce((s, d) => s + d.rainfall, 0).toFixed(1));
  const peak    = parseFloat(Math.max(0, ...data.map(d => d.rainfall)).toFixed(1));

  const acc3hr = (() => {
    if (hourlyLogs.length === 0) return null;
    return parseFloat(hourlyLogs.slice(-3).reduce((s, d) => s + d.rainfall, 0).toFixed(1));
  })();

  const acc6hr = (() => {
    if (hourlyLogs.length === 0) return null;
    return parseFloat(hourlyLogs.slice(-6).reduce((s, d) => s + d.rainfall, 0).toFixed(1));
  })();

  const isStale = lastFetched
    ? (Date.now() - lastFetched.getTime()) > 5 * 60 * 1000
    : false;

  const trend = (() => {
    if (hourlyLogs.length < 6) return null;
    const last3 = hourlyLogs.slice(-3).reduce((s, d) => s + d.rainfall, 0);
    const prev3 = hourlyLogs.slice(-6, -3).reduce((s, d) => s + d.rainfall, 0);
    const delta = last3 - prev3;
    if (delta > 1)  return { label: '⬆ Increasing', color: '#ef4444' };
    if (delta < -1) return { label: '⬇ Decreasing', color: '#22c55e' };
    return { label: '➡ Steady', color: '#8da4be' };
  })();

  // Active thresholds based on current view
  const activeThresholds = getThresholds(period);

  // KPI card category uses hourly thresholds always (live reading is mm/hr)
  const acc3hrCat = acc3hr != null ? getRainfallCategory(acc3hr, 'hourly') : null;
  const acc6hrCat = acc6hr != null ? getRainfallCategory(acc6hr, 'hourly') : null;

  return (
    <div className="fade-in">

      {/* ── Staleness Warning ─────────────────────────────────────── */}
      {isStale && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '9px 14px', marginBottom: 14,
          background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.25)',
          borderRadius: 'var(--radius-sm)',
          fontSize: '0.8rem', color: '#f87171',
        }}>
          <strong>Data may be stale</strong> — last update was over 5 minutes ago. Check backend connectivity.
        </div>
      )}

      {/* ── Operational Status Banner ─────────────────────────────── */}
      <StatusBanner
        total={total} peak={peak}
        acc3hr={acc3hr} acc6hr={acc6hr}
        period={period}
        hasData={hourlyLogs.length > 0}
      />

      {/* ── KPI Cards ─────────────────────────────────────────────── */}
      <div className="grid-4 rain-kpis" style={{ marginBottom: 18 }}>
        {[
          {
            label: 'Total Accumulated',
            value: `${total}`,
            unit: 'mm',
            icon: <LuDroplets size={16} />,
            color: 'var(--accent)',
            sub: period === 'hourly' ? 'Last 24 hours · hourly average' : 'Last 7 days · daily total',
          },
          {
            label: period === 'hourly' ? 'Peak Intensity' : 'Peak Day',
            value: `${peak}`,
            unit: period === 'hourly' ? 'mm/hr' : 'mm',
            icon: <LuTrendingUp size={16} />,
            color: peak > 0 ? getRainfallCategory(peak, period).color : '#22c55e',
            sub: peak > 0
              ? `${getRainfallCategory(peak, period).label}${period === 'hourly' ? ' intensity' : ''} · ${getRainfallCategory(peak, period).pagasa}`
              : 'No rainfall recorded',
          },
          {
            label: '3-Hr Accumulation',
            value: acc3hr != null ? `${acc3hr}` : '—',
            unit: acc3hr != null ? 'mm' : '',
            icon: <LuTimer size={16} />,
            color: acc3hrCat?.color ?? 'var(--text-muted)',
            sub: acc3hr != null
              ? `${acc3hrCat.label} · ${trend?.label ?? '—'}`
              : 'Needs recorded hourly readings',
            badge: acc3hrCat?.label ?? null,
            badgeColor: acc3hrCat?.color ?? null,
          },
          {
            label: '6-Hr Accumulation',
            value: acc6hr != null ? `${acc6hr}` : '—',
            unit: acc6hr != null ? 'mm' : '',
            icon: <LuGauge size={16} />,
            color: acc6hrCat?.color ?? 'var(--text-muted)',
            sub: acc6hr != null
              ? `PAGASA Intense threshold at 15mm/hr · 6-hr window`
              : 'Needs recorded hourly readings',
            badge: acc6hr != null && acc6hr >= 15 ? 'Above Intense' : null,
            badgeColor: '#ef4444',
          },
        ].map(c => (
          <div key={c.label} className="card" style={{
            position: 'relative', overflow: 'hidden',
          }}>
            <div className="kpi-head">
              <span className="kpi-icon" aria-hidden="true">{c.icon}</span>
              <span className="kpi-label">{c.label}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 6 }}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: 800, color: c.color, lineHeight: 1 }}>
                {c.value}
              </span>
              {c.unit && (
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600 }}>{c.unit}</span>
              )}
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
            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: 'auto', paddingTop: 2 }}>
              {c.sub}
            </div>
          </div>
        ))}
      </div>

      {/* ── Main Chart Card ────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title" style={{ marginBottom: 14 }}>
          Rainfall {period === 'hourly' ? 'Intensity (mm/hr)' : 'Accumulation (mm/24hr)'}
        </div>

        <div className="chart-toolbar">
          <div className="seg" role="group" aria-label="Time period">
            <button type="button" aria-pressed={period === 'hourly'} onClick={() => setPeriod('hourly')}>Last 24 hours</button>
            <button type="button" aria-pressed={period === 'daily'}  onClick={() => setPeriod('daily')}>Last 7 days</button>
          </div>
          <div className="seg" role="group" aria-label="Display as">
            <button type="button" aria-pressed={view === 'chart'} onClick={() => setView('chart')}><LuChartColumn size={15} aria-hidden="true" /> Chart</button>
            <button type="button" aria-pressed={view === 'table'} onClick={() => setView('table')}><LuTable size={15} aria-hidden="true" /> Table</button>
          </div>
          {lastFetched && (
            <span className="chart-toolbar-sync">
              Synced {lastFetched.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>

        {/* Period context note */}
        <div style={{
          fontSize: '0.68rem', color: 'var(--text-muted)',
          marginBottom: 12, padding: '6px 10px',
          background: 'var(--blue-mid)', borderRadius: 6,
          border: '1px solid var(--blue-border)',
        }}>
          {period === 'hourly'
            ? 'Thresholds based on PAGASA hourly rainfall intensity classification (mm/hr) · Philippine Atmospheric, Geophysical and Astronomical Services Administration'
            : 'Thresholds based on PAGASA 24-hour accumulated rainfall classification (mm/24hr) · Philippine Atmospheric, Geophysical and Astronomical Services Administration'}
        </div>

        {data.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon" aria-hidden="true"><LuCloudOff size={26} /></div>
            <div className="empty-state-title">No rainfall readings yet</div>
            <p className="empty-state-text">Readings appear here once AGOS starts recording. Check back in a few minutes.</p>
          </div>
        ) : view === 'chart' ? (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--blue-border)" />
              <XAxis
                dataKey={dataKey}
                tick={{ fill: 'var(--text-secondary)', fontSize: 11 }}
                tickLine={false}
                interval={period === 'hourly' ? Math.floor(data.length / 8) : 0}
              />
              <YAxis
                tick={{ fill: 'var(--text-secondary)', fontSize: 11 }}
                unit="mm"
                tickLine={false}
              />
              <Tooltip content={<CustomTooltip period={period} />} />

              {/* Dynamic reference lines based on active threshold set */}
              {activeThresholds.slice(1).map(t => (
                <ReferenceLine
                  key={t.label}
                  y={t.min}
                  stroke={t.color}
                  strokeWidth={1}
                  strokeDasharray="4 3"
                  label={{
                    value: `${t.label} (${t.min}mm)`,
                    fill: t.color,
                    fontSize: 10,
                    position: 'insideTopRight',
                  }}
                />
              ))}

              <Bar dataKey="rainfall" fill="#38bdf8" radius={[4, 4, 0, 0]} maxBarSize={40}>
                {data.map((row, i) => (
                  <Cell key={i} fill={getRainfallCategory(row.rainfall, period).color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div style={{ overflowY: 'auto', overflowX: 'auto', maxHeight: 300 }}>
            <table style={{ width: '100%', minWidth: 480, borderCollapse: 'collapse', fontSize: '0.8rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--blue-border)' }}>
                  {[period === 'hourly' ? 'Hour' : 'Date', 'Rainfall', 'PAGASA Category', 'Operational Note'].map(h => (
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
                  const cat = getRainfallCategory(row.rainfall, period);
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid var(--blue-border)' }}>
                      <td style={{ padding: '7px 12px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                        {row[dataKey]}
                      </td>
                      <td style={{ padding: '7px 12px', color: cat.color, fontWeight: 700, whiteSpace: 'nowrap' }}>
                        {row.rainfall} {period === 'hourly' ? 'mm/hr' : 'mm'}
                      </td>
                      <td style={{ padding: '7px 12px' }}>
                        <span style={{
                          fontSize: '0.65rem', fontWeight: 700,
                          background: `${cat.color}18`, color: cat.color,
                          border: `1px solid ${cat.color}40`,
                          borderRadius: 4, padding: '2px 7px',
                          whiteSpace: 'nowrap',
                        }}>
                          {getRainfallEmoji(row.rainfall, period)} {cat.label}
                        </span>
                      </td>
                      <td style={{ padding: '7px 12px', fontSize: '0.7rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
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

      {/* ── PAGASA Threshold Reference ────────────────────────────── */}
      <div className="card" style={{ padding: '14px 20px' }}>
        <SectionLabel>
          PAGASA Rainfall Classification —{' '}
          {period === 'hourly' ? 'Hourly Intensity (mm/hr)' : '24-Hour Accumulation (mm/24hr)'}
        </SectionLabel>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10, marginBottom: 14 }}>
          {activeThresholds.map(t => {
            const isActive = liveRainfall != null && liveRainfall >= t.min && liveRainfall < t.max;
            return (
              <div key={t.label} style={{
                padding: '10px 12px',
                background: isActive ? `${t.color}12` : 'var(--blue-mid)',
                border: `1px solid ${isActive ? t.color + '50' : 'var(--blue-border)'}`,
                borderRadius: 'var(--radius-sm)',
                transition: 'all 0.2s',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: '0.72rem', fontWeight: 800, color: t.color, letterSpacing: '0.06em' }}>
                    {getRainfallEmoji(t.min + 0.1, period)} {t.label}
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
                <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', fontFamily: 'monospace', marginBottom: 5 }}>
                  {t.max === 9999
                    ? `≥ ${t.min} ${period === 'hourly' ? 'mm/hr' : 'mm'}`
                    : `${t.min}–${t.max} ${period === 'hourly' ? 'mm/hr' : 'mm'}`}
                </div>
                <div style={{ fontSize: '0.67rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                  {t.desc}
                </div>
              </div>
            );
          })}
        </div>

        {/* PAGASA citation */}
        <div style={{
          padding: '8px 12px',
          background: 'rgba(56,189,248,0.05)',
          border: '1px solid rgba(56,189,248,0.15)',
          borderRadius: 6,
          fontSize: '0.68rem',
          color: 'var(--text-muted)',
          display: 'flex', flexDirection: 'column', gap: 3,
        }}>
          <div>
            <strong style={{ color: 'var(--text-secondary)' }}>Source:</strong>{' '}
            Philippine Atmospheric, Geophysical and Astronomical Services Administration (PAGASA).
            {period === 'hourly'
              ? ' Rainfall Advisory — Hourly Intensity Classification.'
              : ' Flood Advisory — 24-Hour Accumulated Rainfall Classification.'}
          </div>
          <div>
            <strong style={{ color: 'var(--text-secondary)' }}>Reference:</strong>{' '}
            <span style={{ fontFamily: 'monospace', fontSize: '0.65rem' }}>
              https://www.pagasa.dost.gov.ph/information/rainfall-information
            </span>
          </div>
          
        </div>
      </div>

    </div>
  );
}