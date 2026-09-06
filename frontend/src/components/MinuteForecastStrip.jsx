import { useMemo } from 'react';

// Mirrors RainfallPage's PAGASA_HOURLY_THRESHOLDS (mm/hr) bands/colors so a
// given rainfall rate reads the same way everywhere in the app. This is a
// smaller, presentation-only subset (label + color only) rather than an
// import of the full threshold table there, which also carries the daily
// bands, advisory copy, and PAGASA citation strings this strip doesn't need.
const RATE_BANDS = [
  { label: 'Light', max: 2.5, color: '#22c55e', range: '< 2.5 mm/h' },
  { label: 'Moderate', max: 7.5, color: '#eab308', range: '2.5–7.5 mm/h' },
  { label: 'Heavy', max: 15, color: '#f97316', range: '7.5–15 mm/h' },
  { label: 'Intense', max: 30, color: '#ef4444', range: '15–30 mm/h' },
  { label: 'Torrential', max: Infinity, color: '#7c3aed', range: '> 30 mm/h' },
];

function bandFor(rateMmhr) {
  return RATE_BANDS.find(b => rateMmhr < b.max) ?? RATE_BANDS[RATE_BANDS.length - 1];
}

/**
 * Short-range precipitation strip, styled after OpenWeatherMap's "Minute
 * forecast" widget: a row of time labels over a bar timeline, plus a band
 * legend. Backed by /api/forecast's "minutely" field (see
 * app/weather/client.py + app/api/routes_weather.py on the backend), which
 * comes from Open-Meteo's `minutely_15` block -- 15-minute steps, since
 * Open-Meteo has no true per-minute precipitation field. That's coarser
 * than OpenWeatherMap's 60x 1-minute series, so this reads as a
 * "Now / 15 / 30 / 45 / 60 min" strip rather than 60 individual ticks --
 * inspired by that widget's layout, not a literal per-minute reproduction.
 */
export default function MinuteForecastStrip({ minutely }) {
  const points = useMemo(() => (minutely || []).slice(0, 5), [minutely]);
  if (points.length < 2) return null; // not enough data yet to draw a timeline

  const maxRate = Math.max(1, ...points.map(p => p.precipitation_rate_mmhr || 0));

  return (
    <div style={{
      position: 'absolute', left: 12, right: 12, bottom: 52, zIndex: 5,
      background: 'rgba(13, 31, 60, 0.85)', backdropFilter: 'blur(6px)',
      border: '1px solid rgba(56,189,248,0.25)', borderRadius: 8,
      padding: '10px 14px', display: 'flex', flexWrap: 'wrap', alignItems: 'stretch', gap: 14,
      boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
    }}>
      <div style={{ flex: '1 1 220px', minWidth: 0 }}>
        <div style={{
          fontSize: '0.62rem', fontWeight: 800, letterSpacing: '0.06em',
          color: '#8da4be', textTransform: 'uppercase', marginBottom: 8,
        }}>
          Minute forecast · precipitation
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 4 }}>
          {points.map((p, i) => {
            const clock = new Date(p.time).toLocaleTimeString('en-PH', {
              hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila',
            });
            return (
              <div key={p.time} style={{ textAlign: 'center', flex: 1 }}>
                <div style={{ fontSize: '0.6rem', color: '#5f7a9c' }}>
                  {i === 0 ? 'Now' : `${i * 15} min`}
                </div>
                <div style={{ fontSize: '0.66rem', fontWeight: 700, color: '#e2eaf5' }}>{clock}</div>
              </div>
            );
          })}
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 34, marginTop: 8 }}>
          {points.map(p => {
            const rate = p.precipitation_rate_mmhr || 0;
            const band = bandFor(rate);
            const h = Math.max(3, Math.round((rate / maxRate) * 34));
            return (
              <div
                key={p.time}
                title={`${rate.toFixed(1)} mm/hr`}
                style={{
                  flex: 1, height: h, borderRadius: 2,
                  background: rate > 0 ? band.color : 'rgba(141,164,190,0.25)',
                }}
              />
            );
          })}
        </div>
      </div>

      <div style={{
        display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 4,
        borderLeft: '1px solid rgba(56,189,248,0.2)', paddingLeft: 12, flexShrink: 0,
      }}>
        {RATE_BANDS.map(b => (
          <div key={b.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 9, height: 9, borderRadius: 2, background: b.color, flexShrink: 0 }} />
            <span style={{ fontSize: '0.58rem', color: '#8da4be', whiteSpace: 'nowrap' }}>
              {b.label} · {b.range}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
