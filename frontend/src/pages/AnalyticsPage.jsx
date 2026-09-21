import { useState, useMemo } from 'react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, ReferenceLine, ResponsiveContainer, Cell,
} from 'recharts';
import { useModelComparison, useModelExplanation, probabilityToAlertKey } from '../lib/modelApi';
import { useModelSelection } from '../hooks/useModelSelection';
import { ALERT_LEVELS } from '../data/mockData';
import { ErrorBanner } from '../components/ui';

// Shown only until the real comparison data (per_model forecasts) has
// loaded for the first time — never mixed with live numbers afterward.
const MOCK_14_DAY_FORECAST = [
  { day: 'Day 1', prob: 0.25 }, { day: 'Day 2', prob: 0.28 },
  { day: 'Day 3', prob: 0.32 }, { day: 'Day 4', prob: 0.38 },
  { day: 'Day 5', prob: 0.45 }, { day: 'Day 6', prob: 0.49 },
  { day: 'Day 7', prob: 0.52 }, { day: 'Day 8', prob: 0.65 },
  { day: 'Day 9', prob: 0.72 }, { day: 'Day 10', prob: 0.78 },
  { day: 'Day 11', prob: 0.60 }, { day: 'Day 12', prob: 0.45 },
  { day: 'Day 13', prob: 0.35 }, { day: 'Day 14', prob: 0.20 }
];

// Shown ONLY when /api/explain is unreachable — clearly badged
// "illustrative" below, never silently mixed in with a real SHAP result.
const MOCK_SHAP_DATA = [
  { feature: 'Month (cos)', label: 'Month (cos)', shap_value: 0.07 },
  { feature: 'prev_flood', label: 'Prev-day flood', shap_value: 0.12 },
  { feature: 'rain_6h', label: '6h Cumul. RF', shap_value: 0.14 },
  { feature: 'rain_7d_avg', label: '7d roll. avg', shap_value: 0.15 },
  { feature: 'humidity', label: 'Humidity', shap_value: 0.16 },
  { feature: 'wind_signal', label: 'Wind signal', shap_value: 0.19 },
  { feature: 'rain_12h', label: '12h Cumul. RF', shap_value: 0.24 },
  { feature: 'typhoon_signal', label: 'TCWS level', shap_value: 0.28 },
  { feature: 'api_5d', label: 'API (5-day)', shap_value: 0.32 },
  { feature: 'rain_24h', label: '24h Cumul. RF', shap_value: 0.43 },
];

const pctSigned = (fraction) => fraction == null ? '—'
  : `${fraction >= 0 ? '+' : ''}${(fraction * 100).toFixed(1)} pp`;

// ─── SHAP panel ─────────────────────────────────────────────────────────────
// Real KernelSHAP (see AI_Model/app/models/explain.py) when the backend is
// reachable; falls back to the old illustrative bars — clearly badged as
// such — only when it isn't. Never blends the two.
function ShapPanel({ activeModel, explanation, loading, error, onRefresh }) {
  const isReal = !!explanation && explanation.features?.length > 0;

  const chartData = useMemo(() => {
    const source = isReal
      ? explanation.features.slice(0, 10).map(f => ({
          feature: f.label, shap_value: f.shap_value, current_value: f.current_value, unit: f.unit,
        }))
      : MOCK_SHAP_DATA.map(f => ({ feature: f.label, shap_value: f.shap_value }));
    return [...source].reverse(); // largest impact ends up at the bottom of the vertical bar chart
  }, [isReal, explanation]);

  const maxAbs = Math.max(0.05, ...chartData.map(d => Math.abs(d.shap_value)));
  const riskDelta = isReal ? explanation.predicted_value - explanation.base_value : null;

  return (
    <div className="card" style={{ marginBottom: '20px' }}>
      <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <span>🔍 Explainable AI: SHAP Feature Attribution</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {loading && (
            <span style={{ fontSize: '0.7rem', color: 'var(--accent)', fontWeight: 'normal', textTransform: 'none' }}>
              ⏳ Computing live SHAP…
            </span>
          )}
          <span style={{
            fontSize: '0.7rem', fontWeight: 700, padding: '3px 9px', borderRadius: 999,
            textTransform: 'none', letterSpacing: 0,
            background: isReal ? `${activeModel.color}22` : 'rgba(148,163,184,0.15)',
            color: isReal ? activeModel.color : 'var(--text-muted)',
          }}>
            {isReal ? `Live KernelSHAP · ${activeModel.fullLabel}` : 'Illustrative — model backend unreachable'}
          </span>
          <button
            className="btn btn-ghost"
            onClick={onRefresh}
            disabled={loading}
            style={{ fontSize: '0.7rem', padding: '4px 10px', opacity: loading ? 0.5 : 1 }}
            title="Re-run the SHAP computation against the current live input"
          >
            🔄 Recompute
          </button>
        </div>
      </div>

      <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.6, marginTop: 10, marginBottom: 16 }}>
        {isReal ? (
          <>
            Each bar is a real Shapley value: how many percentage points that feature pushed today's Day-1 flood
            probability up (🔴) or down (🟢) relative to an <strong>average-conditions baseline</strong> — every
            feature at its training-set mean. <strong>Red = increases risk, green = decreases risk.</strong> Computed
            fresh from the live {activeModel.fullLabel} model, not a training-time snapshot.
          </>
        ) : (
          <>This visualization illustrates Shapley Additive exPlanations (SHAP) — it will switch to a live computation automatically once the model backend is reachable.</>
        )}
      </div>

      {isReal && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
          padding: '12px 16px', marginBottom: 16, background: 'var(--blue-mid)',
          border: '1px solid var(--blue-border)', borderRadius: 'var(--radius-sm)',
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Average-conditions baseline</div>
            <div style={{ fontSize: '1.3rem', fontWeight: 800, fontFamily: 'var(--font-display)', color: 'var(--text-muted)' }}>
              {(explanation.base_value * 100).toFixed(1)}%
            </div>
          </div>
          <div style={{ fontSize: '1.4rem', color: riskDelta >= 0 ? '#ef4444' : '#22c55e' }}>→</div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Today's actual prediction</div>
            <div style={{ fontSize: '1.3rem', fontWeight: 800, fontFamily: 'var(--font-display)', color: activeModel.color }}>
              {(explanation.predicted_value * 100).toFixed(1)}%
            </div>
          </div>
          <div style={{ marginLeft: 'auto', fontSize: '0.72rem', color: riskDelta >= 0 ? '#ef4444' : '#22c55e', fontWeight: 700 }}>
            Net effect of live conditions: {pctSigned(riskDelta)}
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '2.5fr 1fr', gap: '20px', alignItems: 'start' }}>
        <div style={{ height: Math.max(280, chartData.length * 30) }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--blue-border)" horizontal={true} vertical={false} />
              <XAxis
                type="number" stroke="var(--text-muted)" fontSize={11} tickLine={false}
                domain={isReal ? [-maxAbs, maxAbs] : [0, 0.5]}
                tickFormatter={(v) => isReal ? `${(v * 100).toFixed(0)}pp` : v}
              />
              <YAxis dataKey="feature" type="category" stroke="var(--text-primary)" fontSize={11} tickLine={false} axisLine={false} width={140} />
              {isReal && <ReferenceLine x={0} stroke="var(--text-muted)" />}
              <RechartsTooltip
                cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                contentStyle={{ background: 'var(--bg-dark)', border: '1px solid var(--blue-border)', borderRadius: '8px', color: '#fff' }}
                formatter={(value, name, props) => isReal
                  ? [`${pctSigned(value)}${props.payload.unit ? ` · currently ${props.payload.current_value} ${props.payload.unit}` : ''}`, 'SHAP contribution']
                  : [`${value.toFixed(2)} SHAP Value`, 'Impact Weight']}
              />
              <Bar dataKey="shap_value" radius={[0, 4, 4, 0]} barSize={16}>
                {chartData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={isReal ? (entry.shap_value >= 0 ? '#ef4444' : '#22c55e') : 'var(--accent)'}
                    fillOpacity={isReal ? 0.85 : 0.4 + (index * 0.06)}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
          {isReal ? (
            <>
              <p style={{ marginBottom: 8 }}>
                <strong style={{ color: 'var(--text-secondary)' }}>Method:</strong> {explanation.method}
              </p>
              <p>
                <strong style={{ color: 'var(--text-secondary)' }}>Baseline:</strong> {explanation.baseline_definition}
              </p>
            </>
          ) : (
            <p>
              It proves mathematically that the AI does not rely on sudden rainfall alone — the highest driving
              factors are typically <strong>24-hour Cumulative Rainfall</strong> and the <strong>Antecedent
              Precipitation Index (API)</strong>.
            </p>
          )}
        </div>
      </div>

      {isReal && (
        <div style={{ marginTop: 18, overflowX: 'auto' }}>
          <table style={{ width: '100%', minWidth: 520, borderCollapse: 'collapse', fontSize: '0.78rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--blue-border)' }}>
                {['Feature', 'Current Value', 'SHAP Contribution', 'Direction'].map(h => (
                  <th key={h} style={{
                    padding: '8px 12px', textAlign: 'left', color: 'var(--text-muted)',
                    fontWeight: 700, textTransform: 'uppercase', fontSize: '0.62rem', letterSpacing: '0.08em',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {explanation.features.map(f => (
                <tr key={f.feature} style={{ borderBottom: '1px solid rgba(30,58,95,0.4)' }}>
                  <td style={{ padding: '7px 12px', color: 'var(--text-primary)', fontWeight: 600 }}>{f.label}</td>
                  <td style={{ padding: '7px 12px', color: 'var(--text-secondary)' }}>
                    {f.current_value}{f.unit ? ` ${f.unit}` : ''}
                  </td>
                  <td style={{
                    padding: '7px 12px', fontWeight: 700,
                    color: f.shap_value > 0 ? '#ef4444' : f.shap_value < 0 ? '#22c55e' : 'var(--text-muted)',
                  }}>
                    {pctSigned(f.shap_value)}
                  </td>
                  <td style={{ padding: '7px 12px', color: 'var(--text-muted)' }}>
                    {f.shap_value > 0 ? '🔴 Increases risk' : f.shap_value < 0 ? '🟢 Decreases risk' : '⚪ No effect (at baseline)'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ marginTop: 8, fontSize: '0.62rem', color: 'var(--text-muted)' }}>
            Values sum exactly to the gap between the baseline and today's prediction (Shapley additivity) — this is
            a real explanation of this specific forecast, not a static training-time ranking.
          </div>
        </div>
      )}

      {error && (
        <div style={{ marginTop: 14, fontSize: '0.72rem', color: '#f87171' }}>
          ⚠ {error}
        </div>
      )}
    </div>
  );
}

// Uses the same probabilityToAlertKey() thresholds and ALERT_LEVELS copy as
// the rest of the app (Dashboard, Topbar, modelApi.js). This page used to
// have its own local, binary-only version of this logic that never got the
// ADVISORY/CRITICAL tiers when the rest of the app was updated -- routing
// through the shared source prevents that drift from happening again.
const getAlertDetails = (probability) => {
  const key = probabilityToAlertKey(probability);
  const info = ALERT_LEVELS[key];
  return { level: info.level, name: info.label, color: info.color, action: info.action };
};

const pct = (fraction) => fraction == null ? '—' : `${(fraction * 100).toFixed(1)}%`;

export default function AnalyticsPage() {
  const { modelKey, activeModel, options: modelOptions, setModelKey } = useModelSelection();
  const {
    perModel, comparisonDays, modelsCompared,
    loadingCompare, errorCompare,
  } = useModelComparison();
  const {
    explanation, loadingExplain, errorExplain, refetchExplanation,
  } = useModelExplanation(modelKey);

  const [selectedForecastIndex, setSelectedForecastIndex] = useState(0);

  const modelUnavailable = !loadingCompare && (!!errorCompare || !modelsCompared.length);

  // The 14-day curve for whichever algorithm is currently selected up in
  // the Topbar switcher — real per_model forecast data, not a fabricated
  // decay curve. Falls back to illustrative mock data only while the very
  // first fetch is still in flight or the backend is unreachable.
  const activeCurveData = useMemo(() => {
    const realForecast = perModel[modelKey]?.forecast;
    if (realForecast?.length) {
      return realForecast.map((d, i) => ({ day: `Day ${i + 1}`, prob: d.flood_probability }));
    }
    return MOCK_14_DAY_FORECAST;
  }, [perModel, modelKey]);

  const usingRealCurve = !!perModel[modelKey]?.forecast?.length;

  const selectedForecast = activeCurveData[selectedForecastIndex] || activeCurveData[0];
  const selectedAlert = getAlertDetails(selectedForecast.prob);

  // Real per-algorithm cards, built straight from /api/forecast-flood/compare
  // (per_model[key].meta.model_reliability + per_model[key].forecast[0]).
  // No hardcoded accuracy numbers or client-side probability offsets.
const algorithmCards = modelOptions.map((opt) => {
  const modelData = perModel[opt.key];
  const reliability = modelData?.meta?.model_reliability;
  const day1Prob = modelData?.forecast?.[0]?.flood_probability;

  return {
    ...opt,
    isLoaded: !!modelData,
    isSelected: opt.key === modelKey,

    avgAccuracy: reliability?.avg_accuracy,
    avgPrecision: reliability?.avg_precision,
    avgRecall: reliability?.avg_recall,
    avgF1: reliability?.avg_f1,
    avgFalseAlarm: reliability?.avg_false_alarm_rate,
    avgMissedEvent: reliability?.avg_missed_event_rate,

    day1ProbPct: day1Prob != null ? Math.round(day1Prob * 100) : null,
    measuredOn: reliability?.measured_on,
  };
});

  return (
    <div className="fade-in">

      {modelUnavailable && (
        <ErrorBanner>
          <strong>AI Model Backend Offline</strong> — showing simulated historical data until the flood-forecast API is reachable again.
        </ErrorBanner>
      )}

      {/* 1. 14-DAY PREDICTIVE ALERT CURVE — reflects whichever algorithm is
          selected via the Topbar switcher */}
      <div style={{ marginBottom: '20px', display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px' }}>
        <div className="card">
          <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span>📈 14-Day Predictive Alert Curve</span>
            <span style={{
              fontSize: '0.7rem', fontWeight: 700, padding: '3px 9px', borderRadius: 999,
              background: `${activeModel.color}22`, color: activeModel.color,
              textTransform: 'none', letterSpacing: 0,
            }}>
              {activeModel.fullLabel}{!usingRealCurve && ' · simulated'}
            </span>
          </div>
          <div style={{ height: 300, width: '100%', marginTop: '20px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={activeCurveData}
                margin={{ top: 10, right: 20, left: 0, bottom: 0 }}
                onClick={(e) => { if (e && e.activeTooltipIndex !== undefined) setSelectedForecastIndex(e.activeTooltipIndex); }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--blue-border)" vertical={false} />
                <XAxis dataKey="day" stroke="var(--text-muted)" fontSize={12} tickLine={false} />
                <YAxis domain={[0, 1]} ticks={[0, 0.50, 1]} stroke="var(--text-muted)" fontSize={12} tickLine={false} />
                <RechartsTooltip
                  contentStyle={{ background: 'var(--bg-dark)', border: '1px solid var(--blue-border)', borderRadius: '8px' }}
                  itemStyle={{ color: 'var(--accent)' }}
                  formatter={(value) => [`${(value * 100).toFixed(0)}% Risk`, activeModel.label]}
                />
                <ReferenceLine y={0.50} stroke="#f97316" strokeDasharray="4 4" label={{ position: 'insideTopLeft', value: 'Alert 2 Threshold', fill: '#f97316', fontSize: 10 }} />
                <Line type="monotone" dataKey="prob" stroke={activeModel.color} strokeWidth={4} dot={{ r: 5, fill: 'var(--bg-dark)', stroke: activeModel.color, strokeWidth: 2 }} activeDot={{ r: 8, fill: activeModel.color, stroke: '#fff' }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div style={{ textAlign: 'center', marginTop: '10px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            * Click on any point to view the LGU action plan for that day. Switch algorithms from the Topbar.
          </div>
        </div>

        <div className="card" style={{ borderTop: `6px solid ${selectedAlert.color}`, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '8px' }}>
            Timeline: <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{selectedForecast.day}</span>
          </div>
          <div style={{ fontSize: '2.5rem', fontFamily: 'var(--font-display)', fontWeight: 800, color: selectedAlert.color, lineHeight: 1.1, marginBottom: '5px' }}>
            {(selectedForecast.prob * 100).toFixed(0)}% Risk
          </div>
          <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '20px' }}>
            Alert Level {selectedAlert.level}: {selectedAlert.name}
          </div>
          <div style={{ background: 'var(--blue-mid)', padding: '16px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--blue-border)' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px', fontWeight: 600 }}>
              📋 Recommended LGU Action Plan
            </div>
            <div style={{ fontSize: '1rem', color: 'var(--text-primary)', lineHeight: 1.5 }}>{selectedAlert.action}</div>
          </div>
        </div>
      </div>

      {/* 2. SHAP FEATURE ATTRIBUTION — real KernelSHAP computed live against
          the active model (AI_Model/app/models/explain.py), falls back to
          clearly-labeled illustrative data only if the backend is unreachable. */}
      <ShapPanel
        activeModel={activeModel}
        explanation={explanation}
        loading={loadingExplain}
        error={errorExplain}
        onRefresh={refetchExplanation}
      />

      {/* 3. MULTI-ALGORITHM BENCHMARK PANEL — real per-model reliability
          metrics and live day-1 probabilities from /api/forecast-flood/compare.
          Clicking a card switches the algorithm app-wide (same context the
          Topbar switcher uses). */}
      <div className="card" style={{ marginBottom: '20px' }}>
        <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <span>Multi-Algorithm Comparison</span>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 'normal', textTransform: 'none', letterSpacing: 0 }}>
            {loadingCompare ? 'Loading live comparison…' : 'Live reliability & day-1 probability, same input windows'}
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px', marginTop: '16px' }}>
          {algorithmCards.map((algo) => (
            <button
              key={algo.key}
              onClick={() => setModelKey(algo.key)}
              style={{
                textAlign: 'left', cursor: 'pointer', font: 'inherit',
                background: 'var(--blue-mid)',
                border: `1px solid ${algo.isSelected ? algo.color : 'var(--blue-border)'}`,
                borderRadius: 'var(--radius-sm)', padding: '16px', position: 'relative', overflow: 'hidden',
              }}
              title={`View the ${algo.fullLabel} forecast`}
            >
              {algo.isSelected && (
                <div style={{ position: 'absolute', top: 0, right: 0, background: `${algo.color}20`, color: algo.color, padding: '4px 12px', fontSize: '0.65rem', fontWeight: 700, borderBottomLeftRadius: 'var(--radius-sm)' }}>
                  ACTIVE
                </div>
              )}
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>
                {algo.isLoaded ? 'Held-out test split' : 'Unavailable'}
              </div>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: algo.isSelected ? algo.color : 'var(--text-primary)', marginBottom: '16px' }}>{algo.fullLabel}</div>
              <div style={{ display: 'flex', gap: '20px', marginBottom: '16px', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '12px', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: '2px' }}>Accuracy</div>
                  <div style={{ fontSize: '0.9rem', color: 'var(--text-primary)', fontWeight: 600 }}>{pct(algo.avgAccuracy)}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: '2px' }}>Avg Precision</div>
                  <div style={{ fontSize: '0.9rem', color: 'var(--text-primary)', fontWeight: 600 }}>{pct(algo.avgPrecision)}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: '2px' }}>Avg Recall</div>
                  <div style={{ fontSize: '0.9rem', color: 'var(--text-primary)', fontWeight: 600 }}>{pct(algo.avgRecall)}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: '2px' }}>Avg F1</div>
                  <div style={{ fontSize: '0.9rem', color: 'var(--text-primary)', fontWeight: 600 }}>{pct(algo.avgF1)}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: '2px' }} title="Lower is better — how often this model cries wolf">Avg False Alarm</div>
                  <div style={{ fontSize: '0.9rem', color: '#f97316', fontWeight: 600 }}>{pct(algo.avgFalseAlarm)}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: '2px' }} title="Lower is better — share of actual floods this model failed to flag">Missed Event</div>
                  <div style={{ fontSize: '0.9rem', color: '#f97316', fontWeight: 600 }}>{pct(algo.avgMissedEvent)}</div>
                </div>
              </div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '6px' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Day-1 Probability (live)</span>
                  <span style={{ fontSize: '1.6rem', fontFamily: 'var(--font-display)', fontWeight: 800, color: algo.color, lineHeight: 1 }}>
                    {algo.day1ProbPct != null ? `${algo.day1ProbPct}%` : '—'}
                  </span>
                </div>
                <div style={{ width: '100%', height: '6px', background: 'rgba(0,0,0,0.3)', borderRadius: '99px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${algo.day1ProbPct ?? 0}%`, background: algo.color, transition: 'width 0.5s ease-in-out' }} />
                </div>
              </div>
            </button>
          ))}
        </div>

        {!loadingCompare && comparisonDays.length > 0 && (
          <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--blue-border)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
            {comparisonDays[0].models_agree
              ? 'All algorithms agree on tomorrow\u2019s alert level.'
              : 'Algorithms disagree on tomorrow\u2019s alert level — spread of '
                + `${Math.round(comparisonDays[0].spread * 100)} percentage points. Ensemble mean: `
                + `${Math.round(comparisonDays[0].ensemble_mean_probability * 100)}% (${comparisonDays[0].ensemble_alert_level}).`}
          </div>
        )}
      </div>

    </div>
  );
}