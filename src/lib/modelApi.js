import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';

const MODEL_URL = 'https://flood-prediction-api-553657561163.asia-southeast1.run.app/api/predict-flood';
const POLL_INTERVAL_MS = 30_000;

export function alertLevelToKey(alert_level) {
  switch (alert_level) {
    case 3: return 'CRITICAL';
    case 2: return 'WARNING';
    case 1: return 'ADVISORY';
    default: return 'NORMAL';
  }
}

async function saveSnapshot(data) {
  const BASELINE_LEVEL = 1.4;
  const RISE_RATE      = 0.045;
  const rainfall       = data?.live_metrics?.rainfall_mm ?? 0;
  const waterLevel     = parseFloat((BASELINE_LEVEL + rainfall * RISE_RATE).toFixed(2));

  const { error } = await supabase.from('flood_snapshots').insert({
    alert_level:  data.alert_level,
    alert_key:    alertLevelToKey(data.alert_level),
    probability:  data.probability,
    rainfall_mm:  rainfall,
    humidity:     data?.live_metrics?.humidity ?? null,
    wind_signal:  data?.live_metrics?.wind_signal ?? null,
    water_level:  waterLevel,
    status:       data.status ?? null,
  });

  if (error) console.warn('Snapshot save failed:', error.message);
}

export function useModelPrediction({ pollInterval = POLL_INTERVAL_MS } = {}) {
  const [prediction, setPrediction] = useState(null);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);

  const fetchPrediction = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch(MODEL_URL);
      if (!res.ok) throw new Error(`Server responded ${res.status}`);
      const data = await res.json();
      setPrediction(data);
      await saveSnapshot(data);       // ← persist every poll
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