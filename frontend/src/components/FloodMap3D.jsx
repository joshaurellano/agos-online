import { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import '../lib/maplibreSetup';
import trianguloRoads from '../data/trianguloRoads.json';
import RainOverlay from './RainOverlay';
import RainDebugControls from './RainDebugControls';
import MinuteForecastStrip from './MinuteForecastStrip';
import WindDirectionArrow, { degToCardinal } from './WindDirectionArrow';

// Road class -> line weight, matching the 2D FloodMap's ROAD_WEIGHT so the
// two views read consistently (trunk/primary thicker, service thinner).
const ROAD_WEIGHT = {
  trunk: 5, trunk_link: 4, primary: 5, secondary: 4,
  tertiary: 3, tertiary_link: 3, busway: 3,
  unclassified: 2, residential: 2, service: 1,
};

const BOUNDARY_COLOR = '#38bdf8';
const WATER_COLOR = '#1e88e5';

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

export default function FloodMap3D({ currentAlert, boundary, alertColors, rainfallMm, windSignal, windDirectionDeg, condition, minutely }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const [styleKey, setStyleKey] = useState('liberty');
  const [rainDebugPreset, setRainDebugPreset] = useState(null); // dev-only override, see RainDebugControls
  const currentAlertRef = useRef(currentAlert);
  currentAlertRef.current = currentAlert;

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

  // Init map once on mount.
  useEffect(() => {
    if (!containerRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE_URLS.liberty,
      center: [123.1905, 13.618],
      zoom: 16.2,
      pitch: 55,
      bearing: -17,
      antialias: true,
    });
    mapRef.current = map;

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');

    map.on('load', () => {
      addDataLayers(map);
      applyTimeOfDay(map);
    });

    // Re-lights every 5 minutes so a long-running demo still drifts with
    // the real clock instead of freezing at whatever time the page opened.
    const lightTimer = setInterval(() => {
      if (mapRef.current && mapRef.current.isStyleLoaded()) applyTimeOfDay(mapRef.current);
    }, 5 * 60 * 1000);

    return () => {
      clearInterval(lightTimer);
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

  // Dev-only: RainDebugControls can override the live rainfall/condition
  // props so you can preview every intensity tier on demand. Selecting the
  // "Live data" preset clears the override (see handleRainDebugSelect).
  const effectiveRainfallMm = rainDebugPreset ? rainDebugPreset.mm : rainfallMm;
  const effectiveCondition  = rainDebugPreset ? rainDebugPreset.condition : condition;
  const handleRainDebugSelect = (preset) => {
    setRainDebugPreset(preset.mm === null ? null : preset);
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: 420, borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      {/* ── Rain overlay ─────────────────────────────────────────────── */}
      <RainOverlay rainfallMm={effectiveRainfallMm} condition={effectiveCondition} windSignal={windSignal} />

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
        padding: '10px 14px', minWidth: 168,
        boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          <div style={{
            width: 8, height: 8, borderRadius: '50%', background: alertColor,
            boxShadow: `0 0 6px ${alertColor}`,
          }} />
          <span style={{
            fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.06em',
            color: alertColor, textTransform: 'uppercase',
          }}>
            {currentAlert}
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <span style={{ fontSize: '0.65rem', color: '#8da4be' }}>🌧 Rainfall</span>
            <span style={{ fontSize: '0.7rem', color: '#e2eaf5', fontWeight: 600 }}>
              {effectiveRainfallMm != null ? `${effectiveRainfallMm.toFixed(1)} mm/hr` : '—'}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <span style={{ fontSize: '0.65rem', color: '#8da4be' }}>🌀 Wind Signal</span>
            <span style={{ fontSize: '0.7rem', color: '#e2eaf5', fontWeight: 600 }}>
              {windSignal != null ? `#${windSignal}` : '—'}
            </span>
          </div>
          {windDirectionDeg != null && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: '0.65rem', color: '#8da4be' }}>🧭 Wind Dir</span>
              <span style={{ fontSize: '0.7rem', color: '#e2eaf5', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                <WindDirectionArrow deg={windDirectionDeg} size={13} />
                {degToCardinal(windDirectionDeg)} · {Math.round(windDirectionDeg)}°
              </span>
            </div>
          )}
          {effectiveCondition && (
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <span style={{ fontSize: '0.65rem', color: '#8da4be' }}>☁ Condition</span>
              <span style={{ fontSize: '0.7rem', color: '#e2eaf5', fontWeight: 600 }}>
                {effectiveCondition}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── Minute forecast (precipitation) ─────────────────────────────── */}
      <MinuteForecastStrip minutely={minutely} />

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