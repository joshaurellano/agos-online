import { useEffect } from 'react';
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

const ALERT_MESSAGES = {
  ADVISORY: () => `Elevated flood risk detected. Stay alert and prepare your emergency go-bags.`,
  WARNING:  () => `WARNING level reached. Significant flooding expected. Move valuables to higher ground and prepare for possible evacuation.`,
  CRITICAL: () => `CRITICAL level reached. Severe flooding imminent. EVACUATE IMMEDIATELY to your designated evacuation center.`,
  NORMAL:   () => `Situation has returned to NORMAL. Flood risk has subsided. Continue monitoring for updates.`,
};

// Push notification titles now live solely in on-alert-change/index.ts —
// that's the only place left that ever calls send-push-notification, so
// keeping a second copy here would just risk drifting out of sync again.

async function dispatchAutoAlert(alertKey) {
  const message = ALERT_MESSAGES[alertKey]?.();
  if (!message) return;

  logger.debug(`Alert level changed to ${alertKey} — dispatching alert...`);

  // SMS + push are dispatched automatically by the on-alert-change DB
  // webhook whenever a row lands in `alerts` — do not call send-alert /
  // send-push-notification here too. (This was the second, differently
  // titled push showing up alongside the one from on-alert-change.)
  const { error: dbError } = await supabase.from('alerts').insert({
    type:    alertKey,
    message,
    sent_by: 'AGOS Auto-Alert',
  });
  if (dbError) logger.warn('Alert log failed:', dbError.message);
}

// Saves snapshot to Supabase for the FloodForecastChart
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

// Tracks the last alert key we dispatched, per data-source, so switching
// between live and mock (or, in future, calling this hook for more than
// one model at once) can't cause one query's alert transition to suppress
// or spuriously trigger another's. Keyed rather than a single module-level
// value for exactly that reason.
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

  // Side effects — auto-alert dispatch + snapshot logging — run whenever a
  // fresh prediction comes back, mirroring the old fetchLatest() behavior.
  //
  // isMock guards both real calls: dispatchAutoAlert() writes a row to the
  // real `alerts` table, which the on-alert-change DB webhook turns into
  // actual SMS/push notifications to residents, and which AlertsLogPage
  // reads back out as PUBLIC alert history. Without this guard, an admin
  // flipping to "Mock Data" mid-demo could broadcast a real false alarm,
  // and leave a fake entry in residents' alert history, the moment the
  // mock data's alert level differs from the last live one. Snapshot
  // logging is skipped for the same reason: mock readings have no business
  // in the real flood_snapshots history.
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
        Swal.fire({
          title: 'Simulated alert (mock data)',
          text: ALERT_MESSAGES[currentKey]?.() ?? `Alert level changed to ${currentKey}`,
          icon: 'info',
          background: '#0d1f3c', color: '#e2eaf5',
          confirmButtonColor: '#0ea5e9',
          timer: 6000, timerProgressBar: true,
          footer: 'No SMS/push was sent and nothing was written to the alert log — mock data never touches either.',
        });
      }
      return;
    }

    if (changed) {
      dispatchAutoAlert(currentKey).catch(err =>
        logger.error('Alert dispatch failed:', err.message)
      );
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
