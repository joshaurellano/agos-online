// src/lib/modelApi.js
// Shared hook to fetch live prediction from the Flask/LSTM model backend.
// Make sure app.py is running: python app.py  (listens on http://localhost:5000)

import { useState, useEffect, useCallback } from 'react';

const MODEL_URL = 'http://localhost:5000/predict_live';
const POLL_INTERVAL_MS = 30_000; // re-fetch every 30 seconds

/**
 * Returns { prediction, loading, error, refetch }
 *
 * prediction shape:
 * {
 *   probability: number,       // 0.0 – 1.0
 *   alert_level: 0 | 1 | 2,
 *   status: string,
 *   location: string,
 *   live_metrics: {
 *     rainfall_mm: number,
 *     wind_signal: number,
 *     humidity: number,
 *   },
 *   lead_time_estimate: string,
 * }
 */
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
    } catch (err) {
      setError(err.message || 'Model backend unreachable');
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch + polling
  useEffect(() => {
    fetchPrediction();
    const id = setInterval(fetchPrediction, pollInterval);
    return () => clearInterval(id);
  }, [fetchPrediction, pollInterval]);

  return { prediction, loading, error, refetch: fetchPrediction };
}

/**
 * Map the model's alert_level (0/1/2/3) to the app's ALERT_LEVELS keys.
 * 0 = NORMAL, 1 = ADVISORY, 2 = WARNING, 3 = CRITICAL
 */
export function alertLevelToKey(alert_level) {
  switch (alert_level) {
    case 3: return 'CRITICAL';
    case 2: return 'WARNING';
    case 1: return 'ADVISORY';
    default: return 'NORMAL';
  }
}