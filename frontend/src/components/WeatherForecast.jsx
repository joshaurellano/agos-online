import { useMemo, useState } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';
import { useTheme } from '../hooks/useTheme';

// ─── WMO weather-code → icon/label map ─────────────────────────────────────
// https://open-meteo.com/en/docs (WMO Weather interpretation codes)
const WMO_ICONS = {
  0:  { day: '', night: '' },
  1:  { day: '', night: '' },
  2:  { day: '',  night: '' },
  3:  { day: '',  night: '' },
  45: { day: '', night: '' },
  48: { day: '', night: '' },
  51: { day: '', night: '' },
  53: { day: '', night: '' },
  55: { day: '', night: '' },
  56: { day: '', night: '' },
  57: { day: '', night: '' },
  61: { day: '', night: '' },
  63: { day: '', night: '' },
  65: { day: '', night: '' },
  66: { day: '', night: '' },
  67: { day: '', night: '' },
  71: { day: '', night: '' },
  73: { day: '', night: '' },
  75: { day: '',  night: '' },
  77: { day: '',  night: '' },
  80: { day: '', night: '' },
  81: { day: '', night: '' },
  82: { day: '', night: '' },
  85: { day: '', night: '' },
  86: { day: '',  night: '' },
  95: { day: '', night: '' },
  96: { day: '', night: '' },
  99: { day: '', night: '' },
};

function weatherIcon(code, isDay = true) {
  const entry = WMO_ICONS[code] ?? WMO_ICONS[2];
  return isDay ? entry.day : entry.night;
}

// Backdrop tint for the hero panel — keyed off condition, not a literal photo,
// so it stays on-brand with the rest of the (dark navy / accent blue) UI.
// Rain/storm lean darker and moodier than the rest (near-black at the edges)
// so the bokeh lights and rain streaks drawn on top of it actually read as
// a night/wet-glass scene instead of sitting on a flat blue card.
function heroBackdrop(code, isDay) {
  if (code == null) return 'linear-gradient(135deg, #16305a 0%, #0d1f3c 100%)';
  if ([95, 96, 99, 82].includes(code)) return 'linear-gradient(160deg, #241a3a 0%, #0a0a16 55%, #050508 100%)'; // storm
  if (code >= 51 && code <= 82) return 'linear-gradient(160deg, #1a2740 0%, #0a121f 55%, #060a12 100%)'; // rain
  if (code >= 45 && code <= 48) return 'linear-gradient(135deg, #29405c 0%, #0d1f3c 100%)'; // fog
  if (code === 0 || code === 1) return isDay
    ? 'linear-gradient(135deg, #1c5f8f 0%, #0d1f3c 100%)'
    : 'linear-gradient(135deg, #0e2647 0%, #0d1f3c 100%)'; // clear
  return 'linear-gradient(135deg, #1c3f66 0%, #0d1f3c 100%)'; // cloudy default
}

// Single accent used for every day tab — a uniform look reads calmer than
// tinting each day by its own weather condition.
const WEATHER_TAB_ACCENT = '#7c3aed';

// Simple original SVG art (not emoji, not a stock photo) behind the hero
// panel — a sun with rays, rain streaks, a lightning bolt, cloud blobs, fog
// bands, a starry night, or snow dots depending on condition, so the panel
// reads like a proper weather-app backdrop instead of a flat gradient card.
function heroArtBucket(code, isDay) {
  if (code == null) return isDay ? 'sun' : 'clear-night';
  if ([95, 96, 99].includes(code)) return 'storm';
  if ([80, 81, 82].includes(code)) return 'rain';
  if (code >= 61 && code <= 67) return 'rain';
  if (code >= 51 && code <= 57) return 'rain';
  if (code >= 71 && code <= 86) return 'snow';
  if (code === 45 || code === 48) return 'fog';
  if (code === 2 || code === 3) return 'cloudy';
  if (code === 0 || code === 1) return isDay ? 'sun' : 'clear-night';
  return 'cloudy';
}

function HeroWeatherArt({ code, isDay }) {
  const bucket = heroArtBucket(code, isDay);

  return (
    <svg
      viewBox="0 0 400 220"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 0 }}
    >
      {bucket === 'sun' && (
        <>
          <defs>
            <radialGradient id="heroSunGlow" cx="80%" cy="18%" r="60%">
              <stop offset="0%" stopColor="#ffd27a" stopOpacity="0.5" />
              <stop offset="55%" stopColor="#ffb84d" stopOpacity="0.15" />
              <stop offset="100%" stopColor="#ffb84d" stopOpacity="0" />
            </radialGradient>
          </defs>
          <rect width="400" height="220" fill="url(#heroSunGlow)" />
          {Array.from({ length: 12 }).map((_, i) => {
            const a = (i / 12) * Math.PI * 2;
            return (
              <line key={i}
                x1={320 + Math.cos(a) * 46} y1={42 + Math.sin(a) * 46}
                x2={320 + Math.cos(a) * 66} y2={42 + Math.sin(a) * 66}
                stroke="#ffd27a" strokeOpacity="0.35" strokeWidth="3" strokeLinecap="round"
              />
            );
          })}
          <circle cx="320" cy="42" r="32" fill="#ffd27a" fillOpacity="0.4" />
        </>
      )}

      {bucket === 'clear-night' && (
        <>
          <circle cx="322" cy="44" r="24" fill="#eef3fb" fillOpacity="0.45" />
          <circle cx="332" cy="36" r="24" fill="#0e2647" />
          {[[40,30,1.6,0.5],[90,60,1.2,0.35],[150,20,1.8,0.5],[200,80,1.3,0.4],[250,40,1.5,0.55],
            [60,110,1.2,0.3],[130,130,1.6,0.45],[300,120,1.4,0.4],[360,70,1.2,0.35],[20,150,1.3,0.3]]
            .map(([x,y,r,o], i) => <circle key={i} cx={x} cy={y} r={r} fill="#fff" fillOpacity={o} />)}
        </>
      )}

      {bucket === 'cloudy' && (
        <g opacity="0.22" fill="#e2eaf5">
          <ellipse cx="300" cy="55" rx="95" ry="32" />
          <ellipse cx="215" cy="88" rx="70" ry="26" />
          <ellipse cx="355" cy="95" rx="55" ry="22" />
        </g>
      )}

      {bucket === 'fog' && (
        <g opacity="0.16" fill="#cfe0f2">
          <rect x="0" y="36" width="400" height="12" />
          <rect x="0" y="72" width="400" height="9" />
          <rect x="0" y="106" width="400" height="10" />
          <rect x="0" y="142" width="400" height="8" />
        </g>
      )}

      {(bucket === 'rain' || bucket === 'storm') && (
        <>
          <defs>
            <filter id="heroBokehSoft" x="-60%" y="-60%" width="220%" height="220%">
              <feGaussianBlur stdDeviation="6" />
            </filter>
            <filter id="heroBokehStrong" x="-80%" y="-80%" width="260%" height="260%">
              <feGaussianBlur stdDeviation="13" />
            </filter>
            <linearGradient id="heroRainStreak" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#dff1ff" stopOpacity="0" />
              <stop offset="45%" stopColor="#dff1ff" stopOpacity="0.55" />
              <stop offset="100%" stopColor="#dff1ff" stopOpacity="0" />
            </linearGradient>
            {/* Darkens the lower third so the temperature/condition text
                stays readable over the bright bokeh, same trick the
                reference photo uses. */}
            <linearGradient id="heroBottomVignette" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#000" stopOpacity="0" />
              <stop offset="60%" stopColor="#000" stopOpacity="0" />
              <stop offset="100%" stopColor="#000" stopOpacity="0.35" />
            </linearGradient>
          </defs>

          {/* Out-of-focus city / brake lights low in frame — the warm, heavily
              blurred bokeh that reads as "shot through a wet windshield at
              night". Storm skews redder/dimmer than plain rain. */}
          <g filter="url(#heroBokehStrong)">
            <circle cx="55" cy="170" r="26" fill="#ff5a36" fillOpacity={bucket === 'storm' ? 0.4 : 0.55} />
            <circle cx="118" cy="184" r="19" fill="#ffb020" fillOpacity={bucket === 'storm' ? 0.3 : 0.48} />
            <circle cx="205" cy="162" r="30" fill="#ff3b30" fillOpacity={bucket === 'storm' ? 0.35 : 0.48} />
            <circle cx="288" cy="188" r="21" fill="#ffcf4d" fillOpacity={bucket === 'storm' ? 0.28 : 0.42} />
            <circle cx="352" cy="152" r="25" fill="#ff5a36" fillOpacity={bucket === 'storm' ? 0.3 : 0.38} />
          </g>
          <g filter="url(#heroBokehSoft)">
            <circle cx="36" cy="55" r="9" fill="#bfe3ff" fillOpacity="0.3" />
            <circle cx="150" cy="38" r="7" fill="#fff" fillOpacity="0.25" />
            <circle cx="332" cy="66" r="11" fill="#ffd27a" fillOpacity="0.25" />
          </g>

          {/* Rain streaking down the "glass", varied length/width/opacity so
              it doesn't read as a uniform hatch pattern */}
          <g stroke="url(#heroRainStreak)" strokeLinecap="round">
            {Array.from({ length: 34 }).map((_, i) => {
              const x = (i * 13.5) % 430 - 15;
              const len = 44 + (i % 5) * 15;
              const drift = 14 + (i % 3) * 7;
              const width = 1.6 + (i % 3) * 0.6;
              return (
                <line key={i}
                  x1={x} y1={-20} x2={x - drift} y2={-20 + len + 190}
                  strokeWidth={width}
                  opacity={0.22 + (i % 4) * 0.11}
                />
              );
            })}
          </g>

          {/* A few larger, softly-blurred droplets up close for depth */}
          <g filter="url(#heroBokehSoft)" fill="#eaf6ff" fillOpacity="0.16">
            <ellipse cx="86" cy="118" rx="3" ry="10" />
            <ellipse cx="258" cy="88" rx="4" ry="14" />
            <ellipse cx="342" cy="128" rx="3" ry="9" />
          </g>

          {bucket === 'storm' && (
            <path d="M244 18 L210 106 L240 106 L200 198 L266 92 L232 92 Z" fill="#ffe066" fillOpacity="0.7" />
          )}

          <rect x="0" y="0" width="400" height="220" fill="url(#heroBottomVignette)" />
        </>
      )}

      {bucket === 'snow' && (
        <g fill="#fff" fillOpacity="0.45">
          {Array.from({ length: 26 }).map((_, i) => {
            const x = (i * 37) % 400;
            const y = (i * 53) % 220;
            return <circle key={i} cx={x} cy={y} r={2.4} />;
          })}
        </g>
      )}
    </svg>
  );
}

function fmtHour(iso) {
  return new Date(iso).toLocaleTimeString('en-PH', { hour: 'numeric', hour12: true, timeZone: 'Asia/Manila' });
}
function fmtDayLabel(dateStr, idx) {
  if (idx === 0) return 'Today';
  const d = new Date(`${dateStr}T12:00:00+08:00`);
  return d.toLocaleDateString('en-PH', { weekday: 'short', timeZone: 'Asia/Manila' });
}
function fmtDateShort(dateStr) {
  const d = new Date(`${dateStr}T12:00:00+08:00`);
  return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', timeZone: 'Asia/Manila' });
}

function Stat({ icon, label, value }) {
  return (
    <div style={{
      background: 'var(--blue-mid)', border: '1px solid var(--blue-border)',
      borderRadius: 'var(--radius-sm)', padding: '10px 12px',
    }}>
      <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.04em', marginBottom: 6, display: 'flex', alignItems: 'flex-start', gap: 6, lineHeight: 1.25 }}>
        <span style={{ fontSize: '0.85rem', flexShrink: 0 }}>{icon}</span>
        <span style={{ minWidth: 0, wordBreak: 'break-word' }}>{label}</span>
      </div>
      <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
        {value ?? '—'}
      </div>
    </div>
  );
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  return (
    <div style={{
      background: '#0d1f3c', border: '1px solid #2a4a72', borderRadius: 8,
      padding: '8px 12px', fontSize: '0.75rem', boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
    }}>
      <div style={{ fontWeight: 700, color: '#e2eaf5', marginBottom: 4 }}>{label}</div>
      <div style={{ color: '#38bdf8', fontWeight: 600 }}>{row?.precipitation ?? 0} mm/h</div>
      {row?.rain_probability_pct != null && (
        <div style={{ color: '#8da4be' }}>{row.rain_probability_pct}% chance of rain</div>
      )}
    </div>
  );
}

/**
 * OpenWeatherMap-style forecast widget: day tabs + hero "now" panel with a
 * stat grid, plus an hourly precipitation trend and hourly card strip.
 * Consumes the /api/forecast response shape directly (hourly[], daily[]).
 */
export default function WeatherForecast({ hourly = [], daily = [], loading, generatedAt, outlook, weatherCache, pagasaCalibration }) {
  const [selectedIdx, setSelectedIdx] = useState(0);
  // Which hour (by ISO time string) is pinned into the hero card, or null to
  // fall back to the "now" / midday default for the selected day.
  const [selectedHourTime, setSelectedHourTime] = useState(null);
  const { theme } = useTheme() ?? {};
  const isLight = theme === 'light';
  // Light canvas washes out low-alpha tints, so give light mode a stronger
  // fill/border than dark mode needs for the same chip to read as "colored".
  const tabFillAlpha = isLight ? '26' : '18';
  const tabBorderAlpha = isLight ? '70' : '55';

  const days = daily; // full outlook window returned by the backend (currently up to 14 days)
  const selectedDay = days[selectedIdx] ?? null;

  const hourlyForSelectedDay = useMemo(() => {
    if (!selectedDay) return [];
    return hourly.filter(h => h.time.startsWith(selectedDay.date));
  }, [hourly, selectedDay]);

  const hasHourlyDetail = hourlyForSelectedDay.length > 0;
  const isToday = selectedIdx === 0;

  // Switching days drops any hour pinned on the previous day's strip, so the
  // hero card falls back to that new day's own default snapshot.
  const handleSelectDay = (idx) => {
    setSelectedIdx(idx);
    setSelectedHourTime(null);
  };

  // representative record for the hero panel: a clicked hour from the strip
  // below takes priority; otherwise "now" for today, or a midday snapshot
  // for other days (still inside the 48h hourly window)
  const pickedHour = selectedHourTime
    ? hourlyForSelectedDay.find(h => h.time === selectedHourTime) ?? null
    : null;
  const heroRecord = pickedHour
    ? pickedHour
    : isToday
      ? hourly[0] ?? null
      : hasHourlyDetail
        ? hourlyForSelectedDay[Math.min(Math.floor(hourlyForSelectedDay.length / 2), hourlyForSelectedDay.length - 1)]
        : null;

  if (loading) {
    return (
      <div style={{ display: 'flex', gap: 8 }}>
        {[...Array(7)].map((_, i) => (
          <div key={i} style={{
            minWidth: 90, height: 220, background: 'var(--blue-mid)',
            borderRadius: 'var(--radius-sm)', border: '1px solid var(--blue-border)',
            opacity: 0.5,
          }} />
        ))}
      </div>
    );
  }

  if (!days.length) {
    return (
      <div style={{
        padding: '20px', textAlign: 'center',
        color: 'var(--text-muted)', fontSize: '0.82rem',
        background: 'var(--blue-mid)', borderRadius: 'var(--radius-sm)',
        border: '1px solid var(--blue-border)',
      }}>
        Forecast feed unavailable — model backend offline
      </div>
    );
  }

  const chartData = hourlyForSelectedDay.map(h => ({
    hour: fmtHour(h.time),
    time: h.time,
    precipitation: h.precipitation,
    rain_probability_pct: h.rain_probability_pct,
  }));

  // Custom hour labels rendered as our own row below the chart (not recharts'
  // built-in XAxis) — same "every Nth hour" spacing recharts was using, just
  // laid out with plain flexbox so we control exactly how it looks.
  const axisStep = Math.max(1, Math.ceil(chartData.length / 6));
  const axisTicks = chartData.filter((_, i) => i % axisStep === 0);

  return (
    <div>
      {/* ── Day tabs (full outlook window returned by the backend) ─── */}
      <div className="weather-day-tabs" style={{ marginBottom: 16 }}>
        {days.map((d, idx) => {
          const active = idx === selectedIdx;
          const accent = WEATHER_TAB_ACCENT;
          return (
            <button
              key={d.date}
              onClick={() => handleSelectDay(idx)}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                minWidth: 74, flexShrink: 0, cursor: 'pointer',
                padding: '10px 10px 8px', borderRadius: 'var(--radius-sm)',
                border: `1px solid ${active ? accent : accent + tabBorderAlpha}`,
                borderTop: `2px solid ${accent}`,
                background: active ? accent : accent + tabFillAlpha,
                color: active ? '#fff' : 'var(--text-primary)',
                transition: 'all 0.15s ease',
              }}
            >
              <span style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.02em' }}>{fmtDayLabel(d.date, idx)}</span>
              <span style={{ fontSize: '0.62rem', opacity: active ? 0.85 : 0.7 }}>{fmtDateShort(d.date)}</span>
              <span style={{ fontSize: '1.2rem', margin: '2px 0' }}>{weatherIcon(d.weathercode, true)}</span>
              <span style={{ fontSize: '0.82rem', fontWeight: 800, fontFamily: 'var(--font-display)', color: active ? '#fff' : accent }}>
                {d.temperature_max_c != null ? `${Math.round(d.temperature_max_c)}°` : '—'}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Hero + hourly detail ────────────────────────────────── */}
      <div className="weather-hero-grid">

        {/* Hero "now" / day-snapshot panel */}
        <div style={{
          borderRadius: 'var(--radius)', overflow: 'hidden', position: 'relative',
          border: '1px solid var(--blue-border)',
          background: heroBackdrop(heroRecord?.weathercode ?? selectedDay?.weathercode, heroRecord?.is_day ?? true),
        }}>
          <HeroWeatherArt
            code={heroRecord?.weathercode ?? selectedDay?.weathercode}
            isDay={heroRecord?.is_day ?? true}
          />

          <div style={{ position: 'relative', zIndex: 1 }}>
            <div style={{ padding: '18px 18px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                <span style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.7)', fontWeight: 600, letterSpacing: '0.04em' }}>
                  {pickedHour
                    ? fmtHour(pickedHour.time)
                    : isToday ? (heroRecord ? fmtHour(heroRecord.time) : 'Now') : fmtDateShort(selectedDay.date)}
                </span>
              </div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '3rem', fontWeight: 800, color: '#fff', lineHeight: 1 }}>
                {heroRecord?.temperature_c != null
                  ? `${Math.round(heroRecord.temperature_c)}°`
                  : selectedDay?.temperature_max_c != null ? `${Math.round(selectedDay.temperature_max_c)}°` : '—'}
              </div>
              <div style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.9)', fontWeight: 600, marginTop: 4 }}>
                {heroRecord?.condition ?? selectedDay?.condition ?? '—'}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.65)', marginTop: 2 }}>
                {heroRecord?.feels_like_c != null
                  ? `Feels like ${Math.round(heroRecord.feels_like_c)}°`
                  : hasHourlyDetail ? '' : 'Daily outlook · hourly detail not yet available for this day'}
              </div>
            </div>

            <div className="weather-stat-grid" style={{ padding: '0 14px 14px' }}>
              <Stat icon="" label="Wind" value={
                heroRecord ? `${heroRecord.wind_speed_kph ?? '—'} km/h` : selectedDay?.wind_speed_max_kph != null ? `${selectedDay.wind_speed_max_kph} km/h` : '—'
              } />
              <Stat icon="" label="Wind Gusts" value={
                heroRecord?.wind_gusts_kph != null ? `${heroRecord.wind_gusts_kph} km/h` : selectedDay?.wind_gusts_max_kph != null ? `${selectedDay.wind_gusts_max_kph} km/h` : '—'
              } />
              <Stat icon="" label="Humidity" value={heroRecord?.humidity != null ? `${heroRecord.humidity}%` : '—'} />
              <Stat icon="" label="Visibility" value={heroRecord?.visibility_km != null ? `${heroRecord.visibility_km} km` : '—'} />
              <Stat icon="" label="Pressure" value={
                heroRecord?.pressure_msl_hpa != null ? `${heroRecord.pressure_msl_hpa} hPa` : selectedDay?.pressure_msl_hpa != null ? `${selectedDay.pressure_msl_hpa} hPa` : '—'
              } />
              <Stat icon="" label="UV Index" value={heroRecord?.uv_index ?? '—'} />
              <Stat icon="" label="Dew Point" value={heroRecord?.dew_point_c != null ? `${heroRecord.dew_point_c}°C` : '—'} />
              <Stat icon="" label="Soil Moisture" value={
                heroRecord?.soil_moisture_vwc != null
                  ? `${(heroRecord.soil_moisture_vwc * 100).toFixed(1)}%`
                  : selectedDay?.soil_moisture_vwc != null ? `${(selectedDay.soil_moisture_vwc * 100).toFixed(1)}%` : '—'
              } />
            </div>
          </div>
        </div>

        {/* Hourly forecast */}
        <div style={{
          background: 'var(--blue-card)', border: '1px solid var(--blue-border)',
          borderRadius: 'var(--radius)', padding: '16px 18px',
        }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: 10 }}>
            Hourly forecast
          </div>

          {!hasHourlyDetail ? (
            <div style={{ padding: '30px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
              Hourly breakdown covers the next 48 hours only. This day is shown as a daily outlook above.
            </div>
          ) : (
            <>
              <div style={{ height: 120, marginBottom: 4, cursor: 'pointer' }} title="Click the chart to show that hour in the panel above">
                <ResponsiveContainer key={`${selectedDay.date}-${chartData.length}`} width="100%" height="100%">
                  <AreaChart
                    data={chartData}
                    margin={{ top: 10, right: 8, left: 8, bottom: 0 }}
                    onClick={(state) => {
                      const clickedTime = state?.activePayload?.[0]?.payload?.time;
                      if (clickedTime) {
                        setSelectedHourTime(prev => (prev === clickedTime ? null : clickedTime));
                      }
                    }}
                  >
                    <defs>
                      <linearGradient id="precipFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.4} />
                        <stop offset="100%" stopColor="#38bdf8" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    {/* No recharts axes at all — no gridlines, no XAxis, no
                        YAxis. Just the shape of the trend. Hour labels are
                        rendered separately below as a plain HTML row, and
                        exact values show on hover via the tooltip. Clicking
                        anywhere on the chart also pins that hour into the
                        hero panel, same as clicking its tile below. */}
                    <XAxis dataKey="hour" hide />
                    <YAxis hide domain={[0, (max) => Math.max(2, Math.ceil(max * 1.2))]} />
                    <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#38bdf8', strokeWidth: 1, strokeDasharray: '4 4' }} />
                    <Area
                      type="monotone"
                      dataKey="precipitation"
                      stroke="#38bdf8"
                      strokeWidth={2.5}
                      fill="url(#precipFill)"
                      activeDot={{ r: 4, fill: '#38bdf8', stroke: '#0d1f3c', strokeWidth: 2, style: { cursor: 'pointer' } }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* Dedicated hour axis — plain HTML, sits directly under the
                  chart, independent of recharts. */}
              <div style={{
                display: 'flex', justifyContent: 'space-between',
                padding: '0 8px 10px', borderBottom: '1px solid #1e3a5f', marginBottom: 8,
              }}>
                {axisTicks.map((t, i) => (
                  <span key={i} style={{ fontSize: 11, color: '#8da4be', fontFamily: 'var(--font-body)' }}>
                    {t.hour}
                  </span>
                ))}
              </div>

              <div className="weather-hourly-row">
                {hourlyForSelectedDay.map((h) => {
                  const isActive = pickedHour?.time === h.time;
                  return (
                    <button
                      key={h.time}
                      type="button"
                      onClick={() => setSelectedHourTime(isActive ? null : h.time)}
                      aria-pressed={isActive}
                      title={`Show ${fmtHour(h.time)} in the panel above`}
                      style={{
                        minWidth: 62, flexShrink: 0, textAlign: 'center',
                        padding: '8px 4px', borderRadius: 'var(--radius-sm)',
                        cursor: 'pointer', fontFamily: 'inherit',
                        background: isActive ? 'var(--accent)' : 'transparent',
                        border: `1px solid ${isActive ? 'var(--accent)' : 'transparent'}`,
                        transition: 'background 0.15s ease, border-color 0.15s ease',
                      }}
                    >
                      {h.rain_probability_pct != null && (
                        <div style={{ fontSize: '0.62rem', color: isActive ? '#0d1f3c' : 'var(--accent)', fontWeight: 700, marginBottom: 4 }}>
                          {h.rain_probability_pct}%
                        </div>
                      )}
                      <div style={{ fontSize: '0.65rem', color: isActive ? '#0d1f3c' : 'var(--text-muted)', marginBottom: 4 }}>{fmtHour(h.time)}</div>
                      <div style={{ fontSize: '1.15rem', marginBottom: 4 }}>{weatherIcon(h.weathercode, h.is_day)}</div>
                      <div style={{ fontSize: '0.75rem', fontWeight: 700, color: isActive ? '#0d1f3c' : 'var(--text-primary)' }}>
                        {h.temperature_c != null ? `${Math.round(h.temperature_c)}°` : '—'}
                      </div>
                    </button>
                  );
                })}
              </div>
              {pickedHour && (
                <div style={{ marginTop: 8, fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                  Showing {fmtHour(pickedHour.time)} in the panel above ·{' '}
                  <button
                    type="button"
                    onClick={() => setSelectedHourTime(null)}
                    style={{
                      background: 'none', border: 'none', padding: 0,
                      color: 'var(--accent)', fontWeight: 600, cursor: 'pointer',
                      fontSize: '0.7rem', textDecoration: 'underline',
                    }}
                  >
                    Back to now
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Rainfall outlook (next_6h / 12h / 24h from the backend) ──── */}
      {outlook && (
        <div className="grid-3" style={{ marginTop: 16 }}>
          {[
            { label: 'Next 6 Hours',  mm: outlook.next_6h_rain_mm,  pct: outlook.next_6h_rain_probability_pct },
            { label: 'Next 12 Hours', mm: outlook.next_12h_rain_mm, pct: outlook.next_12h_rain_probability_pct },
            { label: 'Next 24 Hours', mm: outlook.next_24h_rain_mm, pct: outlook.next_24h_rain_probability_pct },
          ].map(o => (
            <div key={o.label} style={{
              background: 'var(--blue-mid)', border: '1px solid var(--blue-border)',
              borderRadius: 'var(--radius-sm)', padding: '10px 14px',
            }}>
              <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>
                {o.label}
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.3rem', fontWeight: 800, color: 'var(--accent)' }}>
                  {o.mm ?? '—'}
                </span>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>mm</span>
                {o.pct != null && (
                  <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                    {o.pct}% chance
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

   
    </div>
  );
}

// True once at least one field is actively being bias-corrected against
// PAGASA's Pili AWS station (see backend app.weather.calibration) --
// before that, /api/forecast is still plain, uncorrected Open-Meteo data.
function pagasaCalibrationApplied(pagasaCalibration) {
  if (!pagasaCalibration || !pagasaCalibration.enabled) return false;
  const perField = pagasaCalibration.per_field || {};
  return Object.values(perField).some((f) => f && f.applied);
}

function pagasaCalibrationTooltip(pagasaCalibration) {
  const perField = pagasaCalibration.per_field || {};
  const lines = Object.entries(perField)
    .filter(([, f]) => f && f.bias != null)
    .map(([field, f]) => `${field}: ${f.bias > 0 ? '+' : ''}${f.bias.toFixed(2)} ${f.unit ?? ''} (${f.samples} samples)${f.applied ? '' : ' — below min sample threshold'}`);

  return [
    `Reference station: ${pagasaCalibration.reference_station?.name ?? '—'} (ID ${pagasaCalibration.reference_station?.id ?? '—'})`,
    `Total paired samples: ${pagasaCalibration.total_samples ?? 0} (min ${pagasaCalibration.min_samples_required ?? '—'} to activate a field)`,
    ...lines,
  ].join('\n');
}