import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import '../lib/maplibreSetup';
import { LuMapPin, LuNavigation, LuBookmarkPlus, LuCheck, LuFootprints, LuX } from 'react-icons/lu';
import { TRIANGULO_BOUNDARY, TRIANGULO_CENTER, EVACUATION_CENTERS } from '../data/triangulo';
import trianguloFloodHazard from '../data/trianguloFloodHazard.json';
import trianguloRoads from '../data/trianguloRoads.json';
import { hazardAtPoint, pointInBoundary } from '../lib/hazard';
import { buildRoadGraph, findNearestCenterByRoad } from '../lib/routing';
import { personalTier, TIER_KEYS } from '../lib/personalRisk';
import { TIER_COLORS } from '../hooks/useYourPlace';
import { useLanguage } from '../hooks/useLanguage';
import FloodGuide from '../components/FloodGuide';

// "Know Your Zone": an explorer for the flood hazard map. Tap any spot to see
// how flood-prone it is, what that means *today* (live alert x zone, the same
// rule Your Place uses) and where to go. Wording for tiers/actions comes from
// the shared i18n dictionary so it follows the language picker.

let buildingsPromise = null;
const loadBuildings = () => (buildingsPromise ??= import('../data/trianguloBuildings.json').then((m) => m.default));
const EMPTY_FC = { type: 'FeatureCollection', features: [] };

let cachedGraph = null;
const getGraph = () => (cachedGraph ??= buildRoadGraph(trianguloRoads));

const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';
const VIEW = { center: [TRIANGULO_CENTER.lng, TRIANGULO_CENTER.lat], zoom: 16, pitch: 45, bearing: -17 };
const PLACE_KEY = 'agos-your-place'; // same key Your Place reads on the dashboard

// Same zone colours as the dashboard map and Your Place card.
const ZONES = [
  { cls: 1, color: '#3b82f6', meaning: 'Water rarely reaches here, but low spots and blocked drains can still pond.' },
  { cls: 2, color: '#f59e0b', meaning: 'Streets can become hard to cross. Be ready to move early.' },
  { cls: 3, color: '#ef4444', meaning: 'Water can rise fast and deep. Leave before it reaches you.' },
];
const ZONE_COLOR = { 0: '#64748b', 1: '#3b82f6', 2: '#f59e0b', 3: '#ef4444' };

const ALERT_BY_NUMBER = ['NORMAL', 'ADVISORY', 'WARNING', 'CRITICAL'];
function alertKeyOf(prediction) {
  const a = prediction?.alert_level ?? prediction?.alert_key;
  if (typeof a === 'number') return ALERT_BY_NUMBER[a] ?? 'NORMAL';
  return a ?? 'NORMAL';
}

function pinElement(color) {
  const el = document.createElement('div');
  el.innerHTML = `<svg width="30" height="40" viewBox="0 0 30 40" aria-hidden="true">
    <path d="M15 0C6.7 0 0 6.7 0 15c0 11 15 25 15 25s15-14 15-25C30 6.7 23.3 0 15 0z" fill="${color}" stroke="#fff" stroke-width="2"/>
    <circle cx="15" cy="15" r="5" fill="#fff"/></svg>`;
  el.style.filter = 'drop-shadow(0 2px 3px rgba(0,0,0,0.45))';
  return el;
}

const fill = (str, vars) => String(str).replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');

export default function KnowYourHazardsPage() {
  const { t } = useLanguage();
  const { prediction } = useOutletContext() ?? {};
  const alertKey = alertKeyOf(prediction);

  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const [spot, setSpot] = useState(null);       // { lat, lng } of the last tap
  const [onlyZone, setOnlyZone] = useState(null); // null = show all zones
  const [saved, setSaved] = useState(false);

  // Everything derived from the tapped spot.
  const info = useMemo(() => {
    if (!spot) return null;
    const inside = pointInBoundary(spot, TRIANGULO_BOUNDARY);
    if (!inside) return { inside: false };
    const zone = hazardAtPoint(spot);
    const tier = prediction ? personalTier(alertKey, zone) : null;
    const route = findNearestCenterByRoad(getGraph(), spot, EVACUATION_CENTERS);
    return { inside: true, zone, tier, route };
  }, [spot, alertKey, prediction]);

  useEffect(() => {
    if (!containerRef.current) return undefined;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE_URL,
      ...VIEW,
      antialias: true,
      maxPitch: 70,
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
    map.addControl(
      new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: false }),
      'top-right',
    );

    map.on('load', () => {
      map.addSource('kyh-hazard', { type: 'geojson', data: trianguloFloodHazard });
      map.addLayer({
        id: 'kyh-hazard-fill',
        type: 'fill',
        source: 'kyh-hazard',
        paint: {
          'fill-color': ['match', ['get', 'hazard_class'], 1, ZONE_COLOR[1], 2, ZONE_COLOR[2], 3, ZONE_COLOR[3], '#94a3b8'],
          'fill-opacity': 0.6,
        },
      });
      map.addLayer({
        id: 'kyh-hazard-edge',
        type: 'line',
        source: 'kyh-hazard',
        paint: {
          'line-color': ['match', ['get', 'hazard_class'], 1, ZONE_COLOR[1], 2, ZONE_COLOR[2], 3, ZONE_COLOR[3], '#94a3b8'],
          'line-width': 1,
          'line-opacity': 0.9,
        },
      });

      map.addSource('kyh-boundary', {
        type: 'geojson',
        data: {
          type: 'Feature', properties: {},
          geometry: { type: 'LineString', coordinates: [...TRIANGULO_BOUNDARY, TRIANGULO_BOUNDARY[0]].map((p) => [p.lng, p.lat]) },
        },
      });
      map.addLayer({
        id: 'kyh-boundary-line',
        type: 'line',
        source: 'kyh-boundary',
        paint: { 'line-color': '#38bdf8', 'line-width': 2.5, 'line-dasharray': [2, 1.5] },
      });

      map.addSource('kyh-buildings', { type: 'geojson', data: EMPTY_FC });
      map.addLayer({
        id: 'kyh-buildings-3d',
        type: 'fill-extrusion',
        source: 'kyh-buildings',
        paint: {
          'fill-extrusion-color': '#cbd5e1',
          'fill-extrusion-height': ['get', 'h'],
          'fill-extrusion-base': 0,
          'fill-extrusion-opacity': 0.85,
        },
      });
      loadBuildings().then((data) => {
        try { map.getSource('kyh-buildings')?.setData(data); } catch { /* map was torn down */ }
      });
    });

    map.on('click', (e) => {
      setSaved(false);
      setSpot({ lat: e.lngLat.lat, lng: e.lngLat.lng });
    });
    map.on('mousemove', () => { map.getCanvas().style.cursor = 'crosshair'; });

    const ro = new ResizeObserver(() => map.resize());
    ro.observe(containerRef.current);
    return () => {
      ro.disconnect();
      markerRef.current?.remove();
      markerRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Pin follows the tapped spot and takes the colour of its zone.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markerRef.current?.remove();
    markerRef.current = null;
    if (!spot) return;
    const color = info?.inside ? ZONE_COLOR[info.zone] : '#64748b';
    markerRef.current = new maplibregl.Marker({ element: pinElement(color), anchor: 'bottom' })
      .setLngLat([spot.lng, spot.lat])
      .addTo(map);
  }, [spot, info]);

  // Tapping a zone card isolates that zone on the map.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      const filter = onlyZone ? ['==', ['get', 'hazard_class'], onlyZone] : null;
      ['kyh-hazard-fill', 'kyh-hazard-edge'].forEach((id) => { if (map.getLayer(id)) map.setFilter(id, filter); });
    };
    if (map.isStyleLoaded() && map.getLayer('kyh-hazard-fill')) apply();
    else map.once('idle', apply);
  }, [onlyZone]);

  const savePlace = () => {
    try { localStorage.setItem(PLACE_KEY, JSON.stringify({ lat: spot.lat, lng: spot.lng })); setSaved(true); } catch { /* storage unavailable */ }
  };

  const tierColor = info?.tier != null ? TIER_COLORS[info.tier] : null;
  const directionsUrl = info?.route
    ? `https://www.google.com/maps/dir/?api=1&origin=${spot.lat},${spot.lng}&destination=${info.route.center.position.lat},${info.route.center.position.lng}&travelmode=walking`
    : null;

  return (
    <div className="kyz">
      <header className="kyz-head">
        <div>
          <div className="kyz-kicker">Know your zone</div>
          <h2>How flood-prone is your street?</h2>
        </div>
        <div className="kyz-live" style={{ '--c': TIER_COLORS[TIER_KEYS.indexOf(alertKey)] ?? '#22c55e' }}>
          <span aria-hidden="true" />
          Barangay alert: <strong>{t(`alertLevel.${alertKey}.name`)}</strong>
        </div>
      </header>

      <div className="kyz-zones" role="group" aria-label="Flood zones">
        {ZONES.map(({ cls, color, meaning }) => (
          <button
            key={cls}
            type="button"
            className="kyz-zone"
            style={{ '--c': color }}
            aria-pressed={onlyZone === cls}
            onClick={() => setOnlyZone((z) => (z === cls ? null : cls))}
          >
            <span className="kyz-zone-name"><i aria-hidden="true" />{t(`place.zoneNames.${cls}`)}</span>
            <span className="kyz-zone-text">{meaning}</span>
          </button>
        ))}
      </div>

      <div className="kyz-map-card">
        <div ref={containerRef} className="kyz-map" />

        {!spot && (
          <div className="kyz-hint"><LuMapPin size={15} aria-hidden="true" /> Tap the map to check a spot</div>
        )}

        {spot && (
          <section className="kyz-sheet" style={{ '--c': tierColor ?? (info?.inside ? ZONE_COLOR[info.zone] : '#64748b') }} aria-live="polite">
            <button type="button" className="kyz-sheet-close" aria-label="Close" onClick={() => setSpot(null)}><LuX size={16} /></button>

            {!info.inside ? (
              <p className="kyz-outside">{t('place.outside')}</p>
            ) : (
              <>
                <div className="kyz-sheet-top">
                  <span className="kyz-badge" style={{ '--c': ZONE_COLOR[info.zone] }}>
                    {t('place.zone')}: {t(`place.zoneNames.${info.zone}`)}
                  </span>
                  {info.tier != null && <h3>{t(`place.headline.${TIER_KEYS[info.tier]}`)}</h3>}
                </div>

                {info.tier != null ? (
                  <ul className="kyz-actions">
                    {t(`place.actions.${TIER_KEYS[info.tier]}`).map((a) => <li key={a}>{a}</li>)}
                  </ul>
                ) : (
                  <p className="kyz-note">{t('place.noLive')}</p>
                )}

                {info.route && (
                  <div className="kyz-evac">
                    <LuFootprints size={16} aria-hidden="true" />
                    <span>
                      {t('place.nearest')}: <strong>{info.route.center.name}</strong>
                      {' · '}{fill(t('place.walk'), { n: info.route.walkMinutes })}
                    </span>
                  </div>
                )}

                <div className="kyz-buttons">
                  {directionsUrl && (
                    <a className="btn btn-primary" href={directionsUrl} target="_blank" rel="noopener noreferrer">
                      <LuNavigation size={15} aria-hidden="true" /> {t('place.directions')}
                    </a>
                  )}
                  {saved ? (
                    <Link className="btn btn-ghost" to="/dashboard"><LuCheck size={15} aria-hidden="true" /> Saved as your place</Link>
                  ) : (
                    <button type="button" className="btn btn-ghost" onClick={savePlace}>
                      <LuBookmarkPlus size={15} aria-hidden="true" /> Save as my place
                    </button>
                  )}
                </div>
              </>
            )}
          </section>
        )}
      </div>

      <FloodGuide alertKey={alertKey} />

      <p className="kyz-source">
        Zones come from the 25-year rainfall flood hazard map (Camarines Sur), clipped to Barangay Triangulo: the flooding
        expected in a rain event with a 4% chance of happening in any year. Building outlines © OpenStreetMap contributors;
        heights are partly estimated. {t('disclaimer')}
      </p>
    </div>
  );
}