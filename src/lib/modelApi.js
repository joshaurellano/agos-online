import { useState, useEffect, useCallback } from 'react';
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
  ADVISORY: (leadTime) => `AGOS Alert - Barangay Triangulo: ADVISORY level reached. Elevated flood risk detected. Estimated time: ${leadTime ?? '> 3 hrs'}. Stay alert and prepare your emergency go-bags.`,
  WARNING:  (leadTime) => `AGOS Alert - Barangay Triangulo: WARNING level reached. Significant flooding expected within ${leadTime ?? '2–3 hrs'}. Move valuables to higher ground and prepare for possible evacuation.`,
  CRITICAL: (leadTime) => `AGOS Alert - Barangay Triangulo: CRITICAL level reached. Severe flooding imminent within ${leadTime ?? '1–2 hrs'}. EVACUATE IMMEDIATELY to your designated evacuation center.`,
  NORMAL:   ()         => `AGOS Alert - Barangay Triangulo: Situation has returned to NORMAL. Flood risk has subsided. Continue monitoring for updates.`,
};

const FCM_TITLES = {
  ADVISORY: '🟡 ADVISORY — Barangay Triangulo',
  WARNING:  '🟠 WARNING — Barangay Triangulo',
  CRITICAL: '🔴 EVACUATION ALERT — Barangay Triangulo',
  NORMAL:   '🟢 ALL CLEAR — Barangay Triangulo',
};

async function dispatchAutoAlert(alertKey, leadTime) {
  const message = ALERT_MESSAGES[alertKey]?.(leadTime);
  if (!message) return;

  console.log(`📲 Alert level changed to ${alertKey} — dispatching alert...`);

  const { error: dbError } = await supabase.from('alerts').insert({
    type:    alertKey,
    message,
    sent_by: 'AGOS Auto-Alert',
  });
  if (dbError) console.warn('Alert log failed:', dbError.message);

  const { data: smsData, error: smsError } = await supabase.functions.invoke('send-alert', {
    body: { message, type: alertKey },
  });
  if (smsError) console.warn('SMS dispatch failed:', smsError.message);
  else console.log(`✅ SMS dispatched for ${alertKey}`, smsData);

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
    lead_time_estimate: data.lead_time_estimate ?? null,
  });

  if (error) console.warn('Snapshot save failed:', error.message);
  else console.log('💾 Snapshot saved to Supabase');
}

let lastDispatchedAlertKey = null;

export function useModelPrediction() {
  const { apiBaseUrl } = useDataSource();
  const [prediction, setPrediction] = useState(null);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);

  const fetchLatest = useCallback(async () => {
    try {
      const res = await fetch(`${apiBaseUrl}/api/predict-flood`);
      if (!res.ok) throw new Error(`API error: ${res.status}`);
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

      console.log('🌐 Live prediction from API:', normalized);
      setPrediction(normalized);
      setError(null);

      // Dispatch alert if level changed
      const currentKey = normalized.alert_level;
      if (lastDispatchedAlertKey !== null && lastDispatchedAlertKey !== currentKey) {
        dispatchAutoAlert(currentKey, normalized.lead_time_estimate).catch(err =>
          console.error('Alert dispatch failed:', err.message)
        );
      }
      
      lastDispatchedAlertKey = currentKey;

      // Save snapshot for FloodForecastChart (fire and forget)
      saveSnapshot(normalized).catch(err =>
        console.warn('Snapshot save error:', err.message)
      );

    } catch (err) {
      console.error('❌ API fetch error:', err.message);
      setError(err.message || 'Could not load prediction');
    } finally {
      setLoading(false);
    }
  }, [apiBaseUrl]);

  useEffect(() => {
    setLoading(true);
    fetchLatest();
    const id = setInterval(fetchLatest, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [fetchLatest]);

  return { prediction, loading, error, refetch: fetchLatest };
}