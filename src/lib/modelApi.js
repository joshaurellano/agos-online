import { useState, useEffect, useCallback } from 'react';
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
    logger.warn(`⚠️ Primary model API unreachable/erroring (${apiBaseUrl}${path}): ${err.message} — trying backup`);
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

  logger.debug(`📲 Alert level changed to ${alertKey} — dispatching alert...`);

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
  const BASELINE_LEVEL = 1.4;
  const RISE_RATE      = 0.045;
  const rainfall       = data?.live_metrics?.rainfall_mm ?? 0;
  const waterLevel     = parseFloat((BASELINE_LEVEL + rainfall * RISE_RATE).toFixed(2));

  const { error } = await supabase.from('flood_snapshots').insert({
    alert_level:        alertLevelFromKey(data.alert_level),
    alert_key:          data.alert_level,
    probability:        data.probability,
    rainfall_mm:        rainfall,
    humidity:           data?.live_metrics?.humidity  ?? null,
    wind_signal:        data?.live_metrics?.wind_signal ?? null,
    water_level:        waterLevel,
    status:             data.status ?? null,
  });

  if (error) logger.warn('Snapshot save failed:', error.message);
  else logger.debug('💾 Snapshot saved to Supabase');
}

let lastDispatchedAlertKey = null;

// ── Day-1 prediction (KPI cards, alerts, snapshot logging) ──────────────
export function useModelPrediction() {
  const { apiBaseUrl, isMock } = useDataSource();
  const [prediction, setPrediction] = useState(null);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);

  const fetchLatest = useCallback(async () => {
    try {
      const data = await fetchModelJson(apiBaseUrl, '/api/predict-flood', !isMock);
      if (data.status !== 'success') throw new Error(data.message || 'Prediction unavailable');

      const probability = data.probability ?? 0;
      // Alert level now comes straight from the backend (/api/predict-flood),
      // which applies the same 4-tier probability_to_alert_level() bucketing
      // used across the whole API. Do not recompute it here — that used to
      // cause the frontend's alert to disagree with the backend's.
      const alertKey = data.alert_level ?? probabilityToAlertKey(probability);

      const normalized = {
        alert_level:        alertKey,
        probability,
        status:             data.status ?? null,
        live_metrics: {
          rainfall_mm: data?.live_metrics?.rainfall_mm ?? 0,
          humidity:    data?.live_metrics?.humidity    ?? null,
          wind_signal: data?.live_metrics?.wind_signal ?? 0,
        },
      };

      logger.debug('🌐 Live prediction from API:', normalized);
      setPrediction(normalized);
      setError(null);

      const currentKey = normalized.alert_level;
      if (lastDispatchedAlertKey !== null && lastDispatchedAlertKey !== currentKey) {
        dispatchAutoAlert(currentKey).catch(err =>
          logger.error('Alert dispatch failed:', err.message)
        );
      }
      lastDispatchedAlertKey = currentKey;

      saveSnapshot(normalized).catch(err =>
        logger.warn('Snapshot save error:', err.message)
      );

    } catch (err) {
      logger.error('❌ API fetch error:', err.message);
      setError(err.message || 'Could not load prediction');
    } finally {
      setLoading(false);
    }
  }, [apiBaseUrl, isMock]);

  useEffect(() => {
    setLoading(true);
    fetchLatest();
    const id = setInterval(fetchLatest, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [fetchLatest]);

  return { prediction, loading, error, refetch: fetchLatest };
}

// ── NEW: 14-day forecast (single source of truth = the model) ───────────
export function useFloodForecast14Day() {
  const { apiBaseUrl, isMock } = useDataSource();
  const [forecast14, setForecast14] = useState([]);
  const [meta14, setMeta14]         = useState(null);
  const [loading14, setLoading14]   = useState(true);
  const [error14, setError14]       = useState(null);

  const fetchForecast14 = useCallback(async () => {
    try {
      const data = await fetchModelJson(apiBaseUrl, '/api/forecast-flood', !isMock);
      if (data.status !== 'success') throw new Error(data.message || 'Forecast unavailable');

      setForecast14(data.forecast ?? []);
      setMeta14(data.meta ?? null);
      setError14(null);
    } catch (err) {
      logger.error('14-day forecast fetch error:', err.message);
      setError14(err.message || 'Could not load 14-day forecast');
    } finally {
      setLoading14(false);
    }
  }, [apiBaseUrl, isMock]);

  useEffect(() => {
    setLoading14(true);
    fetchForecast14();
    const id = setInterval(fetchForecast14, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [fetchForecast14]);

  return { forecast14, meta14, loading14, error14, refetch14: fetchForecast14 };
}