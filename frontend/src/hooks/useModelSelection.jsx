import { createContext, useContext, useState, useEffect } from 'react';

const ModelSelectionContext = createContext(null);

const STORAGE_KEY = 'agos-model-key';

// The three trained flood-forecast algorithms exposed by the backend
// (app/config/settings.py MODEL_REGISTRY). Every algorithm is trained
// against the exact same scaler / feature contract, so they're directly
// swappable at the UI level — this is the single source of truth for
// their ids/labels/colors so Topbar, Dashboard, and AnalyticsPage never
// drift out of sync with each other or with the backend's registry keys.
export const MODEL_OPTIONS = [
  { key: 'gru',  label: 'GRU',  fullLabel: 'GRU Encoder-Decoder',  color: '#0ea5e9' },
  { key: 'lstm', label: 'LSTM', fullLabel: 'LSTM Encoder-Decoder', color: '#fbbf24' },
  { key: 'cnn',  label: 'CNN',  fullLabel: 'CNN Encoder-Decoder',  color: '#a78bfa' },
];

const VALID_KEYS = MODEL_OPTIONS.map((m) => m.key);

// Matches the backend's DEFAULT_MODEL_KEY default (FLOOD_DEFAULT_MODEL
// env var, "gru" unless overridden).
const DEFAULT_MODEL_KEY = 'gru';

export function ModelSelectionProvider({ children }) {
  const [modelKey, setModelKeyState] = useState(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return VALID_KEYS.includes(stored) ? stored : DEFAULT_MODEL_KEY;
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, modelKey);
  }, [modelKey]);

  const setModelKey = (key) => {
    if (VALID_KEYS.includes(key)) setModelKeyState(key);
  };

  const cycleModelKey = () => {
    setModelKeyState((prev) => {
      const idx = VALID_KEYS.indexOf(prev);
      return VALID_KEYS[(idx + 1) % VALID_KEYS.length];
    });
  };

  const activeModel = MODEL_OPTIONS.find((m) => m.key === modelKey) ?? MODEL_OPTIONS[0];

  const value = {
    modelKey,                 // 'gru' | 'lstm' | 'cnn'
    activeModel,               // full {key,label,fullLabel,color} for the active one
    options: MODEL_OPTIONS,
    setModelKey,
    cycleModelKey,
  };

  return (
    <ModelSelectionContext.Provider value={value}>
      {children}
    </ModelSelectionContext.Provider>
  );
}

export const useModelSelection = () => useContext(ModelSelectionContext);
