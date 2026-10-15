import { useCallback, useEffect, useMemo, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import { EVACUATION_CENTERS } from '../data/triangulo';
import { personalTier } from '../lib/personalRisk';
import { PIN_ASPECT, evacuationPinSvgMarkup } from '../data/criticalFacilities';
import { useYourPlace, TIER_COLORS } from './useYourPlace';

// 3D (MapLibre) counterpart of YourPlaceMapLayer: draws the visitor's saved
// place on the main map -- draggable pin, walking route, evacuation centers --
// and handles pick mode. A hook, not a component, because it needs the map
// instance FloodMap3D creates in its own effect; call it AFTER that effect.

const SRC = 'your-route';
const CASING = 'your-route-casing';
const LINE = 'your-route-line';

const lineFC = (coords) => ({
  type: 'FeatureCollection',
  features: coords.length > 1
    ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } }]
    : [],
});

export function useYourPlaceMap3D(mapRef, { currentAlert, showEvac = true, showPlace = true }) {
  const { place, inside, hazard, route, setPlace, picking, setPicking, focus } = useYourPlace();

  const tier = place && inside ? personalTier(currentAlert, hazard) : null;
  const color = tier != null ? TIER_COLORS[tier] : '#64748b';
  const coords = useMemo(() => (route ? route.path.map((p) => [p.lng, p.lat]) : []), [route]);

  const live = useRef({});
  live.current = { coords, color, showPlace };
  const pinRef = useRef(null);
  const evacRef = useRef([]);
  const pickingRef = useRef(picking);
  pickingRef.current = picking;

  // Route line. Custom sources/layers are wiped by every basemap switch, so
  // this re-runs on style.load; it also pulls the layers to the top so the
  // route draws over the roads/buildings the parent adds after us.
  const applyRoute = useCallback((map) => {
    if (!map || !map.isStyleLoaded()) return;
    const { coords: c, color: col, showPlace: show } = live.current;
    const data = lineFC(show ? c : []);
    const src = map.getSource(SRC);
    if (src) src.setData(data); else map.addSource(SRC, { type: 'geojson', data });
    if (!map.getLayer(CASING)) {
      map.addLayer({ id: CASING, type: 'line', source: SRC, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': 10, 'line-opacity': 0.9 } });
    }
    if (!map.getLayer(LINE)) {
      map.addLayer({ id: LINE, type: 'line', source: SRC, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': col, 'line-width': 5 } });
    }
    map.setPaintProperty(LINE, 'line-color', col);
    map.moveLayer(CASING);
    map.moveLayer(LINE);
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return undefined;
    const now = () => applyRoute(map);
    const onStyle = () => map.once('idle', now);
    map.on('load', now);
    map.on('style.load', onStyle);
    if (map.isStyleLoaded()) now();
    return () => { try { map.off('load', now); map.off('style.load', onStyle); } catch { /* map already removed */ } };
  }, [mapRef, applyRoute]);

  useEffect(() => { applyRoute(mapRef.current); }, [coords, color, showPlace, mapRef, applyRoute]);

  // Pin
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!place || !showPlace) { pinRef.current?.remove(); pinRef.current = null; return; }
    if (!pinRef.current) {
      const el = document.createElement('div');
      el.className = 'yp-pin-wrap';
      el.style.cssText = 'width:28px;height:28px;';
      el.innerHTML = '<span class="yp-pin"></span>';
      const marker = new maplibregl.Marker({ element: el, draggable: true, anchor: 'center', offset: [0, -17] })
        .setLngLat([place.lng, place.lat]).addTo(map);
      marker.on('dragend', () => { const ll = marker.getLngLat(); setPlace({ lat: ll.lat, lng: ll.lng }); });
      pinRef.current = marker;
    } else {
      pinRef.current.setLngLat([place.lng, place.lat]);
    }
    pinRef.current.getElement().firstChild.style.setProperty('--c', color);
  }, [place, showPlace, color, mapRef, setPlace]);

  // Evacuation centers (green = the one your route leads to)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!showEvac) { evacRef.current.forEach((m) => m.remove()); evacRef.current = []; return; }
    if (!evacRef.current.length) {
      evacRef.current = EVACUATION_CENTERS.map((c) => {
        const el = document.createElement('div');
        el.setAttribute('role', 'img');
        el.setAttribute('aria-label', c.name);
        el.style.cursor = 'pointer';
        const popup = new maplibregl.Popup({ offset: 38, closeButton: false }).setText(c.name);
        const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat([c.position.lng, c.position.lat]).setPopup(popup).addTo(map);
        marker._evacId = c.id;
        return marker;
      });
    }
    evacRef.current.forEach((m) => {
      const hi = route?.center.id === m._evacId;
      const el = m.getElement();
      el.innerHTML = evacuationPinSvgMarkup({ highlighted: hi });
      const w = hi ? 36 : 30;
      el.style.width = `${w}px`;
      el.style.height = `${Math.round(w * PIN_ASPECT)}px`;
      el.style.zIndex = hi ? '2' : '';
    });
  }, [showEvac, route, mapRef]);

  // Pick mode: the next tap on the map sets the place.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return undefined;
    const onClick = (e) => {
      if (!pickingRef.current) return;
      setPlace({ lat: e.lngLat.lat, lng: e.lngLat.lng });
      setPicking(false);
    };
    map.on('click', onClick);
    return () => { try { map.off('click', onClick); } catch { /* map already removed */ } };
  }, [mapRef, setPlace, setPicking]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return undefined;
    map.getCanvas().style.cursor = picking ? 'crosshair' : '';
    if (!picking) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setPicking(false); };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); try { map.getCanvas().style.cursor = ''; } catch { /* removed */ } };
  }, [picking, mapRef, setPicking]);

  // Fly to the pin / route when the card asks. Starts at the current value so
  // a remount (switching 2D/3D) doesn't replay an old request.
  const handled = useRef(focus.ts);
  useEffect(() => {
    if (focus.ts === handled.current) return;
    handled.current = focus.ts;
    const map = mapRef.current;
    if (!map || !place) return;
    if (inside && coords.length > 1) {
      const bounds = coords.reduce((b, c) => b.extend(c), new maplibregl.LngLatBounds(coords[0], coords[0]));
      map.fitBounds(bounds, { padding: 90, maxZoom: 18, pitch: 55, duration: 1200 });
    } else {
      map.flyTo({ center: [place.lng, place.lat], zoom: 18, pitch: 55, duration: 1200 });
    }
  }, [focus.ts, place, inside, coords, mapRef]);

  // Marker cleanup on unmount (the map itself is removed by FloodMap3D).
  useEffect(() => () => {
    pinRef.current?.remove(); pinRef.current = null;
    evacRef.current.forEach((m) => m.remove()); evacRef.current = [];
  }, []);

  return pickingRef;
}
