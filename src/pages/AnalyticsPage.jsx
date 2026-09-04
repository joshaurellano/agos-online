import { useState, useMemo } from 'react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, ReferenceLine, ResponsiveContainer, Cell,
} from 'recharts';
import { useModelComparison, probabilityToAlertKey } from '../lib/modelApi';
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

const MOCK_SHAP_DATA = [
  { feature: 'Month (cos)', value: 0.07 },
  { feature: 'Prev-day flood', value: 0.12 },
  { feature: '6h Cumul. RF', value: 0.14 },
  { feature: '7d roll. avg', value: 0.15 },
  { feature: 'Humidity', value: 0.16 },
  { feature: 'Wind signal', value: 0.19 },
  { feature: '12h Cumul. RF', value: 0.24 },
  { feature: 'TCWS level', value: 0.28 },
  { feature: 'API (5-day)', value: 0.32 },
  { feature: '24h Cumul. RF', value: 0.43 }
].reverse();

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
      avgPrecision: reliability?.avg_precision,
      avgRecall: reliability?.avg_recall,
      avgF1: reliability?.avg_f1,
      avgFalseAlarm: reliability?.avg_false_alarm_rate,
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

      {/* 2. SHAP FEATURE IMPORTANCE — illustrative; the backend does not
          currently expose live per-request SHAP values */}
      <div className="card" style={{ marginBottom: '20px' }}>
        <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>🔍 Explainable AI: Global Feature Importance (SHAP)</span>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 'normal', textTransform: 'none' }}>Illustrative — from training-time analysis</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2.5fr', gap: '20px', alignItems: 'center', marginTop: '16px' }}>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            <p style={{ marginBottom: '10px' }}>
              <strong>How to read this chart:</strong> This visualization uses Shapley Additive exPlanations (SHAP) to break down the model logic.
            </p>
            <p style={{ marginBottom: '10px' }}>
              It proves mathematically that the AI does not rely on sudden rainfall alone. The highest driving factors are <strong>24-hour Cumulative Rainfall</strong> and the <strong>Antecedent Precipitation Index (API)</strong>.
            </p>
            <div style={{ marginTop: '16px', padding: '12px', background: 'rgba(251,191,36,0.05)', borderLeft: '3px solid var(--accent)', borderRadius: '4px', fontSize: '0.75rem' }}>
              💡 <strong>Insight:</strong> Flooding is heavily driven by prolonged soil saturation rather than brief downpours.
            </div>
          </div>
          <div style={{ height: 320, width: '100%' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={MOCK_SHAP_DATA} layout="vertical" margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--blue-border)" horizontal={true} vertical={false} />
                <XAxis type="number" stroke="var(--text-muted)" fontSize={11} tickLine={false} domain={[0, 0.5]} />
                <YAxis dataKey="feature" type="category" stroke="var(--text-primary)" fontSize={11} tickLine={false} axisLine={false} />
                <RechartsTooltip
                  cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                  contentStyle={{ background: 'var(--bg-dark)', border: '1px solid var(--blue-border)', borderRadius: '8px', color: '#fff' }}
                  formatter={(value) => [`${value.toFixed(2)} SHAP Value`, 'Impact Weight']}
                />
                <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={16}>
                  {MOCK_SHAP_DATA.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill="var(--accent)" fillOpacity={0.4 + (index * 0.06)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* 3. MULTI-ALGORITHM BENCHMARK PANEL — real per-model reliability
          metrics and live day-1 probabilities from /api/forecast-flood/compare.
          Clicking a card switches the algorithm app-wide (same context the
          Topbar switcher uses). */}
      <div className="card" style={{ marginBottom: '20px' }}>
        <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <span>🧠 Multi-Algorithm Comparison</span>
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
              ? '✅ All algorithms agree on tomorrow\u2019s alert level.'
              : '⚠️ Algorithms disagree on tomorrow\u2019s alert level — spread of '
                + `${Math.round(comparisonDays[0].spread * 100)} percentage points. Ensemble mean: `
                + `${Math.round(comparisonDays[0].ensemble_mean_probability * 100)}% (${comparisonDays[0].ensemble_alert_level}).`}
          </div>
        )}
      </div>

    </div>
  );
}
