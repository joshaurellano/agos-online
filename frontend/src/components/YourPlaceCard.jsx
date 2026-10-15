import { useMemo, useState } from 'react';
import { LuMapPin, LuLocateFixed, LuNavigation, LuShare2, LuShieldCheck, LuEye, LuTriangleAlert, LuSiren, LuTrash2, LuInfo, LuCalendarClock, LuMap, LuCrosshair } from 'react-icons/lu';
import { personalTier, TIER_KEYS, firstLikelyDay } from '../lib/personalRisk';
import { formatDistanceKm } from '../lib/geo';
import { useLanguage } from '../hooks/useLanguage';
import { useModelSelection } from '../hooks/useModelSelection';
import { useFloodForecast14Day } from '../lib/modelApi';
import { useYourPlace, scrollToMapCard, TIER_COLORS } from '../hooks/useYourPlace';

// "Your Place": a personal flood check for one saved spot. Pure client-side:
// the pin is kept in this browser's localStorage and never sent to a server.
//
// This card is a summary only. The pin and route are drawn on the dashboard's
// main map (YourPlaceMapLayer in 2D, useYourPlaceMap3D in 3D), so there is a
// single map on the page.

const TIER_ICONS = [LuShieldCheck, LuEye, LuTriangleAlert, LuSiren];
const ZONE_COLORS = { 0: '#64748b', 1: '#3b82f6', 2: '#f59e0b', 3: '#ef4444' };

const fill = (str, vars) => String(str).replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');

export default function YourPlaceCard({ currentAlert = 'NORMAL', probability = null, hasPrediction = true }) {
  const { t, lang } = useLanguage();
  const { activeModel } = useModelSelection();
  const { forecast14 } = useFloodForecast14Day(activeModel.key);
  const { place, setPlace, inside, hazard, route, locating, geoError, locate, setPicking, requestFocus } = useYourPlace();

  const [showHow, setShowHow] = useState(false);
  const [copied, setCopied] = useState(false);

  const tier = place && inside && hasPrediction ? personalTier(currentAlert, hazard) : null;
  const tierKey = tier != null ? TIER_KEYS[tier] : null;
  const color = tier != null ? TIER_COLORS[tier] : '#64748b';
  const TierIcon = tier != null ? TIER_ICONS[tier] : LuMapPin;
  const likely = useMemo(() => firstLikelyDay(forecast14), [forecast14]);

  const formatDay = (d) => {
    const dt = new Date(`${String(d).slice(0, 10)}T00:00:00`);
    if (Number.isNaN(dt.getTime())) return String(d);
    return dt.toLocaleDateString(lang === 'en' ? 'en-PH' : 'fil-PH', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const directionsUrl = route
    ? `https://www.google.com/maps/dir/?api=1&origin=${place.lat},${place.lng}&destination=${route.center.position.lat},${route.center.position.lng}&travelmode=walking`
    : null;

  const handleShare = async () => {
    const text = fill(t('place.shareText'), {
      alert: t(`alertLevel.${currentAlert}.name`),
      zone: t(`place.zoneNames.${hazard}`),
      center: route?.center.name ?? '-',
    });
    try {
      if (navigator.share) { await navigator.share({ text }); return; }
      await navigator.clipboard.writeText(text);
      setCopied(true); setTimeout(() => setCopied(false), 2200);
    } catch { /* share cancelled */ }
  };

  // Both actions hand off to whichever main map (2D or 3D) is showing.
  const goToMap = (action) => { scrollToMapCard(); if (action) action(); };
  const startPick = () => goToMap(() => setPicking(true));
  const showOnMap = () => goToMap(requestFocus);

  // ── Empty state ────────────────────────────────────────────────────────
  if (!place) {
    return (
      <section className="card yp-card yp-empty" aria-label={t('place.title')}>
        <div className="yp-empty-icon" aria-hidden="true"><LuMapPin size={30} /></div>
        <div className="yp-empty-copy">
          <div className="yp-kicker">{t('place.title')}</div>
          <h2 className="yp-title">{t('place.emptyTitle')}</h2>
          <p className="yp-body">{t('place.emptyBody')}</p>
          <div className="yp-actions">
            <button type="button" className="btn btn-primary" onClick={locate} disabled={locating}>
              <LuLocateFixed size={16} /> {locating ? t('place.locating') : t('place.useLocation')}
            </button>
            <button type="button" className="btn btn-ghost" onClick={startPick}>
              <LuCrosshair size={16} /> {t('place.pickOnMap')}
            </button>
          </div>
          {geoError && <p className="yp-error" role="alert">{geoError}</p>}
          <p className="yp-fine">{t('place.privacy')}</p>
        </div>
      </section>
    );
  }

  // ── Active state ───────────────────────────────────────────────────────
  return (
    <section className="card yp-card" style={{ '--yp': color }} aria-label={t('place.title')}>
      <div className="yp-info">
        <div className="yp-head">
          <span className="yp-kicker">{t('place.title')}</span>
          <span className="yp-head-actions">
            <button type="button" className="yp-link" onClick={locate} disabled={locating}>
              <LuLocateFixed size={13} /> {locating ? t('place.locating') : t('place.useLocation')}
            </button>
            <button type="button" className="yp-link" onClick={startPick}>
              <LuCrosshair size={13} /> {t('place.setOnMap')}
            </button>
            <button type="button" className="yp-link yp-link-quiet" onClick={() => setPlace(null)}>
              <LuTrash2 size={13} /> {t('place.clear')}
            </button>
          </span>
        </div>

        <div className="yp-status" aria-live="polite">
          <span className="yp-status-icon" aria-hidden="true"><TierIcon size={26} /></span>
          <div>
            <h2 className="yp-headline">
              {!inside ? t('place.title') : tierKey ? t(`place.headline.${tierKey}`) : t('place.title')}
            </h2>
            <p className="yp-sub">
              {!inside
                ? t('place.outside')
                : !hasPrediction
                  ? t('place.noLive')
                  : `${t(`alertLevel.${currentAlert}.name`)}${probability != null ? ` · ${Math.round(probability * 100)}%` : ''}`}
            </p>
          </div>
        </div>

        {inside && (
          <>
            <dl className="yp-facts">
              <div className="yp-fact">
                <dt>{t('place.zone')}</dt>
                <dd><span className="yp-dot" style={{ background: ZONE_COLORS[hazard] }} />{t(`place.zoneNames.${hazard}`)}</dd>
              </div>
              {route && (
                <div className="yp-fact">
                  <dt>{t('place.nearest')}</dt>
                  <dd>{route.center.name}<small>{fill(t('place.walk'), { n: route.walkMinutes })} · {formatDistanceKm(route.totalKm)}</small></dd>
                </div>
              )}
              {forecast14?.length > 0 && (
                <div className="yp-fact">
                  <dt><LuCalendarClock size={12} /> {t('place.outlook')}</dt>
                  <dd>{likely ? fill(t('place.outlookLikely'), { d: formatDay(likely.date) }) : t('place.outlookClear')}</dd>
                </div>
              )}
            </dl>

            {tierKey && (
              <ul className="yp-todo">
                {t(`place.actions.${tierKey}`).map((line) => <li key={line}>{line}</li>)}
              </ul>
            )}
          </>
        )}

        <div className="yp-actions">
          <button type="button" className="btn btn-primary" onClick={showOnMap}>
            <LuMap size={16} /> {t('place.showOnMap')}
          </button>
          {inside && directionsUrl && (
            <a className={`btn ${tier >= 2 ? 'btn-danger' : 'btn-ghost'}`} href={directionsUrl} target="_blank" rel="noopener noreferrer">
              <LuNavigation size={16} /> {t('place.directions')}
            </a>
          )}
          {inside && (
            <button type="button" className="btn btn-ghost" onClick={handleShare}>
              <LuShare2 size={16} /> {copied ? t('place.shared') : t('place.share')}
            </button>
          )}
        </div>

        {geoError && <p className="yp-error" role="alert">{geoError}</p>}

        <div className="yp-foot">
          <button type="button" className="yp-how-toggle" onClick={() => setShowHow((v) => !v)} aria-expanded={showHow}>
            <LuInfo size={13} /> {t('place.how')}
          </button>
          {showHow && <p className="yp-fine">{t('place.howBody')}</p>}
          <p className="yp-fine">{t('place.privacy')}</p>
        </div>
      </div>
    </section>
  );
}
