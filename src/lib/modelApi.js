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

  const { error: dbError } = await supabase.from('alerts').insert({
    type:    alertKey,
    message,
    sent_by: 'AGOS Auto-Alert',
  });
  if (dbError) console.warn('Alert log failed:', dbError.message);

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

export function useModelPrediction() {
  const [prediction, setPrediction] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchLatest = useCallback(async () => {
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
        setPrediction(normalized);
        setError(null);

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
  }, []);

  useEffect(() => {
    fetchLatest();
    const id = setInterval(fetchLatest, 30_000);
    return () => clearInterval(id);
  }, [fetchLatest]);

  return { prediction, loading, error, refetch: fetchLatest };
}