// ─── Road-network routing ───────────────────────────────────────────────────
// Turns the OSM-derived street data in data/trianguloRoads.json into a graph
// and routes across it with Dijkstra, instead of the straight-line distance
// haversineDistanceKm() gives in lib/geo.js. That's fine for "how far is this
// facility as the crow flies" (Dashboard's exposure stats), but wrong for
// "how do I actually get there" -- a flooded canal or a row of buildings
// between two points isn't something a resident can walk through.
//
// Everything here runs client-side against the ~1,700-point road bundle
// already shipped with the app, so "find my nearest evacuation center" works
// with no routing API, no API key, and no network call -- which matters when
// the people using it may be doing so with spotty connectivity mid-flood.

import { haversineDistanceKm } from './geo';

// Vertices are keyed by rounded lat/lng so that two road ways which meet at
// the same OSM-exported intersection coordinate collapse onto one graph
// node instead of staying as two disconnected dead ends.
const KEY_PRECISION = 6; // ~0.11m at this latitude -- exact-intersection matching only

function keyOf(lat, lng) {
  return `${lat.toFixed(KEY_PRECISION)},${lng.toFixed(KEY_PRECISION)}`;
}

// Build the graph once (e.g. via useMemo) and reuse it for every route
// lookup -- this is the expensive-ish part (~1,700 points), routing itself
// is cheap.
export function buildRoadGraph(roads) {
  const nodes = new Map();      // key -> { lat, lng }
  const adjacency = new Map();  // key -> [{ to: key, dist: km }]
  const segments = [];          // every road edge, flat, for snapping

  const ensureNode = (lat, lng) => {
    const key = keyOf(lat, lng);
    if (!nodes.has(key)) {
      nodes.set(key, { lat, lng });
      adjacency.set(key, []);
    }
    return key;
  };

  const addEdge = (aKey, bKey, dist) => {
    adjacency.get(aKey).push({ to: bKey, dist });
    adjacency.get(bKey).push({ to: aKey, dist });
  };

  for (const way of roads) {
    const pts = way.positions;
    for (let i = 0; i < pts.length - 1; i++) {
      const [aLat, aLng] = pts[i];
      const [bLat, bLng] = pts[i + 1];
      const aKey = ensureNode(aLat, aLng);
      const bKey = ensureNode(bLat, bLng);
      const dist = haversineDistanceKm({ lat: aLat, lng: aLng }, { lat: bLat, lng: bLng });
      if (dist > 0) {
        addEdge(aKey, bKey, dist);
        segments.push({ aKey, bKey, a: { lat: aLat, lng: aLng }, b: { lat: bLat, lng: bLng } });
      }
    }
  }

  return { nodes, adjacency, segments };
}

// Projects `point` onto segment a-b. Longitude is scaled by cos(latitude)
// first so the tiny local patch (a few hundred meters, at barangay scale)
// is treated as roughly square before projecting -- plain lat/lng
// projection would skew slightly toward the east-west axis otherwise.
function projectOntoSegment(point, a, b) {
  const cosLat = Math.cos((a.lat * Math.PI) / 180);
  const ax = a.lng * cosLat, ay = a.lat;
  const bx = b.lng * cosLat, by = b.lat;
  const px = point.lng * cosLat, py = point.lat;

  const dx = bx - ax, dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));

  return { lat: a.lat + t * (b.lat - a.lat), lng: a.lng + t * (b.lng - a.lng) };
}

// Finds the closest point anywhere on the road network to an arbitrary
// {lat,lng} -- a GPS fix or an evacuation center that doesn't sit exactly on
// a road vertex -- and grafts it onto the graph as a temporary node
// connected to the two endpoints of whichever segment it landed on. Kept
// separate from the shared graph so repeated snaps don't pollute it.
export function snapToGraph(graph, point, tempId) {
  let best = null;
  for (const seg of graph.segments) {
    const proj = projectOntoSegment(point, seg.a, seg.b);
    const d = haversineDistanceKm(point, proj);
    if (!best || d < best.dist) best = { dist: d, proj, seg };
  }
  if (!best) return null;

  const { proj, seg } = best;
  return {
    key: `__snap_${tempId}`,
    point: proj,
    snapDistanceKm: best.dist,
    edges: [
      { to: seg.aKey, dist: haversineDistanceKm(proj, seg.a) },
      { to: seg.bKey, dist: haversineDistanceKm(proj, seg.b) },
    ],
  };
}

// Plain-array Dijkstra from a single snapped start node across the whole
// graph. The road graph tops out around ~1,700 nodes at barangay scale, so
// a linear scan for the minimum each step comfortably beats the overhead of
// a real priority queue for a one-off, client-side computation.
function dijkstra(graph, startSnap) {
  const dist = new Map([[startSnap.key, 0]]);
  const prev = new Map();
  const visited = new Set();
  const frontier = new Map([[startSnap.key, true]]);

  const neighborsOf = (key) => (key === startSnap.key ? startSnap.edges : (graph.adjacency.get(key) || []));

  while (frontier.size) {
    let uKey = null, uDist = Infinity;
    for (const key of frontier.keys()) {
      const d = dist.get(key) ?? Infinity;
      if (d < uDist) { uDist = d; uKey = key; }
    }
    if (uKey === null) break;
    frontier.delete(uKey);
    if (visited.has(uKey)) continue;
    visited.add(uKey);

    for (const { to, dist: edgeDist } of neighborsOf(uKey)) {
      if (visited.has(to)) continue;
      const alt = uDist + edgeDist;
      if (alt < (dist.get(to) ?? Infinity)) {
        dist.set(to, alt);
        prev.set(to, uKey);
        frontier.set(to, true);
      }
    }
  }

  return { dist, prev };
}

// Walks a dijkstra prev-map back from `viaKey` to the start node and
// reconstructs the ordered list of {lat,lng} points along the way.
function reconstructRoadPoints(graph, dijkstraResult, startSnap, viaKey) {
  const keys = [viaKey];
  let cur = viaKey;
  while (cur !== startSnap.key) {
    const p = dijkstraResult.prev.get(cur);
    if (p === undefined) break; // disconnected -- shouldn't happen on a connected barangay graph
    keys.push(p);
    cur = p;
  }
  keys.reverse();
  return keys.map(k => (k === startSnap.key ? startSnap.point : graph.nodes.get(k)));
}

// Distance (km) beyond which a snap is treated as "off the mapped network"
// rather than "close enough to be basically on a road". trianguloRoads.json
// only covers Barangay Triangulo itself, so a start point in a neighboring
// barangay (or anywhere outside that ~3km box) snaps to whichever mapped
// road happens to be nearest -- which can be a genuinely long straight-line
// jump. That jump is real and worth flagging, not a bug in the pathfinding.
export const OFF_NETWORK_THRESHOLD_KM = 0.25;

// A bigger gap than OFF_NETWORK_THRESHOLD_KM: past this, the point isn't
// just "off the nearest street" -- it's realistically outside Barangay
// Triangulo altogether, so the message shown should say that plainly
// instead of talking about "mapped roads" in the abstract.
export const OUTSIDE_BARANGAY_THRESHOLD_KM = 1;

// Full route from an arbitrary point (already-run dijkstra) out to one
// snapped destination -- total distance plus the polyline to draw.
function routeTo(graph, dijkstraResult, startSnap, destSnap, originPoint, destPoint) {
  const [e1, e2] = destSnap.edges;
  const d1 = (dijkstraResult.dist.get(e1.to) ?? Infinity) + e1.dist;
  const d2 = (dijkstraResult.dist.get(e2.to) ?? Infinity) + e2.dist;
  const viaKey = d1 <= d2 ? e1.to : e2.to;
  const roadDist = Math.min(d1, d2);
  if (!Number.isFinite(roadDist)) return null;

  const roadPoints = reconstructRoadPoints(graph, dijkstraResult, startSnap, viaKey);
  const totalKm = startSnap.snapDistanceKm + roadDist + destSnap.snapDistanceKm;

  // roadPoints already starts at startSnap.point (the origin's projection
  // onto the network) and ends at a real road node near the destination --
  // that whole stretch is genuine road-following. The two legs outside it
  // (originPoint -> startSnap.point, destSnap.point -> destPoint) are
  // straight-line "how far off the mapped network is this point" jumps,
  // kept separate so the map can draw them differently instead of letting
  // them blend into what looks like an unbroken road route.
  return {
    totalKm,
    path: [originPoint, ...roadPoints, destSnap.point, destPoint],
    roadPath: [...roadPoints, destSnap.point],
    offNetworkStart: [originPoint, startSnap.point],
    offNetworkEnd: [destSnap.point, destPoint],
    startSnapKm: startSnap.snapDistanceKm,
    destSnapKm: destSnap.snapDistanceKm,
  };
}

const WALK_KPH = 4.5; // average walking pace, used for the ETA shown alongside distance

export function estimateWalkMinutes(km) {
  return Math.max(1, Math.round((km / WALK_KPH) * 60));
}

// Main entry point: given the road graph, a starting point (e.g. the
// resident's GPS location), and a list of {id, position} evacuation
// centers, returns the nearest one by actual street distance -- not
// straight-line -- plus the route to draw and an ETA.
export function findNearestCenterByRoad(graph, originPoint, centers) {
  const startSnap = snapToGraph(graph, originPoint, 'origin');
  if (!startSnap) return null;

  const dijkstraResult = dijkstra(graph, startSnap);

  let best = null;
  for (const center of centers) {
    const destSnap = snapToGraph(graph, center.position, center.id);
    if (!destSnap) continue;
    const route = routeTo(graph, dijkstraResult, startSnap, destSnap, originPoint, center.position);
    if (route && (!best || route.totalKm < best.totalKm)) {
      best = { center, ...route, walkMinutes: estimateWalkMinutes(route.totalKm) };
    }
  }
  return best;
}
