import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Swal from 'sweetalert2';
import { APIProvider, Map, Polygon } from '@vis.gl/react-google-maps';
import {
  XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer, Area, AreaChart,
} from 'recharts';
import { ALERT_LEVELS } from '../data/mockData';
import { useAuth } from '../hooks/useAuth';
import { useModelPrediction, alertLevelToKey } from '../lib/modelApi';
import { supabase } from '../lib/supabaseClient';
import { isAdmin, isResident } from '../lib/roles';

// ─── Constants ────────────────────────────────────────────────────────────────

const ALERT_COLORS = {
  NORMAL:   '#22c55e',
  ADVISORY: '#eab308',
  WARNING:  '#f97316',
  CRITICAL: '#ef4444',
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
    { key: 'NORMAL',   range: '< 2.5m',     action: 'Continue normal activities. Monitor updates.' },
    { key: 'ADVISORY', range: '2.5 – 3.4m', action: 'Stay alert. Prepare emergency go-bags.' },
    { key: 'WARNING',  range: '3.5 – 4.4m', action: 'Move valuables to higher ground. Be ready to evacuate.' },
    { key: 'CRITICAL', range: '≥ 4.5m',     action: 'Evacuate immediately to designated evacuation centers.' },
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
        const precipPct   = (f.precipitation / maxPrecip) * 100;
        const isHeavy     = f.precipitation > 10;
        const isMod       = f.precipitation > 2;
        const emoji       = isHeavy ? '⛈' : isMod ? '🌧' : f.precipitation > 0 ? '🌦' : '☀️';
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
  const modelOnline   = !modelError && !modelLoading && !!prediction;
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
      detail: forecastOnline ? `${forecast.length} hourly records loaded` : 'Feed unavailable',
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
    { label: 'Rainfall',          value: `${m.rainfall_mm?.toFixed(2) ?? '—'} mm/hr`, icon: '🌧', note: 'Primary flood driver' },
    { label: 'Humidity',          value: `${m.humidity ?? '—'}%`,                      icon: '💨', note: 'Atmospheric moisture' },
    { label: 'Wind Signal',       value: `Signal #${m.wind_signal ?? '—'}`,     icon: '🌀', note: 'PAGASA classification' },
    { label: 'Flood Probability', value: `${(prediction.probability * 100).toFixed(1)}%`, icon: '🤖', note: 'LSTM output confidence' },
    { label: 'Alert Level',       value: `Level ${prediction.alert_level}`,            icon: '🚦', note: 'Model classification' },
    { label: 'Lead Time Est.',    value: prediction.lead_time_estimate ?? '1–3 hrs',  icon: '⏱', note: 'Time before flood' },
  ];
  return (
    <div className="card">
      <SectionLabel>📊 Prediction Input Summary</SectionLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {rows.map(({ label, value, icon, note }, i) => (
          <div key={label} style={{
            display: 'grid', gridTemplateColumns: '24px 1fr auto',
            alignItems: 'center', gap: 10, padding: '9px 10px',
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

function FloodForecastChart() {
  const [view, setView]           = useState('hourly');
  const [chartData, setChartData] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [lastFetched, setLastFetched] = useState(null);

  const fetchData = useCallback(async () => {
    if (view === 'hourly') {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const { data, error } = await supabase
        .from('flood_snapshots')
        .select('created_at, probability')
        .gte('created_at', since.toISOString())
        .order('created_at', { ascending: true })
        .limit(10000);

      if (error) { console.warn('Fetch failed:', error.message); setLoading(false); return; }

      setChartData((data ?? []).map(row => ({
        label: new Date(row.created_at).toLocaleTimeString('en-PH', {
          hour: 'numeric', minute: '2-digit', hour12: true,
        }),
        time: new Date(row.created_at),
        floodRisk: Math.min(Math.round((row.probability ?? 0) * 100), 100),
      })));
    } else {
      const { data, error } = await supabase.rpc('get_daily_flood_avg', { days_back: 7 });
      if (error) { console.warn('Fetch failed:', error.message); setLoading(false); return; }

      const days = (data ?? []).map(row => {
        const date = new Date(row.day);
        return {
          label:      date.toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' }),
          shortLabel: date.toLocaleDateString('en-PH', { weekday: 'short' }),
          time:       date,
          floodRisk:  Math.min(Math.round((row.avg_probability ?? 0) * 100), 100),
          readings:   Number(row.readings ?? 0),
          isToday:    new Date().toDateString() === date.toDateString(),
        };
      });
      setChartData(days.slice(-7));
    }

    setLastFetched(new Date());
    setLoading(false);
  }, [view]);

  useEffect(() => {
    setLoading(true);
    fetchData();
    const t = setInterval(fetchData, 30_000);
    return () => clearInterval(t);
  }, [fetchData]);

  useEffect(() => {
    const channel = supabase
      .channel('flood_forecast_live')
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'flood_snapshots' },
        () => fetchData()
      )
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [fetchData]);

  const getRiskColor = (pct) =>
    pct >= 75 ? '#ef4444' :
    pct >= 50 ? '#f97316' :
    pct >= 25 ? '#eab308' : '#22c55e';

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    const val   = payload[0]?.value;
    const color = getRiskColor(val);
    return (
      <div style={{
        background: '#0d1f3c', border: '1px solid #1e3a5f',
        borderRadius: 8, padding: '10px 14px', fontSize: '0.78rem',
        boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
      }}>
        <div style={{ fontWeight: 700, color: '#e2eaf5', marginBottom: 6 }}>{label}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: 2, background: color }} />
          <span style={{ color: '#8da4be' }}>Flood Probability:</span>
          <span style={{ fontWeight: 800, color, fontSize: '0.9rem' }}>{val}%</span>
        </div>
        <div style={{ marginTop: 6, fontSize: '0.65rem', color: getRiskColor(val), opacity: 0.85 }}>
          {val >= 75 ? '⛔ Critical risk' : val >= 50 ? '⚠ High risk' : val >= 25 ? '📢 Elevated risk' : '✅ Low risk'}
        </div>
      </div>
    );
  };

  const latestRisk = chartData[chartData.length - 1]?.floodRisk ?? null;

  return (
    <div className="card" style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <SectionLabel>🤖 LSTM Flood Probability Trend</SectionLabel>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: -4 }}>
            Live LSTM predictions · Supabase flood_snapshots
            {lastFetched && (
              <span style={{ marginLeft: 8, color: '#4a6080' }}>
                · synced {lastFetched.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 0, background: 'var(--blue-mid)', border: '1px solid var(--blue-border)', borderRadius: 6, overflow: 'hidden' }}>
          {['hourly', 'daily'].map(v => (
            <button key={v} onClick={() => setView(v)} style={{
              padding: '5px 14px', fontSize: '0.7rem', fontWeight: 700,
              letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer', border: 'none',
              background: view === v ? 'var(--accent)' : 'transparent',
              color: view === v ? '#fff' : 'var(--text-muted)',
              transition: 'all 0.2s',
            }}>
              {v === 'hourly' ? '24-Hour' : '7-Day'}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
            <div style={{ fontSize: '1.5rem', marginBottom: 8, opacity: 0.4 }}>📊</div>
            Loading predictions from Supabase...
          </div>
        </div>
      ) : !chartData.length ? (
        <div style={{
          height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'var(--blue-mid)', borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--blue-border)',
        }}>
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
            <div style={{ fontSize: '1.5rem', marginBottom: 8, opacity: 0.4 }}>⚠️</div>
            No LSTM snapshots yet — model must run at least once
          </div>
        </div>
      ) : (
        <>
          {latestRisk !== null && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '10px 14px', marginBottom: 14,
              background: `${getRiskColor(latestRisk)}10`,
              border: `1px solid ${getRiskColor(latestRisk)}30`,
              borderRadius: 'var(--radius-sm)',
            }}>
              <div style={{
                fontFamily: 'var(--font-display)', fontSize: '1.8rem', fontWeight: 900,
                color: getRiskColor(latestRisk), lineHeight: 1,
              }}>
                {latestRisk}%
              </div>
              <div>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  Current Flood Probability
                </div>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: 2 }}>
                  {latestRisk >= 75 ? '⛔ Immediate action may be required'
                    : latestRisk >= 50 ? '⚠ High risk — monitor closely'
                    : latestRisk >= 25 ? '📢 Elevated — stay alert'
                    : '✅ Low risk — conditions normal'}
                </div>
              </div>
            </div>
          )}

          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={chartData} margin={{ top: 10, right: 16, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="riskGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#a855f7" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#a855f7" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e3a5f" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fill: '#4a6080', fontSize: 10, fontWeight: 600 }}
                tickLine={false}
                axisLine={{ stroke: '#1e3a5f' }}
                interval={view === 'hourly' ? Math.floor(chartData.length / 6) : 0}
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fill: '#4a6080', fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={v => `${v}%`}
              />
              <Tooltip content={<CustomTooltip />} />
              <ReferenceLine y={25} stroke="#eab308" strokeDasharray="4 3" strokeOpacity={0.4}
                label={{ value: 'Elevated', position: 'insideTopLeft', fill: '#eab308', fontSize: 9 }} />
              <ReferenceLine y={50} stroke="#f97316" strokeDasharray="4 3" strokeOpacity={0.4}
                label={{ value: 'High', position: 'insideTopLeft', fill: '#f97316', fontSize: 9 }} />
              <ReferenceLine y={75} stroke="#ef4444" strokeDasharray="4 3" strokeOpacity={0.4}
                label={{ value: 'Critical', position: 'insideTopLeft', fill: '#ef4444', fontSize: 9 }} />
              <Area
                type="monotone"
                dataKey="floodRisk"
                name="Flood Probability"
                stroke="#a855f7"
                strokeWidth={2.5}
                fill="url(#riskGradient)"
                dot={(props) => {
                  const { cx, cy, payload } = props;
                  if (view === 'hourly' && chartData.length > 48) return null;
                  const color = getRiskColor(payload.floodRisk);
                  return (
                    <circle key={`dot-${payload.label}`}
                      cx={cx} cy={cy} r={4}
                      fill={color} stroke={color} strokeWidth={1.5}
                    />
                  );
                }}
                activeDot={{ r: 6, strokeWidth: 2, stroke: '#a855f7' }}
              />
            </AreaChart>
          </ResponsiveContainer>

          {view === 'daily' && (
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${chartData.length}, 1fr)`, gap: 4, marginTop: 12 }}>
              {chartData.map((d, i) => {
                const color = getRiskColor(d.floodRisk);
                return (
                  <div key={i} style={{
                    textAlign: 'center', padding: '8px 4px',
                    background: d.isToday ? 'rgba(56,189,248,0.08)' : 'var(--blue-mid)',
                    border: `1px solid ${d.isToday ? 'rgba(56,189,248,0.3)' : 'var(--blue-border)'}`,
                    borderRadius: 6,
                  }}>
                    <div style={{ fontSize: '0.6rem', color: d.isToday ? 'var(--accent)' : 'var(--text-muted)', fontWeight: 700, marginBottom: 3 }}>
                      {d.isToday ? 'TODAY' : d.shortLabel}
                    </div>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: '0.9rem', fontWeight: 800, color }}>
                      {d.floodRisk}%
                    </div>
                    {d.readings > 0 && (
                      <div style={{ fontSize: '0.52rem', color: '#38bdf8', marginTop: 2 }}>{d.readings} rdgs</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      <div style={{ marginTop: 10, fontSize: '0.62rem', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 4 }}>
        <span>Source: flood_snapshots · LSTM model output · Poll: 30s · Realtime subscription active</span>
        <span>No physical sensor · For situational awareness only</span>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Dashboard() {
  const { user }    = useAuth();
  const navigate    = useNavigate();
  const [forecast, setForecast]               = useState([]);
  const [forecastLoading, setForecastLoading] = useState(true);
  const [lastUpdated, setLastUpdated]         = useState(new Date());
  const [recentTrend, setRecentTrend]         = useState(null);

  useEffect(() => {
    fetch('https://flood-api-553657561163.asia-southeast1.run.app/api/forecast')
      .then(res => res.json())
      .then(data => { if (data.hourly) setForecast(data.hourly); })
      .catch(err => console.warn('Forecast fetch failed:', err))
      .finally(() => setForecastLoading(false));
  }, []);

  useEffect(() => {
    const t = setInterval(() => setLastUpdated(new Date()), 60000);
    return () => clearInterval(t);
  }, []);

  const userIsResident = isResident(user);
  const { prediction, loading: modelLoading, error: modelError } = useModelPrediction();

  const prevAlertDisplay = useRef(null);

  useEffect(() => {
    if (!prediction) return;
    const current = prediction.alert_level;
    if (prevAlertDisplay.current !== null && prevAlertDisplay.current !== current) {
      Swal.fire({
        title: '⚠️ Alert Level Changed',
        html: `<p style="color:#8da4be">Flood alert has changed from <strong style="color:#e2eaf5">${prevAlertDisplay.current}</strong> → <strong style="color:${ALERT_COLORS[current]}">${current}</strong>.</p><p style="color:#8da4be;margin-top:8px;font-size:0.85rem">An SMS notification will be sent to registered users.</p>`,
        icon: current === 'NORMAL' ? 'success' : 'warning',
        background: '#0d1f3c', color: '#e2eaf5',
        confirmButtonColor: '#0ea5e9',
        timer: 8000, timerProgressBar: true,
      });
    }
    prevAlertDisplay.current = current;
  }, [prediction]);

  useEffect(() => {
    supabase
      .from('flood_snapshots')
      .select('probability, created_at')
      .order('created_at', { ascending: false })
      .limit(6)
      .then(({ data }) => {
        if (!data || data.length < 3) return;
        const probs = data.map(r => r.probability).reverse();
        const first = probs.slice(0, 3).reduce((s, v) => s + v, 0) / 3;
        const last  = probs.slice(-3).reduce((s, v) => s + v, 0) / 3;
        const delta = last - first;
        setRecentTrend(delta > 0.04 ? 'rising' : delta < -0.04 ? 'falling' : 'stable');
      });
  }, [prediction]);

  const currentAlert = typeof prediction?.alert_level === 'number'
    ? alertLevelToKey(prediction.alert_level)
    : (prediction?.alert_level ?? prediction?.alert_key ?? 'NORMAL');
  const alertInfo  = ALERT_LEVELS[currentAlert] ?? ALERT_LEVELS['NORMAL'];
  const alertColor = ALERT_COLORS[currentAlert];

  const probabilityPct = prediction ? `${(prediction.probability * 100).toFixed(0)}%` : '—';
  const rainfallMm     = prediction?.live_metrics?.rainfall_mm ?? 0;
  const humidityVal    = prediction?.live_metrics?.humidity ?? null;

  const leadTime = !prediction ? null
    : prediction.probability >= 0.75 ? '1–2 hrs'
    : prediction.probability >= 0.50 ? '2–3 hrs'
    : '> 3 hrs';

  const leadTimeColor = !prediction ? 'var(--text-muted)'
    : prediction.probability >= 0.75 ? '#ef4444'
    : prediction.probability >= 0.50 ? '#f97316'
    : '#22c55e';

  const EVACUATION_PRESETS = [
    { label: '🟡 Advisory', type: 'ADVISORY', msg: 'ADVISORY: Flood risk is elevated in Barangay Triangulo. Stay alert and prepare your emergency go-bags.' },
    { label: '🟠 Warning',  type: 'WARNING',  msg: 'WARNING: Rising water levels detected. Move valuables to higher ground and be ready to evacuate immediately.' },
    { label: '🔴 Critical', type: 'CRITICAL', msg: 'CRITICAL: Flooding is imminent in Barangay Triangulo. EVACUATE NOW to designated evacuation centers.' },
    { label: '✍️ Custom',   type: 'CRITICAL', msg: '' },
  ];

  const handleEvacuationAlert = () => {
    Swal.fire({
      title: '🚨 Send Emergency Alert',
      html: `
        <div style="text-align:left">
          <label style="display:block;font-size:0.75rem;color:#8da4be;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.05em">Select Message</label>
          <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:14px">
            ${EVACUATION_PRESETS.map((p, i) => `
              <label style="display:flex;align-items:flex-start;gap:10px;padding:10px 12px;background:#152a4a;border:1px solid ${i === 2 ? '#ef4444' : '#1e3a5f'};border-radius:8px;cursor:pointer" id="preset-label-${i}">
                <input type="radio" name="preset" value="${i}" ${i === 2 ? 'checked' : ''} style="margin-top:3px;accent-color:#ef4444"
                  onchange="
                    document.querySelectorAll('[id^=preset-label]').forEach(el => el.style.borderColor='#1e3a5f');
                    document.getElementById('preset-label-${i}').style.borderColor='#ef4444';
                    document.getElementById('swal-msg').value='${p.msg.replace(/'/g, "\\'")}';
                    document.getElementById('swal-msg').disabled=${p.msg !== ''};
                    document.getElementById('swal-msg').style.opacity=${p.msg !== '' ? '0.6' : '1'};
                  ">
                <div>
                  <div style="font-size:0.82rem;font-weight:700;color:#e2eaf5">${p.label}</div>
                  ${p.msg ? `<div style="font-size:0.7rem;color:#8da4be;margin-top:2px">${p.msg}</div>` : '<div style="font-size:0.7rem;color:#8da4be;margin-top:2px">Type your own message below</div>'}
                </div>
              </label>
            `).join('')}
          </div>
          <label style="display:block;font-size:0.75rem;color:#8da4be;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.05em">Message</label>
          <textarea id="swal-msg" rows="3" disabled style="width:100%;padding:10px;background:#152a4a;border:1px solid #1e3a5f;border-radius:8px;color:#e2eaf5;font-size:0.82rem;resize:none;opacity:0.6;box-sizing:border-box">${EVACUATION_PRESETS[2].msg}</textarea>
        </div>
      `,
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#1e3a5f',
      confirmButtonText: '🚨 Send Alert Now',
      cancelButtonText: 'Cancel',
      background: '#0d1f3c', color: '#e2eaf5',
      preConfirm: () => {
        const checkedRadio = document.querySelector('input[name="preset"]:checked');
        const idx = checkedRadio ? parseInt(checkedRadio.value) : 2;
        const msg = document.getElementById('swal-msg').value.trim();
        if (!msg) { Swal.showValidationMessage('Please enter a message.'); return false; }
        return { msg, type: EVACUATION_PRESETS[idx].type };
      },
    }).then(async (result) => {
      if (!result.isConfirmed) return;

      const sentBy    = user?.name ?? user?.email ?? 'Admin';
      const message   = result.value.msg;
      const alertType = result.value.type;

      const { error } = await supabase.from('alerts').insert({ type: alertType, message, sent_by: sentBy });
      if (error) {
        Swal.fire({ title: '⚠️ Failed to Save', text: error.message, icon: 'error', background: '#0d1f3c', color: '#e2eaf5', confirmButtonColor: '#0ea5e9' });
        return;
      }

      const { data: smsData, error: smsError } = await supabase.functions.invoke('send-alert', { body: { message, type: alertType } });
      if (smsError) {
        Swal.fire({ title: '⚠️ Alert Saved, SMS Failed', text: 'The alert was recorded but SMS could not be sent.', icon: 'warning', background: '#0d1f3c', color: '#e2eaf5', confirmButtonColor: '#0ea5e9' });
        return;
      }

      const { error: fcmError } = await supabase.functions.invoke('send-push-notification', {
        body: {
          title: alertType === 'CRITICAL' ? '🔴 EVACUATION ALERT — Barangay Triangulo'
               : alertType === 'WARNING'  ? '🟠 WARNING — Barangay Triangulo'
               : '🟡 ADVISORY — Barangay Triangulo',
          body: message, level: alertType, topic: 'flood_alerts',
        },
      });
      if (fcmError) console.error('FCM push failed:', fcmError.message);

      Swal.fire({
        title: '✅ Alert Dispatched',
        html: `<p style="color:#8da4be;margin-bottom:12px">Evacuation alert sent successfully.</p>
          <div style="background:#112240;border-radius:8px;padding:12px;text-align:left;font-size:0.85rem">
            <div style="color:#22c55e;margin-bottom:4px">📱 SMS sent to: <strong>${smsData?.sent ?? 0} residents</strong></div>
            ${smsData?.failed ? `<div style="color:#f97316">⚠️ Failed: ${smsData.failed}</div>` : ''}
            <div style="color:#22c55e;margin-top:4px">🔔 Push notification sent to all app users</div>
          </div>`,
        icon: 'success', background: '#0d1f3c', color: '#e2eaf5', confirmButtonColor: '#0ea5e9',
      });
    });
  };

  return (
    <div className="fade-in">

      {/* ── 1. Offline Banner ──────────────────────────────────── */}
      {modelError && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.25)',
          borderLeft: '3px solid #ef4444', borderRadius: 'var(--radius-sm)',
          padding: '9px 14px', marginBottom: 14, fontSize: '0.8rem', color: '#f87171',
        }}>
          <span style={{ flexShrink: 0 }}>⚠</span>
          <span>
            <strong>Model backend offline</strong> — displaying fallback data. Start{' '}
            <code style={{ background: 'rgba(255,255,255,0.08)', padding: '1px 5px', borderRadius: 3 }}>app.py</code>{' '}
            to enable live predictions.
          </span>
        </div>
      )}

      {/* ── 2. Alert Status Header ─────────────────────────────── */}
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
          </div>
          <div style={{ fontSize: '0.88rem', color: 'var(--text-primary)', marginBottom: 3 }}>
            {alertInfo.description}
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
            🔔 {alertInfo.action}
          </div>
        </div>

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
              Est. lead time:{' '}
              <strong style={{ color: leadTimeColor }}>{leadTime}</strong>
              <span style={{ marginLeft: 6, opacity: 0.6 }}>· 7-hr lookback window</span>
            </div>
          )}
          {recentTrend && (
            <div style={{ marginTop: 3, fontSize: '0.65rem', color: 'var(--text-muted)' }}>
              Trend:{' '}
              <strong style={{
                color: recentTrend === 'rising' ? '#ef4444'
                     : recentTrend === 'falling' ? '#22c55e'
                     : 'var(--text-secondary)'
              }}>
                {recentTrend === 'rising'  ? '⬆ Rising'
               : recentTrend === 'falling' ? '⬇ Falling'
               : '➡ Stable'}
              </strong>
              <span style={{ marginLeft: 4, opacity: 0.5 }}>· last 6 readings</span>
            </div>
          )}
          <div style={{ marginTop: 4, fontSize: '0.65rem', color: 'var(--text-muted)' }}>
            Updated: {lastUpdated.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
      </div>

      {/* ── 3. KPI Metrics Row ─────────────────────────────────── */}
      <div className="grid-4" style={{ marginBottom: 18 }}>
        <MetricCard
          icon={recentTrend === 'rising' ? '📈' : recentTrend === 'falling' ? '📉' : '⏱'}
          label="Lead Time Estimate"
          value={leadTime ?? '—'}
          sub={
            !prediction ? 'Model offline — no data'
            : recentTrend === 'rising'  ? '⬆ Risk trending upward'
            : recentTrend === 'falling' ? '⬇ Risk trending downward'
            : recentTrend === 'stable'  ? '➡ Risk stable'
            : prediction.probability >= 0.75 ? 'High risk · Immediate monitoring'
            : prediction.probability >= 0.50 ? 'Elevated risk · Deteriorating'
            : 'Low risk · Within normal range'
          }
          color={
            recentTrend === 'rising'  ? '#ef4444'
            : recentTrend === 'falling' ? '#22c55e'
            : leadTimeColor
          }
          noData={!prediction}
          badge={prediction ? 'LSTM · 7-hr window' : null}
        />
        <MetricCard
          icon="🌧"
          label="Rainfall Intensity"
          value={prediction ? `${rainfallMm.toFixed(1)}` : '—'}
          unit="mm/hr"
          sub={prediction ? 'OpenMeteo · Live feed' : 'PAGASA Station · Naga City'}
          color="var(--accent)"
          badge={prediction && rainfallMm > 10 ? '🔴 Heavy' : prediction && rainfallMm > 2 ? '🟡 Moderate' : prediction ? '🟢 Light' : null}
        />
        <MetricCard
          icon="💧"
          label="Humidity"
          value={humidityVal !== null ? `${humidityVal}` : '—'}
          unit="%"
          sub={prediction ? 'Atmospheric moisture · LSTM input' : 'LSTM Model · Cloud Run'}
          color={
            !humidityVal ? 'var(--text-muted)'
            : humidityVal >= 90 ? '#ef4444'
            : humidityVal >= 80 ? '#f97316'
            : humidityVal >= 70 ? '#eab308'
            : '#22c55e'
          }
          badge={
            !humidityVal ? null
            : humidityVal >= 90 ? '🔴 Saturated'
            : humidityVal >= 80 ? '🟡 High'
            : '🟢 Normal'
          }
        />
        <MetricCard
          icon="🤖"
          label="Flood Probability"
          value={modelLoading ? '...' : probabilityPct}
          sub={prediction ? `Wind Signal #${prediction.live_metrics.wind_signal} · LSTM v1` : 'LSTM Model · Cloud Run'}
          color={!prediction ? 'var(--text-muted)'
            : prediction.probability >= 0.75 ? '#ef4444'
            : prediction.probability >= 0.50 ? '#f97316'
            : prediction.probability >= 0.25 ? '#eab308'
            : '#22c55e'}
          badge={prediction ? 'LSTM Prediction' : null}
        />
      </div>

      {/* ── 4. Map + Alert Level Reference ────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 16, marginBottom: 18 }}>
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

        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div>
            <SectionLabel>🚦 Alert Level Reference</SectionLabel>
            <AlertLevelTable currentAlert={currentAlert} />
          </div>
        </div>
      </div>

      {/* ── 5. LSTM Flood Probability Chart ───────────────────── */}
      <FloodForecastChart />

      {/* ── 6. Forecast + Radar Row ────────────────────────────── */}
      <div className="grid-2" style={{ marginBottom: 18 }}>
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <SectionLabel>⛅ 72-Hour Rainfall Forecast</SectionLabel>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>OpenMeteo · Naga City</div>
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

      {/* ── 7. LSTM Prediction Input Summary ─────────────────── */}
      {prediction && (
        <div style={{ marginBottom: 18 }}>
          <PredictionInputTable prediction={prediction} />
        </div>
      )}

      {/* ── 8. System Status ──────────────────────────────────── */}
      <div style={{ marginBottom: 18 }}>
        <SystemStatusPanel
          modelError={modelError}
          modelLoading={modelLoading}
          prediction={prediction}
          forecastLoading={forecastLoading}
          forecast={forecast}
        />
      </div>

      {/* ── 9. Evacuation CTA ─────────────────────────────────── */}
      {!userIsResident  && (
        <div className="card" style={{
          display: 'grid', gridTemplateColumns: '1fr auto',
          alignItems: 'center', gap: 20,
          background: 'rgba(239,68,68,0.04)',
          border: '1px solid rgba(239,68,68,0.2)',
          padding: '20px 24px',
        }}>
          <div>
            <div style={{
              fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.14em',
              textTransform: 'uppercase', color: '#ef4444', marginBottom: 6,
            }}>
              🚨 Emergency Action
            </div>
            <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 3 }}>
              Send Flood Alert
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Broadcasts flood alert notice to all registered officials and residents in Barangay Triangulo via httpsms.
            </div>
          </div>
          <button className="btn btn-danger" onClick={handleEvacuationAlert} style={{ flexShrink: 0, whiteSpace: 'nowrap' }}>
            🚨 Send Flood Alert
          </button>
        </div>
      )}

    </div>
  );
}