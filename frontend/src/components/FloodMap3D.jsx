import { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import '../lib/maplibreSetup';
import trianguloRoads from '../data/trianguloRoads.json';
import trianguloFloodHazard from '../data/trianguloFloodHazard.json';
// ~850 KB of footprints: fetched as its own chunk after the map is up instead of
// blocking the first paint, and cached for style switches.
let buildingsPromise = null;
const loadBuildings = () => (buildingsPromise ??= import('../data/trianguloBuildings.json').then((m) => m.default));
const EMPTY_FC = { type: 'FeatureCollection', features: [] };
import { CRITICAL_FACILITIES, FACILITY_STYLE, facilityIconSvgMarkup } from '../data/criticalFacilities';
import RainOverlay from './RainOverlay';
import RainDebugControls from './RainDebugControls';
import MapTimeline from './MapTimeline';
import WindFlowOverlay from './WindFlowOverlay';
import WindDirectionArrow, { degToCardinal } from './WindDirectionArrow';
import { MapRecenterButton } from './ui';
import { useYourPlaceMap3D } from '../hooks/useYourPlaceMap3D';
import PlacePickBanner from './PlacePickBanner';

// Road class -> line weight, matching the 2D FloodMap's ROAD_WEIGHT so the
// two views read consistently (trunk/primary thicker, service thinner).
const ROAD_WEIGHT = {
  trunk: 5, trunk_link: 4, primary: 5, secondary: 4,
  tertiary: 3, tertiary_link: 3, busway: 3,
  unclassified: 2, residential: 2, service: 1,
};

// Building colours: buildings matched to a verified critical facility pick up
// that facility's marker colour; everything else is a neutral grey-blue.
const BUILDING_COLOR = [
  'match', ['get', 'c'],
  ...Object.entries(FACILITY_STYLE).flatMap(([type, st]) => [type, st.color]),
  '#c9d3df',
];

// Which 25-yr hazard zone a point sits in (null = outside the mapped zones).
// Plain ray-casting over the hazard MultiPolygons -- 3 features, so cheap.
function ringContains(ring, x, y) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function hazardAt(lng, lat) {
  let best = null;
  for (const f of trianguloFloodHazard.features) {
    const polys = f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [f.geometry.coordinates];
    const hit = polys.some(poly => ringContains(poly[0], lng, lat) && !poly.slice(1).some(h => ringContains(h, lng, lat)));
    if (hit && (!best || f.properties.hazard_class > best.hazard_class)) best = f.properties;
  }
  return best; // { hazard_class, hazard_level, color } | null
}

const BOUNDARY_COLOR = '#38bdf8';
const WATER_COLOR = '#1e88e5';

// Shared between the initial map setup and the recenter button, so the two
// can never drift apart.
const DEFAULT_VIEW = { center: [123.1905, 13.618], zoom: 16.2, pitch: 55, bearing: -17 };

// 25-yr rainfall return period hazard zones, clipped to the barangay
// boundary. Extruded a little per class (not real depth data -- just a
// legibility cue) so Low/Medium/High read distinctly at a glance in 3D.
const HAZARD_HEIGHT = ['match', ['get', 'hazard_class'], 1, 1.5, 2, 3, 3, 4.5, 1.5];
const HAZARD_LEGEND = [
  { level: 'Low', color: '#3b82f6' },
  { level: 'Medium', color: '#f59e0b' },
  { level: 'High', color: '#ef4444' },
];

// Uniform across the whole boundary (not per-street/per-building) -- same
// as every other severity cue in this app: it's an intensity signal from
// the single barangay-wide probability, not a claim about which specific
// spot floods first or deepest.
const ALERT_WATER = {
  NORMAL:   { height: 0,   opacity: 0 },
  ADVISORY: { height: 0,   opacity: 0 },
  WARNING:  { height: 3.2, opacity: 0.42 },
  CRITICAL: { height: 5.5, opacity: 0.55 },
};

// OpenFreeMap's three free, no-key vector styles.
const STYLE_URLS = {
  liberty: 'https://tiles.openfreemap.org/styles/liberty',
  bright: 'https://tiles.openfreemap.org/styles/bright',
  positron: 'https://tiles.openfreemap.org/styles/positron',
};
const STYLE_LABELS = { liberty: 'Liberty', bright: 'Bright', positron: 'Positron' };

// ─── Time-of-day lighting presets ──────────────────────────────────────────
// Stylistic only -- not real sun-position astronomy, just four buckets that
// make the 3D buildings/sky read as day/dawn/dusk/night based on the
// viewer's local clock. map.setLight() (radial/azimuthal/polar + color +
// intensity) is core MapLibre style-spec API, shared across all three
// OpenFreeMap styles, not tied to any one of them.
function getLightBucket(hour) {
  if (hour >= 5 && hour < 7) return 'dawn';
  if (hour >= 7 && hour < 17) return 'day';
  if (hour >= 17 && hour < 20) return 'dusk';
  return 'night';
}

const LIGHT_PRESETS = {
  day:   { light: { color: '#ffffff', intensity: 0.5, position: [1.5, 210, 45] },
           sky: { color: '#bcdcff', halo: '#ffffff', sunPos: [210, 45], opacity: 1 },
           bg: '#dce9f5' },
  dawn:  { light: { color: '#ffcf9e', intensity: 0.35, position: [1.5, 100, 82] },
           sky: { color: '#ffd9a8', halo: '#fff2d9', sunPos: [100, 82], opacity: 1 },
           bg: '#f3dcc2' },
  dusk:  { light: { color: '#ff9d66', intensity: 0.3, position: [1.5, 280, 84] },
           sky: { color: '#7a5a7a', halo: '#ff9d66', sunPos: [280, 84], opacity: 1 },
           bg: '#4a3b57' },
  night: { light: { color: '#3a4a72', intensity: 0.15, position: [1.5, 180, 100] },
           sky: { color: '#0c1830', halo: '#1a2942', sunPos: [180, 100], opacity: 1 },
           bg: '#0c1830' },
};

function roadsToGeoJSON(roads) {
  return {
    type: 'FeatureCollection',
    features: roads.map(road => ({
      type: 'Feature',
      properties: { id: road.id, name: road.name, highway: road.highway },
      geometry: {
        type: 'LineString',
        coordinates: road.positions.map(([lat, lng]) => [lng, lat]),
      },
    })),
  };
}

function boundaryToLineGeoJSON(boundary) {
  return {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'LineString',
      coordinates: boundary.map(p => [p.lng, p.lat]),
    },
  };
}

// fill-extrusion requires a closed Polygon ring (first point === last point),
// unlike the boundary LineString used for the outline layers above.
function boundaryToPolygonGeoJSON(boundary) {
  const ring = boundary.map(p => [p.lng, p.lat]);
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) ring.push(first);
  return {
    type: 'Feature',
    properties: {},
    geometry: { type: 'Polygon', coordinates: [ring] },
  };
}

function roadWidthExpression() {
  const expr = ['match', ['get', 'highway']];
  Object.entries(ROAD_WEIGHT).forEach(([hw, w]) => { expr.push(hw, w); });
  expr.push(2);
  return expr;
}

// Plain DOM element for a maplibregl.Marker -- these live outside the
// style/source/layer system entirely, so (unlike everything in
// addDataLayers) they survive a setStyle() basemap switch without needing
// to be re-added. Teardrop pin, same markup as the 2D map.
function createFacilityMarkerEl(facility) {
  const style = FACILITY_STYLE[facility.facilityType];
  const el = document.createElement('div');
  el.style.display = 'flex';
  el.style.alignItems = 'center';
  el.style.justifyContent = 'center';
  el.style.cursor = 'pointer';
  el.innerHTML = facilityIconSvgMarkup(facility.facilityType, { size: 30, color: style.color, shape: 'pin' });
  return el;
}

// Small pill toggle used for the map's layer switches.
function LayerChip({ active, label, title, onClick }) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-pressed={active}
      style={{
        padding: '3px 9px', fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.03em',
        borderRadius: 999, cursor: 'pointer', transition: 'all 0.2s',
        border: `1px solid ${active ? 'var(--accent, #0ea5e9)' : 'rgba(255,255,255,0.16)'}`,
        background: active ? 'rgba(14,165,233,0.22)' : 'transparent',
        color: active ? '#e2eaf5' : '#8da4be',
      }}
    >
      {label}
    </button>
  );
}

export default function FloodMap3D({ currentAlert, probabilityPct = null, boundary, alertColors, rainfallMm, windSignal, windDirectionDeg, condition, minutely, hourly, focusRequest, showFacilities, setShowFacilities }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const [styleKey, setStyleKey] = useState('liberty');
  const [rainDebugPreset, setRainDebugPreset] = useState(null); // dev-only override, see RainDebugControls
  // The HUD is big; on phones it starts collapsed to a one-line alert chip.
  const [hudOpen, setHudOpen] = useState(() => typeof window === 'undefined' || window.innerWidth >= 700);
  const [showHazard, setShowHazard] = useState(true);
  const [showWind, setShowWind] = useState(true);
  const [showRainFx, setShowRainFx] = useState(true);
  const [showEvac, setShowEvac] = useState(true);
  // null = live conditions; otherwise the forecast frame picked on the timeline.
  const [forecastFrame, setForecastFrame] = useState(null);
  const facilityMarkersRef = useRef([]);
  const currentAlertRef = useRef(currentAlert);
  currentAlertRef.current = currentAlert;
  const [showBuildings, setShowBuildings] = useState(true);
  const buildingPopupRef = useRef(null);
  const hoverIdRef = useRef(-1);
  const selectedIdRef = useRef(-1);
  const showBuildingsRef = useRef(showBuildings);
  showBuildingsRef.current = showBuildings;
  const showHazardRef = useRef(showHazard);
  showHazardRef.current = showHazard;
  const showFacilitiesRef = useRef(showFacilities);
  showFacilitiesRef.current = showFacilities;

  // Critical-facility markers (hospitals/schools) -- plain maplibregl.Marker
  // DOM overlays, not style layers, so they're created once on load rather
  // than inside addDataLayers (which re-runs on every basemap switch and
  // would otherwise duplicate them).
  const addFacilityMarkers = (map) => {
    if (facilityMarkersRef.current.length > 0) return;
    facilityMarkersRef.current = CRITICAL_FACILITIES.map(facility => {
      const el = createFacilityMarkerEl(facility);
      const style = FACILITY_STYLE[facility.facilityType];
      const popup = new maplibregl.Popup({ offset: 38, closeButton: false }).setHTML(`
        <div style="min-width:160px; padding:2px;">
          <div style="font-weight:700; font-size:0.85rem; margin-bottom:4px;">${facility.name}</div>
          <div style="display:inline-block; font-size:0.6rem; font-weight:700; text-transform:uppercase;
                      letter-spacing:0.04em; color:${style.color}; background:${style.color}18;
                      border:1px solid ${style.color}40; border-radius:4px; padding:2px 6px;">
            ${style.label}
          </div>
        </div>
      `);
      const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat([facility.position.lng, facility.position.lat])
        .setPopup(popup)
        .addTo(map);
      marker._facilityId = facility.id; // plain JS property, for lookup on focus-request below
      el.style.display = showFacilitiesRef.current ? 'flex' : 'none';
      return marker;
    });
  };

  // Hides the basemap's own extruded buildings while ours are showing.
  // Flat building footprints from the basemap stay visible either way.
  const applyBasemapBuildingVisibility = (map) => {
    const layers = map.getStyle()?.layers ?? [];
    layers.forEach(l => {
      if (l['source-layer'] === 'building' && l.type === 'fill-extrusion') {
        map.setLayoutProperty(l.id, 'visibility', showBuildingsRef.current ? 'none' : 'visible');
      }
    });
  };

  // Adds/re-adds all custom sources and layers. Called on first load AND
  // after every setStyle() call, since switching styles wipes any custom
  // sources/layers that were on the previous style.
  const addDataLayers = (map) => {
    const color = alertColors[currentAlertRef.current] || alertColors.NORMAL;
    const water = ALERT_WATER[currentAlertRef.current] || ALERT_WATER.NORMAL;

    if (!map.getSource('triangulo-roads')) {
      map.addSource('triangulo-roads', { type: 'geojson', data: roadsToGeoJSON(trianguloRoads) });
    }
    if (!map.getLayer('triangulo-roads-line')) {
      map.addLayer({
        id: 'triangulo-roads-line',
        type: 'line',
        source: 'triangulo-roads',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': color,
          'line-width': roadWidthExpression(),
          'line-opacity': 0.9,
        },
      });
    }

    // Extruded "water slab" -- a translucent flooded-plane polygon whose
    // height/opacity scale with alert severity. Added before the boundary
    // outline layers so the dashed boundary line still renders crisply on
    // top of it, and before the roads/buildings visually resolve via the
    // WebGL depth buffer regardless of add order.
    if (!map.getSource('triangulo-water')) {
      map.addSource('triangulo-water', { type: 'geojson', data: boundaryToPolygonGeoJSON(boundary) });
    }
    if (!map.getLayer('triangulo-water-fill')) {
      map.addLayer({
        id: 'triangulo-water-fill',
        type: 'fill-extrusion',
        source: 'triangulo-water',
        paint: {
          'fill-extrusion-color': WATER_COLOR,
          'fill-extrusion-height': water.height,
          'fill-extrusion-base': 0,
          'fill-extrusion-opacity': water.opacity,
        },
      });
    }

    // 25-yr flood hazard overlay -- own toggle, independent of the live
    // alert-driven water slab above. Added after the water slab / before
    // the boundary outline so the dashed boundary still renders crisply
    // on top of it.
    if (!map.getSource('triangulo-flood-hazard')) {
      map.addSource('triangulo-flood-hazard', { type: 'geojson', data: trianguloFloodHazard });
    }
    if (!map.getLayer('triangulo-flood-hazard-fill')) {
      map.addLayer({
        id: 'triangulo-flood-hazard-fill',
        type: 'fill-extrusion',
        source: 'triangulo-flood-hazard',
        layout: { visibility: showHazardRef.current ? 'visible' : 'none' },
        paint: {
          'fill-extrusion-color': ['get', 'color'],
          'fill-extrusion-height': HAZARD_HEIGHT,
          'fill-extrusion-base': 0,
          'fill-extrusion-opacity': 0.55,
        },
      });
    }

    // Real building footprints (Overture Maps / OpenStreetMap). Heights come
    // from num_floors where the data has it, otherwise an estimate from
    // footprint size (see scripts note in src/data) -- not surveyed heights.
    // The basemap's own 3D buildings are hidden while this layer is on so
    // the two don't overlap.
    if (!map.getSource('triangulo-buildings')) {
      map.addSource('triangulo-buildings', { type: 'geojson', data: EMPTY_FC });
      loadBuildings().then((data) => {
        try { map.getSource('triangulo-buildings')?.setData(data); } catch { /* map was torn down */ }
      });
    }
    if (!map.getLayer('triangulo-buildings-3d')) {
      map.addLayer({
        id: 'triangulo-buildings-3d',
        type: 'fill-extrusion',
        source: 'triangulo-buildings',
        layout: { visibility: showBuildingsRef.current ? 'visible' : 'none' },
        paint: {
          'fill-extrusion-color': BUILDING_COLOR,
          'fill-extrusion-height': ['get', 'h'],
          'fill-extrusion-base': 0,
          'fill-extrusion-opacity': 0.92,
        },
      });
    }
    if (!map.getLayer('triangulo-buildings-hl')) {
      map.addLayer({
        id: 'triangulo-buildings-hl',
        type: 'fill-extrusion',
        source: 'triangulo-buildings',
        filter: ['==', ['get', 'i'], -1],
        layout: { visibility: showBuildingsRef.current ? 'visible' : 'none' },
        paint: {
          'fill-extrusion-color': '#38bdf8',
          'fill-extrusion-height': ['+', ['get', 'h'], 0.6],
          'fill-extrusion-base': 0,
          'fill-extrusion-opacity': 0.95,
        },
      });
    }
    applyBasemapBuildingVisibility(map);

    if (!map.getSource('triangulo-boundary')) {
      map.addSource('triangulo-boundary', { type: 'geojson', data: boundaryToLineGeoJSON(boundary) });
    }
    if (!map.getLayer('triangulo-boundary-halo')) {
      map.addLayer({
        id: 'triangulo-boundary-halo',
        type: 'line',
        source: 'triangulo-boundary',
        layout: { 'line-join': 'round' },
        paint: { 'line-color': BOUNDARY_COLOR, 'line-width': 10, 'line-opacity': 0.25 },
      });
    }
    if (!map.getLayer('triangulo-boundary-line')) {
      map.addLayer({
        id: 'triangulo-boundary-line',
        type: 'line',
        source: 'triangulo-boundary',
        layout: { 'line-join': 'round' },
        paint: {
          'line-color': BOUNDARY_COLOR,
          'line-width': 3,
          'line-opacity': 1,
          'line-dasharray': [2, 1.5],
        },
      });
    }

    // Sky layer -- optional; wrapped in try/catch since older style JSON or
    // a MapLibre version mismatch could omit 'sky' layer-type support.
    if (!map.getLayer('triangulo-sky')) {
      try {
        map.addLayer({
          id: 'triangulo-sky',
          type: 'sky',
          paint: { 'sky-type': 'atmosphere', 'sky-atmosphere-sun-intensity': 8 },
        });
      } catch (e) {
        // sky layer unsupported -- lighting still applies via map.setLight()
      }
    }
  };

  const applyTimeOfDay = (map) => {
    const bucket = getLightBucket(new Date().getHours());
    const preset = LIGHT_PRESETS[bucket];
    map.setLight(preset.light);
    if (map.getLayer('triangulo-sky')) {
      map.setPaintProperty('triangulo-sky', 'sky-atmosphere-color', preset.sky.color);
      map.setPaintProperty('triangulo-sky', 'sky-atmosphere-halo-color', preset.sky.halo);
      map.setPaintProperty('triangulo-sky', 'sky-atmosphere-sun', preset.sky.sunPos);
      map.setPaintProperty('triangulo-sky', 'sky-opacity', preset.sky.opacity);
    }
    if (map.getLayer('background')) {
      map.setPaintProperty('background', 'background-color', preset.bg);
    }
  };

  // Highlight = the selected building if a popup is open, else the hovered one.
  const refreshBuildingHighlight = (map) => {
    if (!map.getLayer('triangulo-buildings-hl')) return;
    const id = selectedIdRef.current >= 0 ? selectedIdRef.current : hoverIdRef.current;
    map.setFilter('triangulo-buildings-hl', ['==', ['get', 'i'], id]);
  };

  const openBuildingPopup = (map, feature, lngLat) => {
    const { f: facilityId, c: type, h, e: estimated, i } = feature.properties;
    const facility = facilityId ? CRITICAL_FACILITIES.find(x => x.id === facilityId) : null;
    const style = type ? FACILITY_STYLE[type] : null;
    const hazard = hazardAt(lngLat.lng, lngLat.lat);
    const alert = currentAlertRef.current;
    const alertCol = alertColors[alert] || alertColors.NORMAL;
    const waterH = (ALERT_WATER[alert] || ALERT_WATER.NORMAL).height;
    const heightNum = Number(h);
    // The slab is a severity cue, not measured depth -- only say "reaches the
    // roofline" when it plainly does, otherwise leave depth out entirely.
    const slabNote = waterH > 0 && heightNum <= waterH
      ? 'Illustrative flood layer covers this building at the current alert level.'
      : '';

    const badge = (txt, color) => `<span style="display:inline-block; font-size:0.6rem; font-weight:700; text-transform:uppercase; letter-spacing:0.04em; color:${color}; background:${color}18; border:1px solid ${color}40; border-radius:4px; padding:2px 6px; margin-right:4px;">${txt}</span>`;

    buildingPopupRef.current?.remove();
    selectedIdRef.current = i;
    refreshBuildingHighlight(map);
    const popup = new maplibregl.Popup({ offset: 12, closeButton: true, maxWidth: '260px' })
      .setLngLat(lngLat)
      .setHTML(`
        <div style="min-width:190px; padding:2px;">
          <div style="font-weight:700; font-size:0.88rem; margin-bottom:5px;">${facility ? facility.name : 'Building'}</div>
          <div style="margin-bottom:6px;">
            ${style ? badge(style.label, style.color) : ''}
            ${hazard ? badge(`${hazard.hazard_level} flood hazard`, hazard.color) : badge('Outside mapped hazard zones', '#64748b')}
          </div>
          <div style="font-size:0.7rem; line-height:1.5; color:#475569;">
            <div>Live alert: <b style="color:${alertCol};">${alert}</b></div>
            <div>Height: ~${Math.round(heightNum)} m${estimated ? ' (estimated)' : ''}</div>
            ${slabNote ? `<div style="margin-top:3px;">${slabNote}</div>` : ''}
          </div>
          <div style="font-size:0.58rem; color:#94a3b8; margin-top:6px;">
            Hazard: 25-yr rainfall return period map. Building outline © OpenStreetMap contributors.
          </div>
        </div>
      `)
      .addTo(map);
    popup.on('close', () => {
      if (buildingPopupRef.current === popup) buildingPopupRef.current = null;
      selectedIdRef.current = -1;
      refreshBuildingHighlight(map);
    });
    buildingPopupRef.current = popup;
  };

  // Init map once on mount.
  useEffect(() => {
    if (!containerRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE_URLS.liberty,
      center: DEFAULT_VIEW.center,
      zoom: DEFAULT_VIEW.zoom,
      pitch: DEFAULT_VIEW.pitch,
      bearing: DEFAULT_VIEW.bearing,
      antialias: true,
    });
    mapRef.current = map;

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');

    // Layer-delegated listeners survive basemap switches (setStyle), so they
    // are registered once here rather than inside addDataLayers.
    map.on('click', 'triangulo-buildings-3d', (e) => {
      if (!pickingRef.current && e.features?.[0]) openBuildingPopup(map, e.features[0], e.lngLat);
    });
    map.on('mousemove', 'triangulo-buildings-3d', (e) => {
      map.getCanvas().style.cursor = pickingRef.current ? 'crosshair' : 'pointer';
      const id = e.features?.[0]?.properties?.i ?? -1;
      if (id !== hoverIdRef.current) {
        hoverIdRef.current = id;
        refreshBuildingHighlight(map);
      }
    });
    map.on('mouseleave', 'triangulo-buildings-3d', () => {
      map.getCanvas().style.cursor = pickingRef.current ? 'crosshair' : '';
      hoverIdRef.current = -1;
      refreshBuildingHighlight(map);
    });

    map.on('load', () => {
      addDataLayers(map);
      applyTimeOfDay(map);
      addFacilityMarkers(map);
    });

    // Keeps the canvas correctly sized whenever the container's box
    // changes -- e.g. when it's expanded to fullscreen and back -- not
    // just on window resize.
    const resizeObserver = new ResizeObserver(() => map.resize());
    resizeObserver.observe(containerRef.current);

    // Re-lights every 5 minutes so a long-running demo still drifts with
    // the real clock instead of freezing at whatever time the page opened.
    const lightTimer = setInterval(() => {
      if (mapRef.current && mapRef.current.isStyleLoaded()) applyTimeOfDay(mapRef.current);
    }, 5 * 60 * 1000);

    return () => {
      clearInterval(lightTimer);
      buildingPopupRef.current?.remove();
      resizeObserver.disconnect();
      facilityMarkersRef.current.forEach(marker => marker.remove());
      facilityMarkersRef.current = [];
      map.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Saved place: pin, route and evacuation centers on this map. Declared after
  // the init effect above so the map instance exists when its effects run.
  const pickingRef = useYourPlaceMap3D(mapRef, { currentAlert, showEvac, showPlace: false });

  // Toggle critical-facility marker visibility. Markers are plain DOM
  // overlays (not a style layer), so this just flips each element's
  // display rather than touching map state.
  useEffect(() => {
    facilityMarkersRef.current.forEach(marker => {
      marker.getElement().style.display = showFacilities ? 'flex' : 'none';
    });
  }, [showFacilities]);

  // Fly to + pop open a facility marker when a Critical Facilities card is
  // clicked (focusRequest set by the Dashboard). ts in focusRequest makes
  // re-clicking the same facility retrigger this even though the id repeats.
  useEffect(() => {
    const map = mapRef.current;
    if (!focusRequest || !map) return;
    const facility = CRITICAL_FACILITIES.find(f => f.id === focusRequest.id);
    if (!facility) return;
    setShowFacilities(true);
    const flyAndPop = () => {
      map.flyTo({ center: [facility.position.lng, facility.position.lat], zoom: 18, pitch: 55, duration: 1200 });
      const marker = facilityMarkersRef.current.find(m => m._facilityId === facility.id);
      const popup = marker?.getPopup();
      if (popup && !popup.isOpen()) marker.togglePopup();
    };
    if (map.isStyleLoaded()) flyAndPop();
    else map.once('load', flyAndPop);
  }, [focusRequest]);

  // Keep road color AND water slab height/opacity in sync with alert level.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const color = alertColors[currentAlert] || alertColors.NORMAL;
    const water = ALERT_WATER[currentAlert] || ALERT_WATER.NORMAL;
    const applyAlertState = () => {
      if (map.getLayer('triangulo-roads-line')) {
        map.setPaintProperty('triangulo-roads-line', 'line-color', color);
      }
      if (map.getLayer('triangulo-water-fill')) {
        map.setPaintProperty('triangulo-water-fill', 'fill-extrusion-height', water.height);
        map.setPaintProperty('triangulo-water-fill', 'fill-extrusion-opacity', water.opacity);
      }
    };
    if (map.isStyleLoaded()) applyAlertState();
    else map.once('load', applyAlertState);
  }, [currentAlert, alertColors]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      if (map.getLayer('triangulo-buildings-3d')) {
        map.setLayoutProperty('triangulo-buildings-3d', 'visibility', showBuildings ? 'visible' : 'none');
      }
      if (map.getLayer('triangulo-buildings-hl')) {
        map.setLayoutProperty('triangulo-buildings-hl', 'visibility', showBuildings ? 'visible' : 'none');
      }
      if (!showBuildings) buildingPopupRef.current?.remove();
      applyBasemapBuildingVisibility(map);
    };
    if (map.isStyleLoaded()) apply();
    else map.once('load', apply);
  }, [showBuildings]);

  // Toggle the flood hazard overlay's visibility without touching any
  // other layer.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const applyHazardVisibility = () => {
      if (map.getLayer('triangulo-flood-hazard-fill')) {
        map.setLayoutProperty('triangulo-flood-hazard-fill', 'visibility', showHazard ? 'visible' : 'none');
      }
    };
    if (map.isStyleLoaded()) applyHazardVisibility();
    else map.once('load', applyHazardVisibility);
  }, [showHazard]);

  // Handle basemap style switching -- setStyle() wipes custom layers, so
  // they're re-added (and re-lit) once the new style finishes loading.
  const handleStyleChange = (key) => {
    setStyleKey(key);
    const map = mapRef.current;
    if (!map) return;
    map.setStyle(STYLE_URLS[key]);
    map.once('style.load', () => {
      addDataLayers(map);
      applyTimeOfDay(map);
    });
  };

  const alertColor = alertColors[currentAlert] || alertColors.NORMAL;

  // Live wind speed = the "now" hourly record (same convention
  // WeatherForecast uses). A picked forecast frame overrides live values for
  // the rain effect, wind flow and HUD readouts; the alert colours/water slab
  // stay on the live alert level.
  const liveWindKph = hourly?.[0]?.wind_speed_kph ?? null;
  const liveGustKph = hourly?.[0]?.wind_gusts_kph ?? null;

  // Dev-only: RainDebugControls can override the live rainfall/condition
  // props so you can preview every intensity tier on demand. Selecting the
  // "Live data" preset clears the override (see handleRainDebugSelect).
  const effectiveRainfallMm = rainDebugPreset ? rainDebugPreset.mm : (forecastFrame ? forecastFrame.rainMm : rainfallMm);
  const effectiveCondition  = rainDebugPreset ? rainDebugPreset.condition : (forecastFrame ? forecastFrame.condition : condition);
  const effectiveWindKph    = forecastFrame?.windKph ?? liveWindKph;
  const effectiveGustKph    = forecastFrame ? (forecastFrame.gustKph ?? null) : liveGustKph;
  const effectiveWindDeg    = forecastFrame?.dirDeg ?? windDirectionDeg;
  const handleRainDebugSelect = (preset) => {
    setRainDebugPreset(preset.mm === null ? null : preset);
  };

  const handleRecenter = () => {
    mapRef.current?.flyTo({ ...DEFAULT_VIEW, duration: 800 });
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      <MapRecenterButton onClick={handleRecenter} />

      {/* ── Rain overlay ─────────────────────────────────────────────── */}
      {showRainFx && (
        <RainOverlay rainfallMm={effectiveRainfallMm} condition={effectiveCondition} windSignal={windSignal} />
      )}

      {/* ── Wind flow ────────────────────────────────────────────────── */}
      {showWind && (
        <WindFlowOverlay
          speedKph={effectiveWindKph}
          gustKph={effectiveGustKph}
          directionDeg={effectiveWindDeg}
          mapRef={mapRef}
        />
      )}

      <PlacePickBanner />

      {/* Dev-only tier preview -- stripped from production builds since
          import.meta.env.DEV is statically false there and bundlers
          tree-shake the dead branch. */}
      {import.meta.env.DEV && (
        <RainDebugControls
          activeLabel={rainDebugPreset?.label ?? 'Live data'}
          onSelect={handleRainDebugSelect}
        />
      )}

      {/* ── Floating HUD ─────────────────────────────────────────────── */}
      <div style={{
        position: 'absolute', top: 12, left: 12, zIndex: 5,
        background: 'rgba(13, 31, 60, 0.82)', backdropFilter: 'blur(6px)',
        border: `1px solid ${alertColor}50`, borderRadius: 8,
        padding: '10px 14px', minWidth: 176, maxWidth: 230,
        boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: hudOpen ? 8 : 0, transition: 'margin 0.25s ease' }}>
          <div style={{
            width: 8, height: 8, borderRadius: '50%', background: alertColor,
            boxShadow: `0 0 6px ${alertColor}`,
          }} />
          <span title="Live flood alert level" style={{
            fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.06em',
            color: alertColor, textTransform: 'uppercase',
          }}>
            {currentAlert}{probabilityPct != null ? ` · ${probabilityPct}%` : ''}
          </span>
          {forecastFrame && (
            <span style={{
              marginLeft: 'auto', fontSize: '0.55rem', fontWeight: 800, letterSpacing: '0.06em',
              color: '#fbbf24', border: '1px solid rgba(251,191,36,0.5)', borderRadius: 4, padding: '1px 5px',
            }}>
              FORECAST
            </span>
          )}
          <button
            type="button"
            onClick={() => setHudOpen(v => !v)}
            aria-expanded={hudOpen}
            aria-label={hudOpen ? 'Collapse map details' : 'Expand map details'}
            style={{
              marginLeft: forecastFrame ? 4 : 'auto', width: 22, height: 22, display: 'grid', placeItems: 'center',
              borderRadius: '50%', border: 'none', cursor: 'pointer', background: 'rgba(255,255,255,0.1)', color: '#cfe0f5',
              fontSize: '0.7rem', lineHeight: 1,
            }}
          >
            <span style={{ display: 'inline-block', transition: 'transform 0.25s ease', transform: hudOpen ? 'rotate(180deg)' : 'none' }}>▾</span>
          </button>
        </div>
        <div style={{ display: 'grid', gridTemplateRows: hudOpen ? '1fr' : '0fr', transition: 'grid-template-rows 0.3s ease' }}>
        <div style={{ minHeight: 0, overflow: 'hidden' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <span style={{ fontSize: '0.65rem', color: '#8da4be' }}>Rainfall</span>
            <span style={{ fontSize: '0.7rem', color: '#e2eaf5', fontWeight: 600 }}>
              {effectiveRainfallMm != null ? `${effectiveRainfallMm.toFixed(1)} mm/hr` : '—'}
            </span>
          </div>
          {effectiveWindKph != null && (
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <span style={{ fontSize: '0.65rem', color: '#8da4be' }}>Wind</span>
              <span style={{ fontSize: '0.7rem', color: '#e2eaf5', fontWeight: 600 }}>
                {Math.round(effectiveWindKph)} km/h{effectiveGustKph != null && effectiveGustKph > effectiveWindKph ? ` · gust ${Math.round(effectiveGustKph)}` : ''}
              </span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <span style={{ fontSize: '0.65rem', color: '#8da4be' }}>Wind Signal</span>
            <span style={{ fontSize: '0.7rem', color: '#e2eaf5', fontWeight: 600 }}>
              {windSignal != null ? `#${windSignal}` : '—'}
            </span>
          </div>
          {effectiveWindDeg != null && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: '0.65rem', color: '#8da4be' }}>Wind Dir</span>
              <span style={{ fontSize: '0.7rem', color: '#e2eaf5', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                <WindDirectionArrow deg={effectiveWindDeg} size={13} />
                {degToCardinal(effectiveWindDeg)} · {Math.round(effectiveWindDeg)}°
              </span>
            </div>
          )}
          {effectiveCondition && (
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <span style={{ fontSize: '0.65rem', color: '#8da4be' }}>Condition</span>
              <span style={{ fontSize: '0.7rem', color: '#e2eaf5', fontWeight: 600 }}>
                {effectiveCondition}
              </span>
            </div>
          )}

          {/* Layer switches */}
          <div style={{ marginTop: 4, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ fontSize: '0.56rem', fontWeight: 800, letterSpacing: '0.07em', color: '#5f7a9c', textTransform: 'uppercase', marginBottom: 6 }}>
              Layers
            </div>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              <LayerChip active={showHazard} label="Hazard" title="25-yr rainfall return period flood hazard" onClick={() => setShowHazard(v => !v)} />
              <LayerChip active={showFacilities} label="Facilities" title="Hospitals and schools -- exposure layer" onClick={() => setShowFacilities(v => !v)} />
              <LayerChip active={showBuildings} label="Buildings" title="Building footprints in 3D (heights partly estimated)" onClick={() => setShowBuildings(v => !v)} />
              <LayerChip active={showWind} label="Wind flow" title="Animated wind direction and strength (barangay-wide reading)" onClick={() => setShowWind(v => !v)} />
              <LayerChip active={showRainFx} label="Rain" title="Animated rain / cloud effect" onClick={() => setShowRainFx(v => !v)} />
              <LayerChip active={showEvac} label="Evac centers" title="Designated evacuation centers" onClick={() => setShowEvac(v => !v)} />
            </div>
          </div>

          {showHazard && (
            <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap', marginTop: 4 }}>
              {HAZARD_LEGEND.map(({ level, color }) => (
                <div key={level} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 7, height: 7, borderRadius: 2, background: color, flexShrink: 0 }} />
                  <span style={{ fontSize: '0.58rem', color: '#8da4be' }}>{level}</span>
                </div>
              ))}
            </div>
          )}
          {showFacilities && (
            <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
              {Object.values(FACILITY_STYLE).map(({ label, color }) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 }} />
                  <span style={{ fontSize: '0.58rem', color: '#8da4be' }}>{label}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        </div>
        </div>
      </div>

      {/* ── Forecast timeline (play / scrub, 1 hr + 24 hr) ──────────────── */}
      <MapTimeline minutely={minutely} hourly={hourly} onFrameChange={setForecastFrame} />

      {/* ── Basemap style switcher ──────────────────────────────────────── */}
      <div style={{
        position: 'absolute', bottom: 12, left: 12, zIndex: 5,
        display: 'flex', gap: 0, background: 'rgba(13, 31, 60, 0.82)',
        backdropFilter: 'blur(6px)', border: '1px solid rgba(56,189,248,0.3)',
        borderRadius: 6, overflow: 'hidden',
      }}>
        {Object.keys(STYLE_URLS).map(key => (
          <button key={key} onClick={() => handleStyleChange(key)} style={{
            padding: '5px 12px', fontSize: '0.65rem', fontWeight: 700,
            letterSpacing: '0.04em', cursor: 'pointer', border: 'none',
            background: styleKey === key ? 'var(--accent, #0ea5e9)' : 'transparent',
            color: styleKey === key ? '#fff' : '#8da4be',
            transition: 'all 0.2s',
          }}>
            {STYLE_LABELS[key]}
          </button>
        ))}
      </div>
    </div>
  );
}