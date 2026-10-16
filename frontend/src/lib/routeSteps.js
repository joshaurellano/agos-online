import { haversineDistanceKm } from './geo';

// Turns a route from lib/routing.js into plain walking steps, entirely
// client-side, using the street names already bundled in trianguloRoads.json.
// Each step is { kind: 'start' | 'turn' | 'straight' | 'arrive', street, km, turn }.

const pairKey = (a, b) => `${a.lat},${a.lng}|${b.lat},${b.lng}`;
let nameIndex = null;
let indexedRoads = null;

function getNameIndex(roads) {
  if (nameIndex && indexedRoads === roads) return nameIndex;
  const m = new Map();
  for (const way of roads) {
    if (!way.name) continue;
    for (let i = 0; i < way.positions.length - 1; i++) {
      const [aLat, aLng] = way.positions[i];
      const [bLat, bLng] = way.positions[i + 1];
      const a = { lat: aLat, lng: aLng };
      const b = { lat: bLat, lng: bLng };
      m.set(pairKey(a, b), way.name);
      m.set(pairKey(b, a), way.name);
    }
  }
  nameIndex = m;
  indexedRoads = roads;
  return m;
}

// Compass bearing a->b in degrees (local flat approximation is fine at this scale).
function bearing(a, b) {
  const cosLat = Math.cos((a.lat * Math.PI) / 180);
  const dx = (b.lng - a.lng) * cosLat;
  const dy = b.lat - a.lat;
  return ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
}

export function buildRouteSteps(route, roads) {
  if (!route?.roadPath || route.roadPath.length < 2) return [];
  const idx = getNameIndex(roads);
  const pts = route.roadPath;

  // One street name per segment. Segments next to a snapped (off-vertex) point
  // are not in the index, so they borrow the nearest named neighbour.
  const segs = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const km = haversineDistanceKm(pts[i], pts[i + 1]);
    if (km <= 0) continue;
    segs.push({ a: pts[i], b: pts[i + 1], km, name: idx.get(pairKey(pts[i], pts[i + 1])) || null });
  }
  if (!segs.length) return [];
  for (let i = 1; i < segs.length; i++) if (!segs[i].name) segs[i].name = segs[i - 1].name;
  for (let i = segs.length - 2; i >= 0; i--) if (!segs[i].name) segs[i].name = segs[i + 1].name;

  // Group consecutive segments on the same street.
  const groups = [];
  for (const s of segs) {
    const last = groups[groups.length - 1];
    if (last && last.street === s.name) { last.km += s.km; last.end = s; }
    else groups.push({ street: s.name, km: s.km, start: s, end: s });
  }

  const steps = [];
  if (route.startSnapKm > 0.25) {
    steps.push({ kind: 'walkToStreet', street: groups[0].street, km: route.startSnapKm });
  }
  groups.forEach((g, i) => {
    if (i === 0) { steps.push({ kind: 'start', street: g.street, km: g.km }); return; }
    const prev = groups[i - 1];
    const diff = ((bearing(g.start.a, g.start.b) - bearing(prev.end.a, prev.end.b) + 540) % 360) - 180;
    if (Math.abs(diff) < 25) steps.push({ kind: 'straight', street: g.street, km: g.km });
    else steps.push({ kind: 'turn', turn: diff > 0 ? 'right' : 'left', sharp: Math.abs(diff) > 120, street: g.street, km: g.km });
  });
  steps.push({ kind: 'arrive', km: route.destSnapKm > 0.25 ? route.destSnapKm : 0 });
  return steps;
}
