import { useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import '../lib/maplibreSetup';
import RainOverlay from './RainOverlay';
import { MapRecenterButton } from './ui';

const BOUNDARY_COLOR = '#38bdf8';
const ROUTE_COLOR = '#22c55e';

// Shared between the initial map setup and the recenter button, so the two
// can never drift apart.
const DEFAULT_VIEW = { center: [123.1905, 13.618], zoom: 16.2, pitch: 55, bearing: -17 };

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

const EMPTY_FEATURE_COLLECTION = { type: 'FeatureCollection', features: [] };

// Same route shape FloodMapPage computes via lib/routing.js's
// findNearestCenterByRoad() -- { path: [{lat,lng}, ...], ... }.
function routeToGeoJSON(route) {
  if (!route) return EMPTY_FEATURE_COLLECTION;
  return {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: route.path.map(p => [p.lng, p.lat]) },
    }],
  };
}

// Same pulsing "you are here" dot used on the 2D map (USER_LOCATION_ICON in
// FloodMapPage.jsx), built as a real DOM node for maplibregl.Marker.
function buildUserLocationElement() {
  const wrapper = document.createElement('div');
  wrapper.style.position = 'relative';
  wrapper.style.width = '20px';
  wrapper.style.height = '20px';
  wrapper.innerHTML = `
    <div style="position:absolute; inset:0; border-radius:50%; background:#38bdf8; opacity:0.28; animation: pulse-ring 1.6s ease-out infinite;"></div>
    <div style="position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); width:12px; height:12px; border-radius:50%; background:#38bdf8; border:2px solid #fff; box-shadow:0 1px 4px rgba(0,0,0,0.4);"></div>
  `;
  return wrapper;
}

// Builds the same pin-with-label DOM element the 2D page uses
// (createCenterIcon in FloodMapPage.jsx), but as a real DOM node for
// maplibregl.Marker instead of a Leaflet divIcon HTML string.
function buildMarkerElement(center) {
  const wrapper = document.createElement('div');
  wrapper.style.position = 'relative';
  wrapper.style.width = '30px';
  wrapper.style.height = '30px';
  wrapper.style.cursor = 'pointer';

  wrapper.innerHTML = `
    <div style="
      position:absolute; bottom:100%; left:50%; transform:translateX(-50%);
      margin-bottom:6px;
      background:${center.color}; color:#fff; font-size:10px; font-weight:700;
      padding:2px 7px; border-radius:4px; white-space:nowrap;
      box-shadow:0 1px 4px rgba(0,0,0,0.35);
    ">
      ${center.name}
    </div>
    <div style="
      position:absolute; inset:0; border-radius:50%;
      background:${center.color}33; border:2px solid ${center.color};
    "></div>
    <div style="
      position:absolute; top:50%; left:50%; transform:translate(-50%,-50%);
      width:12px; height:12px; border-radius:50%;
      background:${center.color}; border:2px solid #fff;
      box-shadow:0 1px 3px rgba(0,0,0,0.35);
    "></div>
  `;
  return wrapper;
}

function buildPopupHTML(center) {
  return `
    <div style="min-width:200px; padding:4px 2px; font-family:inherit;">
      <div style="font-weight:700; font-size:0.9rem; margin-bottom:4px;">
        ${center.name}
      </div>
      <div style="
        display:inline-block; font-size:0.65rem; font-weight:700;
        color:${center.color}; background:${center.color}18;
        border:1px solid ${center.color}40; border-radius:4px;
        padding:2px 6px; margin-bottom:6px;
      ">
        ${center.type}
      </div>
      <div style="font-size:0.75rem; color:#333; line-height:1.4; margin-top:2px;">
        ${center.address}
      </div>
      <div style="font-size:0.72rem; color:#666; font-family:monospace; margin-top:6px;">
        ${center.position.lat.toFixed(4)}, ${center.position.lng.toFixed(4)}
      </div>
    </div>
  `;
}

export default function EvacuationMap3D({ boundary, evacuationCenters, rainfallMm, condition, windSignal, route }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const userMarkerRef = useRef(null);
  const mapLoadedRef = useRef(false);
  // Keeps the route sync function reading the latest prop even though it's
  // only wired up once, inside the mount effect's `load` handler.
  const routeRef = useRef(route);
  routeRef.current = route;

  // Pushes the current route onto the map: updates the route-line source,
  // (re)places the "you are here" marker, and flies the camera to frame the
  // whole route. Safe to call before the style has finished loading -- the
  // mount effect only calls it from inside `map.on('load')`, and the
  // route-sync effect below guards on mapLoadedRef.
  const syncRoute = () => {
    const map = mapRef.current;
    if (!map || !map.getSource('evac-route')) return;
    const currentRoute = routeRef.current;

    map.getSource('evac-route').setData(routeToGeoJSON(currentRoute));

    if (userMarkerRef.current) {
      userMarkerRef.current.remove();
      userMarkerRef.current = null;
    }

    if (currentRoute) {
      userMarkerRef.current = new maplibregl.Marker({ element: buildUserLocationElement(), anchor: 'center' })
        .setLngLat([currentRoute.userPoint.lng, currentRoute.userPoint.lat])
        .setPopup(new maplibregl.Popup({ offset: 16 }).setText('You are here'))
        .addTo(map);

      const lngs = currentRoute.path.map(p => p.lng);
      const lats = currentRoute.path.map(p => p.lat);
      const bounds = [
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)],
      ];
      map.fitBounds(bounds, { padding: 80, pitch: DEFAULT_VIEW.pitch, bearing: DEFAULT_VIEW.bearing, duration: 900 });
    }
  };

  useEffect(() => {
    if (!containerRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: 'https://tiles.openfreemap.org/styles/liberty',
      center: DEFAULT_VIEW.center,
      zoom: DEFAULT_VIEW.zoom,
      pitch: DEFAULT_VIEW.pitch,
      bearing: DEFAULT_VIEW.bearing,
      antialias: true,
    });
    mapRef.current = map;

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');

    // Keeps the canvas correctly sized whenever the container's box
    // changes -- e.g. when it's expanded to fullscreen and back -- not
    // just on window resize.
    const resizeObserver = new ResizeObserver(() => map.resize());
    resizeObserver.observe(containerRef.current);

    map.on('load', () => {
      map.addSource('triangulo-boundary', { type: 'geojson', data: boundaryToGeoJSON(boundary) });
      map.addLayer({
        id: 'triangulo-boundary-halo',
        type: 'line',
        source: 'triangulo-boundary',
        layout: { 'line-join': 'round' },
        paint: { 'line-color': BOUNDARY_COLOR, 'line-width': 10, 'line-opacity': 0.2 },
      });
      map.addLayer({
        id: 'triangulo-boundary-line',
        type: 'line',
        source: 'triangulo-boundary',
        layout: { 'line-join': 'round' },
        paint: {
          'line-color': BOUNDARY_COLOR,
          'line-width': 2.5,
          'line-opacity': 0.8,
          'line-dasharray': [3, 2],
        },
      });

      // Route (via-roads walking path to the nearest evacuation center).
      // Starts empty; syncRoute() below fills it in once a route exists.
      map.addSource('evac-route', { type: 'geojson', data: EMPTY_FEATURE_COLLECTION });
      map.addLayer({
        id: 'evac-route-halo',
        type: 'line',
        source: 'evac-route',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': ROUTE_COLOR, 'line-width': 9, 'line-opacity': 0.18 },
      });
      map.addLayer({
        id: 'evac-route-line',
        type: 'line',
        source: 'evac-route',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': ROUTE_COLOR,
          'line-width': 4,
          'line-opacity': 0.9,
          'line-dasharray': [1, 2],
        },
      });

      evacuationCenters.forEach(center => {
        const popup = new maplibregl.Popup({ offset: 28 }).setHTML(buildPopupHTML(center));
        new maplibregl.Marker({ element: buildMarkerElement(center), anchor: 'center' })
          .setLngLat([center.position.lng, center.position.lat])
          .setPopup(popup)
          .addTo(map);
      });

      mapLoadedRef.current = true;
      syncRoute(); // picks up a route that was already set before the style finished loading
    });

    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapLoadedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-sync whenever the route changes (new "find nearest" result, or
  // cleared) after the map is already up and running.
  useEffect(() => {
    if (mapLoadedRef.current) syncRoute();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      <RainOverlay rainfallMm={rainfallMm} condition={condition} windSignal={windSignal} />
      <MapRecenterButton onClick={() => mapRef.current?.flyTo({ ...DEFAULT_VIEW, duration: 800 })} />
    </div>
  );
}
