import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from './supabaseClient';
import { useDataSource } from '../hooks/useDataSource';

const POLL_INTERVAL_MS = 30_000;

export function alertLevelToKey(alert_level) {
  switch (alert_level) {
    case 3: return 'CRITICAL';
    case 2: return 'WARNING';
    case 1: return 'ADVISORY';
    default: return 'NORMAL';
  }
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
  ADVISORY: 'ADVISORY level reached. Elevated water levels possible within the next 1-3 hours. Stay alert and monitor updates.',
  WARNING:  'WARNING level reached. Significant flooding expected within the next 1-3 hours. Prepare for possible evacuation. Secure valuables now.',
  CRITICAL: 'CRITICAL level reached. Severe flooding imminent — possible within the next 1-3 hours. EVACUATE IMMEDIATELY to your designated evacuation center.',
  NORMAL:   'Situation has returned to NORMAL. Flood risk has subsided. Continue monitoring for updates.',
};

const FCM_TITLES = {
  ADVISORY: '🟡 ADVISORY — Barangay Triangulo',
  WARNING:  '🟠 WARNING — Barangay Triangulo',
  CRITICAL: '🔴 EVACUATION ALERT — Barangay Triangulo',
  NORMAL:   '🟢 ALL CLEAR — Barangay Triangulo',
};

// Fires whenever the model's alert level changes (in either live or mock mode):
// 1. Logs the alert in Supabase (drives the Alerts page + realtime feed)
// 2. Dispatches SMS via the 'send-alert' edge function
// 3. Dispatches a push notification via the 'send-push-notification' edge function
async function dispatchAutoAlert(alertKey) {
  const message = ALERT_MESSAGES[alertKey];
  if (!message) return;

  console.log(`📲 Alert level changed to ${alertKey} — dispatching alert (DB log + SMS + push)...`);

  // 1. Log the alert
  const { error: dbError } = await supabase.from('alerts').insert({
    type:    alertKey,
    message,
    sent_by: 'AGOS Auto-Alert',
  });
  if (dbError) console.warn('Alert log failed:', dbError.message);
  else console.log(`✅ Alert logged for ${alertKey}`);

  // 2. SMS dispatch
  const { data: smsData, error: smsError } = await supabase.functions.invoke('send-alert', {
    body: { message, type: alertKey },
  });
  if (smsError) console.warn('SMS dispatch failed:', smsError.message);
  else console.log(`✅ SMS dispatched for ${alertKey}`, smsData);

  // 3. FCM push notification
  const { error: fcmError } = await supabase.functions.invoke('send-push-notification', {
    body: {
      title: FCM_TITLES[alertKey] ?? `AGOS Alert — ${alertKey}`,
      body:  message,
      level: alertKey,
      topic: 'flood_alerts',
    },
  });
  if (fcmError) console.warn('Push notification dispatch failed:', fcmError.message);
  else console.log(`✅ Push notification dispatched for ${alertKey}`);
}

async function saveSnapshot(data) {
  const BASELINE_LEVEL = 1.4;
  const RISE_RATE      = 0.045;
  const rainfall       = data?.live_metrics?.rainfall_mm ?? 0;
  const waterLevel     = parseFloat((BASELINE_LEVEL + rainfall * RISE_RATE).toFixed(2));

  const { error } = await supabase.from('flood_snapshots').insert({
    alert_level: alertLevelFromKey(data.alert_level),
    alert_key:   data.alert_level,
    probability: data.probability,
    rainfall_mm: rainfall,
    humidity:    data?.live_metrics?.humidity ?? null,
    wind_signal: data?.live_metrics?.wind_signal ?? null,
    water_level: waterLevel,
    status:      data.status ?? null,
  });

  if (error) console.warn('Snapshot save failed:', error.message);
}

// Module-level (persists across hook remounts / page navigations within the
// same session) so an alert dispatch fires exactly once per genuine level
// change, regardless of how many pages mount useModelPrediction.
let lastDispatchedAlertKey = null;

export function useModelPrediction() {
  const { apiBaseUrl, isMock } = useDataSource();
  const [prediction, setPrediction] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const handleNewPrediction = useCallback((normalized) => {
    setPrediction(normalized);
    setError(null);

    const currentKey = normalized.alert_level;
    if (lastDispatchedAlertKey !== null && lastDispatchedAlertKey !== currentKey) {
      dispatchAutoAlert(currentKey).catch(err =>
        console.error('Alert dispatch failed:', err.message)
      );
    }
    lastDispatchedAlertKey = currentKey;
  }, []);

  const fetchFromMockApi = useCallback(async () => {
    try {
      const res = await fetch(`${apiBaseUrl}/api/predict-flood`);
      if (!res.ok) throw new Error(`Mock API error: ${res.status}`);
      const data = await res.json();

      const normalized = {
        alert_level:        data.alert_level ?? 'NORMAL',
        probability:        data.probability ?? 0,
        status:             data.status ?? null,
        lead_time_estimate: data.lead_time_estimate ?? null,
        live_metrics: {
          rainfall_mm: data?.live_metrics?.rainfall_mm ?? 0,
          humidity:    data?.live_metrics?.humidity    ?? null,
          wind_signal: data?.live_metrics?.wind_signal ?? 0,
        },
      };

      console.log('🧪 Prediction loaded from MOCK API:', normalized);
      handleNewPrediction(normalized);
    } catch (err) {
      console.error('❌ Mock API fetch error:', err.message);
      setError(err.message || 'Could not load mock prediction');
    } finally {
      setLoading(false);
    }
  }, [apiBaseUrl, handleNewPrediction]);

  const fetchFromSupabase = useCallback(async () => {
    try {
      const { data: raw, error: dbError } = await supabase
        .from('flood_snapshots')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (dbError) throw new Error(dbError.message);

      if (raw) {
        console.log('📦 Latest snapshot from Supabase:', {
          id:          raw.id,
          alert_key:   raw.alert_key,
          probability: raw.probability,
          rainfall_mm: raw.rainfall_mm,
          created_at:  raw.created_at,
        });

        const normalized = {
          alert_level:        raw.alert_key ?? 'NORMAL',
          probability:        raw.probability ?? 0,
          status:             raw.status ?? null,
          lead_time_estimate: raw.lead_time_estimate ?? null,
          live_metrics: {
            rainfall_mm: raw.rainfall_mm ?? 0,
            humidity:    raw.humidity    ?? null,
            wind_signal: raw.wind_signal ?? 0,
          },
        };
        handleNewPrediction(normalized);

        console.log('✅ Prediction state updated at', new Date().toLocaleTimeString());
      } else {
        console.warn('⚠️ No snapshots found in flood_snapshots table');
      }
    } catch (err) {
      console.error('❌ Snapshot fetch error:', err.message);
      setError(err.message || 'Could not load snapshot');
    } finally {
      setLoading(false);
    }
  }, [handleNewPrediction]);

  const fetchLatest = useCallback(() => {
    return isMock ? fetchFromMockApi() : fetchFromSupabase();
  }, [isMock, fetchFromMockApi, fetchFromSupabase]);

  useEffect(() => {
    setLoading(true);
    fetchLatest();
    const id = setInterval(fetchLatest, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [fetchLatest]);

  return { prediction, loading, error, refetch: fetchLatest };
}