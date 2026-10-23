import { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import '../lib/maplibreSetup';
import trianguloRoads from '../data/trianguloRoads.json';
// ~850 KB of footprints: fetched as its own chunk after the map is up instead of
// blocking the first paint, and cached for style switches.
let buildingsPromise = null;
const loadBuildings = () => (buildingsPromise ??= import('../data/trianguloBuildings.json').then((m) => m.default));
const EMPTY_FC = { type: 'FeatureCollection', features: [] };
import RainOverlay from './RainOverlay';
import RainDebugControls from './RainDebugControls';
import MapTimeline from './MapTimeline';
import WindFlowOverlay from './WindFlowOverlay';
import WindDirectionArrow, { degToCardinal } from './WindDirectionArrow';
import { MapRecenterButton } from './ui';
import PlacePickBanner from './PlacePickBanner';
import { addZoneLines, createZoneMarkers, setZoneLinesVisible, setZoneMarkersVisible } from '../lib/zoneLayers';

// Road class -> line weight, matching the 2D FloodMap's ROAD_WEIGHT so the
// two views read consistently (trunk/primary thicker, service thinner).
const ROAD_WEIGHT = {
  trunk: 5, trunk_link: 4, primary: 5, secondary: 4,
  tertiary: 3, tertiary_link: 3, busway: 3,
  unclassified: 2, residential: 2, service: 1,
};

// Neutral building colour.
const BUILDING_COLOR = '#c9d3df';

const BOUNDARY_COLOR = '#38bdf8';
const WATER_COLOR = '#1e88e5';

// Shared between the initial map setup and the recenter button, so the two
// can never drift apart.
const DEFAULT_VIEW = { center: [123.1905, 13.618], zoom: 16.2, pitch: 55, bearing: -17 };

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

// ─── Fixed daytime lighting ────────────────────────────────────────────────
// The map always uses the same bright daytime look, whatever the clock says.
// map.setLight() is core MapLibre style-spec API, shared across all three
// OpenFreeMap styles.
const DAY_LIGHT = { color: '#ffffff', intensity: 0.5, position: [1.5, 210, 45] };
const DAY_SKY = {
  'sky-color': '#bcdcff',
  'horizon-color': '#ffffff',
  'fog-color': '#ffffff',
  'sky-horizon-blend': 0.6,
  'horizon-fog-blend': 0.6,
  'fog-ground-blend': 0.2,
  'atmosphere-blend': 0.8,
};

// ─── Basemap look: labels + per-style tone ─────────────────────────────────
// The three OpenFreeMap styles all ship small, pale labels, and once the
// roads/buildings/zone overlays are on top they look nearly identical. So
// after every style load we (1) make the basemap's text darker, bigger and
// haloed, and (2) give each style its own ground tone and building colour.
// Originals are cached so a style can be re-toned without reloading it.
const LABEL_SCALE = 1.2;

const STYLE_LOOKS = {
  // Natural OSM colours, left as shipped.
  liberty:  { building: '#cdd6e2', sat: 1,    mix: null,            mixAmount: 0 },
  // Same map, noticeably more saturated, with warm sand buildings.
  bright:   { building: '#f0dcc0', sat: 1.5,  mix: null,            mixAmount: 0 },
  // Near-greyscale with a cool blue-grey cast; white buildings so the
  // coloured overlays stand out.
  positron: { building: '#ffffff', sat: 0.15, mix: [214, 224, 238], mixAmount: 0.3 },
};

const COLOR_PROPS = ['background-color', 'fill-color', 'fill-outline-color', 'line-color'];

function parseColor(str) {
  if (typeof str !== 'string') return null;
  const v = str.trim().toLowerCase();
  let m = v.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/);
  if (m) {
    let h = m[1];
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), 1];
  }
  m = v.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/);
  if (m) return [+m[1], +m[2], +m[3], m[4] == null ? 1 : +m[4]];
  m = v.match(/^hsla?\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*(?:,\s*([\d.]+)\s*)?\)$/);
  if (m) {
    const h = +m[1] / 360, s2 = +m[2] / 100, l = +m[3] / 100;
    const f = (p, q, t) => {
      if (t < 0) t += 1; if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s2) : l + s2 - l * s2, p = 2 * l - q;
    return [f(p, q, h + 1 / 3) * 255, f(p, q, h) * 255, f(p, q, h - 1 / 3) * 255, m[4] == null ? 1 : +m[4]];
  }
  return null;
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

const hsla = (h, s, l, a) => `hsla(${h.toFixed(1)}, ${(Math.min(1, s) * 100).toFixed(1)}%, ${(l * 100).toFixed(1)}%, ${a})`;

// Walks a paint value (plain colour, stop function or expression) and maps
// every literal colour string in it.
function mapColors(value, fn) {
  if (typeof value === 'string') {
    const c = parseColor(value);
    return c ? fn(c) : value;
  }
  if (Array.isArray(value)) return value.map(v => mapColors(v, fn));
  if (value && typeof value === 'object') {
    const out = {};
    for (const k of Object.keys(value)) out[k] = mapColors(value[k], fn);
    return out;
  }
  return value;
}

// Ground colour -> this style's tone (saturation scale, then a tint).
function toneGround([r, g, b, a], look) {
  const [h, s, l] = rgbToHsl(r, g, b);
  let [nr, ng, nb] = parseColor(hsla(h, s * look.sat, l, a));
  if (look.mix) {
    nr += (look.mix[0] - nr) * look.mixAmount;
    ng += (look.mix[1] - ng) * look.mixAmount;
    nb += (look.mix[2] - nb) * look.mixAmount;
  }
  return `rgba(${Math.round(nr)}, ${Math.round(ng)}, ${Math.round(nb)}, ${a})`;
}

// Label colour -> same hue, much darker, so it reads on any ground.
function darkenText([r, g, b, a]) {
  const [h, s, l] = rgbToHsl(r, g, b);
  return hsla(h, Math.max(s, 0.1), Math.min(l, 0.22), a);
}

// Scales a text-size value (number, legacy stops, or interpolate/step
// expression) when every output is a plain number; otherwise leaves it.
function scaleSize(v, k) {
  const sc = n => +(n * k).toFixed(2);
  if (typeof v === 'number') return sc(v);
  if (v && typeof v === 'object' && !Array.isArray(v) && Array.isArray(v.stops)) {
    return v.stops.every(st => typeof st[1] === 'number') ? { ...v, stops: v.stops.map(([z, n]) => [z, sc(n)]) } : v;
  }
  if (Array.isArray(v) && (v[0] === 'interpolate' || v[0] === 'step')) {
    const first = v[0] === 'interpolate' ? 4 : 2;
    const idx = [];
    for (let i = first; i < v.length; i += 2) idx.push(i);
    if (!idx.every(i => typeof v[i] === 'number')) return v;
    return v.map((x, i) => (idx.includes(i) ? sc(x) : x));
  }
  return v;
}

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

export default function FloodMap3D({ currentAlert, probabilityPct = null, boundary, alertColors, rainfallMm, windSignal, windDirectionDeg, condition, minutely, hourly }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const [styleKey, setStyleKey] = useState('liberty');
  const [rainDebugPreset, setRainDebugPreset] = useState(null); // dev-only override, see RainDebugControls
  // The HUD is big; on phones it starts collapsed to a one-line alert chip.
  const [hudOpen, setHudOpen] = useState(() => typeof window === 'undefined' || window.innerWidth >= 700);
  const [showWind, setShowWind] = useState(true);
  const [showRainFx, setShowRainFx] = useState(true);
  const [showZones, setShowZones] = useState(true);
  // null = live conditions; otherwise the forecast frame picked on the timeline.
  const [forecastFrame, setForecastFrame] = useState(null);
  const zoneMarkersRef = useRef([]);
  const baseStyleRef = useRef({});
  const showZonesRef = useRef(true);
  const currentAlertRef = useRef(currentAlert);
  currentAlertRef.current = currentAlert;
  const [showBuildings, setShowBuildings] = useState(true);
  const buildingPopupRef = useRef(null);
  const hoverIdRef = useRef(-1);
  const selectedIdRef = useRef(-1);
  const showBuildingsRef = useRef(showBuildings);
  showBuildingsRef.current = showBuildings;
  showZonesRef.current = showZones;

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

    // Our overlays go UNDER the basemap's first text label, so street and
    // place names are never covered by the road/zone/boundary lines.
    const labelAnchor = (map.getStyle()?.layers ?? []).find(
      l => l.type === 'symbol' && l.layout?.['text-field'] !== undefined && !l.id.startsWith('triangulo-'),
    )?.id;
    const addBelowLabels = (layer) => map.addLayer(layer, labelAnchor);

    if (!map.getSource('triangulo-roads')) {
      map.addSource('triangulo-roads', { type: 'geojson', data: roadsToGeoJSON(trianguloRoads) });
    }
    if (!map.getLayer('triangulo-roads-line')) {
      addBelowLabels({
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
      addBelowLabels({
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
      addBelowLabels({
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
      addBelowLabels({
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
      addBelowLabels({
        id: 'triangulo-boundary-halo',
        type: 'line',
        source: 'triangulo-boundary',
        layout: { 'line-join': 'round' },
        paint: { 'line-color': BOUNDARY_COLOR, 'line-width': 10, 'line-opacity': 0.25 },
      });
    }
    if (!map.getLayer('triangulo-boundary-line')) {
      addBelowLabels({
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

    // Purok zone dividers (style layers, so re-added after a basemap switch).
    addZoneLines(map, showZonesRef.current, labelAnchor);
  };

  const applyDayLighting = (map) => {
    map.setLight(DAY_LIGHT);
    // MapLibre has no 'sky' layer type -- the sky is a style-level property.
    try {
      map.setSky(DAY_SKY);
    } catch { /* sky not supported -- lighting still applies */ }
  };

  // Per-style ground tone + building colour, and clearer basemap labels.
  const applyStyleLook = (map, key) => {
    const look = STYLE_LOOKS[key] ?? STYLE_LOOKS.liberty;
    const cache = baseStyleRef.current;
    const layers = map.getStyle()?.layers ?? [];
    const retone = look.sat !== 1 || look.mix;

    layers.forEach(l => {
      if (l.id.startsWith('triangulo-')) return;
      const paint = l.paint || {};
      const layout = l.layout || {};

      // Ground colours (land, water, parks, roads...). Skipped for symbols.
      if (l.type !== 'symbol') {
        COLOR_PROPS.forEach(p => {
          const ck = `${l.id}|${p}`;
          if (paint[p] === undefined && cache[ck] === undefined) return;
          if (cache[ck] === undefined) cache[ck] = paint[p];
          try { map.setPaintProperty(l.id, p, retone ? mapColors(cache[ck], c => toneGround(c, look)) : cache[ck]); } catch { /* not valid for this layer */ }
        });
        return;
      }

      // Labels: darker, haloed, bigger. Light-on-dark text (e.g. road
      // shields) is left alone.
      if (layout['text-field'] === undefined) return;
      const tk = `${l.id}|text-color`;
      if (cache[tk] === undefined) cache[tk] = paint['text-color'] ?? '#000000';
      const lit = parseColor(cache[tk]);
      if (lit && rgbToHsl(lit[0], lit[1], lit[2])[2] >= 0.62) return;
      try {
        map.setPaintProperty(l.id, 'text-color', mapColors(cache[tk], c => (rgbToHsl(c[0], c[1], c[2])[2] < 0.62 ? darkenText(c) : c)));
        map.setPaintProperty(l.id, 'text-halo-color', '#ffffff');
        map.setPaintProperty(l.id, 'text-halo-width', 2);
        map.setPaintProperty(l.id, 'text-halo-blur', 0.4);
        const sk = `${l.id}|text-size`;
        if (cache[sk] === undefined) cache[sk] = layout['text-size'] ?? 16;
        map.setLayoutProperty(l.id, 'text-size', scaleSize(cache[sk], LABEL_SCALE));
      } catch { /* property not valid for this layer */ }
    });

    if (map.getLayer('triangulo-buildings-3d')) {
      map.setPaintProperty('triangulo-buildings-3d', 'fill-extrusion-color', look.building);
    }
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
      if (e.features?.[0]) openBuildingPopup(map, e.features[0], e.lngLat);
    });
    map.on('mousemove', 'triangulo-buildings-3d', (e) => {
      map.getCanvas().style.cursor = 'pointer';
      const id = e.features?.[0]?.properties?.i ?? -1;
      if (id !== hoverIdRef.current) {
        hoverIdRef.current = id;
        refreshBuildingHighlight(map);
      }
    });
    map.on('mouseleave', 'triangulo-buildings-3d', () => {
      map.getCanvas().style.cursor = '';
      hoverIdRef.current = -1;
      refreshBuildingHighlight(map);
    });

    map.on('load', () => {
      addDataLayers(map);
      applyDayLighting(map);
      applyStyleLook(map, 'liberty');
      zoneMarkersRef.current = createZoneMarkers(maplibregl, map, showZonesRef.current);
    });

    // Keeps the canvas correctly sized whenever the container's box
    // changes -- e.g. when it's expanded to fullscreen and back -- not
    // just on window resize.
    const resizeObserver = new ResizeObserver(() => map.resize());
    resizeObserver.observe(containerRef.current);

    return () => {
      buildingPopupRef.current?.remove();
      resizeObserver.disconnect();
      zoneMarkersRef.current.forEach(marker => marker.remove());
      zoneMarkersRef.current = [];
      map.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // Purok zone overlay: divider lines are a style layer, badges are DOM markers.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    setZoneMarkersVisible(zoneMarkersRef.current, showZones);
    const apply = () => setZoneLinesVisible(map, showZones);
    if (map.isStyleLoaded()) apply();
    else map.once('load', apply);
  }, [showZones]);

  // Handle basemap style switching -- setStyle() wipes custom layers, so
  // they're re-added (and re-lit) once the new style finishes loading.
  const handleStyleChange = (key) => {
    setStyleKey(key);
    const map = mapRef.current;
    if (!map) return;
    baseStyleRef.current = {};
    map.setStyle(STYLE_URLS[key]);
    map.once('style.load', () => {
      addDataLayers(map);
      applyDayLighting(map);
      applyStyleLook(map, key);
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
              <LayerChip active={showZones} label="Zones" title="Purok zone boundaries 1-7 (from the official Naga City barangay map)" onClick={() => setShowZones(v => !v)} />
              <LayerChip active={showBuildings} label="Buildings" title="Building footprints in 3D (heights partly estimated)" onClick={() => setShowBuildings(v => !v)} />
              <LayerChip active={showWind} label="Wind flow" title="Animated wind direction and strength (barangay-wide reading)" onClick={() => setShowWind(v => !v)} />
              <LayerChip active={showRainFx} label="Rain" title="Animated rain / cloud effect" onClick={() => setShowRainFx(v => !v)} />
            </div>
          </div>
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