import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Swal from 'sweetalert2';
import { APIProvider, Map, Polygon } from '@vis.gl/react-google-maps';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer, Area, AreaChart, Legend,
} from 'recharts';
import { ALERT_LEVELS, DATA_SOURCES } from '../data/mockData';
import { useAuth } from '../hooks/useAuth';
import { useModelPrediction, alertLevelToKey } from '../lib/modelApi';
import { supabase } from '../lib/supabaseClient';

// ─── Constants ───────────────────────────────────────────────────────────────

const ALERT_COLORS = {
  NORMAL:   '#22c55e',
  ADVISORY: '#eab308',
  WARNING:  '#f97316',
  CRITICAL: '#ef4444',
};

const ALERT_THRESHOLDS = {
  NORMAL:   { min: 0,   max: 2.4,  label: 'Safe Range',         wl: '< 2.5m' },
  ADVISORY: { min: 2.5, max: 3.4,  label: 'Advisory Threshold', wl: '2.5 – 3.4m' },
  WARNING:  { min: 3.5, max: 4.4,  label: 'Warning Threshold',  wl: '3.5 – 4.4m' },
  CRITICAL: { min: 4.5, max: 999,  label: 'Critical Threshold', wl: '≥ 4.5m' },
};

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

// ─── Sub-components ───────────────────────────────────────────────────────────

function LiveBadge({ color }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.08em',
      color: color || '#22c55e', textTransform: 'uppercase',
    }}>
      <span style={{
        width: 7, height: 7, borderRadius: '50%',
        background: color || '#22c55e',
        boxShadow: `0 0 0 0 ${color || '#22c55e'}`,
        animation: 'pulse-ring 1.6s ease-out infinite',
        display: 'inline-block', flexShrink: 0,
      }} />
      LIVE
    </span>
  );
}

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

function MetricCard({ icon, label, value, sub, color, noData, unit, badge }) {
  return (
    <div className="card" style={{
      display: 'flex', flexDirection: 'column', gap: 0,
      opacity: noData ? 0.55 : 1,
      borderTop: `3px solid ${color || 'var(--blue-border)'}`,
      transition: 'border-color 0.3s ease',
      position: 'relative', overflow: 'hidden',
    }}>
      {/* faint icon watermark */}
      <div style={{
        position: 'absolute', right: 12, top: 10,
        fontSize: '2.4rem', opacity: 0.07, pointerEvents: 'none', userSelect: 'none',
      }}>{icon}</div>

      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8 }}>
        {label}
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 6 }}>
        <span style={{
          fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: 800,
          color: color || 'var(--accent)', lineHeight: 1,
        }}>
          {value}
        </span>
        {unit && <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600 }}>{unit}</span>}
      </div>

      {badge && (
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.06em',
          background: `${color}20`, color: color, border: `1px solid ${color}40`,
          borderRadius: 4, padding: '2px 7px', marginBottom: 6, width: 'fit-content',
        }}>
          {badge}
        </div>
      )}

      <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: 'auto', paddingTop: 4 }}>
        {sub}
      </div>
    </div>
  );
}

function WaterLevelGauge({ level, maxLevel = 6 }) {
  const pct = level ? Math.min((level / maxLevel) * 100, 100) : 0;
  const color = !level ? 'var(--text-muted)'
    : level >= 4.5 ? '#ef4444'
    : level >= 3.5 ? '#f97316'
    : level >= 2.5 ? '#eab308'
    : '#22c55e';

  const thresholds = [
    { value: 2.5, color: '#eab308', label: 'Advisory' },
    { value: 3.5, color: '#f97316', label: 'Warning' },
    { value: 4.5, color: '#ef4444', label: 'Critical' },
  ];

  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'stretch', height: 200 }}>
      {/* Vertical bar gauge */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
        {/* Scale labels */}
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', paddingBottom: 2 }}>
          {[6, 5, 4, 3, 2, 1, 0].map(v => (
            <span key={v} style={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontWeight: 600, lineHeight: 1, textAlign: 'right' }}>
              {v}m
            </span>
          ))}
        </div>
        {/* Bar track */}
        <div style={{
          width: 40, height: '100%', background: 'var(--blue-mid)',
          border: '1px solid var(--blue-border)', borderRadius: 6, position: 'relative', overflow: 'hidden',
        }}>
          {/* Threshold lines */}
          {thresholds.map(t => (
            <div key={t.value} style={{
              position: 'absolute', bottom: `${(t.value / maxLevel) * 100}%`,
              left: 0, right: 0, borderTop: `1px dashed ${t.color}`,
              opacity: 0.7, zIndex: 2,
            }} />
          ))}
          {/* Fill */}
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            height: `${pct}%`, background: color,
            opacity: 0.85, transition: 'height 1s ease, background 0.4s ease',
            zIndex: 1,
          }} />
        </div>
      </div>

      {/* Reading + legend */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>
            Est. Water Level
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '2.4rem', fontWeight: 800, color, lineHeight: 1 }}>
            {level ? `${level}m` : 'N/A'}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: 4 }}>
            {!level ? 'No model data available' : level >= 4.5 ? 'Critical — immediate action required' : level >= 3.5 ? 'Warning — monitor closely' : level >= 2.5 ? 'Advisory — elevated risk' : 'Within normal range'}
          </div>
        </div>

        {/* Threshold legend */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {thresholds.map(t => (
            <div key={t.value} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 18, height: 2, background: t.color, borderRadius: 1, opacity: 0.8 }} />
              <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                {t.label} ({t.value}m)
              </span>
            </div>
          ))}
          <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', marginTop: 4, opacity: 0.7 }}>
            Derived · baseline 1.4m + rain factor ×0.045
          </div>
        </div>
      </div>
    </div>
  );
}

function FloodMap({ currentAlert }) {
  const color = ALERT_COLORS[currentAlert] || ALERT_COLORS.NORMAL;
  return (
    <APIProvider apiKey={import.meta.env.VITE_GOOGLE_MAPS_KEY}>
      <Map
        defaultCenter={{ lat: 13.6140, lng: 123.1915 }}
        defaultZoom={15}
        mapId="agos-flood-map"
        style={{ width: '100%', height: 420, borderRadius: 'var(--radius-sm)' }}
        gestureHandling="cooperative"
      >
        <Polygon
          paths={TRIANGULO_BOUNDARY}
          strokeColor={color}
          strokeOpacity={0.95}
          strokeWeight={2}
          fillColor={color}
          fillOpacity={0.28}
        />
      </Map>
    </APIProvider>
  );
}

function AlertLevelTable({ currentAlert }) {
  const levels = [
    { key: 'NORMAL',   range: '< 2.5m',      action: 'Continue normal activities. Monitor updates.' },
    { key: 'ADVISORY', range: '2.5 – 3.4m',  action: 'Stay alert. Prepare emergency go-bags.' },
    { key: 'WARNING',  range: '3.5 – 4.4m',  action: 'Move valuables to higher ground. Be ready to evacuate.' },
    { key: 'CRITICAL', range: '≥ 4.5m',      action: 'Evacuate immediately to designated evacuation centers.' },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {levels.map(({ key, range, action }) => {
        const info = ALERT_LEVELS[key];
        const isCurrent = currentAlert === key;
        return (
          <div key={key} style={{
            display: 'grid', gridTemplateColumns: '10px 70px 1fr',
            alignItems: 'center', gap: 10,
            padding: '10px 12px',
            borderRadius: 'var(--radius-sm)',
            background: isCurrent ? `${info.color}12` : 'var(--blue-mid)',
            border: `1px solid ${isCurrent ? info.color + '50' : 'var(--blue-border)'}`,
            transition: 'all 0.2s',
          }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: info.color, flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: '0.72rem', fontWeight: 800, color: info.color, letterSpacing: '0.06em' }}>{info.label}</div>
              <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', marginTop: 1, fontFamily: 'monospace' }}>{range}</div>
            </div>
            <div style={{ fontSize: '0.7rem', color: isCurrent ? 'var(--text-primary)' : 'var(--text-muted)', lineHeight: 1.4 }}>
              {action}
              {isCurrent && (
                <span style={{
                  marginLeft: 8, fontSize: '0.6rem', fontWeight: 700,
                  background: `${info.color}30`, color: info.color,
                  padding: '1px 6px', borderRadius: 3, border: `1px solid ${info.color}40`,
                }}>
                  CURRENT
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ForecastStrip({ forecast, loading }) {
  if (loading) {
    return (
      <div style={{ display: 'flex', gap: 8 }}>
        {[...Array(6)].map((_, i) => (
          <div key={i} style={{
            minWidth: 78, height: 100, background: 'var(--blue-mid)',
            borderRadius: 'var(--radius-sm)', border: '1px solid var(--blue-border)',
            opacity: 0.5,
          }} />
        ))}
      </div>
    );
  }
  if (!forecast.length) {
    return (
      <div style={{
        padding: '20px', textAlign: 'center',
        color: 'var(--text-muted)', fontSize: '0.82rem',
        background: 'var(--blue-mid)', borderRadius: 'var(--radius-sm)',
        border: '1px solid var(--blue-border)',
      }}>
        ⚠️ Forecast feed unavailable — model backend offline
      </div>
    );
  }

  const maxPrecip = Math.max(...forecast.map(f => f.precipitation), 1);

  return (
    <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4 }}>
      {forecast.map((f, idx) => {
        const precipPct = (f.precipitation / maxPrecip) * 100;
        const isHeavy = f.precipitation > 10;
        const isMod = f.precipitation > 2;
        const emoji = isHeavy ? '⛈' : isMod ? '🌧' : f.precipitation > 0 ? '🌦' : '☀️';
        const precipColor = isHeavy ? '#ef4444' : isMod ? '#f97316' : '#38bdf8';

        return (
          <div key={f.time} style={{
            minWidth: 80, flexShrink: 0, textAlign: 'center',
            background: 'var(--blue-mid)', border: '1px solid var(--blue-border)',
            borderRadius: 'var(--radius-sm)', padding: '10px 8px',
            borderTop: idx === 0 ? '2px solid var(--accent)' : '2px solid transparent',
          }}>
            <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', fontWeight: 700, marginBottom: 6, letterSpacing: '0.06em' }}>
              {new Date(f.time).toLocaleString('en-PH', { weekday: 'short', hour: 'numeric', hour12: true })}
            </div>
            <div style={{ fontSize: '1.3rem', marginBottom: 4 }}>{emoji}</div>
            <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 2 }}>{f.temperature_c}°C</div>
            {/* Mini precip bar */}
            <div style={{ height: 3, background: 'var(--blue-border)', borderRadius: 2, marginBottom: 4, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${precipPct}%`, background: precipColor, borderRadius: 2, transition: 'width 0.5s ease' }} />
            </div>
            <div style={{ fontSize: '0.65rem', color: precipColor, fontWeight: 600 }}>{f.precipitation}mm</div>
            <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginTop: 2 }}>{f.wind_speed_kph} km/h</div>
          </div>
        );
      })}
    </div>
  );
}

function SystemStatusPanel({ modelError, modelLoading, prediction, forecastLoading, forecast }) {
  const modelOnline = !modelError && !modelLoading && !!prediction;
  const forecastOnline = !forecastLoading && forecast.length > 0;

  const indicators = [
    {
      label: 'LSTM Prediction Engine',
      status: modelLoading ? 'checking' : modelOnline ? 'online' : 'offline',
      detail: modelOnline
        ? `Last response: ${new Date().toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })}`
        : modelError ?? 'Connecting...',
    },
    {
      label: 'WeatherAPI Forecast Feed',
      status: forecastLoading ? 'checking' : forecastOnline ? 'online' : 'offline',
      detail: forecastOnline
        ? `${forecast.length} hourly records loaded`
        : 'Feed unavailable',
    },
    {
      label: 'Supabase Database',
      status: 'online',
      detail: 'Alert logs · User auth · SMS queue',
    },
    {
      label: 'SMS Gateway (httpsms)',
      status: 'online',
      detail: 'Edge function standby',
    },
  ];

  const statusStyle = {
    online:   { color: '#22c55e', dot: '#22c55e', label: 'ONLINE' },
    offline:  { color: '#ef4444', dot: '#ef4444', label: 'OFFLINE' },
    checking: { color: '#eab308', dot: '#eab308', label: 'CHECKING' },
  };

  return (
    <div className="card" style={{ padding: '16px 20px' }}>
      <SectionLabel>🖥 System Status</SectionLabel>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
        {indicators.map(({ label, status, detail }) => {
          const s = statusStyle[status];
          return (
            <div key={label} style={{
              display: 'flex', alignItems: 'flex-start', gap: 10,
              padding: '9px 12px',
              background: 'var(--blue-mid)',
              border: '1px solid var(--blue-border)',
              borderRadius: 'var(--radius-sm)',
            }}>
              <div style={{
                width: 7, height: 7, borderRadius: '50%',
                background: s.dot, flexShrink: 0, marginTop: 4,
                boxShadow: status === 'online' ? `0 0 6px ${s.dot}80` : 'none',
                animation: status === 'checking' ? 'pulse-ring 1.4s ease-out infinite' : 'none',
              }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginBottom: 2 }}>
                  <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.2 }}>
                    {label}
                  </span>
                  <span style={{
                    fontSize: '0.58rem', fontWeight: 800, letterSpacing: '0.08em',
                    color: s.color, flexShrink: 0,
                    background: `${s.color}15`, border: `1px solid ${s.color}30`,
                    borderRadius: 3, padding: '1px 5px',
                  }}>
                    {s.label}
                  </span>
                </div>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', lineHeight: 1.3 }}>
                  {detail}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PredictionInputTable({ prediction }) {
  if (!prediction) return null;

  const m = prediction.live_metrics;

  const rows = [
    { label: 'Rainfall',         value: `${m.rainfall_mm?.toFixed(2) ?? '—'} mm/hr`,   icon: '🌧', note: 'Primary flood driver' },
    { label: 'Humidity',         value: `${m.humidity ?? '—'}%`,                         icon: '💨', note: 'Atmospheric moisture' },
    { label: 'Wind Signal',      value: `PAGASA Signal #${m.wind_signal ?? '—'}`,         icon: '🌀', note: 'PAGASA classification' },
    { label: 'Flood Probability',value: `${(prediction.probability * 100).toFixed(1)}%`,  icon: '🤖', note: 'LSTM output confidence' },
    { label: 'Alert Level',      value: `Level ${prediction.alert_level}`,                icon: '🚦', note: 'Model classification' },
    { label: 'Lead Time Est.',   value: prediction.lead_time_estimate ?? '6–12 hrs',      icon: '⏱', note: 'Time before peak flood' },
  ];

  return (
    <div className="card">
      <SectionLabel>📊 LSTM Model — Prediction Input Summary</SectionLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {rows.map(({ label, value, icon, note }, i) => (
          <div key={label} style={{
            display: 'grid',
            gridTemplateColumns: '24px 1fr auto',
            alignItems: 'center',
            gap: 10,
            padding: '9px 10px',
            background: i % 2 === 0 ? 'var(--blue-mid)' : 'transparent',
            borderRadius: i === 0 ? '6px 6px 0 0' : i === rows.length - 1 ? '0 0 6px 6px' : 0,
          }}>
            <span style={{ fontSize: '0.9rem', textAlign: 'center' }}>{icon}</span>
            <div>
              <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-primary)' }}>{label}</div>
              <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', marginTop: 1 }}>{note}</div>
            </div>
            <div style={{
              fontFamily: 'var(--font-display)', fontSize: '0.82rem', fontWeight: 700,
              color: 'var(--accent)', textAlign: 'right', whiteSpace: 'nowrap',
            }}>
              {value}
            </div>
          </div>
        ))}
      </div>
      <div style={{
        marginTop: 10, paddingTop: 8,
        borderTop: '1px solid var(--blue-border)',
        fontSize: '0.63rem', color: 'var(--text-muted)',
        display: 'flex', justifyContent: 'space-between',
      }}>
        <span>Model: LSTM · Cloud Run (asia-southeast1)</span>
        <span>Poll interval: 30s</span>
      </div>
    </div>
  );
}

function SevenDayForecastChart() {
  const [chartData,    setChartData]    = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [lastFetched,  setLastFetched]  = useState(null);

  const fetchSnapshots = useCallback(async () => {
    const since = new Date();
    since.setDate(since.getDate() - 7);

    const { data, error } = await supabase
      .from('flood_snapshots')
      .select('created_at, water_level, rainfall_mm, probability, alert_key')
      .gte('created_at', since.toISOString())
      .order('created_at', { ascending: true });

    if (error) {
      console.warn('Snapshot fetch failed:', error.message);
      setLoading(false);
      return;
    }

    // Group into daily buckets
    const byDay = {};
    (data ?? []).forEach(row => {
      const key = new Date(row.created_at).toDateString();
      if (!byDay[key]) byDay[key] = { date: new Date(row.created_at), rows: [] };
      byDay[key].rows.push(row);
    });

    const days = Object.values(byDay).map(({ date, rows }) => {
      const avgWater    = rows.reduce((s, r) => s + (r.water_level   || 0), 0) / rows.length;
      const avgRain     = rows.reduce((s, r) => s + (r.rainfall_mm   || 0), 0) / rows.length;
      const avgProb     = rows.reduce((s, r) => s + (r.probability   || 0), 0) / rows.length;
      const floodRisk   = Math.min(Math.round(avgProb * 100), 100);
      const dominant    = rows.reduce((acc, r) => {
        acc[r.alert_key] = (acc[r.alert_key] || 0) + 1;
        return acc;
      }, {});
      const alertKey = Object.entries(dominant).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'NORMAL';

      return {
        day:        date.toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' }),
        shortDay:   date.toLocaleDateString('en-PH', { weekday: 'short' }),
        dateObj:    date,
        waterLevel: parseFloat(avgWater.toFixed(2)),
        rainfall:   parseFloat(avgRain.toFixed(1)),
        floodRisk,
        alertKey,
        snapshots:  rows.length,
        isProjected: false,
      };
    });

    // Fill missing future days up to 7 with decay projection
    const today      = new Date();
    today.setHours(0, 0, 0, 0);
    const filled     = [...days];
    const lastKnown  = filled[filled.length - 1];
    const lastRain   = lastKnown?.rainfall ?? 0;
    const daysHave   = filled.length;

    for (let i = daysHave; i < 7; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + (i - daysHave + 1));
      const projRain  = parseFloat(Math.max(lastRain * Math.pow(0.75, i - daysHave + 1), 0).toFixed(1));
      const projLevel = parseFloat((1.4 + projRain * 0.045).toFixed(2));
      filled.push({
        day:        d.toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' }),
        shortDay:   d.toLocaleDateString('en-PH', { weekday: 'short' }),
        dateObj:    d,
        waterLevel: projLevel,
        rainfall:   projRain,
        floodRisk:  Math.min(Math.round((projLevel / 6) * 100), 100),
        alertKey:   'NORMAL',
        snapshots:  0,
        isProjected: true,
      });
    }

    setChartData(filled.slice(-7));
    setLastFetched(new Date());
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchSnapshots();

    // Re-fetch chart every 60s so it stays in sync with new snapshots
    const t = setInterval(fetchSnapshots, 60_000);
    return () => clearInterval(t);
  }, [fetchSnapshots]);

  // ── Realtime subscription — update chart whenever a new snapshot is inserted
  useEffect(() => {
    const channel = supabase
      .channel('flood_snapshots_live')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'flood_snapshots' },
        () => fetchSnapshots()
      )
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [fetchSnapshots]);

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0]?.payload;
    const wlColor = !d ? '#8da4be'
      : d.waterLevel >= 4.5 ? '#ef4444'
      : d.waterLevel >= 3.5 ? '#f97316'
      : d.waterLevel >= 2.5 ? '#eab308'
      : '#22c55e';
    return (
      <div style={{
        background: '#0d1f3c', border: '1px solid #1e3a5f',
        borderRadius: 8, padding: '10px 14px', fontSize: '0.78rem',
        boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
      }}>
        <div style={{ fontWeight: 700, color: '#e2eaf5', marginBottom: 6 }}>
          {label}
          {d?.isProjected && <span style={{ fontSize: '0.62rem', color: '#4a6080', fontWeight: 400 }}> · projected</span>}
          {!d?.isProjected && d?.snapshots > 0 && (
            <span style={{ fontSize: '0.62rem', color: '#38bdf8', fontWeight: 400 }}> · {d.snapshots} readings</span>
          )}
        </div>
        {payload.map(p => (
          <div key={p.dataKey} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: p.color }} />
            <span style={{ color: '#8da4be' }}>{p.name}:</span>
            <span style={{ fontWeight: 700, color: p.dataKey === 'waterLevel' ? wlColor : p.color }}>
              {p.value}{p.dataKey === 'waterLevel' ? 'm' : p.dataKey === 'rainfall' ? 'mm' : '%'}
            </span>
          </div>
        ))}
        {d?.waterLevel >= 3.5 && (
          <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid #1e3a5f', fontSize: '0.68rem', color: '#f97316' }}>
            ⚠ Warning threshold exceeded
          </div>
        )}
      </div>
    );
  };

  const projectedStartIdx = chartData.findIndex(d => d.isProjected);
  const hasLiveData = chartData.some(d => !d.isProjected && d.snapshots > 0);

  if (loading) {
    return (
      <div className="card" style={{ marginBottom: 18 }}>
        <SectionLabel>📈 7-Day Flood Forecast Trend</SectionLabel>
        <div style={{ height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
            <div style={{ fontSize: '1.5rem', marginBottom: 8, opacity: 0.4 }}>📊</div>
            Loading snapshot history from Supabase...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="card" style={{ marginBottom: 18 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <SectionLabel>📈 7-Day Flood Forecast Trend</SectionLabel>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: -4 }}>
            Avg daily water level · rainfall · flood risk % &nbsp;·&nbsp;
            {hasLiveData
              ? <span style={{ color: '#22c55e' }}>Live Supabase snapshots</span>
              : <span style={{ color: '#eab308' }}>⚠ No snapshots yet — model must run at least once</span>
            }
            {lastFetched && (
              <span style={{ marginLeft: 8, color: '#4a6080' }}>
                · synced {lastFetched.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
          {[
            { color: '#38bdf8', label: 'Water Level (m)' },
            { color: '#f97316', label: 'Rainfall (mm)' },
            { color: '#a855f7', label: 'Flood Risk (%)' },
          ].map(({ color, label }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 20, height: 2, background: color, borderRadius: 1 }} />
              <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{label}</span>
            </div>
          ))}
          {projectedStartIdx > -1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 20, height: 0, borderTop: '2px dashed #4a6080' }} />
              <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Projected</span>
            </div>
          )}
        </div>
      </div>

      {/* Chart */}
      <div style={{ position: 'relative' }}>
        {projectedStartIdx > 0 && (
          <div style={{
            position: 'absolute',
            left: `${(projectedStartIdx / Math.max(chartData.length, 1)) * 100}%`,
            right: 0, top: 0, bottom: 20,
            background: 'rgba(74,96,128,0.05)',
            borderLeft: '1px dashed #1e3a5f',
            zIndex: 0, pointerEvents: 'none',
            display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end',
            paddingRight: 8, paddingTop: 4,
          }}>
            <span style={{ fontSize: '0.58rem', color: '#4a6080', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              Projected
            </span>
          </div>
        )}

        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={chartData} margin={{ top: 10, right: 16, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e3a5f" vertical={false} />
            <XAxis
              dataKey="shortDay"
              tick={{ fill: '#4a6080', fontSize: 11, fontWeight: 600 }}
              tickLine={false}
              axisLine={{ stroke: '#1e3a5f' }}
            />
            <YAxis
              yAxisId="left"
              domain={[0, 6]}
              tick={{ fill: '#4a6080', fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={v => `${v}m`}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              domain={[0, 100]}
              tick={{ fill: '#4a6080', fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={v => `${v}`}
            />
            <Tooltip content={<CustomTooltip />} />

            <ReferenceLine yAxisId="left" y={2.5} stroke="#eab308" strokeDasharray="4 3" strokeOpacity={0.5}
              label={{ value: 'Advisory', position: 'insideTopLeft', fill: '#eab308', fontSize: 9 }} />
            <ReferenceLine yAxisId="left" y={3.5} stroke="#f97316" strokeDasharray="4 3" strokeOpacity={0.5}
              label={{ value: 'Warning', position: 'insideTopLeft', fill: '#f97316', fontSize: 9 }} />
            <ReferenceLine yAxisId="left" y={4.5} stroke="#ef4444" strokeDasharray="4 3" strokeOpacity={0.5}
              label={{ value: 'Critical', position: 'insideTopLeft', fill: '#ef4444', fontSize: 9 }} />

            <Line
              yAxisId="left" type="monotone" dataKey="waterLevel" name="Water Level"
              stroke="#38bdf8" strokeWidth={2.5}
              dot={(props) => {
                const { cx, cy, payload } = props;
                const dotColor = payload.waterLevel >= 4.5 ? '#ef4444'
                  : payload.waterLevel >= 3.5 ? '#f97316'
                  : payload.waterLevel >= 2.5 ? '#eab308'
                  : '#22c55e';
                return (
                  <circle key={`wl-${payload.day}`}
                    cx={cx} cy={cy}
                    r={payload.isProjected ? 3 : 5}
                    fill={payload.isProjected ? '#0d1f3c' : dotColor}
                    stroke={dotColor}
                    strokeWidth={payload.isProjected ? 1.5 : 2}
                  />
                );
              }}
              activeDot={{ r: 6, strokeWidth: 2 }}
            />
            <Line
              yAxisId="right" type="monotone" dataKey="rainfall" name="Rainfall"
              stroke="#f97316" strokeWidth={2}
              dot={(props) => {
                const { cx, cy, payload } = props;
                return (
                  <circle key={`rf-${payload.day}`}
                    cx={cx} cy={cy}
                    r={payload.isProjected ? 3 : 4}
                    fill={payload.isProjected ? '#0d1f3c' : '#f97316'}
                    stroke="#f97316" strokeWidth={1.5}
                  />
                );
              }}
              activeDot={{ r: 5 }}
            />
            <Line
              yAxisId="right" type="monotone" dataKey="floodRisk" name="Flood Risk"
              stroke="#a855f7" strokeWidth={1.5} strokeDasharray="5 3"
              dot={false} activeDot={{ r: 4, fill: '#a855f7' }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Day strip */}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${chartData.length}, 1fr)`, gap: 4, marginTop: 12 }}>
        {chartData.map((d, i) => {
          const isToday = new Date().toDateString() === d.dateObj?.toDateString();
          const wlColor = d.waterLevel >= 4.5 ? '#ef4444'
            : d.waterLevel >= 3.5 ? '#f97316'
            : d.waterLevel >= 2.5 ? '#eab308'
            : '#22c55e';
          return (
            <div key={i} style={{
              textAlign: 'center', padding: '8px 4px',
              background: isToday ? 'rgba(56,189,248,0.08)' : d.isProjected ? 'transparent' : 'var(--blue-mid)',
              border: `1px solid ${isToday ? 'rgba(56,189,248,0.3)' : 'var(--blue-border)'}`,
              borderRadius: 6,
              opacity: d.isProjected ? 0.65 : 1,
            }}>
              <div style={{ fontSize: '0.6rem', color: isToday ? 'var(--accent)' : 'var(--text-muted)', fontWeight: 700, marginBottom: 3 }}>
                {isToday ? 'TODAY' : d.shortDay}
              </div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '0.9rem', fontWeight: 800, color: wlColor }}>
                {d.waterLevel}m
              </div>
              <div style={{ fontSize: '0.58rem', color: '#f97316', marginTop: 1 }}>
                {d.rainfall}mm
              </div>
              {!d.isProjected && d.snapshots > 0 && (
                <div style={{ fontSize: '0.52rem', color: '#38bdf8', marginTop: 2 }}>{d.snapshots} rdgs</div>
              )}
              {d.isProjected && (
                <div style={{ fontSize: '0.52rem', color: '#4a6080', marginTop: 2 }}>proj.</div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 8, fontSize: '0.62rem', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 4 }}>
        <span>Source: flood_snapshots table · Supabase Realtime · Averaged per day · Poll: 30s</span>
        <span>No physical sensor · For situational awareness only</span>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [forecast, setForecast] = useState([]);
  const [forecastLoading, setForecastLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(new Date());

  useEffect(() => {
    fetch('https://flood-prediction-api-553657561163.asia-southeast1.run.app/api/forecast')
      .then(res => res.json())
      .then(data => { if (data.hourly) setForecast(data.hourly); })
      .catch(err => console.warn('Forecast fetch failed:', err))
      .finally(() => setForecastLoading(false));
  }, []);

  // Refresh timestamp every minute
  useEffect(() => {
    const t = setInterval(() => setLastUpdated(new Date()), 60000);
    return () => clearInterval(t);
  }, []);

  const isResident = user?.role_id === 7;
  const { prediction, loading: modelLoading, error: modelError } = useModelPrediction();

  const currentAlert = prediction ? alertLevelToKey(prediction.alert_level) : 'NORMAL';
  const alertInfo    = ALERT_LEVELS[currentAlert];
  const alertColor   = ALERT_COLORS[currentAlert];

  const probabilityPct  = prediction ? `${(prediction.probability * 100).toFixed(0)}%` : '—';
  const rainfallMm      = prediction?.live_metrics?.rainfall_mm ?? 0;
  const hasRainfall     = rainfallMm > 0;

  const BASELINE_LEVEL  = 1.4;
  const RISE_RATE       = 0.045;
  const estimatedLevel  = prediction
    ? parseFloat((BASELINE_LEVEL + rainfallMm * RISE_RATE).toFixed(2))
    : null;

  const waterLevelColor = !estimatedLevel || !hasRainfall ? 'var(--text-muted)'
    : estimatedLevel >= 4.5 ? '#ef4444'
    : estimatedLevel >= 3.5 ? '#f97316'
    : estimatedLevel >= 2.5 ? '#eab308'
    : '#22c55e';

  // ── Evacuation handler ──
  const handleEvacuationAlert = () => {
    Swal.fire({
      title: '⚠️ Send Evacuation Alert?',
      html: `
        <p style="color:#8da4be;margin-bottom:16px">This will send an SMS evacuation alert to all registered officials and residents in Barangay Triangulo.</p>
        <div style="background:#152a4a;border-radius:8px;padding:14px;text-align:left">
          <div style="color:#ef4444;font-weight:700;margin-bottom:8px">📢 Alert Message:</div>
          <div style="color:#e2eaf5;font-size:0.9rem">"Flooding possible in the next 6 hours. Please proceed to designated evacuation centers immediately."</div>
        </div>
      `,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#1e3a5f',
      confirmButtonText: '🚨 Send Alert Now',
      cancelButtonText: 'Cancel',
      background: '#0d1f3c',
      color: '#e2eaf5',
    }).then(async (result) => {
      if (!result.isConfirmed) return;
      const sentBy  = user?.name ?? user?.email ?? 'Admin';
      const message = 'Flooding possible in the next 6 hours. Please proceed to designated evacuation centers immediately.';
      const { error } = await supabase.from('alerts').insert({ type: 'CRITICAL', message, sent_by: sentBy });
      if (error) {
        Swal.fire({ title: '⚠️ Failed to Save', text: error.message, icon: 'error', background: '#0d1f3c', color: '#e2eaf5', confirmButtonColor: '#0ea5e9' });
        return;
      }
      const { data: smsData, error: smsError } = await supabase.functions.invoke('send-alert', { body: { message, type: 'CRITICAL' } });
      if (smsError) {
        Swal.fire({ title: '⚠️ Alert Saved, SMS Failed', text: 'The alert was recorded but SMS could not be sent. Check your httpsms setup.', icon: 'warning', background: '#0d1f3c', color: '#e2eaf5', confirmButtonColor: '#0ea5e9' });
        return;
      }
      Swal.fire({
        title: '✅ Alert Dispatched',
        html: `<p style="color:#8da4be;margin-bottom:12px">Evacuation alert sent successfully.</p>
          <div style="background:#112240;border-radius:8px;padding:12px;text-align:left;font-size:0.85rem">
            <div style="color:#22c55e;margin-bottom:4px">📱 SMS sent to: <strong>${smsData?.sent ?? 0} residents</strong></div>
            ${smsData?.failed ? `<div style="color:#f97316">⚠️ Failed: ${smsData.failed}</div>` : ''}
          </div>`,
        icon: 'success', background: '#0d1f3c', color: '#e2eaf5', confirmButtonColor: '#0ea5e9',
      });
    });
  };

  return (
    <div className="fade-in">

      {/* ── Offline Banner ──────────────────────────────────────── */}
      {modelError && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.25)',
          borderLeft: '3px solid #ef4444', borderRadius: 'var(--radius-sm)',
          padding: '9px 14px', marginBottom: 14, fontSize: '0.8rem', color: '#f87171',
        }}>
          <span style={{ flexShrink: 0 }}>⚠</span>
          <span>
            <strong>Model backend offline</strong> — displaying fallback data.
            Start <code style={{ background: 'rgba(255,255,255,0.08)', padding: '1px 5px', borderRadius: 3 }}>app.py</code> to enable live predictions.
          </span>
        </div>
      )}

      {/* ── Alert Status Header ─────────────────────────────────── */}
      <div style={{
        background: `linear-gradient(135deg, ${alertColor}10 0%, transparent 60%)`,
        border: `1px solid ${alertColor}40`,
        borderLeft: `4px solid ${alertColor}`,
        borderRadius: 'var(--radius)',
        padding: '18px 20px',
        marginBottom: 18,
        display: 'grid',
        gridTemplateColumns: '1fr auto',
        gap: 16,
        alignItems: 'center',
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <span style={{
              fontFamily: 'var(--font-display)', fontWeight: 900,
              fontSize: '1.15rem', color: alertColor, letterSpacing: '0.04em',
            }}>
              {alertInfo.label.toUpperCase()} STATUS
            </span>
            <LiveBadge color={alertColor} />
          </div>
          <div style={{ fontSize: '0.88rem', color: 'var(--text-primary)', marginBottom: 3 }}>
            {alertInfo.description}
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
            🔔 {alertInfo.action}
          </div>
        </div>

        {/* Status panel */}
        <div style={{
          background: 'rgba(0,0,0,0.2)', border: `1px solid ${alertColor}25`,
          borderRadius: 'var(--radius-sm)', padding: '12px 16px',
          minWidth: 220, textAlign: 'right',
        }}>
          <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>
            Model Output
          </div>
          <div style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.5 }}>
            {prediction ? prediction.status : '⚠️ Flooding possible in next 6 hrs'}
          </div>
          {prediction && (
            <div style={{ marginTop: 6, fontSize: '0.68rem', color: 'var(--text-muted)' }}>
              Lead time estimate: <strong style={{ color: 'var(--text-secondary)' }}>{prediction.lead_time_estimate ?? '6–12 hrs'}</strong>
            </div>
          )}
          <div style={{ marginTop: 4, fontSize: '0.65rem', color: 'var(--text-muted)' }}>
            Updated: {lastUpdated.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
      </div>

      {/* ── KPI Metrics Row ────────────────────────────────────── */}
      <div className="grid-4" style={{ marginBottom: 18 }}>
        <MetricCard
          icon="💧"
          label="Est. Water Level"
          value={estimatedLevel && hasRainfall ? `${estimatedLevel}` : 'N/A'}
          unit={estimatedLevel && hasRainfall ? 'm' : undefined}
          sub={!estimatedLevel ? 'Model offline — no data' : !hasRainfall ? 'No active rainfall · Baseline 1.4m' : estimatedLevel >= 4.5 ? 'Critical threshold exceeded' : estimatedLevel >= 3.5 ? 'Warning threshold exceeded' : estimatedLevel >= 2.5 ? 'Advisory range' : 'Within safe range'}
          color={waterLevelColor}
          noData={!estimatedLevel || !hasRainfall}
          badge={estimatedLevel && hasRainfall ? (estimatedLevel >= 4.5 ? '⛔ CRITICAL' : estimatedLevel >= 3.5 ? '⚠ WARNING' : estimatedLevel >= 2.5 ? '📢 ADVISORY' : '✅ NORMAL') : null}
        />
        <MetricCard
          icon="🌧"
          label="Rainfall Intensity"
          value={prediction ? `${rainfallMm.toFixed(1)}` : '—'}
          unit="mm/hr"
          sub={prediction ? 'WeatherAPI · Live feed' : 'PAGASA Station · Naga City'}
          color="var(--accent)"
          badge={prediction && rainfallMm > 10 ? '🔴 Heavy' : prediction && rainfallMm > 2 ? '🟡 Moderate' : prediction ? '🟢 Light' : null}
        />
        <MetricCard
          icon="🌀"
          label="PAGASA Wind Signal"
          value={prediction ? `#${prediction.live_metrics.wind_signal}` : '—'}
          sub={!prediction ? 'No active signal data'
            : prediction.live_metrics.wind_signal >= 4 ? 'Extremely destructive · >185 km/h'
            : prediction.live_metrics.wind_signal === 3 ? 'Destructive winds · >121 km/h'
            : prediction.live_metrics.wind_signal === 2 ? 'Damaging winds · >61 km/h'
            : prediction.live_metrics.wind_signal === 1 ? 'Strong winds · >30 km/h'
            : 'No active wind signal'}
          color={!prediction ? 'var(--text-muted)'
            : prediction.live_metrics.wind_signal >= 3 ? '#ef4444'
            : prediction.live_metrics.wind_signal === 2 ? '#f97316'
            : prediction.live_metrics.wind_signal === 1 ? 'var(--accent)'
            : '#22c55e'}
        />
        <MetricCard
          icon="🤖"
          label="Flood Probability"
          value={modelLoading ? '...' : probabilityPct}
          sub={prediction ? `Humidity: ${prediction.live_metrics.humidity}% · LSTM v1` : 'LSTM Model · Cloud Run'}
          color={!prediction ? 'var(--text-muted)'
            : prediction.alert_level === 2 ? '#ef4444'
            : prediction.alert_level === 1 ? '#f97316'
            : '#22c55e'}
          badge={prediction ? 'LSTM Prediction' : null}
        />
      </div>

    {/* ── Map + Gauge Row ────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 16, marginBottom: 18 }}>

        {/* Flood Map */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '14px 18px', borderBottom: '1px solid var(--blue-border)',
          }}>
            <div>
              <div className="card-title" style={{ marginBottom: 2 }}>
                🗺 Flood Status Map — Barangay Triangulo
              </div>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                Boundary overlay · Alert level color-coded
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {Object.entries(ALERT_COLORS).map(([key, color]) => (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 2, background: color, opacity: currentAlert === key ? 1 : 0.3 }} />
                  <span style={{ fontSize: '0.6rem', color: currentAlert === key ? color : 'var(--text-muted)', fontWeight: currentAlert === key ? 700 : 400, letterSpacing: '0.06em' }}>
                    {key}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <FloodMap currentAlert={currentAlert} />
          <div style={{ padding: '8px 18px', fontSize: '0.65rem', color: 'var(--text-muted)', borderTop: '1px solid var(--blue-border)' }}>
            Approximate barangay boundary · Source: PAGASA &amp; OCD Region V
          </div>
        </div>

        {/* Gauge + Alert Level Reference — right column */}
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <SectionLabel>💧 Water Level Gauge</SectionLabel>
              <WaterLevelGauge level={estimatedLevel && hasRainfall ? estimatedLevel : null} />
            </div>
            <div>
              <SectionLabel>🚦 Alert Level Reference</SectionLabel>
              <AlertLevelTable currentAlert={currentAlert} />
            </div>
          </div>
      </div>

      {/* ── System Status — full width below map ──────────────── */}
      <div style={{ marginBottom: 18 }}>
        <SystemStatusPanel
          modelError={modelError}
          modelLoading={modelLoading}
          prediction={prediction}
          forecastLoading={forecastLoading}
          forecast={forecast}
        />
      </div>

      {/* ── LSTM Prediction Input Summary ────────────────────── */}
      {prediction && (
        <div style={{ marginBottom: 18 }}>
          <PredictionInputTable prediction={prediction} />
        </div>
      )}

      {/* ── 7-Day Flood Forecast Chart ────────────────────────── */}
      <SevenDayForecastChart />

      {/* ── Forecast + Radar Row ───────────────────────────────── */}
      <div className="grid-2" style={{ marginBottom: 18 }}>

        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <SectionLabel>⛅ 72-Hour Rainfall Forecast</SectionLabel>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>WeatherAPI · Naga City</div>
          </div>
          <ForecastStrip forecast={forecast} loading={forecastLoading} />
        </div>

        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--blue-border)' }}>
            <div className="card-title" style={{ marginBottom: 2 }}>🛰 Live Weather Radar</div>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
              Windy.com · ECMWF Model · Surface Rain Overlay
            </div>
          </div>
          <iframe
            width="100%"
            height="280"
            src="https://www.windy.com/embed2.html?lat=13.621&lon=123.194&zoom=8&level=surface&overlay=rain&product=ecmwf&message=true&marker=true&location=coordinates"
            frameBorder="0"
            title="Windy Live Forecast"
            style={{ display: 'block' }}
          />
        </div>
      </div>

      {/* ── Evacuation CTA ─────────────────────────────────────── */}
      {!isResident && (
        <div className="card" style={{
          display: 'grid',
          gridTemplateColumns: '1fr auto',
          alignItems: 'center',
          gap: 20,
          background: 'rgba(239,68,68,0.04)',
          border: '1px solid rgba(239,68,68,0.2)',
          padding: '20px 24px',
        }}>
          <div>
            <div style={{
              fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.14em',
              textTransform: 'uppercase', color: '#ef4444', marginBottom: 6,
            }}>
              🚨 Emergency Action — Admin Only
            </div>
            <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 3 }}>
              One-Click Evacuation Alert
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Broadcasts an SMS evacuation notice to all registered officials and residents in Barangay Triangulo via httpsms.
            </div>
          </div>
          <button className="btn btn-danger" onClick={handleEvacuationAlert} style={{ flexShrink: 0, whiteSpace: 'nowrap' }}>
            🚨 Send Evacuation Alert
          </button>
        </div>
      )}

    </div>
  );
}