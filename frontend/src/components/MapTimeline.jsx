import { useEffect, useMemo, useRef, useState } from 'react';

// Same PAGASA-aligned rate bands as MinuteForecastStrip / RainfallPage, so a
// given mm/h reads the same colour everywhere in the app.
export const RATE_BANDS = [
  { label: 'None', max: 0.1, color: 'rgba(141,164,190,0.28)', range: '0' },
  { label: 'Light', max: 2.5, color: '#22c55e', range: '< 2.5' },
  { label: 'Moderate', max: 7.5, color: '#eab308', range: '2.5–7.5' },
  { label: 'Heavy', max: 15, color: '#f97316', range: '7.5–15' },
  { label: 'Intense', max: 30, color: '#ef4444', range: '15–30' },
  { label: 'Torrential', max: Infinity, color: '#7c3aed', range: '> 30' },
];

const bandFor = (rate) => RATE_BANDS.find(b => rate < b.max) ?? RATE_BANDS[RATE_BANDS.length - 1];

const clock = (iso, opts) =>
  new Date(iso).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila', ...opts });

const PLAY_INTERVAL_MS = 900;

/**
 * Forecast timeline for the map. Two ranges:
 *   - "1 hr"  -> the 15-minute precipitation steps (Open-Meteo minutely_15)
 *   - "24 hr" -> the next 24 hourly records
 * Frame 0 is always "Now" and reports `null` to the parent, meaning "use the
 * live readings". Any later frame reports its forecast values so the parent
 * can drive the rain effect, wind flow and HUD from them. Play steps through
 * the frames and loops; clicking a bar scrubs to it.
 *
 * Values are barangay-wide forecasts -- the timeline changes *when*, never
 * *where* -- and the water-slab / alert colours stay tied to the live alert
 * level, because the flood alert is a model output, not a forecast frame.
 */
export default function MapTimeline({ minutely, hourly, onFrameChange }) {
  const [range, setRange] = useState('24h'); // '1h' | '24h'
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);

  const frames = useMemo(() => {
    if (range === '1h') {
      return (minutely || []).slice(0, 5).map(p => ({
        time: p.time,
        rainMm: p.precipitation_rate_mmhr ?? 0,
        windKph: null, gustKph: null, dirDeg: null, condition: null, tempC: null, prob: null,
      }));
    }
    return (hourly || []).slice(0, 24).map(h => ({
      time: h.time,
      rainMm: h.precipitation ?? 0,
      windKph: h.wind_speed_kph ?? null,
      gustKph: h.wind_gusts_kph ?? null,
      dirDeg: h.wind_direction_deg ?? null,
      condition: h.condition ?? null,
      tempC: h.temperature_c ?? null,
      prob: h.rain_probability_pct ?? null,
    }));
  }, [range, minutely, hourly]);

  // Keep the parent informed of the active frame (null = live "Now").
  const onFrameChangeRef = useRef(onFrameChange);
  onFrameChangeRef.current = onFrameChange;
  useEffect(() => {
    onFrameChangeRef.current?.(idx === 0 ? null : frames[idx] ?? null);
  }, [idx, frames]);

  // Switching range, or data refreshing under us, returns to live.
  useEffect(() => { setIdx(0); setPlaying(false); }, [range]);
  useEffect(() => { if (idx >= frames.length) setIdx(0); }, [frames.length, idx]);

  useEffect(() => {
    if (!playing || frames.length < 2) return;
    const id = setInterval(() => setIdx(i => (i + 1) % frames.length), PLAY_INTERVAL_MS);
    return () => clearInterval(id);
  }, [playing, frames.length]);

  // Unmounting (e.g. switching to the 2D map) must not leave a stale
  // forecast frame applied.
  useEffect(() => () => onFrameChangeRef.current?.(null), []);

  if (frames.length < 2 && (hourly?.length ?? 0) < 2 && (minutely?.length ?? 0) < 2) return null;

  const maxRate = Math.max(2, ...frames.map(f => f.rainMm));
  const active = frames[idx];
  const isLive = idx === 0;
  const labelEvery = range === '24h' ? 4 : 1;

  const btn = (on) => ({
    padding: '3px 9px', fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.04em',
    cursor: 'pointer', border: 'none', borderRadius: 4,
    background: on ? 'var(--accent, #0ea5e9)' : 'transparent',
    color: on ? '#fff' : '#8da4be',
  });

  return (
    <div style={{
      position: 'absolute', left: 12, right: 12, bottom: 52, zIndex: 5,
      background: 'rgba(13, 31, 60, 0.88)', backdropFilter: 'blur(6px)',
      border: '1px solid rgba(56,189,248,0.25)', borderRadius: 8,
      padding: '8px 12px 9px', boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
    }}>
      {/* Controls + readout */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 7 }}>
        <button
          onClick={() => setPlaying(p => !p)}
          disabled={frames.length < 2}
          title={playing ? 'Pause' : 'Play the forecast'}
          aria-label={playing ? 'Pause forecast playback' : 'Play forecast playback'}
          style={{
            width: 26, height: 26, borderRadius: '50%', border: '1px solid rgba(56,189,248,0.45)',
            background: playing ? 'var(--accent, #0ea5e9)' : 'transparent', color: '#e2eaf5',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
            {playing ? <path d="M6 5h4v14H6zM14 5h4v14h-4z" /> : <path d="M7 4l13 8-13 8z" />}
          </svg>
        </button>

        <div style={{ display: 'flex', background: 'rgba(255,255,255,0.06)', borderRadius: 5, padding: 2 }}>
          <button style={btn(range === '1h')} onClick={() => setRange('1h')}>1 hr</button>
          <button style={btn(range === '24h')} onClick={() => setRange('24h')}>24 hr</button>
        </div>

        <button
          onClick={() => { setPlaying(false); setIdx(0); }}
          disabled={isLive}
          style={{
            ...btn(isLive), padding: '4px 10px', border: '1px solid rgba(56,189,248,0.3)',
            opacity: isLive ? 1 : 0.95,
          }}
          title="Back to live conditions"
        >
          ● Now
        </button>

        <div style={{ flex: '1 1 180px', minWidth: 0, fontSize: '0.66rem', color: '#e2eaf5', textAlign: 'right' }}>
          <span style={{ fontWeight: 800, color: isLive ? '#38bdf8' : '#fbbf24', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            {isLive ? 'Live' : `Forecast · ${clock(active.time, range === '24h' ? { weekday: 'short' } : {})}`}
          </span>
          {!isLive && (
            <span style={{ color: '#8da4be' }}>
              {' · '}{active.rainMm.toFixed(1)} mm/h
              {active.windKph != null && ` · wind ${Math.round(active.windKph)} km/h`}
              {active.prob != null && ` · ${active.prob}% rain`}
              {active.condition && ` · ${active.condition}`}
            </span>
          )}
        </div>
      </div>

      {/* Bars -- each is a clickable frame */}
      <div role="group" aria-label="Forecast time steps" style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 38 }}>
        {frames.map((f, i) => {
          const band = bandFor(f.rainMm);
          const h = f.rainMm < 0.1 ? 4 : Math.max(6, Math.round((f.rainMm / maxRate) * 38));
          const isActive = i === idx;
          return (
            <button
              key={f.time}
              onClick={() => { setPlaying(false); setIdx(i); }}
              title={`${i === 0 ? 'Now' : clock(f.time)} · ${f.rainMm.toFixed(1)} mm/h (${band.label})`}
              aria-label={`${i === 0 ? 'Now' : clock(f.time)}, ${f.rainMm.toFixed(1)} millimetres per hour`}
              aria-pressed={isActive}
              style={{
                flex: 1, height: '100%', padding: 0, border: 'none', background: 'transparent',
                cursor: 'pointer', display: 'flex', alignItems: 'flex-end',
                borderBottom: isActive ? '2px solid #fff' : '2px solid transparent',
              }}
            >
              <span style={{
                display: 'block', width: '100%', height: h, borderRadius: 2,
                background: band.color, opacity: isActive ? 1 : 0.72,
                outline: isActive ? '1px solid rgba(255,255,255,0.7)' : 'none',
              }} />
            </button>
          );
        })}
      </div>

      {/* Time axis */}
      <div style={{ display: 'flex', gap: 3, marginTop: 4 }}>
        {frames.map((f, i) => (
          <div key={f.time} style={{
            flex: 1, textAlign: 'center', fontSize: '0.54rem', whiteSpace: 'nowrap',
            color: i === idx ? '#e2eaf5' : '#5f7a9c', fontWeight: i === idx ? 700 : 500,
            visibility: i % labelEvery === 0 ? 'visible' : 'hidden', overflow: 'visible',
          }}>
            <span style={{ display: 'inline-block', width: 0, overflow: 'visible' }}>
              {i === 0 ? 'Now' : clock(f.time, range === '24h' ? { minute: undefined } : {})}
            </span>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 8, paddingTop: 6, borderTop: '1px solid rgba(255,255,255,0.07)' }}>
        <span style={{ fontSize: '0.56rem', color: '#5f7a9c', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' }}>mm/h</span>
        {RATE_BANDS.slice(1).map(b => (
          <span key={b.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.56rem', color: '#8da4be', whiteSpace: 'nowrap' }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: b.color }} />
            {b.label} {b.range}
          </span>
        ))}
      </div>
    </div>
  );
}
