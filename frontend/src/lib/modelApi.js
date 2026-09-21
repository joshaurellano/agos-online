import { useState, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import Swal from 'sweetalert2';
import { supabase } from './supabaseClient';
import { useDataSource } from '../hooks/useDataSource';
import { logger } from './logger';

const POLL_INTERVAL_MS = 30_000;

// Backup model deployment — exposes the same endpoints/shape as the
// primary (VITE_LIVE_URL). Only used when the primary host is unreachable
// or erroring, and only for the 'live' data source (the 'mock' source is
// for demos and shouldn't silently fall through to production).
const BACKUP_MODEL_BASE_URL = 'https://agos-flood-predict.onrender.com';

async function fetchModelJson(apiBaseUrl, path, allowFallback) {
  try {
    const res = await fetch(`${apiBaseUrl}${path}`);
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    const data = await res.json();
    // The backend always returns HTTP 200, even on internal errors (e.g.
    // Open-Meteo down with no usable cache) — it reports failure via
    // `status: "error"` in the JSON body instead of an HTTP error code.
    // Without this check, res.ok is true and we'd never fall back.
    if (data.status !== 'success') throw new Error(data.message || 'Primary model API returned an error');
    return data;
  } catch (err) {
    if (!allowFallback) throw err;
    logger.warn(`Primary model API unreachable/erroring (${apiBaseUrl}${path}): ${err.message} — trying backup`);
    const res = await fetch(`${BACKUP_MODEL_BASE_URL}${path}`);
    if (!res.ok) throw new Error(`Backup API error: ${res.status}`);
    const data = await res.json();
    if (data.status !== 'success') throw new Error(data.message || 'Backup model API also returned an error');
    return data;
  }
}

export function probabilityToAlertKey(probability) {
  if (probability >= 0.75) return 'CRITICAL';
  if (probability >= 0.50) return 'WARNING';
  if (probability >= 0.25) return 'ADVISORY';
  return 'NORMAL';
}

export function alertLevelFromKey(key) {
  switch (key) {
    case 'CRITICAL':  return 3;
    case 'WARNING':   return 2;
    case 'ADVISORY':  return 1;
    default:          return 0;
  }
}

const LOCATION = 'Barangay Triangulo, Naga City';
const SOURCE = 'AGOS';

// (2:05 PM, Sep 16) — same shape as an NDRRMC SMS timestamp, in Manila time.
// Keep in sync with formatTimestamp() in supabase/functions/poll-flood/index.ts.
function formatTimestamp(date) {
  const time = date.toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit', hour12: true });
  const day  = date.toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric' });
  return `(${time}, ${day})`;
}

// Message copy: NDRRMC-style source + timestamp + what/where up front, then
// a plain-language impact + action — the same two-part shape as a Google
// Weather card's headline + detail line. Keep in sync with
// buildCurrentMessage() in supabase/functions/poll-flood/index.ts — this is
// the same wording, just built client-side for the level-change dispatch
// that fires while the dashboard is open.
const ALERT_MESSAGES = {
  ADVISORY: (pct) => `${SOURCE}: ${formatTimestamp(new Date())} Flood Advisory in effect for ${LOCATION}${pct != null ? ` — ${pct}% flood probability` : ''}. Elevated water levels; minor flooding possible in low-lying areas. Residents near waterways should stay alert and prepare emergency go-bags.`,
  WARNING:  (pct) => `${SOURCE}: ${formatTimestamp(new Date())} Flood Warning in effect for ${LOCATION}${pct != null ? ` — ${pct}% flood probability` : ''}. Significant flooding expected. Move valuables to higher ground and prepare for possible evacuation.`,
  CRITICAL: (pct) => `${SOURCE}: ${formatTimestamp(new Date())} Flood CRITICAL alert for ${LOCATION}${pct != null ? ` — ${pct}% flood probability` : ''}. Severe flooding imminent. EVACUATE IMMEDIATELY to your designated evacuation center.`,
  NORMAL:   () => `${SOURCE}: ${formatTimestamp(new Date())} Situation in ${LOCATION} has returned to Normal. Flood risk has subsided. Continue monitoring for updates.`,
};

// Push notification titles now live solely in on-alert-change/index.ts —
// that's the only place left that ever calls send-push-notification, so
// keeping a second copy here would just risk drifting out of sync again.
//
// There used to be a second alert-dispatch path here (dispatchAutoAlert),
// firing whenever a dashboard's own 30s poll saw a level change. It's been
// removed: its dedup lived in an in-memory Map local to that browser tab,
// never synced against the flood_snapshots row poll-flood's cron dedupes
// against, so a dashboard left open during a transition could insert a
// second `alerts` row (and a second real SMS + push blast) after the cron
// had already sent one. poll-flood is now the ONLY thing that ever writes
// to `alerts` for a live-reading transition, cron or dashboard-open or not.
// Same reasoning is why the 3-day-outlook check was never added here either
// — see poll-flood/index.ts.

// Saves snapshot to Supabase for the FloodForecastChart. Only writes the
// fields this hook actually knows (alert_key from the live prediction it
// just fetched) — outlook_key is deliberately left untouched, not zeroed,
// because it's poll-flood's cron-only dedup state for the 3-day-outlook
// escalation check; a client write that nulled it out on every 30s poll
// would make poll-flood think each cycle was its first run and silently
// suppress a genuine outlook alert.
async function saveSnapshot(data) {
  const rainfall = data?.live_metrics?.rainfall_mm ?? 0;

  const { error } = await supabase.from('flood_snapshots').insert({
    alert_level:        alertLevelFromKey(data.alert_level),
    alert_key:          data.alert_level,
    probability:        data.probability,
    rainfall_mm:        rainfall,
    humidity:           data?.live_metrics?.humidity  ?? null,
    wind_signal:        data?.live_metrics?.wind_signal ?? null,
    status:             data.status ?? null,
  });

  if (error) logger.warn('Snapshot save failed:', error.message);
  else logger.debug('Snapshot saved to Supabase');
}

// Tracks the last alert key seen, per data-source, so switching between live
// and mock (or, in future, calling this hook for more than one model at
// once) can't cause one query's transition to suppress or spuriously
// trigger another's. This now only drives the mock-mode local toast below —
// real dispatch lives solely in poll-flood's cron (see note above).
const lastDispatchedAlertKeyByKey = new Map();

// ── Day-1 prediction (KPI cards, alerts, snapshot logging) ──────────────
// modelKey selects which trained algorithm ('gru' | 'lstm' | 'cnn') the
// backend runs — see MODEL_OPTIONS in ../hooks/useModelSelection. Defaults
// to 'gru' to match the backend's own DEFAULT_MODEL_KEY.
export function useModelPrediction(modelKey = 'gru') {
  const { apiBaseUrl, isMock } = useDataSource();
  const sourceTag = isMock ? 'mock' : 'live';
  const queryKey = ['prediction', sourceTag, modelKey];

  const query = useQuery({
    queryKey,
    queryFn: async () => {
      const data = await fetchModelJson(apiBaseUrl, `/api/predict-flood/${modelKey}`, !isMock);

      const probability = data.probability ?? 0;
      // Alert level now comes straight from the backend (/api/predict-flood),
      // which applies the same 4-tier probability_to_alert_level() bucketing
      // used across the whole API. Do not recompute it here — that used to
      // cause the frontend's alert to disagree with the backend's.
      const alertKey = data.alert_level ?? probabilityToAlertKey(probability);

      return {
        alert_level:        alertKey,
        probability,
        status:             data.status ?? null,
        model_key:          data.model_key ?? modelKey,
        live_metrics: {
          rainfall_mm: data?.live_metrics?.rainfall_mm ?? 0,
          humidity:    data?.live_metrics?.humidity    ?? null,
          wind_signal: data?.live_metrics?.wind_signal ?? 0,
          wind_direction_deg: data?.live_metrics?.wind_direction_deg ?? null,
          // NOTE: /api/predict-flood's live_metrics (app/features/aggregation.py
          // get_live_metrics()) does NOT include a condition string -- that
          // only exists per-entry in /api/forecast's hourly[]/daily[] (via
          // wmo_label()). Dashboard.jsx pulls it from forecast[0].condition
          // instead, since that's the endpoint that actually returns it.
        },
      };
    },
    refetchInterval: POLL_INTERVAL_MS,
  });

  // Side effects — snapshot logging for the chart — run whenever a fresh
  // prediction comes back. Real alert dispatch for a live-level transition
  // happens solely in poll-flood's cron now (see note above saveSnapshot).
  //
  // isMock guards the real call: saveSnapshot() writes to the real
  // flood_snapshots table poll-flood reads for its own dedup state, and
  // mock readings have no business in that history.
  //
  // Mock mode isn't left silent, though — a level change still surfaces as
  // a clearly-labeled local toast, so testing/demoing the threshold logic
  // itself doesn't require guessing whether it fired.
  const dispatchKey = queryKey.join(':');
  useEffect(() => {
    if (!query.data) return;
    logger.debug('Live prediction from API:', query.data);

    const currentKey = query.data.alert_level;
    const lastKey = lastDispatchedAlertKeyByKey.get(dispatchKey) ?? null;
    const changed = lastKey !== null && lastKey !== currentKey;
    lastDispatchedAlertKeyByKey.set(dispatchKey, currentKey);

    if (isMock) {
      if (changed) {
        const message = ALERT_MESSAGES[currentKey]?.(Math.round((query.data.probability ?? 0) * 100))
          ?? `Alert level changed to ${currentKey}`;

        // Mock mode now dispatches through the exact same path poll-flood's
        // cron uses for a real level change: insert into `alerts`, which
        // on-alert-change picks up via DB webhook and fires real SMS + push
        // to every registered resident. `sent_by` is tagged so a mock-driven
        // row is always identifiable in the alert log / delivery status
        // panel after the fact — it is NOT a dry run.
        supabase.from('alerts')
          .insert({ type: currentKey, message, sent_by: 'AGOS Mock Test' })
          .then(({ error }) => {
            if (error) {
              logger.warn('Mock alert insert failed:', error.message);
              Swal.fire({
                title: 'Mock alert failed to dispatch',
                text: error.message,
                icon: 'error',
                background: '#0d1f3c', color: '#e2eaf5',
                confirmButtonColor: '#0ea5e9',
              });
              return;
            }
            Swal.fire({
              title: 'Mock alert dispatched',
              text: message,
              icon: 'info',
              background: '#0d1f3c', color: '#e2eaf5',
              confirmButtonColor: '#0ea5e9',
              timer: 6000, timerProgressBar: true,
              footer: 'Alert sent to residents.',
            });
          });
      }
      return;
    }

    saveSnapshot(query.data).catch(err =>
      logger.warn('Snapshot save error:', err.message)
    );
  }, [query.data, isMock, dispatchKey]);

  useEffect(() => {
    if (query.error) logger.error('API fetch error:', query.error.message);
  }, [query.error]);

  return {
    prediction: query.data ?? null,
    loading: query.isLoading,
    error: query.error?.message ?? null,
    refetch: query.refetch,
  };
}

// ── Mock-mode outlook test ───────────────────────────────────────────────
// Mirrors what the mock level-alert path above does: in mock mode ONLY, the
// forecast currently on screen is saved as a `source = 'mock'` row in
// forecast_snapshots, then check-forecast is run right away. That exercises
// the real outlook logic (NORMAL -> above-NORMAL within the 3-day window) on
// mock data. Live snapshots are written by poll-flood alone, never here.
//
// The first mock snapshot is stored as an already-checked baseline, so merely
// opening the dashboard in mock mode never fires an alert -- only a later
// change does. As with the mock level alerts, a triggered outlook is NOT a
// dry run: it goes through the webhook to real SMS + push.
const OUTLOOK_LOOKAHEAD_DAYS = 3;
let lastMockOutlookSig = null;

async function saveMockForecastSnapshot(forecast) {
  const upcoming = (forecast ?? []).slice(0, OUTLOOK_LOOKAHEAD_DAYS);
  if (upcoming.length === 0) return;

  const worst = upcoming.reduce((max, d) =>
    (d.flood_probability ?? 0) > (max.flood_probability ?? 0) ? d : max
  );
  const worstProbability = worst.flood_probability ?? 0;
  const worstDate = String(worst.date);

  // Several components can mount this hook; the signature (set before any
  // await) keeps them from all writing the same snapshot.
  const sig = `${worstDate}:${worstProbability}`;
  if (sig === lastMockOutlookSig) return;
  lastMockOutlookSig = sig;

  const { data: latest, error: readError } = await supabase
    .from('forecast_snapshots')
    .select('worst_date, worst_probability')
    .eq('source', 'mock')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (readError) { logger.warn('Mock forecast snapshot read failed:', readError.message); return; }

  if (latest && latest.worst_date === worstDate && Number(latest.worst_probability) === Number(worstProbability)) return;

  const { error } = await supabase.from('forecast_snapshots').insert({
    source: 'mock',
    days: upcoming.map(d => ({ date: d.date, flood_probability: d.flood_probability ?? 0 })),
    worst_date: worstDate,
    worst_probability: worstProbability,
    checked: !latest, // first mock snapshot = baseline, not an alert trigger
  });
  if (error) { logger.warn('Mock forecast snapshot save failed:', error.message); return; }
  if (!latest) return;

  const { data: result, error: invokeError } = await supabase.functions.invoke('check-forecast');
  if (invokeError) { logger.warn('check-forecast invoke failed:', invokeError.message); return; }
  logger.debug('check-forecast result:', result);

  if (typeof result === 'string' && result.includes('mock: OUTLOOK alert created')) {
    Swal.fire({
      title: 'Mock outlook alert dispatched',
      text: 'The mock forecast crossed from NORMAL to above NORMAL within 3 days.',
      icon: 'info',
      background: '#0d1f3c', color: '#e2eaf5',
      confirmButtonColor: '#0ea5e9',
      timer: 6000, timerProgressBar: true,
      footer: 'Alert sent to residents.',
    });
  }
}

// ── 14-day forecast (single source of truth = the selected model) ───────
// modelKey selects which trained algorithm ('gru' | 'lstm' | 'cnn') the
// backend runs. Defaults to 'gru' to match the backend's DEFAULT_MODEL_KEY.
export function useFloodForecast14Day(modelKey = 'gru') {
  const { apiBaseUrl, isMock } = useDataSource();

  const query = useQuery({
    queryKey: ['forecast14', isMock ? 'mock' : 'live', modelKey],
    queryFn: async () => {
      const data = await fetchModelJson(apiBaseUrl, `/api/forecast-flood/${modelKey}`, !isMock);
      return { forecast: data.forecast ?? [], meta: data.meta ?? null };
    },
    refetchInterval: POLL_INTERVAL_MS,
  });

  useEffect(() => {
    if (query.error) logger.error('14-day forecast fetch error:', query.error.message);
  }, [query.error]);

  useEffect(() => {
    if (!isMock || !query.data?.forecast?.length) return;
    saveMockForecastSnapshot(query.data.forecast).catch(err =>
      logger.warn('Mock forecast snapshot error:', err.message)
    );
  }, [query.data, isMock]);

  return {
    forecast14: query.data?.forecast ?? [],
    meta14: query.data?.meta ?? null,
    loading14: query.isLoading,
    error14: query.error?.message ?? null,
    refetch14: query.refetch,
  };
}

// ── All 3 algorithms side by side (AnalyticsPage benchmark panel) ───────
// Hits /api/forecast-flood/compare, which runs every available algorithm
// against the SAME input windows and returns each one's real 14-day
// forecast + reliability metrics, plus a day-by-day ensemble mean and
// agreement flag. This is the genuine multi-algorithm data — nothing here
// is simulated or offset-approximated on the frontend.
export function useModelComparison() {
  const { apiBaseUrl, isMock } = useDataSource();

  const query = useQuery({
    queryKey: ['forecastCompare', isMock ? 'mock' : 'live'],
    queryFn: async () => {
      const data = await fetchModelJson(apiBaseUrl, '/api/forecast-flood/compare', !isMock);
      return {
        perModel:       data.per_model ?? {},
        comparisonDays: data.comparison ?? [],
        modelsCompared: data.models_compared ?? [],
        defaultModel:   data.default_model ?? 'gru',
      };
    },
    refetchInterval: POLL_INTERVAL_MS,
  });

  useEffect(() => {
    if (query.error) logger.error('Model comparison fetch error:', query.error.message);
  }, [query.error]);

  return {
    perModel:       query.data?.perModel ?? {},
    comparisonDays: query.data?.comparisonDays ?? [],
    modelsCompared: query.data?.modelsCompared ?? [],
    defaultModel:   query.data?.defaultModel ?? 'gru',
    loadingCompare: query.isLoading,
    errorCompare:   query.error?.message ?? null,
    refetchCompare: query.refetch,
  };
}

// ── SHAP explanation (AnalyticsPage transparency panel) ──────────────────
// Hits /api/explain/{model}, which runs a genuine KernelSHAP computation
// against the live model (see AI_Model/app/models/explain.py) — real
// per-feature Shapley contributions to today's prediction, not a canned
// or client-side-approximated importance ranking. Deliberately NOT polled
// like the hooks above: it's a heavier on-demand computation, fetched once
// per page view / model switch / manual refresh instead of every 30s.
export function useModelExplanation(modelKey = 'gru') {
  const { apiBaseUrl } = useDataSource();
  const [explanation, setExplanation] = useState(null);
  const [loadingExplain, setLoadingExplain] = useState(true);
  const [errorExplain, setErrorExplain]     = useState(null);

  const fetchExplanation = useCallback(async () => {
    setLoadingExplain(true);
    try {
      const data = await fetchModelJson(apiBaseUrl, `/api/explain/${modelKey}`);
      if (data.status !== 'success') throw new Error(data.message || 'Explanation unavailable');
      setExplanation(data);
      setErrorExplain(null);
    } catch (err) {
      logger.error('SHAP explanation fetch error:', err.message);
      setErrorExplain(err.message || 'Could not compute SHAP explanation');
      setExplanation(null);
    } finally {
      setLoadingExplain(false);
    }
  }, [apiBaseUrl, modelKey]);

  useEffect(() => {
    fetchExplanation();
  }, [fetchExplanation]);

  return { explanation, loadingExplain, errorExplain, refetchExplanation: fetchExplanation };
}