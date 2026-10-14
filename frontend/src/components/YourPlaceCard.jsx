import { useEffect, useMemo, useState, useCallback } from 'react';
import { MapContainer, TileLayer, GeoJSON, Marker, Polyline, CircleMarker, Tooltip, Polygon, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { LuMapPin, LuLocateFixed, LuNavigation, LuShare2, LuShieldCheck, LuEye, LuTriangleAlert, LuSiren, LuTrash2, LuInfo, LuCalendarClock } from 'react-icons/lu';
import trianguloRoads from '../data/trianguloRoads.json';
import { TRIANGULO_BOUNDARY, EVACUATION_CENTERS } from '../data/triangulo';
import { buildRoadGraph, findNearestCenterByRoad } from '../lib/routing';
import { hazardAtPoint, pointInBoundary, hazardGeoJsonData } from '../lib/hazard';
import { personalTier, TIER_KEYS, firstLikelyDay } from '../lib/personalRisk';
import { formatDistanceKm } from '../lib/geo';
import { useLanguage } from '../hooks/useLanguage';
import { useModelSelection } from '../hooks/useModelSelection';
import { useFloodForecast14Day } from '../lib/modelApi';

// "Your Place": a personal flood check for one saved spot. Pure client-side:
// the pin is kept in this browser's localStorage and never sent to a server.

const STORAGE_KEY = 'agos-your-place';
const TIER_COLORS = ['#22c55e', '#eab308', '#f97316', '#ef4444'];
const TIER_ICONS = [LuShieldCheck, LuEye, LuTriangleAlert, LuSiren];
const ZONE_COLORS = { 0: '#64748b', 1: '#3b82f6', 2: '#f59e0b', 3: '#ef4444' };

const CENTROID = {
  lat: TRIANGULO_BOUNDARY.reduce((s, p) => s + p.lat, 0) / TRIANGULO_BOUNDARY.length,
  lng: TRIANGULO_BOUNDARY.reduce((s, p) => s + p.lng, 0) / TRIANGULO_BOUNDARY.length,
};

// Building the road graph is the only heavy step, so do it once, lazily.
let cachedGraph = null;
const getGraph = () => (cachedGraph ??= buildRoadGraph(trianguloRoads));

function loadPlace() {
  try {
    const p = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (p && Number.isFinite(p.lat) && Number.isFinite(p.lng)) return p;
  } catch { /* storage unavailable or corrupt: start empty */ }
  return null;
}
function savePlace(place) {
  try {
    if (place) localStorage.setItem(STORAGE_KEY, JSON.stringify(place));
    else localStorage.removeItem(STORAGE_KEY);
  } catch { /* ignore */ }
}

const fill = (str, vars) => String(str).replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');

const pinIcon = (color) => L.divIcon({
  className: 'yp-pin-wrap',
  html: `<span class="yp-pin" style="--c:${color}"></span>`,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

function ClickToPlace({ onPick }) {
  useMapEvents({ click: (e) => onPick({ lat: e.latlng.lat, lng: e.latlng.lng }) });
  return null;
}

function FitTo({ points, signature }) {
  const map = useMap();
  useEffect(() => {
    if (points.length > 1) map.fitBounds(points, { padding: [28, 28], maxZoom: 17 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);
  return null;
}

export default function YourPlaceCard({ currentAlert = 'NORMAL', probability = null, hasPrediction = true }) {
  const { t, lang } = useLanguage();
  const { activeModel } = useModelSelection();
  const { forecast14 } = useFloodForecast14Day(activeModel.key);

  const [place, setPlaceState] = useState(loadPlace);
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState(null);
  const [showHow, setShowHow] = useState(false);
  const [copied, setCopied] = useState(false);

  const setPlace = useCallback((p) => { setPlaceState(p); savePlace(p); setGeoError(null); }, []);

  const useMyLocation = () => {
    if (!navigator.geolocation) { setGeoError('Location is not available on this device.'); return; }
    setLocating(true); setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => { setLocating(false); setPlace({ lat: pos.coords.latitude, lng: pos.coords.longitude }); },
      (err) => {
        setLocating(false);
        setGeoError(err.code === err.PERMISSION_DENIED ? 'Location permission was denied. You can choose on the map instead.' : 'Could not get your location. Try again or choose on the map.');
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const inside = place ? pointInBoundary(place, TRIANGULO_BOUNDARY) : false;
  const hazard = useMemo(() => (place && inside ? hazardAtPoint(place) : 0), [place, inside]);
  const route = useMemo(
    () => (place && inside ? findNearestCenterByRoad(getGraph(), place, EVACUATION_CENTERS) : null),
    [place, inside],
  );

  const tier = place && inside && hasPrediction ? personalTier(currentAlert, hazard) : null;
  const tierKey = tier != null ? TIER_KEYS[tier] : null;
  const color = tier != null ? TIER_COLORS[tier] : '#64748b';
  const TierIcon = tier != null ? TIER_ICONS[tier] : LuMapPin;
  const likely = firstLikelyDay(forecast14);

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

  const mapPoints = place && inside && route
    ? route.path.map((p) => [p.lat, p.lng])
    : TRIANGULO_BOUNDARY.map((p) => [p.lat, p.lng]);

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
            <button type="button" className="btn btn-primary" onClick={useMyLocation} disabled={locating}>
              <LuLocateFixed size={16} /> {locating ? t('place.locating') : t('place.useLocation')}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setPlace({ ...CENTROID })}>
              <LuMapPin size={16} /> {t('place.pickOnMap')}
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
      <div className="yp-grid">
        <div className="yp-info">
          <div className="yp-head">
            <span className="yp-kicker">{t('place.title')}</span>
            <span className="yp-head-actions">
              <button type="button" className="yp-link" onClick={useMyLocation} disabled={locating}>
                <LuLocateFixed size={13} /> {locating ? t('place.locating') : t('place.useLocation')}
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

              <div className="yp-actions">
                {directionsUrl && (
                  <a className={`btn ${tier >= 2 ? 'btn-danger' : 'btn-primary'}`} href={directionsUrl} target="_blank" rel="noopener noreferrer">
                    <LuNavigation size={16} /> {t('place.directions')}
                  </a>
                )}
                <button type="button" className="btn btn-ghost" onClick={handleShare}>
                  <LuShare2 size={16} /> {copied ? t('place.shared') : t('place.share')}
                </button>
              </div>
            </>
          )}

          {geoError && <p className="yp-error" role="alert">{geoError}</p>}

          <button type="button" className="yp-how-toggle" onClick={() => setShowHow((v) => !v)} aria-expanded={showHow}>
            <LuInfo size={13} /> {t('place.how')}
          </button>
          {showHow && <p className="yp-fine">{t('place.howBody')}</p>}
          <p className="yp-fine">{t('place.privacy')}</p>
        </div>

        <div className="yp-map">
          <MapContainer center={[place.lat, place.lng]} zoom={16} scrollWheelZoom={false} style={{ height: '100%', minHeight: 280, width: '100%' }}>
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            />
            <GeoJSON
              data={hazardGeoJsonData}
              interactive={false}
              style={(f) => ({ fillColor: f.properties.color, fillOpacity: 0.3, color: f.properties.color, weight: 0.6, opacity: 0.6 })}
            />
            <Polygon positions={TRIANGULO_BOUNDARY.map((p) => [p.lat, p.lng])} pathOptions={{ color: '#38bdf8', weight: 2, dashArray: '6 6', fill: false }} />
            {EVACUATION_CENTERS.map((c) => (
              <CircleMarker key={c.id} center={[c.position.lat, c.position.lng]} radius={7} pathOptions={{ color: '#fff', weight: 2, fillColor: route?.center.id === c.id ? '#22c55e' : '#64748b', fillOpacity: 1 }}>
                <Tooltip direction="top" offset={[0, -6]}>{c.name}</Tooltip>
              </CircleMarker>
            ))}
            {route && <Polyline positions={route.path.map((p) => [p.lat, p.lng])} pathOptions={{ color, weight: 5, opacity: 0.9 }} />}
            <Marker
              position={[place.lat, place.lng]}
              icon={pinIcon(color)}
              draggable
              eventHandlers={{ dragend: (e) => { const ll = e.target.getLatLng(); setPlace({ lat: ll.lat, lng: ll.lng }); } }}
            />
            <ClickToPlace onPick={setPlace} />
            <FitTo points={mapPoints} signature={`${place.lat.toFixed(5)},${place.lng.toFixed(5)},${route?.center.id ?? ''}`} />
          </MapContainer>
          <div className="yp-map-hint">{t('place.tapMap')}</div>
        </div>
      </div>
    </section>
  );
}
