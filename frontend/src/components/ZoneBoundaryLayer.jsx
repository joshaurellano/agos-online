import { Polyline, Marker } from 'react-leaflet';
import L from 'leaflet';
import { TRIANGULO_ZONES, TRIANGULO_ZONE_LINES } from '../data/triangulo';
import { ZONE_COLOR } from '../lib/zoneLayers';

// Purok-zone overlay for the 2D (Leaflet) maps: dashed dividers between zones
// and a "Zone N" badge in each. Non-interactive so it never steals clicks from
// the barangay polygon or the markers underneath.
const zoneIcons = TRIANGULO_ZONES.map(zone => ({
  zone,
  icon: L.divIcon({
    className: 'zone-badge',
    html: `<span style="display:inline-block;padding:2px 7px;border-radius:999px;font:700 11px/1.3 system-ui,sans-serif;color:#451a03;background:${ZONE_COLOR};border:1.5px solid rgba(255,255,255,0.9);box-shadow:0 1px 4px rgba(0,0,0,0.35);white-space:nowrap;transform:translate(-50%,-50%);position:absolute">${zone.name}</span>`,
    iconSize: [0, 0],
  }),
}));

const LINE_POSITIONS = TRIANGULO_ZONE_LINES.map(line => line.map(p => [p.lat, p.lng]));

export default function ZoneBoundaryLayer() {
  return (
    <>
      {LINE_POSITIONS.map((positions, i) => (
        <Polyline
          key={i}
          positions={positions}
          interactive={false}
          pathOptions={{ color: ZONE_COLOR, weight: 2.5, opacity: 0.95, dashArray: '8 5' }}
        />
      ))}
      {zoneIcons.map(({ zone, icon }) => (
        <Marker
          key={zone.id}
          position={[zone.label.lat, zone.label.lng]}
          icon={icon}
          interactive={false}
          keyboard={false}
        />
      ))}
    </>
  );
}
