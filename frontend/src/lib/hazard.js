// Point-in-polygon lookups against the bundled flood hazard map
// (trianguloFloodHazard.json: 25-year rainfall return period, classes 1-3).
// Pure functions, no network: the whole check runs on the resident's device.

import hazardGeoJson from '../data/trianguloFloodHazard.json';

// Ray casting on one ring of [lng, lat] pairs.
function inRing(lng, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

// A polygon is [outerRing, ...holes]: inside the outer ring and not in a hole.
function inPolygon(lng, lat, polygon) {
  if (!inRing(lng, lat, polygon[0])) return false;
  for (let h = 1; h < polygon.length; h++) {
    if (inRing(lng, lat, polygon[h])) return false;
  }
  return true;
}

function inGeometry(lng, lat, geometry) {
  if (geometry.type === 'Polygon') return inPolygon(lng, lat, geometry.coordinates);
  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates.some((poly) => inPolygon(lng, lat, poly));
  }
  return false;
}

// Is the point inside the barangay boundary ([{lat,lng}, ...])?
export function pointInBoundary(point, boundary) {
  const ring = boundary.map((p) => [p.lng, p.lat]);
  return inRing(point.lng, point.lat, ring);
}

export const HAZARD_LABELS = { 0: 'None', 1: 'Low', 2: 'Medium', 3: 'High' };

// Highest hazard class (1 low, 2 medium, 3 high) that covers the point, or 0
// when the point is not inside any mapped flood zone.
export function hazardAtPoint(point) {
  let best = 0;
  for (const feature of hazardGeoJson.features) {
    const cls = feature.properties?.hazard_class ?? 0;
    if (cls > best && inGeometry(point.lng, point.lat, feature.geometry)) best = cls;
  }
  return best;
}

export const hazardGeoJsonData = hazardGeoJson;
