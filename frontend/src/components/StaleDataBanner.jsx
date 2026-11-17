import { useEffect, useState } from 'react';
import { LuTriangleAlert, LuRefreshCw } from 'react-icons/lu';
import { useLanguage } from '../hooks/useLanguage';

// Shown when the live reading can no longer be trusted to be current.
//
// The model is polled every 30 s, so a reading older than a few minutes means
// polling is failing. React Query keeps showing the last good data in that
// case, which looks fine on screen but may be hours old during a flood. This
// banner puts the age of the reading in plain words, tells people what to do
// instead, and lets them retry.
//
// It stays hidden while data is fresh, so it never adds noise on a normal day.

const STALE_AFTER_MIN = 10;

const fill = (str, vars) => String(str).replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');

export default function StaleDataBanner({ updatedAt, hasData, hasError, onRetry }) {
  const { t } = useLanguage();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const ageMin = updatedAt ? Math.floor((now - updatedAt) / 60_000) : null;
  const isStale = hasData && ageMin != null && ageMin >= STALE_AFTER_MIN;
  const noData = !hasData && hasError;
  if (!isStale && !noData) return null;

  const headline = noData
    ? t('stale.noData')
    : ageMin >= 60
      ? fill(t('stale.hours'), { h: Math.floor(ageMin / 60) })
      : fill(t('stale.minutes'), { n: ageMin });
  const body = noData ? t('stale.noDataBody') : t('stale.body');

  return (
    <div className="stale-banner" role="status">
      <LuTriangleAlert size={20} aria-hidden="true" className="stale-banner-icon" />
      <div className="stale-banner-copy">
        <strong>{headline}</strong>
        <span>{body}</span>
      </div>
      {onRetry && (
        <button type="button" className="btn btn-ghost stale-banner-retry" onClick={onRetry}>
          <LuRefreshCw size={15} aria-hidden="true" /> {t('stale.retry')}
        </button>
      )}
    </div>
  );
}
