import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

// Accessibility preferences for AGOS.
//
// Stored per-device in localStorage (same approach as theme / language /
// model selection) and applied as classes + a font-size on <html>, so the
// CSS in index.css ("ACCESSIBILITY" section) does the actual work and every
// page picks the settings up without touching its own styles.

const STORAGE_KEY = 'agos-a11y';

export const TEXT_SCALES = [
  { value: 100, label: 'Default' },
  { value: 115, label: 'Large' },
  { value: 130, label: 'Larger' },
  { value: 150, label: 'Largest' },
];

const READABLE_FONT_HREF =
  'https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&display=swap';
const READABLE_FONT_LINK_ID = 'agos-a11y-readable-font';

const mq = (query) =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(query).matches
    : false;

// Defaults follow the device's own accessibility settings where the browser
// exposes them, so someone who already asked their OS for less motion or
// more contrast doesn't have to find the switch here first.
export function getDefaultSettings() {
  return {
    textScale: 100,
    highContrast: mq('(prefers-contrast: more)'),
    reduceMotion: mq('(prefers-reduced-motion: reduce)'),
    readableFont: false,
    textSpacing: false,
    underlineLinks: false,
    strongFocus: false,
    largeTargets: false,
    announceAlerts: true,
  };
}

function loadSettings() {
  const defaults = getDefaultSettings();
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    const next = { ...defaults };
    for (const key of Object.keys(defaults)) {
      if (key === 'textScale') {
        if (TEXT_SCALES.some((s) => s.value === stored.textScale)) next.textScale = stored.textScale;
      } else if (typeof stored[key] === 'boolean') {
        next[key] = stored[key];
      }
    }
    return next;
  } catch {
    return defaults;
  }
}

const AccessibilityContext = createContext(null);

export function AccessibilityProvider({ children }) {
  const [settings, setSettings] = useState(loadSettings);

  useEffect(() => {
    const root = document.documentElement;

    root.style.fontSize = settings.textScale === 100 ? '' : `${(16 * settings.textScale) / 100}px`;

    root.classList.toggle('a11y-contrast', settings.highContrast);
    root.classList.toggle('a11y-reduce-motion', settings.reduceMotion);
    root.classList.toggle('a11y-readable', settings.readableFont);
    root.classList.toggle('a11y-spacing', settings.textSpacing);
    root.classList.toggle('a11y-underline', settings.underlineLinks);
    root.classList.toggle('a11y-focus', settings.strongFocus);
    root.classList.toggle('a11y-targets', settings.largeTargets);

    // Load the readable typeface only for people who turn it on.
    const existing = document.getElementById(READABLE_FONT_LINK_ID);
    if (settings.readableFont && !existing) {
      const link = document.createElement('link');
      link.id = READABLE_FONT_LINK_ID;
      link.rel = 'stylesheet';
      link.href = READABLE_FONT_HREF;
      document.head.appendChild(link);
    }

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // Storage can be blocked (private mode); the settings still apply
      // for this session, they just won't be remembered.
    }
  }, [settings]);

  const updateSetting = useCallback((key, value) => {
    setSettings((prev) => (key in prev ? { ...prev, [key]: value } : prev));
  }, []);

  const resetSettings = useCallback(() => setSettings(getDefaultSettings()), []);

  const isDefault = useMemo(
    () => JSON.stringify(settings) === JSON.stringify(getDefaultSettings()),
    [settings]
  );

  const value = useMemo(
    () => ({ settings, ...settings, updateSetting, resetSettings, isDefault }),
    [settings, updateSetting, resetSettings, isDefault]
  );

  return <AccessibilityContext.Provider value={value}>{children}</AccessibilityContext.Provider>;
}

export const useAccessibility = () => useContext(AccessibilityContext);
