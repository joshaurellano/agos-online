import { useMemo, useState } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';

// ─── WMO weather-code → icon/label map ─────────────────────────────────────
// https://open-meteo.com/en/docs (WMO Weather interpretation codes)
const WMO_ICONS = {
  0:  { day: '☀️', night: '🌙' },
  1:  { day: '🌤️', night: '🌙' },
  2:  { day: '⛅',  night: '☁️' },
  3:  { day: '☁️',  night: '☁️' },
  45: { day: '🌫️', night: '🌫️' },
  48: { day: '🌫️', night: '🌫️' },
  51: { day: '🌦️', night: '🌦️' },
  53: { day: '🌦️', night: '🌦️' },
  55: { day: '🌧️', night: '🌧️' },
  56: { day: '🌧️', night: '🌧️' },
  57: { day: '🌧️', night: '🌧️' },
  61: { day: '🌧️', night: '🌧️' },
  63: { day: '🌧️', night: '🌧️' },
  65: { day: '🌧️', night: '🌧️' },
  66: { day: '🌧️', night: '🌧️' },
  67: { day: '🌧️', night: '🌧️' },
  71: { day: '🌨️', night: '🌨️' },
  73: { day: '🌨️', night: '🌨️' },
  75: { day: '❄️',  night: '❄️' },
  77: { day: '❄️',  night: '❄️' },
  80: { day: '🌦️', night: '🌦️' },
  81: { day: '🌧️', night: '🌧️' },
  82: { day: '⛈️', night: '⛈️' },
  85: { day: '🌨️', night: '🌨️' },
  86: { day: '❄️',  night: '❄️' },
  95: { day: '⛈️', night: '⛈️' },
  96: { day: '⛈️', night: '⛈️' },
  99: { day: '⛈️', night: '⛈️' },
};

function weatherIcon(code, isDay = true) {
  const entry = WMO_ICONS[code] ?? WMO_ICONS[2];
  return isDay ? entry.day : entry.night;
}

// Backdrop tint for the hero panel — keyed off condition, not a literal photo,
// so it stays on-brand with the rest of the (dark navy / accent blue) UI.
function heroBackdrop(code, isDay) {
  if (code == null) return 'linear-gradient(135deg, #16305a 0%, #0d1f3c 100%)';
  if ([95, 96, 99, 82].includes(code)) return 'linear-gradient(135deg, #2a1f4d 0%, #0d1f3c 100%)'; // storm
  if (code >= 51 && code <= 82) return 'linear-gradient(135deg, #12406b 0%, #0d1f3c 100%)'; // rain
  if (code >= 45 && code <= 48) return 'linear-gradient(135deg, #29405c 0%, #0d1f3c 100%)'; // fog
  if (code === 0 || code === 1) return isDay
    ? 'linear-gradient(135deg, #1c5f8f 0%, #0d1f3c 100%)'
    : 'linear-gradient(135deg, #0e2647 0%, #0d1f3c 100%)'; // clear
  return 'linear-gradient(135deg, #1c3f66 0%, #0d1f3c 100%)'; // cloudy default
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
export default function WeatherForecast({ hourly = [], daily = [], loading, generatedAt, outlook, weatherCache }) {
  const [selectedIdx, setSelectedIdx] = useState(0);

  const days = daily; // full outlook window returned by the backend (currently up to 14 days)
  const selectedDay = days[selectedIdx] ?? null;

  const hourlyForSelectedDay = useMemo(() => {
    if (!selectedDay) return [];
    return hourly.filter(h => h.time.startsWith(selectedDay.date));
  }, [hourly, selectedDay]);

  const hasHourlyDetail = hourlyForSelectedDay.length > 0;
  const isToday = selectedIdx === 0;

  // representative record for the hero panel: "now" for today, a midday
  // snapshot for tomorrow (still inside the 48h hourly window)
  const heroRecord = isToday
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
        ⚠️ Forecast feed unavailable — model backend offline
      </div>
    );
  }

  const chartData = hourlyForSelectedDay.map(h => ({
    hour: fmtHour(h.time),
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
          return (
            <button
              key={d.date}
              onClick={() => setSelectedIdx(idx)}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                minWidth: 74, flexShrink: 0, cursor: 'pointer',
                padding: '10px 10px 8px', borderRadius: 'var(--radius-sm)',
                border: active ? '1px solid var(--accent2)' : '1px solid var(--blue-border)',
                background: active ? 'var(--accent2)' : 'var(--blue-mid)',
                color: active ? '#fff' : 'var(--text-secondary)',
                transition: 'all 0.15s ease',
              }}
            >
              <span style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.02em' }}>{fmtDayLabel(d.date, idx)}</span>
              <span style={{ fontSize: '0.62rem', opacity: 0.85 }}>{fmtDateShort(d.date)}</span>
              <span style={{ fontSize: '1.2rem', margin: '2px 0' }}>{weatherIcon(d.weathercode, true)}</span>
              <span style={{ fontSize: '0.82rem', fontWeight: 800, fontFamily: 'var(--font-display)' }}>
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
          borderRadius: 'var(--radius)', overflow: 'hidden',
          border: '1px solid var(--blue-border)',
          background: heroBackdrop(heroRecord?.weathercode ?? selectedDay?.weathercode, heroRecord?.is_day ?? true),
        }}>
          <div style={{ padding: '18px 18px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
              <span style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.7)', fontWeight: 600, letterSpacing: '0.04em' }}>
                {isToday ? (heroRecord ? fmtHour(heroRecord.time) : 'Now') : fmtDateShort(selectedDay.date)}
              </span>
              <span style={{ fontSize: '2rem' }}>
                {weatherIcon(heroRecord?.weathercode ?? selectedDay?.weathercode, heroRecord?.is_day ?? true)}
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
            <Stat icon="💨" label="Wind" value={
              heroRecord ? `${heroRecord.wind_speed_kph ?? '—'} km/h` : selectedDay?.wind_speed_max_kph != null ? `${selectedDay.wind_speed_max_kph} km/h` : '—'
            } />
            <Stat icon="🌬" label="Wind Gusts" value={
              heroRecord?.wind_gusts_kph != null ? `${heroRecord.wind_gusts_kph} km/h` : selectedDay?.wind_gusts_max_kph != null ? `${selectedDay.wind_gusts_max_kph} km/h` : '—'
            } />
            <Stat icon="💧" label="Humidity" value={heroRecord?.humidity != null ? `${heroRecord.humidity}%` : '—'} />
            <Stat icon="👁" label="Visibility" value={heroRecord?.visibility_km != null ? `${heroRecord.visibility_km} km` : '—'} />
            <Stat icon="🧭" label="Pressure" value={
              heroRecord?.pressure_msl_hpa != null ? `${heroRecord.pressure_msl_hpa} hPa` : selectedDay?.pressure_msl_hpa != null ? `${selectedDay.pressure_msl_hpa} hPa` : '—'
            } />
            <Stat icon="☀️" label="UV Index" value={heroRecord?.uv_index ?? '—'} />
            <Stat icon="🌡" label="Dew Point" value={heroRecord?.dew_point_c != null ? `${heroRecord.dew_point_c}°C` : '—'} />
            <Stat icon="🌱" label="Soil Moisture" value={
              heroRecord?.soil_moisture_vwc != null
                ? `${(heroRecord.soil_moisture_vwc * 100).toFixed(1)}%`
                : selectedDay?.soil_moisture_vwc != null ? `${(selectedDay.soil_moisture_vwc * 100).toFixed(1)}%` : '—'
            } />
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
              <div style={{ height: 120, marginBottom: 4 }}>
                <ResponsiveContainer key={`${selectedDay.date}-${chartData.length}`} width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 10, right: 8, left: 8, bottom: 0 }}>
                    <defs>
                      <linearGradient id="precipFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.4} />
                        <stop offset="100%" stopColor="#38bdf8" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    {/* No recharts axes at all — no gridlines, no XAxis, no
                        YAxis. Just the shape of the trend. Hour labels are
                        rendered separately below as a plain HTML row, and
                        exact values show on hover via the tooltip. */}
                    <XAxis dataKey="hour" hide />
                    <YAxis hide domain={[0, (max) => Math.max(2, Math.ceil(max * 1.2))]} />
                    <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#38bdf8', strokeWidth: 1, strokeDasharray: '4 4' }} />
                    <Area
                      type="monotone"
                      dataKey="precipitation"
                      stroke="#38bdf8"
                      strokeWidth={2.5}
                      fill="url(#precipFill)"
                      activeDot={{ r: 4, fill: '#38bdf8', stroke: '#0d1f3c', strokeWidth: 2 }}
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
                {hourlyForSelectedDay.map((h) => (
                  <div key={h.time} style={{
                    minWidth: 62, flexShrink: 0, textAlign: 'center',
                    padding: '8px 4px', borderRadius: 'var(--radius-sm)',
                  }}>
                    {h.rain_probability_pct != null && (
                      <div style={{ fontSize: '0.62rem', color: 'var(--accent)', fontWeight: 700, marginBottom: 4 }}>
                        {h.rain_probability_pct}%
                      </div>
                    )}
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: 4 }}>{fmtHour(h.time)}</div>
                    <div style={{ fontSize: '1.15rem', marginBottom: 4 }}>{weatherIcon(h.weathercode, h.is_day)}</div>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                      {h.temperature_c != null ? `${Math.round(h.temperature_c)}°` : '—'}
                    </div>
                  </div>
                ))}
              </div>
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
                    ☔ {o.pct}% chance
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {(generatedAt || weatherCache) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: 10 }}>
          {generatedAt && (
            <span>
              Source: Open-Meteo · synced {new Date(generatedAt).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Manila' })}
            </span>
          )}
          {weatherCache && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '1px 8px', borderRadius: 4,
              background: weatherCache.significantly_stale ? 'rgba(239,68,68,0.12)' : 'rgba(34,197,94,0.12)',
              border: `1px solid ${weatherCache.significantly_stale ? 'rgba(239,68,68,0.35)' : 'rgba(34,197,94,0.35)'}`,
              color: weatherCache.significantly_stale ? '#ef4444' : '#22c55e',
              fontWeight: 700,
            }}>
              {weatherCache.significantly_stale ? '⚠ Stale cache' : '● Live'} · cache {Math.round(weatherCache.age_minutes)}m old
            </span>
          )}
        </div>
      )}
    </div>
  );
}
