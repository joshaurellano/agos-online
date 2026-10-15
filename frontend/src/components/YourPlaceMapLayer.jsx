import { useEffect, useMemo, useRef } from 'react';
import { Marker, Polyline, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { EVACUATION_CENTERS } from '../data/triangulo';
import { PIN_ASPECT, evacuationPinSvgMarkup } from '../data/criticalFacilities';
import { personalTier } from '../lib/personalRisk';
import { useYourPlace, TIER_COLORS } from '../hooks/useYourPlace';

// Draws the visitor's saved place on the main (2D) map: draggable pin, walking
// route to the nearest evacuation center, and the evacuation centers
// themselves. Also owns "pick mode" (tap the map to set your place).

const pinIcon = (color) => L.divIcon({
  className: 'yp-pin-wrap',
  html: `<span class="yp-pin" style="--c:${color}"></span>`,
  iconSize: [28, 28],
  iconAnchor: [14, 31], // the teardrop's tip, so the pin marks the exact spot
});

// Evacuation-center pins (tip = the exact spot). Two variants, built once.
const evacIcon = (highlighted) => {
  const w = highlighted ? 36 : 30;
  const h = Math.round(w * PIN_ASPECT);
  return L.divIcon({
    html: evacuationPinSvgMarkup({ highlighted }),
    className: '',
    iconSize: [w, h],
    iconAnchor: [w / 2, Math.round(h * 0.94)],
    tooltipAnchor: [0, -Math.round(h * 0.85)],
  });
};
const EVAC_ICON = evacIcon(false);
const EVAC_ICON_NEAREST = evacIcon(true);

// Rendered inside <MapContainer>.
export default function YourPlaceMapLayer({ currentAlert, showEvac = true, showPlace = true }) {
  const map = useMap();
  const { place, inside, hazard, route, setPlace, picking, setPicking, focus } = useYourPlace();

  const tier = place && inside ? personalTier(currentAlert, hazard) : null;
  const color = tier != null ? TIER_COLORS[tier] : '#64748b';

  useMapEvents({
    click(e) {
      if (!picking) return;
      setPlace({ lat: e.latlng.lat, lng: e.latlng.lng });
      setPicking(false);
    },
  });

  // Crosshair cursor + Esc to cancel while picking.
  useEffect(() => {
    const el = map.getContainer();
    el.style.cursor = picking ? 'crosshair' : '';
    if (!picking) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setPicking(false); };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); el.style.cursor = ''; };
  }, [picking, map, setPicking]);

  // Fly to the pin / route when the card asks. Starts at the current value so
  // a remount (e.g. switching 2D/3D) doesn't re-trigger an old request.
  const handled = useRef(focus.ts);
  useEffect(() => {
    if (focus.ts === handled.current) return;
    handled.current = focus.ts;
    if (!place) return;
    const pts = inside && route ? route.path.map((p) => [p.lat, p.lng]) : [[place.lat, place.lng]];
    if (pts.length > 1) map.fitBounds(pts, { padding: [70, 70], maxZoom: 17 });
    else map.setView(pts[0], 17);
  }, [focus.ts, place, inside, route, map]);

  const dragHandlers = useMemo(() => ({
    dragend: (e) => { const ll = e.target.getLatLng(); setPlace({ lat: ll.lat, lng: ll.lng }); },
  }), [setPlace]);

  return (
    <>
      {showEvac && EVACUATION_CENTERS.map((c) => (
        <Marker
          key={c.id}
          position={[c.position.lat, c.position.lng]}
          icon={route?.center.id === c.id ? EVAC_ICON_NEAREST : EVAC_ICON}
          zIndexOffset={route?.center.id === c.id ? 500 : 0}
          title={c.name}
          alt={c.name}
        >
          <Tooltip direction="top">{c.name}</Tooltip>
        </Marker>
      ))}
      {showPlace && route && (
        <Polyline positions={route.path.map((p) => [p.lat, p.lng])} pathOptions={{ color, weight: 5, opacity: 0.9 }} />
      )}
      {showPlace && place && (
        <Marker position={[place.lat, place.lng]} icon={pinIcon(color)} draggable eventHandlers={dragHandlers} />
      )}
    </>
  );
}
