import { useEffect, useRef, useState } from 'react';
import { LuBellRing, LuX, LuTrendingUp, LuTrendingDown } from 'react-icons/lu';
import { useLanguage } from '../hooks/useLanguage';
import { ALERT_LEVELS } from '../data/mockData';

// A visible "moment" when the alert level changes while someone is looking at
// the app. Screen-reader users already get AlertAnnouncer; this is the sighted
// counterpart. Silent on first load, only reacts to a real change.

const RANK = { NORMAL: 0, ADVISORY: 1, WARNING: 2, CRITICAL: 3 };
const SHOW_MS = 9000;

export default function AlertChangeToast({ alertLevel, ready = true, resetKey = null }) {
  const { t } = useLanguage();
  const previous = useRef(null);
  const lastKey = useRef(resetKey);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    // Wait for the first real prediction (the default level is not data), and
    // start over when the user switches model: its levels are not a "change".
    if (!ready || !(alertLevel in RANK)) return undefined;
    if (lastKey.current !== resetKey) { lastKey.current = resetKey; previous.current = null; }
    const prev = previous.current;
    previous.current = alertLevel;
    if (prev === null || prev === alertLevel) return undefined;
    setToast({ level: alertLevel, rising: (RANK[alertLevel] ?? 0) > (RANK[prev] ?? 0), id: Date.now() });
    return undefined;
  }, [alertLevel, ready, resetKey]);

  // Dev-only: run agosPreviewToast('CRITICAL') in the browser console to see it.
  useEffect(() => {
    if (!import.meta.env.DEV) return undefined;
    window.agosPreviewToast = (level = 'WARNING') => setToast({ level, rising: true, id: Date.now() });
    return () => { delete window.agosPreviewToast; };
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const id = setTimeout(() => setToast(null), SHOW_MS);
    return () => clearTimeout(id);
  }, [toast]);

  if (!toast) return null;
  const color = ALERT_LEVELS[toast.level]?.color ?? '#38bdf8';
  const Icon = toast.rising ? LuTrendingUp : LuTrendingDown;
  return (
    <div className="alert-toast" key={toast.id} style={{ '--lvl': color }} role="presentation">
      <span className="alert-toast-icon" aria-hidden="true"><LuBellRing size={20} /></span>
      <div className="alert-toast-text">
        <div className="alert-toast-title">
          {t('alertChanged')} <strong>{t(`alertLevel.${toast.level}.name`)}</strong>
          <Icon size={15} aria-hidden="true" />
        </div>
        <div className="alert-toast-sub">{t(`alertLevel.${toast.level}.stance`)}</div>
      </div>
      <button type="button" className="alert-toast-close" onClick={() => setToast(null)} aria-label="Dismiss">
        <LuX size={16} aria-hidden="true" />
      </button>
    </div>
  );
}
