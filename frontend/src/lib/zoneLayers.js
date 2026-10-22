// Purok-zone overlay for the MapLibre (3D) maps: dashed divider lines between
// zones plus a "Zone N" badge in each zone. Shared so the flood map and the
// evacuation map draw them identically. Data comes from data/triangulo.js.
import { TRIANGULO_ZONES, TRIANGULO_ZONE_LINES } from '../data/triangulo';

export const ZONE_COLOR = '#fbbf24';

const SOURCE_ID = 'triangulo-zone-lines';
const HALO_ID = 'triangulo-zone-lines-halo';
const LINE_ID = 'triangulo-zone-lines-line';

const linesGeoJSON = () => ({
  type: 'FeatureCollection',
  features: TRIANGULO_ZONE_LINES.map(line => ({
    type: 'Feature',
    properties: {},
    geometry: { type: 'LineString', coordinates: line.map(p => [p.lng, p.lat]) },
  })),
});

// Style layers: wiped by map.setStyle(), so call again after each style load
// (safe to call repeatedly -- it skips anything that already exists).
export function addZoneLines(map, visible = true) {
  if (!map.getSource(SOURCE_ID)) {
    map.addSource(SOURCE_ID, { type: 'geojson', data: linesGeoJSON() });
  }
  const visibility = visible ? 'visible' : 'none';
  if (!map.getLayer(HALO_ID)) {
    map.addLayer({
      id: HALO_ID,
      type: 'line',
      source: SOURCE_ID,
      layout: { 'line-join': 'round', visibility },
      paint: { 'line-color': ZONE_COLOR, 'line-width': 7, 'line-opacity': 0.18 },
    });
  }
  if (!map.getLayer(LINE_ID)) {
    map.addLayer({
      id: LINE_ID,
      type: 'line',
      source: SOURCE_ID,
      layout: { 'line-join': 'round', visibility },
      paint: { 'line-color': ZONE_COLOR, 'line-width': 2.2, 'line-opacity': 0.95, 'line-dasharray': [4, 2] },
    });
  }
}

export function setZoneLinesVisible(map, visible) {
  const visibility = visible ? 'visible' : 'none';
  [HALO_ID, LINE_ID].forEach(id => {
    if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', visibility);
  });
}

// DOM badges (not a style layer, so they survive basemap switches and need no
// font glyphs from the style). Returns the markers so callers can toggle or
// remove them.
export function createZoneMarkers(maplibregl, map, visible = true) {
  return TRIANGULO_ZONES.map(zone => {
    const el = document.createElement('div');
    el.textContent = zone.name;
    el.title = `Purok ${zone.name}`;
    el.style.cssText = [
      'padding:2px 7px', 'border-radius:999px', 'font:700 11px/1.3 system-ui,sans-serif',
      'color:#451a03', `background:${ZONE_COLOR}`, 'border:1.5px solid rgba(255,255,255,0.9)',
      'box-shadow:0 1px 4px rgba(0,0,0,0.4)', 'pointer-events:none', 'white-space:nowrap',
      `display:${visible ? 'block' : 'none'}`,
    ].join(';');
    return new maplibregl.Marker({ element: el, anchor: 'center' })
      .setLngLat([zone.label.lng, zone.label.lat])
      .addTo(map);
  });
}

export function setZoneMarkersVisible(markers, visible) {
  markers.forEach(m => { m.getElement().style.display = visible ? 'block' : 'none'; });
}
