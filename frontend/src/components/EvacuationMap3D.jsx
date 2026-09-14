import { useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import '../lib/maplibreSetup';
import RainOverlay from './RainOverlay';

const BOUNDARY_COLOR = '#38bdf8';

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

export default function EvacuationMap3D({ boundary, evacuationCenters, rainfallMm, condition, windSignal }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);

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

      evacuationCenters.forEach(center => {
        const popup = new maplibregl.Popup({ offset: 28 }).setHTML(buildPopupHTML(center));
        new maplibregl.Marker({ element: buildMarkerElement(center), anchor: 'center' })
          .setLngLat([center.position.lng, center.position.lat])
          .setPopup(popup)
          .addTo(map);
      });
    });

    return () => map.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ position: 'relative', width: '100%', height: 500, overflow: 'hidden' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      <RainOverlay rainfallMm={rainfallMm} condition={condition} windSignal={windSignal} />
    </div>
  );
}
