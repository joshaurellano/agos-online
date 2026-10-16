import { useEffect, useMemo, useRef, useState } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import '../lib/maplibreSetup';
import {
  LuMapPin, LuRoute, LuBookmarkPlus, LuCheck, LuFootprints, LuX, LuLocateFixed, LuTriangleAlert,
} from 'react-icons/lu';
import { TRIANGULO_BOUNDARY, TRIANGULO_CENTER, EVACUATION_CENTERS } from '../data/triangulo';
import trianguloFloodHazard from '../data/trianguloFloodHazard.json';
import trianguloRoads from '../data/trianguloRoads.json';
import { hazardAtPoint, pointInBoundary } from '../lib/hazard';
import { buildRoadGraph, findNearestCenterByRoad, OFF_NETWORK_THRESHOLD_KM } from '../lib/routing';
import { formatDistanceKm } from '../lib/geo';
import { buildRouteSteps } from '../lib/routeSteps';
import { personalTier, TIER_KEYS } from '../lib/personalRisk';
import { TIER_COLORS } from '../hooks/useYourPlace';
import { useLanguage } from '../hooks/useLanguage';
import FloodGuide from '../components/FloodGuide';

// "Know Your Risk": the one map for "me and my safety". Tap any spot (or use
// your location) to see how flood-prone it is, what that means *today* (live
// alert x zone, the same rule Your Place uses), and the walking route to the
// nearest evacuation center. It replaces the separate Evacuation Map page.
// Wording for tiers/actions comes from the shared i18n dictionary.

let buildingsPromise = null;
const loadBuildings = () => (buildingsPromise ??= import('../data/trianguloBuildings.json').then((m) => m.default));
const EMPTY_FC = { type: 'FeatureCollection', features: [] };

let cachedGraph = null;
const getGraph = () => (cachedGraph ??= buildRoadGraph(trianguloRoads));

const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';
const VIEW = { center: [TRIANGULO_CENTER.lng, TRIANGULO_CENTER.lat], zoom: 16, pitch: 45, bearing: -17 };
const PLACE_KEY = 'agos-your-place'; // the saved "your place" pin, kept only in this browser

// Same zone colours as the dashboard map.
const ZONES = [
  { cls: 1, color: '#3b82f6', depth: 'up to 0.5 m', meaning: 'Water rarely reaches here, but low spots and blocked drains can still pond.' },
  { cls: 2, color: '#f59e0b', depth: '0.5–1.5 m', meaning: 'Streets can become hard to cross. Be ready to move early.' },
  { cls: 3, color: '#ef4444', depth: 'over 1.5 m', meaning: 'Water can rise fast and deep. Leave before it reaches you.' },
];
// What it means for a spot to sit in each zone. The levels are Project NOAH's
// (UP DREAM) flood-depth classes for a 25-year rain event: low up to 0.5 m,
// medium 0.5-1.5 m, high over 1.5 m (NOAH Hazard Maps dataset card). The class
// also reflects flow velocity, so fast shallow water can rate higher than its
// depth alone suggests. They describe hazard, not urgency.
const ZONE_DETAIL = {
  0: {
    title: 'Not in a mapped flood zone.',
    text: 'The hazard map shows no flooding here in a 25-year rain event. Heavier rain, blocked drains or a rising creek can still make water collect, so keep an eye on the alerts.',
  },
  1: {
    title: 'Low flood hazard: up to about 0.5 m deep.',
    text: 'In a 25-year rain event, floodwater here is expected to stay at about knee-deep or less. Streets and low spots can still get wet and slippery, and fast-moving water can be dangerous even when shallow, so avoid wading through it.',
  },
  2: {
    title: 'Medium flood hazard: about 0.5–1.5 m deep.',
    text: 'In a 25-year rain event, floodwater here is expected to be roughly knee-deep to chest-deep. Streets can become impassable and belongings at floor level may get wet. Be ready to move early when an alert rises.',
  },
  3: {
    title: 'High flood hazard: over 1.5 m deep.',
    text: 'In a 25-year rain event, floodwater here is expected to be deeper than chest-high for most adults. Ground floors can be badly flooded and exits cut off, so plan your way out now and leave early when alerts rise.',
  },
};
const ZONE_COLOR = { 0: '#64748b', 1: '#3b82f6', 2: '#f59e0b', 3: '#ef4444' };

const ALERT_BY_NUMBER = ['NORMAL', 'ADVISORY', 'WARNING', 'CRITICAL'];
function alertKeyOf(prediction) {
  const a = prediction?.alert_level ?? prediction?.alert_key;
  if (typeof a === 'number') return ALERT_BY_NUMBER[a] ?? 'NORMAL';
  return a ?? 'NORMAL';
}

function loadSavedPlace() {
  try {
    const p = JSON.parse(localStorage.getItem(PLACE_KEY));
    return p && Number.isFinite(p.lat) && Number.isFinite(p.lng) ? { lat: p.lat, lng: p.lng } : null;
  } catch { return null; }
}
const samePoint = (a, b) => !!a && !!b && Math.abs(a.lat - b.lat) < 1e-7 && Math.abs(a.lng - b.lng) < 1e-7;

function pinElement(color) {
  const el = document.createElement('div');
  el.innerHTML = `<svg width="30" height="40" viewBox="0 0 30 40" aria-hidden="true">
    <path d="M15 0C6.7 0 0 6.7 0 15c0 11 15 25 15 25s15-14 15-25C30 6.7 23.3 0 15 0z" fill="${color}" stroke="#fff" stroke-width="2"/>
    <circle cx="15" cy="15" r="5" fill="#fff"/></svg>`;
  el.style.filter = 'drop-shadow(0 2px 3px rgba(0,0,0,0.45))';
  return el;
}

// Evacuation-center marker: a coloured dot with the centre's name above it.
// Built with DOM nodes (not innerHTML) so names are never parsed as markup.
function centerElement(center) {
  const el = document.createElement('div');
  el.className = 'kyz-center';
  el.style.setProperty('--c', center.color);
  const label = document.createElement('span');
  label.className = 'kyz-center-label';
  label.textContent = center.name;
  const dot = document.createElement('span');
  dot.className = 'kyz-center-dot';
  el.append(label, dot);
  return el;
}

function centerPopup(center) {
  const box = document.createElement('div');
  box.className = 'kyz-popup';
  const name = document.createElement('strong');
  name.textContent = center.name;
  const type = document.createElement('span');
  type.textContent = center.type;
  type.style.color = center.color;
  const addr = document.createElement('small');
  addr.textContent = center.address.trim();
  box.append(name, type, addr);
  return new maplibregl.Popup({ offset: 18, maxWidth: '260px' }).setDOMContent(box);
}

// GeoJSON for the walking route: the road-following part (green dots) and any
// off-network legs (grey dashes), drawn differently so a straight "as the crow
// flies" stretch never reads as a real road.
function routeGeoJSON(route) {
  const fc = { type: 'FeatureCollection', features: [] };
  if (!route) return fc;
  const line = (pts, kind) => ({
    type: 'Feature', properties: { kind },
    geometry: { type: 'LineString', coordinates: pts.map((p) => [p.lng, p.lat]) },
  });
  fc.features.push(line(route.roadPath, 'road'));
  if (route.startSnapKm > OFF_NETWORK_THRESHOLD_KM) fc.features.push(line(route.offNetworkStart, 'off'));
  if (route.destSnapKm > OFF_NETWORK_THRESHOLD_KM) fc.features.push(line(route.offNetworkEnd, 'off'));
  return fc;
}

const fill = (str, vars) => String(str).replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');

// Plain-language walking steps, built in-app from the bundled street names.
function stepText(st, centerName) {
  const m = formatDistanceKm(st.km);
  switch (st.kind) {
    case 'walkToStreet': return `Walk ${m} to ${st.street || 'the nearest mapped street'}`;
    case 'start': return `Head along ${st.street || 'the street'} for ${m}`;
    case 'straight': return `Continue onto ${st.street || 'the street'} for ${m}`;
    case 'turn': return `Turn ${st.sharp ? 'sharp ' : ''}${st.turn} onto ${st.street || 'the street'} for ${m}`;
    default: return st.km > 0 ? `Walk ${m} to ${centerName}` : `Arrive at ${centerName}`;
  }
}

function fitToRoute(map, route) {
  const b = new maplibregl.LngLatBounds();
  route.path.forEach((p) => b.extend([p.lng, p.lat]));
  map.fitBounds(b, { padding: { top: 70, bottom: 70, left: 60, right: 60 }, maxZoom: 17.5, duration: 900 });
}

export default function KnowYourHazardsPage() {
  const { t } = useLanguage();
  const { prediction } = useOutletContext() ?? {};
  const alertKey = alertKeyOf(prediction);
  const [searchParams] = useSearchParams();

  const containerRef = useRef(null);
  const mapCardRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const centerMarkers = useRef({});
  const routeDataRef = useRef(routeGeoJSON(null));
  const fitNext = useRef(false);                   // true when the next route/spot should be brought into view
  const initialSaved = useRef(loadSavedPlace());

  const [spot, setSpot] = useState(initialSaved.current);   // { lat, lng } of the checked spot
  const [savedPlace, setSavedPlace] = useState(initialSaved.current);
  const [onlyZone, setOnlyZone] = useState(null);           // null = show all zones
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState(null);
  const [targetId, setTargetId] = useState(null);          // null = nearest center; otherwise route to this one

  // Everything derived from the checked spot.
  const [info, setInfo] = useState(null);
  useEffect(() => {
    if (!spot) { setInfo(null); return; }
    if (!pointInBoundary(spot, TRIANGULO_BOUNDARY)) { setInfo({ inside: false }); return; }
    const zone = hazardAtPoint(spot);
    const tier = prediction ? personalTier(alertKey, zone) : null;
    const pool = targetId ? EVACUATION_CENTERS.filter((c) => c.id === targetId) : EVACUATION_CENTERS;
    const route = findNearestCenterByRoad(getGraph(), spot, pool);
    setInfo({ inside: true, zone, tier, route });
  }, [spot, alertKey, prediction, targetId]);

  const isSaved = samePoint(spot, savedPlace);

  const locateMe = () => {
    if (!navigator.geolocation) { setLocateError('Location isn\u2019t available on this device or browser.'); return; }
    setLocating(true);
    setLocateError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        fitNext.current = true;
        setSpot({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      (err) => {
        setLocating(false);
        setLocateError(err.code === err.PERMISSION_DENIED ? 'Location permission was denied.' : 'Couldn\u2019t get your location. Try again.');
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  // The dashboard's "Find the nearest evacuation route" opens this page with ?locate=1.
  useEffect(() => {
    if (searchParams.get('locate') === '1') locateMe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!containerRef.current) return undefined;
    const start = initialSaved.current;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE_URL,
      ...VIEW,
      ...(start ? { center: [start.lng, start.lat] } : {}),
      antialias: true,
      maxPitch: 70,
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');

    // Evacuation centres are always visible: they are the "where do I go" answer.
    EVACUATION_CENTERS.forEach((center) => {
      const el = centerElement(center);
      const popup = centerPopup(center);
      el.addEventListener('click', (e) => e.stopPropagation()); // don't also "check" this spot
      const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat([center.position.lng, center.position.lat])
        .setPopup(popup)
        .addTo(map);
      centerMarkers.current[center.id] = marker;
    });

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

      // Walking route to the nearest evacuation center (on top of everything flat).
      map.addSource('kyz-route', { type: 'geojson', data: routeDataRef.current });
      map.addLayer({
        id: 'kyz-route-off',
        type: 'line',
        source: 'kyz-route',
        filter: ['==', ['get', 'kind'], 'off'],
        paint: { 'line-color': '#64748b', 'line-width': 3, 'line-dasharray': [2, 2], 'line-opacity': 0.9 },
      });
      map.addLayer({
        id: 'kyz-route-road',
        type: 'line',
        source: 'kyz-route',
        filter: ['==', ['get', 'kind'], 'road'],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#16a34a', 'line-width': 5, 'line-dasharray': [0.1, 1.8], 'line-opacity': 0.95 },
      });
    });

    map.on('click', (e) => {
      setLocateError(null);
      setSpot({ lat: e.lngLat.lat, lng: e.lngLat.lng });
    });
    map.on('mousemove', () => { map.getCanvas().style.cursor = 'crosshair'; });

    const ro = new ResizeObserver(() => map.resize());
    ro.observe(containerRef.current);
    return () => {
      ro.disconnect();
      markerRef.current?.remove();
      markerRef.current = null;
      Object.values(centerMarkers.current).forEach((m) => m.remove());
      centerMarkers.current = {};
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Pin follows the checked spot and takes the colour of its zone.
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

  // Route line follows the nearest-center result; bring it into view after a GPS lookup.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !info) return;
    const route = info.inside ? info.route : null;
    routeDataRef.current = routeGeoJSON(route);
    const src = map.getSource('kyz-route');
    if (src) src.setData(routeDataRef.current);

    if (fitNext.current) {
      fitNext.current = false;
      if (route) {
        fitToRoute(map, route);
      } else if (spot) {
        map.easeTo({ center: [spot.lng, spot.lat], zoom: Math.max(map.getZoom(), 15), duration: 900 });
      }
    }
  }, [info, spot]);

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
    try { localStorage.setItem(PLACE_KEY, JSON.stringify({ lat: spot.lat, lng: spot.lng })); } catch { /* storage unavailable */ }
    setSavedPlace({ lat: spot.lat, lng: spot.lng });
  };
  const forgetPlace = () => {
    try { localStorage.removeItem(PLACE_KEY); } catch { /* storage unavailable */ }
    setSavedPlace(null);
  };

  const showCenter = (center) => {
    const map = mapRef.current;
    if (!map) return;
    mapCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    map.flyTo({ center: [center.position.lng, center.position.lat], zoom: 17, duration: 900 });
    const marker = centerMarkers.current[center.id];
    if (marker && !marker.getPopup().isOpen()) marker.togglePopup();
  };

  const route = info?.inside ? info.route : null;
  const steps = useMemo(() => (route ? buildRouteSteps(route, trianguloRoads) : []), [route]);
  const targeted = targetId != null;

  // "Route here" on a center card: walk from your spot (or your location) to that specific center.
  const routeToCenter = (center) => {
    setTargetId(center.id);
    mapCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (spot) fitNext.current = true;
    else locateMe();
  };
  const offRoad = route && (route.startSnapKm > OFF_NETWORK_THRESHOLD_KM || route.destSnapKm > OFF_NETWORK_THRESHOLD_KM);
  const tierColor = info?.tier != null ? TIER_COLORS[info.tier] : null;

  return (
    <div className="kyz">
      <header className="kyz-head">
        <div>
          <div className="kyz-kicker">Know your risk</div>
          <h2>How flood-prone is your street?</h2>
        </div>
        <div className="kyz-live" style={{ '--c': TIER_COLORS[TIER_KEYS.indexOf(alertKey)] ?? '#22c55e' }}>
          <span aria-hidden="true" />
          Barangay alert: <strong>{t(`alertLevel.${alertKey}.name`)}</strong>
        </div>
      </header>

      <div className="kyz-zones" role="group" aria-label="Flood zones">
        {ZONES.map(({ cls, color, depth, meaning }) => (
          <button
            key={cls}
            type="button"
            className="kyz-zone"
            style={{ '--c': color }}
            aria-pressed={onlyZone === cls}
            onClick={() => setOnlyZone((z) => (z === cls ? null : cls))}
          >
            <span className="kyz-zone-name"><i aria-hidden="true" />{t(`place.zoneNames.${cls}`)}<small className="kyz-zone-depth">{depth} deep</small></span>
            <span className="kyz-zone-text">{meaning}</span>
          </button>
        ))}
      </div>

      <div className="kyz-map-card" ref={mapCardRef}>
        <div ref={containerRef} className="kyz-map" />

        {!spot && (
          <div className="kyz-hint">
            <LuMapPin size={15} aria-hidden="true" /> Tap the map to check a spot
            <button type="button" onClick={locateMe} disabled={locating}>
              <LuLocateFixed size={14} aria-hidden="true" /> {locating ? t('place.locating') : t('place.useLocation')}
            </button>
          </div>
        )}

        {locateError && (
          <div className="kyz-toast" role="alert"><LuTriangleAlert size={15} aria-hidden="true" /> {locateError}</div>
        )}

        <div className="kyz-legend" aria-label="Map legend">
          <span><i style={{ background: '#ef4444' }} />Primary evacuation center</span>
          <span><i style={{ background: '#3b82f6' }} />School evacuation center</span>
          <span><i className="kyz-legend-line" style={{ background: '#16a34a' }} />Walking route</span>
        </div>

        {spot && info && (
          <section className="kyz-sheet" style={{ '--c': tierColor ?? (info.inside ? ZONE_COLOR[info.zone] : '#64748b') }} aria-live="polite">
            <button type="button" className="kyz-sheet-close" aria-label="Close" onClick={() => setSpot(null)}><LuX size={16} /></button>

            {!info.inside ? (
              <>
                <p className="kyz-outside">{t('place.outside')}</p>
                <div className="kyz-buttons">
                  <button type="button" className="btn btn-ghost" onClick={locateMe} disabled={locating}>
                    <LuLocateFixed size={15} aria-hidden="true" /> {locating ? t('place.locating') : t('place.useLocation')}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="kyz-sheet-top">
                  <span className="kyz-badge" style={{ '--c': ZONE_COLOR[info.zone] }}>
                    {t('place.zone')}: {t(`place.zoneNames.${info.zone}`)}
                  </span>
                </div>

                <p className="kyz-meaning" style={{ '--c': ZONE_COLOR[info.zone] }}>
                  <strong>{ZONE_DETAIL[info.zone].title}</strong> {ZONE_DETAIL[info.zone].text}
                </p>

                {info.tier != null ? (
                  <div className="kyz-now">
                    <div className="kyz-now-kicker">Right now</div>
                    <h3>{t(`place.headline.${TIER_KEYS[info.tier]}`)}</h3>
                  </div>
                ) : (
                  <p className="kyz-note">{t('place.noLive')}</p>
                )}

                {route && (
                  <div className="kyz-evac">
                    <LuFootprints size={16} aria-hidden="true" />
                    <span>
                      {targeted ? 'Route to' : t('place.nearest')}: <strong>{route.center.name}</strong>
                      {' · '}{formatDistanceKm(route.totalKm)} along streets
                      {' · '}{fill(t('place.walk'), { n: route.walkMinutes })}
                    </span>
                  </div>
                )}
                {steps.length > 0 && (
                  <details className="kyz-steps-list">
                    <summary>Step-by-step walking directions</summary>
                    <ol>
                      {steps.map((st, i) => <li key={i}>{stepText(st, route.center.name)}</li>)}
                    </ol>
                  </details>
                )}
                {offRoad && (
                  <p className="kyz-warn">
                    <LuTriangleAlert size={14} aria-hidden="true" /> Part of this route is a straight line (grey dashes) because the spot or center is off the mapped streets.
                  </p>
                )}

                <div className="kyz-buttons">
                  {route && (
                    <button type="button" className="btn btn-primary" onClick={() => fitToRoute(mapRef.current, route)}>
                      <LuRoute size={15} aria-hidden="true" /> Show route on map
                    </button>
                  )}
                  {targeted && (
                    <button type="button" className="btn btn-ghost" onClick={() => { fitNext.current = true; setTargetId(null); }}>
                      Nearest center instead
                    </button>
                  )}
                  {isSaved ? (
                    <button type="button" className="btn btn-ghost" onClick={forgetPlace}>
                      <LuCheck size={15} aria-hidden="true" /> Saved as your place · Remove
                    </button>
                  ) : (
                    <button type="button" className="btn btn-ghost" onClick={savePlace}>
                      <LuBookmarkPlus size={15} aria-hidden="true" /> Save as my place
                    </button>
                  )}
                  <button type="button" className="btn btn-ghost" onClick={locateMe} disabled={locating}>
                    <LuLocateFixed size={15} aria-hidden="true" /> {locating ? t('place.locating') : t('place.useLocation')}
                  </button>
                </div>
              </>
            )}
          </section>
        )}
      </div>

      <section className="kyz-centers" aria-labelledby="kyz-centers-title">
        <h3 id="kyz-centers-title">Evacuation centers</h3>
        <ul>
          {EVACUATION_CENTERS.map((c) => (
            <li key={c.id} className="kyz-center-card" style={{ '--c': c.color }}>
              <div>
                <strong>{c.name}</strong>
                <span className="kyz-center-type">{c.type}</span>
                <small>{c.address.trim()}</small>
              </div>
              <div className="kyz-center-actions">
                <button type="button" className="btn btn-ghost" onClick={() => showCenter(c)}>
                  <LuMapPin size={14} aria-hidden="true" /> Show on map
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => routeToCenter(c)}>
                  <LuRoute size={14} aria-hidden="true" /> Route here
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <FloodGuide alertKey={alertKey} />

      <p className="kyz-source">
        Zones come from the 25-year rainfall flood hazard map (Camarines Sur), clipped to Barangay Triangulo: the flooding
        expected in a rain event with a 4% chance of happening in any year. Levels follow Project NOAH's flood-depth classes
        (low up to 0.5 m, medium 0.5–1.5 m, high over 1.5 m). Each level also takes flow speed into account, so fast-moving shallow
        water can rate higher than its depth alone suggests. Routes follow mapped streets and are estimates.
        Building outlines © OpenStreetMap contributors; heights are partly estimated. {t('disclaimer')}
      </p>
    </div>
  );
}
