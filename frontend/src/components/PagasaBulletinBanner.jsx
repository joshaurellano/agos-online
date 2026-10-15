import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, CircleMarker, Polyline, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import { usePagasaBulletin, TCWS_INFO, PAGASA_BULLETIN_PAGE } from '../lib/pagasa';
import { TRIANGULO_CENTER } from '../data/triangulo';

// Shows PAGASA's official Tropical Cyclone Wind Signal for Naga City, taken
// from the latest Tropical Cyclone Bulletin. Renders nothing when there is no
// active cyclone. Whenever the bulletin could not be read reliably it says so
// and points at the official bulletin instead of implying "no signal".

function FitBounds({ points }) {
  const map = useMap();
  useEffect(() => {
    if (points.length > 1) map.fitBounds(L.latLngBounds(points), { padding: [28, 28], maxZoom: 9 });
  }, [map, points]);
  return null;
}

function TrackMap({ bulletin }) {
  const naga = [TRIANGULO_CENTER.lat, TRIANGULO_CENTER.lng];
  const center = bulletin.center_lat != null ? [Number(bulletin.center_lat), Number(bulletin.center_lon)] : null;
  const track = (bulletin.track ?? []).map(p => [p.lat, p.lon]);
  const line = center ? [center, ...track] : track;
  const all = [naga, ...line];
  return (
    <div style={{ height: 260, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--blue-border)' }}>
      <MapContainer center={naga} zoom={7} style={{ height: '100%', width: '100%' }} scrollWheelZoom={false}>
        <TileLayer attribution="&copy; OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <FitBounds points={all} />
        <CircleMarker center={naga} radius={7} pathOptions={{ color: '#fff', weight: 2, fillColor: '#2563eb', fillOpacity: 1 }}>
          <Tooltip permanent direction="top" offset={[0, -6]}>Barangay Triangulo</Tooltip>
        </CircleMarker>
        {line.length > 1 && <Polyline positions={line} pathOptions={{ color: '#ef4444', weight: 3, dashArray: '6 6' }} />}
        {track.map((p, i) => (
          <CircleMarker key={i} center={p} radius={4} pathOptions={{ color: '#ef4444', fillColor: '#fff', fillOpacity: 1, weight: 2 }} />
        ))}
        {center && (
          <CircleMarker center={center} radius={9} pathOptions={{ color: '#fff', weight: 2, fillColor: '#ef4444', fillOpacity: 1 }}>
            <Tooltip direction="top">{bulletin.cyclone_name} (current)</Tooltip>
          </CircleMarker>
        )}
      </MapContainer>
    </div>
  );
}

export default function PagasaBulletinBanner() {
  const { bulletin } = usePagasaBulletin();
  const [open, setOpen] = useState(false);
  if (!bulletin) return null;

  const level = bulletin.naga_signal;
  const info = level ? TCWS_INFO[level] : null;
  const readable = bulletin.parse_ok && bulletin.signals_found;
  const color = info?.color ?? (readable ? '#22c55e' : '#eab308');
  const issued = bulletin.issued_at
    ? new Date(bulletin.issued_at).toLocaleString('en-PH', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit', month: 'short', day: 'numeric' })
    : null;

  let headline;
  if (info) headline = `${info.label} is raised over Naga City / Camarines Sur`;
  else if (readable) headline = 'No wind signal covers Naga City / Camarines Sur in this bulletin';
  else headline = 'Check the official bulletin for the wind signal over Naga City';

  return (
    <div className="card" role="status" style={{ marginBottom: 18, padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '14px 18px', display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: '0.64rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
            PAGASA Tropical Cyclone Bulletin
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', fontWeight: 700, color, margin: '2px 0' }}>
            {headline}
          </div>
          <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            {bulletin.category ? `${bulletin.category} ` : ''}<strong>{bulletin.cyclone_name}</strong>
            {` · Bulletin No. ${bulletin.bulletin_no}`}{issued ? ` · issued ${issued}` : ''}
            {info && ` · ${info.winds}`}
            {info && bulletin.naga_partial && ' · only part of Camarines Sur is covered; confirm in the bulletin'}
            {bulletin.stale && ' · this bulletin may be out of date'}
          </div>
          {bulletin.others > 0 && (
            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 2 }}>
              {bulletin.others} other active cyclone{bulletin.others > 1 ? 's' : ''} also tracked; see PAGASA.
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {bulletin.center_lat != null && (
            <button type="button" className="toggle-pill" onClick={() => setOpen(o => !o)} aria-expanded={open}
              style={{ padding: '6px 12px', fontSize: '0.7rem', fontWeight: 700, borderRadius: 6, cursor: 'pointer', border: '1px solid var(--blue-border)', background: 'var(--blue-mid)', color: 'var(--text-primary)' }}>
              {open ? 'Hide track' : 'Show track'}
            </button>
          )}
          <a href={bulletin.pdf_url} target="_blank" rel="noopener noreferrer"
            style={{ padding: '6px 12px', fontSize: '0.7rem', fontWeight: 700, borderRadius: 6, background: color, color: '#fff', textDecoration: 'none' }}>
            Official bulletin
          </a>
        </div>
      </div>

      {open && (
        <div style={{ padding: '0 18px 14px' }}>
          <TrackMap bulletin={bulletin} />
          <div style={{ fontSize: '0.66rem', color: 'var(--text-muted)', marginTop: 6 }}>
            Position and forecast points read from the bulletin. Always follow{' '}
            <a href={PAGASA_BULLETIN_PAGE} target="_blank" rel="noopener noreferrer">PAGASA</a> and your local DRRMO for official guidance.
          </div>
        </div>
      )}
    </div>
  );
}
