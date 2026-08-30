import { useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import trianguloRoads from '../data/trianguloRoads.json';

// Road class -> line weight, matching the 2D FloodMap's ROAD_WEIGHT so the
// two views read consistently (trunk/primary thicker, service thinner).
const ROAD_WEIGHT = {
  trunk: 5, trunk_link: 4, primary: 5, secondary: 4,
  tertiary: 3, tertiary_link: 3, busway: 3,
  unclassified: 2, residential: 2, service: 1,
};

const BOUNDARY_COLOR = '#38bdf8';

function roadsToGeoJSON(roads) {
  return {
    type: 'FeatureCollection',
    features: roads.map(road => ({
      type: 'Feature',
      properties: { id: road.id, name: road.name, highway: road.highway },
      geometry: {
        type: 'LineString',
        // MapLibre/GeoJSON wants [lng, lat] -- trianguloRoads.json stores
        // [lat, lng] (Leaflet convention), so flip it here.
        coordinates: road.positions.map(([lat, lng]) => [lng, lat]),
      },
    })),
  };
}

function boundaryToGeoJSON(boundary) {
  return {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'LineString',
      coordinates: boundary.map(p => [p.lng, p.lat]),
    },
  };
}

// MapLibre's line-width can be a data-driven expression keyed off a
// property -- this builds the ['match', ['get','highway'], ...] expression
// once from ROAD_WEIGHT instead of hardcoding it inline.
function roadWidthExpression() {
  const expr = ['match', ['get', 'highway']];
  Object.entries(ROAD_WEIGHT).forEach(([hw, w]) => { expr.push(hw, w); });
  expr.push(2); // fallback width
  return expr;
}

export default function FloodMap3D({ currentAlert, boundary, alertColors }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);

  // Init map once on mount.
  useEffect(() => {
    if (!containerRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: 'https://tiles.openfreemap.org/styles/liberty',
      center: [123.1905, 13.618],
      zoom: 16.2,
      pitch: 55,
      bearing: -17,
      antialias: true,
    });
    mapRef.current = map;

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');

    map.on('load', () => {
      const color = alertColors[currentAlert] || alertColors.NORMAL;

      map.addSource('triangulo-roads', { type: 'geojson', data: roadsToGeoJSON(trianguloRoads) });
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

      map.addSource('triangulo-boundary', { type: 'geojson', data: boundaryToGeoJSON(boundary) });
      // Halo underneath (wide, soft) + sharp line on top, same trick as the 2D map.
      map.addLayer({
        id: 'triangulo-boundary-halo',
        type: 'line',
        source: 'triangulo-boundary',
        layout: { 'line-join': 'round' },
        paint: { 'line-color': BOUNDARY_COLOR, 'line-width': 10, 'line-opacity': 0.25 },
      });
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
    });

    return () => map.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // init once -- currentAlert/boundary changes are handled below, not by re-init

  // Keep road color in sync with alert level without rebuilding the map.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const color = alertColors[currentAlert] || alertColors.NORMAL;
    const applyColor = () => {
      if (map.getLayer('triangulo-roads-line')) {
        map.setPaintProperty('triangulo-roads-line', 'line-color', color);
      }
    };
    if (map.isStyleLoaded()) applyColor();
    else map.once('load', applyColor);
  }, [currentAlert, alertColors]);

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: 420, borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}
    />
  );
}
