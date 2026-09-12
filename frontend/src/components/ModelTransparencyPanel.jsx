import { useModelSelection } from '../hooks/useModelSelection';
import { useFloodForecast14Day } from '../lib/modelApi';

// ─── Model Transparency panel ───────────────────────────────────────────
// A plain-language walkthrough of the prediction pipeline (data source →
// features → scaling → model → alert bucketing), plus the model's real
// held-out reliability numbers and the assumptions/limitations that go
// with them. Everything here is either static pipeline description (the
// pipeline itself doesn't change) or pulled live from the same
// /api/forecast-flood/<model> call FloodForecast14Day already makes for
// the currently-selected algorithm (Topbar switcher) — react-query
// dedupes the two callers, so this doesn't add an extra network request.

const pct = (fraction) => (fraction == null ? '—' : `${(fraction * 100).toFixed(1)}%`);

function freshnessBadge(weatherCache) {
  if (!weatherCache || !weatherCache.status) return null;
  const isFresh = weatherCache.status === 'fresh';
  const isUnavailable = weatherCache.status === 'unavailable';
  const isStale = weatherCache.significantly_stale;
  const color = isFresh ? '#22c55e' : isStale ? '#ef4444' : '#eab308';
  const label = isFresh ? 'Fresh' : isUnavailable ? 'Unavailable' : isStale ? 'Stale cache' : 'Fallback data';
  return (
    <span
      title={
        weatherCache.last_successful_fetch
          ? `Last successful fetch: ${new Date(weatherCache.last_successful_fetch).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}`
          : undefined
      }
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '3px 10px', borderRadius: 999,
        background: `${color}1a`, border: `1px solid ${color}59`,
        color, fontWeight: 700, fontSize: '0.66rem', whiteSpace: 'nowrap',
      }}
    >
      Weather data: {label}
      {weatherCache.age_minutes != null && ` · ${Math.round(weatherCache.age_minutes)} min old`}
    </span>
  );
}

const STEPS = [
  {
    icon: '',
    title: 'Open-Meteo Forecast API',
    body: (area) =>
      `Live hourly/daily rainfall, humidity, wind, pressure & soil moisture for ${area.name} (${area.coords}).`,
  },
  {
    icon: '',
    title: 'Feature Engineering',
    body: () =>
      `Rolling rainfall sums (3h/6h/12h/24h/7d), a 5-day Antecedent Precipitation Index, wind→typhoon-signal mapping, and seasonal month sin/cos encoding.`,
  },
  {
    icon: '',
    title: 'Scaling',
    body: () =>
      `Every feature is normalized with the same scaler fit at training time, so live inputs match the ranges the model was trained on.`,
  },
  {
    icon: '',
    title: (activeModel) => `${activeModel.fullLabel} Model`,
    body: () =>
      `An encoder reads the past window; a decoder — driven by Open-Meteo's actual future forecast, not a blind extrapolation — outputs a 14-day flood-probability curve.`,
  },
  {
    icon: '',
    title: 'Alert Bucketing',
    body: () =>
      `Day-1 probability is mapped to NORMAL / ADVISORY / WARNING / CRITICAL using fixed thresholds — 25% / 50% / 75% — the same ones used in the Alert Level Reference.`,
  },
];

const ASSUMPTIONS = [
  "Decoder input (rain/wind/typhoon-signal features for the next 14 days) comes directly from Open-Meteo's forecast, not a blind extrapolation of past patterns.",
  'Antecedent moisture is a proxy derived from computed rainfall API. No live soil-moisture sensor.',
  'prev_flood defaults to 0 in the encoder because there is no live ground-truth flood feed. Excluded entirely from the decoder.',
  'Typhoon signal is a proxy derived from forecasted wind-speed thresholds.',
];

export default function ModelTransparencyPanel({ area, weatherCache }) {
  const { activeModel } = useModelSelection();
  const { meta14, loading14 } = useFloodForecast14Day(activeModel.key);
  const reliability = meta14?.model_reliability;

  const metrics = [
    { label: 'Precision', value: pct(reliability?.avg_precision), color: 'var(--accent)' },
    { label: 'Recall', value: pct(reliability?.avg_recall), color: 'var(--accent)' },
    { label: 'F1 Score', value: pct(reliability?.avg_f1), color: 'var(--accent)' },
    { label: 'False Alarm', value: pct(reliability?.avg_false_alarm_rate), color: '#f97316' },
  ];

  return (
    <div className="card" style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
            How This Prediction Works — Model Transparency
          </div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 3 }}>
            The pipeline behind the {activeModel.fullLabel} forecast, end to end
          </div>
        </div>
        {freshnessBadge(weatherCache)}
      </div>

      {/* 5-step pipeline */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(175px, 1fr))', gap: 10, marginBottom: 20 }}>
        {STEPS.map((step, i) => (
          <div key={i} style={{
            background: 'var(--blue-mid)', border: '1px solid var(--blue-border)',
            borderRadius: 'var(--radius-sm)', padding: '12px 13px',
          }}>
            <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6 }}>
              Step {i + 1}
            </div>
            <div style={{ fontSize: '1.1rem', marginBottom: 6 }}>{step.icon}</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 5 }}>
              {typeof step.title === 'function' ? step.title(activeModel) : step.title}
            </div>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
              {step.body(area)}
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 1.1fr) minmax(220px, 1fr)', gap: 18 }}>
        {/* Measured reliability */}
        <div>
          <div style={{ fontSize: '0.64rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: 4 }}>
            Measured Reliability
          </div>
          <div style={{ fontSize: '0.64rem', color: 'var(--text-muted)', marginBottom: 10 }}>
            Held-out test split (20% of sequential data, never seen in training)
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {metrics.map(m => (
              <div key={m.label} style={{
                background: 'var(--blue-mid)', border: '1px solid var(--blue-border)',
                borderRadius: 'var(--radius-sm)', padding: '10px 12px',
              }}>
                <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>
                  {m.label}
                </div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', fontWeight: 800, color: loading14 ? 'var(--text-muted)' : m.color }}>
                  {loading14 ? '…' : m.value}
                </div>
              </div>
            ))}
          </div>
          {reliability?.measured_on && (
            <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginTop: 8 }}>
              Measured on: {reliability.measured_on}
            </div>
          )}
        </div>

        {/* Assumptions & limitations */}
        <div>
          <div style={{ fontSize: '0.64rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: 8 }}>
            Stated Assumptions &amp; Limitations
          </div>
          <ul style={{ margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {ASSUMPTIONS.map((line, i) => (
              <li key={i} style={{ fontSize: '0.68rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>{line}</li>
            ))}
          </ul>
          <div style={{ fontSize: '0.66rem', color: 'var(--text-secondary)', fontStyle: 'italic', marginTop: 10 }}>
            "Treat flood_probability as a decision-support signal, not a certainty score."
          </div>
        </div>
      </div>
    </div>
  );
}
