import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from './supabaseClient';

const MODEL_URL = 'https://flood-api-553657561163.asia-southeast1.run.app/api/predict-flood';
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

// SMS messages per alert level
const ALERT_MESSAGES = {
  ADVISORY: 'AGOS Alert - Barangay Triangulo: ADVISORY level reached. Elevated water levels detected. Residents near waterways should stay alert and monitor updates.',
  WARNING:  'AGOS Alert - Barangay Triangulo: WARNING level reached. Significant flooding expected. Prepare for possible evacuation. Secure valuables now.',
  CRITICAL: 'AGOS Alert - Barangay Triangulo: CRITICAL level reached. Severe flooding imminent. EVACUATE IMMEDIATELY to your designated evacuation center.',
  NORMAL:   'AGOS Alert - Barangay Triangulo: Situation has returned to NORMAL. Flood risk has subsided. Continue monitoring for updates.',
};

async function sendAlertSms(alertKey) {
  const message = ALERT_MESSAGES[alertKey];
  if (!message) return;

  console.log(`📲 Alert level changed to ${alertKey} — sending SMS...`);

  // Log to alerts table
  const { error: dbError } = await supabase.from('alerts').insert({
    type:     alertKey,
    message,
    sent_by:  'AGOS Auto-Alert',
  });
  if (dbError) console.warn('Alert log failed:', dbError.message);

  // Trigger SMS via Edge Function
  const { error: smsError } = await supabase.functions.invoke('send-alert', {
    body: { message, type: alertKey },
  });
  if (smsError) console.warn('SMS dispatch failed:', smsError.message);
  else console.log(`✅ SMS dispatched for ${alertKey}`);
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

export function useModelPrediction({ pollInterval = POLL_INTERVAL_MS } = {}) {
  const [prediction, setPrediction] = useState(null);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);

  // Track previous alert level to detect changes
  // Initialized to null so first poll never triggers SMS
  const prevAlertRef = useRef(null);

  const fetchPrediction = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch(MODEL_URL);
      if (!res.ok) throw new Error(`Server responded ${res.status}`);
      const data = await res.json();

      const currentAlert = data.alert_level; // e.g. "NORMAL", "ADVISORY"

      // Fire SMS only when alert level actually changes (skip first load)
      if (prevAlertRef.current !== null && prevAlertRef.current !== currentAlert) {
        await sendAlertSms(currentAlert);
      }

      prevAlertRef.current = currentAlert;
      setPrediction(data);
      await saveSnapshot(data);
    } catch (err) {
      setError(err.message || 'Model backend unreachable');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPrediction();
    const id = setInterval(fetchPrediction, pollInterval);
    return () => clearInterval(id);
  }, [fetchPrediction, pollInterval]);

  return { prediction, loading, error, refetch: fetchPrediction };
}