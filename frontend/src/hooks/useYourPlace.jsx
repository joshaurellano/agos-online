import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import trianguloRoads from '../data/trianguloRoads.json';
import { TRIANGULO_BOUNDARY, EVACUATION_CENTERS } from '../data/triangulo';
import { buildRoadGraph, findNearestCenterByRoad } from '../lib/routing';
import { hazardAtPoint, pointInBoundary } from '../lib/hazard';

// "Your Place" state, shared by the summary card and the main map.
// The card used to own this (plus a second map of its own); lifting it here
// lets the one main map draw the pin and route while the card stays a plain
// summary. The pin lives only in this browser's localStorage, same key as
// before, so places people already saved keep working.

const STORAGE_KEY = 'agos-your-place';
export const TIER_COLORS = ['#22c55e', '#eab308', '#f97316', '#ef4444'];

export const CENTROID = {
  lat: TRIANGULO_BOUNDARY.reduce((s, p) => s + p.lat, 0) / TRIANGULO_BOUNDARY.length,
  lng: TRIANGULO_BOUNDARY.reduce((s, p) => s + p.lng, 0) / TRIANGULO_BOUNDARY.length,
};

// Building the road graph is the only heavy step, so do it once, lazily.
let cachedGraph = null;
const getGraph = () => (cachedGraph ??= buildRoadGraph(trianguloRoads));

function loadPlace() {
  try {
    const p = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (p && Number.isFinite(p.lat) && Number.isFinite(p.lng)) return p;
  } catch { /* storage unavailable or corrupt: start empty */ }
  return null;
}
function savePlace(place) {
  try {
    if (place) localStorage.setItem(STORAGE_KEY, JSON.stringify(place));
    else localStorage.removeItem(STORAGE_KEY);
  } catch { /* ignore */ }
}

// Scroll the page so the main map card sits under the sticky topbar.
export function scrollToMapCard() {
  const el = document.getElementById('flood-status-map');
  if (!el) return;
  const topbarH = document.querySelector('.topbar')?.offsetHeight ?? 60;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - topbarH - 8, behavior: reduce ? 'auto' : 'smooth' });
}

const YourPlaceContext = createContext(null);

export function YourPlaceProvider({ children }) {
  const [place, setPlaceState] = useState(loadPlace);
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState(null);
  // Pick mode: the next tap on the main map sets the place.
  const [picking, setPicking] = useState(false);
  // Bumped to ask the map to fly to the pin / route.
  const [focus, setFocus] = useState({ ts: 0 });

  const setPlace = useCallback((p) => { setPlaceState(p); savePlace(p); setGeoError(null); }, []);
  const requestFocus = useCallback(() => setFocus({ ts: Date.now() }), []);

  const locate = useCallback(() => {
    if (!navigator.geolocation) { setGeoError('Location is not available on this device.'); return; }
    setLocating(true); setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => { setLocating(false); setPlace({ lat: pos.coords.latitude, lng: pos.coords.longitude }); },
      (err) => {
        setLocating(false);
        setGeoError(err.code === err.PERMISSION_DENIED
          ? 'Location permission was denied. You can choose on the map instead.'
          : 'Could not get your location. Try again or choose on the map.');
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }, [setPlace]);

  const inside = useMemo(() => (place ? pointInBoundary(place, TRIANGULO_BOUNDARY) : false), [place]);
  const hazard = useMemo(() => (place && inside ? hazardAtPoint(place) : 0), [place, inside]);
  const route = useMemo(
    () => (place && inside ? findNearestCenterByRoad(getGraph(), place, EVACUATION_CENTERS) : null),
    [place, inside],
  );

  const value = useMemo(() => ({
    place, setPlace, inside, hazard, route, locating, geoError, locate,
    picking, setPicking, focus, requestFocus,
  }), [place, setPlace, inside, hazard, route, locating, geoError, locate, picking, focus, requestFocus]);

  return <YourPlaceContext.Provider value={value}>{children}</YourPlaceContext.Provider>;
}

export function useYourPlace() {
  const ctx = useContext(YourPlaceContext);
  if (!ctx) throw new Error('useYourPlace must be used inside <YourPlaceProvider>');
  return ctx;
}
