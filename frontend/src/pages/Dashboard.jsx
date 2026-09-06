import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { SectionLabel, ErrorBanner } from '../components/ui';
import Swal from 'sweetalert2';
import { MapContainer, TileLayer, Polygon as LeafletPolygon, Polyline as LeafletPolyline, Tooltip as LeafletTooltip, Marker as LeafletMarker, Popup as LeafletPopup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer, Area, AreaChart,
} from 'recharts';
import trianguloRoads from '../data/trianguloRoads.json';
import { ALERT_LEVELS } from '../data/mockData';
import { useAuth } from '../hooks/useAuth';
import { useDataSource } from '../hooks/useDataSource';
import { useFloodForecast14Day } from '../lib/modelApi';
import { useModelSelection } from '../hooks/useModelSelection';
import { supabase } from '../lib/supabaseClient';
import { isAdmin, isResident } from '../lib/roles';
import { logger } from '../lib/logger';

import FloodMap3D from '../components/FloodMap3D';
import RainOverlay from '../components/RainOverlay';
import WindDirectionArrow, { degToCardinal } from '../components/WindDirectionArrow';
import WeatherForecast from '../components/WeatherForecast';

// ─── Constants ────────────────────────────────────────────────────────────────

const ALERT_COLORS = {
  NORMAL:   '#22c55e',
  ADVISORY: '#eab308',
  WARNING:  '#f97316',
  CRITICAL: '#ef4444',
};

// ─── Resident incident-report markers ──────────────────────────────────────
// Mirrors the category/status vocabulary used in CommunityReportsPage.jsx so
// the map markers stay visually consistent with the moderation list. Only
// pending + verified reports are ever passed in here (rejected reports are
// filtered out before they reach the map — see FloodMap's fetch below).
const REPORT_CATEGORY_ICON = {
  Flood:               '🌊',
  Fire:                '🔥',
  Landslide:           '⛰️',
  'Road Accident':     '🚗',
  'Power Outage':      '💡',
  'Medical Emergency': '🚑',
  Other:               '📍',
};

const REPORT_STATUS_COLORS = {
  pending:  '#eab308',
  verified: '#22c55e',
};

function reportTimeAgo(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1)   return 'just now';
  if (mins < 60)  return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)   return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

// Teardrop pin, colored by moderation status, with the report's category
// emoji at its center — distinct at a glance from the evacuation-center
// pins on the other map (those are colored by center type, not status).
function createReportIcon(report) {
  const color = REPORT_STATUS_COLORS[report.status] ?? '#8da4be';
  const emoji = REPORT_CATEGORY_ICON[report.category] ?? '📍';
  const html = `
    <div style="
      width: 28px; height: 28px; border-radius: 50% 50% 50% 0;
      background: ${color}; transform: rotate(-45deg);
      border: 2px solid #fff; box-shadow: 0 1px 5px rgba(0,0,0,0.45);
      display: flex; align-items: center; justify-content: center;
    ">
      <span style="transform: rotate(45deg); font-size: 13px; line-height: 1;">${emoji}</span>
    </div>
  `;
  return L.divIcon({
    html,
    className: '',
    iconSize: [28, 28],
    iconAnchor: [14, 28],
    popupAnchor: [0, -28],
  });
}

const TRIANGULO_AREA = {
  name: 'Barangay Triangulo',
  city: 'Naga City',
  province: 'Camarines Sur',
  coords: '13.614°N, 123.192°E',
};

const TRIANGULO_BOUNDARY = [
  { lat: 13.622162, lng: 123.193368 },
  { lat: 13.621778, lng: 123.195934 },
  { lat: 13.621222, lng: 123.195882 },
  { lat: 13.621053, lng: 123.196923 },
  { lat: 13.620874, lng: 123.197226 },
  { lat: 13.619826, lng: 123.196902 },
  { lat: 13.619792, lng: 123.197160 },
  { lat: 13.619419, lng: 123.197081 },
  { lat: 13.619310, lng: 123.197670 },
  { lat: 13.617688, lng: 123.197134 },
  { lat: 13.613977, lng: 123.197774 },
  { lat: 13.611311, lng: 123.195202 },
  { lat: 13.607139, lng: 123.197145 },
  { lat: 13.602733, lng: 123.187140 },
  { lat: 13.611057, lng: 123.185706 },
  { lat: 13.611714, lng: 123.186500 },
  { lat: 13.611770, lng: 123.186722 },
  { lat: 13.611529, lng: 123.187289 },
  { lat: 13.611511, lng: 123.187524 },
  { lat: 13.611704, lng: 123.187806 },
  { lat: 13.611891, lng: 123.187920 },
  { lat: 13.612091, lng: 123.187856 },
  { lat: 13.612502, lng: 123.187898 },
  { lat: 13.612609, lng: 123.187964 },
  { lat: 13.612574, lng: 123.188154 },
  { lat: 13.612936, lng: 123.188138 },
  { lat: 13.613193, lng: 123.187934 },
  { lat: 13.613532, lng: 123.188201 },
  { lat: 13.613921, lng: 123.187954 },
  { lat: 13.613929, lng: 123.187798 },
  { lat: 13.614044, lng: 123.187740 },
  { lat: 13.614219, lng: 123.187710 },
  { lat: 13.614300, lng: 123.187333 },
  { lat: 13.616435, lng: 123.187325 },
  { lat: 13.616637, lng: 123.184921 },
  { lat: 13.617106, lng: 123.184082 },
  { lat: 13.618525, lng: 123.185204 },
  { lat: 13.618746, lng: 123.185162 },
  { lat: 13.619016, lng: 123.185245 },
  { lat: 13.619187, lng: 123.185523 },
  { lat: 13.619383, lng: 123.185558 },
  { lat: 13.620149, lng: 123.186123 },
  { lat: 13.620387, lng: 123.186049 },
  { lat: 13.620389, lng: 123.186138 },
  { lat: 13.621316, lng: 123.187165 },
  { lat: 13.621189, lng: 123.187267 },
  { lat: 13.622423, lng: 123.189744 },
  { lat: 13.622633, lng: 123.189794 },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

// Slim official-bulletin masthead — jurisdiction breadcrumb, coordinates,
// active model engine and sync status. Modeled after the station header
// strip on gauge pages like NOAA's National Water Prediction Service and
// Google Flood Hub, where the "where/when/what engine" context sits above
// the fold, separate from the alert itself.
function StationHeader({ area, activeModel, lastUpdated, engineStatus, feedStatus }) {

  const STATUS_STYLE = {
    online:   { color: '#22c55e', label: 'ONLINE' },
    offline:  { color: '#ef4444', label: 'OFFLINE' },
    checking: { color: '#eab308', label: 'CHECKING' },
  };

  const StatusPill = ({ label, status }) => {
    const s = STATUS_STYLE[status] ?? STATUS_STYLE.checking;
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        fontSize: '0.64rem', fontWeight: 700, letterSpacing: '0.04em',
        padding: '5px 10px', borderRadius: 6,
        background: `${s.color}14`, border: `1px solid ${s.color}40`, color: s.color,
      }}>
        <span style={{
          width: 6, height: 6, borderRadius: '50%', background: s.color, flexShrink: 0,
          boxShadow: status === 'online' ? `0 0 5px ${s.color}90` : 'none',
          animation: status === 'checking' ? 'pulse-ring 1.4s ease-out infinite' : 'none',
        }} />
        {label}: {s.label}
      </div>
    );
  };

  return (
    <div style={{
      position: 'relative',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      flexWrap: 'wrap', gap: 10,
      padding: '10px 2px 14px', marginBottom: 14,
      borderBottom: '1px solid var(--blue-border)',
    }}>
      <div>
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 700, letterSpacing: '0.03em',
          }}
        >
          {area.name}, {area.city}, {area.province}
        </div>

        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 3, flexWrap: 'wrap' }}>
          <h1 style={{
            fontFamily: 'var(--font-display)', fontSize: '1.3rem', fontWeight: 800,
            color: 'var(--text-primary)', letterSpacing: '-0.01em', margin: 0,
          }}>
            Flood Early Warning Dashboard
          </h1>
          {area.coords && (
            <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
              {area.coords}
            </span>
          )}
        </div>

      </div>

    </div>
  );
}

// Official advisory bulletin — replaces the old glow-card alert header.
// Formatted like a PAGASA/PDRRMO bulletin: classification, issuing basis,
// validity window, and enumerated recommended actions, with the emergency
// dispatch action attached directly to the bulletin it corresponds to.
function AdvisoryBulletin({ alertInfo, alertColor, currentAlert, recentTrend, onSendAlert, canSendAlert }) {
  const TREND_COPY = {
    rising:  { icon: '↗', label: 'Rising trend', color: '#f97316' },
    falling: { icon: '↘', label: 'Falling trend', color: '#22c55e' },
    stable:  { icon: '→', label: 'Stable',        color: 'var(--text-muted)' },
  };
  const trend = recentTrend ? TREND_COPY[recentTrend] : null;

  return (
    <div className="card" style={{
      padding: 0, overflow: 'hidden', marginBottom: 16,
      borderLeft: `5px solid ${alertColor}`,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8,
        padding: '10px 20px', background: 'var(--blue-mid)', borderBottom: '1px solid var(--blue-border)',
      }}>
        <span style={{ fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.1em', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
          Flood Advisory Bulletin
        </span>
        <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
          Issued {new Date().toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} &middot; Next update in ≤30 min
        </span>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'center', padding: '18px 20px' }}>
        <div style={{ flex: '1 1 320px', minWidth: 260 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '0.95rem',
              color: '#fff', background: alertColor,
              padding: '4px 12px', borderRadius: 5, letterSpacing: '0.04em',
            }}>
              {currentAlert}
            </span>
            {trend && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.72rem', fontWeight: 700, color: trend.color }}>
                {trend.icon} {trend.label}
              </span>
            )}
          </div>
          <div style={{ fontSize: '0.86rem', color: 'var(--text-primary)', lineHeight: 1.5 }}>
            {alertInfo.description}
          </div>
        </div>

        <div style={{
          flex: '1 1 260px', minWidth: 220,
          borderLeft: '1px solid var(--blue-border)', paddingLeft: 20,
        }}>
          <div style={{ fontSize: '0.62rem', fontWeight: 800, letterSpacing: '0.08em', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>
            Recommended Action
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            {alertInfo.action}
          </div>
        </div>

        {canSendAlert && (
          <div style={{ flexShrink: 0 }}>
            <button className="btn btn-danger" onClick={onSendAlert} style={{ whiteSpace: 'nowrap' }}>
              🚨 Dispatch Alert
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// Dense, table-style "current conditions" ribbon — favors a compact,
// data-table reading pattern (label / value / unit, divided by rules)
// over large glowing stat cards, closer to a hydrological observation
// panel than a consumer app widget.
function ConditionsStrip({ items }) {
  return (
    <div className="card" style={{ padding: 0, marginBottom: 16, overflow: 'hidden' }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${items.length}, 1fr)`,
      }}>
        {items.map((it, i) => (
          <div key={it.label} style={{
            padding: '14px 18px',
            borderLeft: i === 0 ? 'none' : '1px solid var(--blue-border)',
            opacity: it.noData ? 0.55 : 1,
          }}>
            <div style={{ fontSize: '0.64rem', color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>
              {it.label}
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', fontWeight: 800, color: it.color || 'var(--text-primary)', lineHeight: 1 }}>
                {it.value}
              </span>
              {it.unit && <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>{it.unit}</span>}
            </div>
            <div style={{ fontSize: '0.68rem', color: it.badgeColor || 'var(--text-secondary)', marginTop: 4, fontWeight: it.badge ? 700 : 400 }}>
              {it.badge || it.sub}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Standing footer disclaimer — the "provisional data, not a substitute for
// official warnings" language every USGS/NOAA gauge page carries.
function DisclaimerFooter() {
  return (
    <div style={{
      marginTop: 20, padding: '12px 16px',
      borderTop: '1px solid var(--blue-border)',
      fontSize: '0.66rem', color: 'var(--text-muted)', lineHeight: 1.6,
      display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8,
    }}>
      <span>
        Forecasts are model-generated (no physical water-level sensor) and intended for situational awareness only
      </span>
      <span style={{ whiteSpace: 'nowrap' }}>Sources: Open-Meteo · GloFAS · flood_snapshots</span>
    </div>
  );
}

// Road class -> line weight. Trunk/primary roads read as thicker "arteries",
// service/residential roads as thin capillaries -- same visual language as
// the water-level analogy without needing a fill.
const ROAD_WEIGHT = {
  trunk: 5, trunk_link: 4, primary: 5, secondary: 4,
  tertiary: 3, tertiary_link: 3, busway: 3,
  unclassified: 2, residential: 2, service: 1,
};

// Free, no-key basemap tile sources for the 2D map. Esri's World Imagery is
// the standard free satellite source (same one Leaflet's own docs point to);
// the Reference/World_Boundaries_and_Places overlay adds place labels + road
// lines on top of it so satellite mode isn't just an unlabeled photo.
const BASEMAP_TILES = {
  street: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community',
  },
};
const BASEMAP_LABELS_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}';

// Small overlay control, positioned to match the 3D map's bottom-left
// basemap switcher so the two views feel like the same product.
function BasemapSwitcher({ basemap, onChange }) {
  return (
    <div style={{
      position: 'absolute', bottom: 12, left: 12, zIndex: 500,
      display: 'flex', gap: 0, background: 'rgba(13, 31, 60, 0.82)',
      backdropFilter: 'blur(6px)', border: '1px solid rgba(56,189,248,0.3)',
      borderRadius: 6, overflow: 'hidden',
    }}>
      {['street', 'satellite'].map(key => (
        <button key={key} onClick={() => onChange(key)} style={{
          padding: '5px 12px', fontSize: '0.65rem', fontWeight: 700,
          letterSpacing: '0.04em', cursor: 'pointer', border: 'none',
          background: basemap === key ? 'var(--accent, #0ea5e9)' : 'transparent',
          color: basemap === key ? '#fff' : '#8da4be',
          transition: 'all 0.2s',
        }}>
          {key === 'street' ? 'Street' : 'Satellite'}
        </button>
      ))}
    </div>
  );
}

function FloodMap({ currentAlert, rainfallMm, condition, windSignal, windDirectionDeg }) {
  const color = ALERT_COLORS[currentAlert] || ALERT_COLORS.NORMAL;
  const [basemap, setBasemap] = useState('street');
  const [reports, setReports] = useState([]);
  const navigate = useNavigate();

  // Leaflet wants [lat, lng] arrays, not {lat, lng} objects
  const boundaryPositions = TRIANGULO_BOUNDARY.map(p => [p.lat, p.lng]);

  // Resident-submitted incident reports, as map pins. Only pending +
  // verified are shown — rejected reports are moderation history, not
  // something an official watching the map needs to see. Filtering out
  // reports with no lat/lng too, since a resident could theoretically
  // submit one without a pinned location.
  const fetchReports = useCallback(async () => {
    const { data, error } = await supabase
      .from('incident_reports')
      .select('*')
      .in('status', ['pending', 'verified'])
      .not('latitude', 'is', null)
      .not('longitude', 'is', null)
      .order('created_at', { ascending: false });
    if (error) {
      logger.error('incident_reports fetch error (dashboard map):', error.message);
      return;
    }
    setReports(data ?? []);
  }, []);

  useEffect(() => { fetchReports(); }, [fetchReports]);

  // Live updates: a new report, or a pending → verified/rejected change,
  // reflects on the map without a manual refresh.
  useEffect(() => {
    const channel = supabase
      .channel('dashboard_incident_reports')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'incident_reports' }, () => {
        fetchReports();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchReports]);

  return (
    <div style={{ position: 'relative' }}>
      <MapContainer
        center={[13.6140, 123.1915]}
        zoom={15}
        scrollWheelZoom={true}
        style={{ width: '100%', height: 480, borderRadius: 'var(--radius-sm)' }}
      >
        <TileLayer
          key={basemap}
          url={BASEMAP_TILES[basemap].url}
          attribution={BASEMAP_TILES[basemap].attribution}
        />
        {basemap === 'satellite' && (
          <TileLayer url={BASEMAP_LABELS_URL} attribution="" />
        )}
        <LeafletPolygon
          positions={boundaryPositions}
          pathOptions={{
            color: '#1E90FF',
            weight: 2,
            opacity: 0.95,
            fillColor: color,
            fillOpacity: 0.28,
          }}
        >
          <LeafletTooltip sticky>
            Barangay Triangulo — {currentAlert}
          </LeafletTooltip>
        </LeafletPolygon>

        {reports.map(report => (
          <LeafletMarker
            key={report.id}
            position={[report.latitude, report.longitude]}
            icon={createReportIcon(report)}
          >
            <LeafletPopup>
              <div style={{ minWidth: 210, maxWidth: 250, padding: '4px 2px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <span style={{ fontSize: '1rem' }}>{REPORT_CATEGORY_ICON[report.category] ?? '📍'}</span>
                  <span style={{ fontWeight: 700, fontSize: '0.88rem' }}>{report.category}</span>
                  <span style={{
                    marginLeft: 'auto', fontSize: '0.6rem', fontWeight: 700,
                    textTransform: 'uppercase', letterSpacing: '0.04em',
                    color: REPORT_STATUS_COLORS[report.status] ?? '#8da4be',
                    background: `${REPORT_STATUS_COLORS[report.status] ?? '#8da4be'}18`,
                    border: `1px solid ${REPORT_STATUS_COLORS[report.status] ?? '#8da4be'}40`,
                    borderRadius: 4, padding: '2px 6px',
                  }}>
                    {report.status}
                  </span>
                </div>

                {report.photo_url && (
                  <img
                    src={report.photo_url}
                    alt="Reported incident"
                    style={{ width: '100%', height: 110, objectFit: 'cover', borderRadius: 6, marginBottom: 6 }}
                  />
                )}

                <div style={{ fontSize: '0.78rem', color: '#333', lineHeight: 1.4, marginBottom: 6 }}>
                  {report.description}
                </div>

                {report.location_label && (
                  <div style={{ fontSize: '0.7rem', color: '#666', marginBottom: 2 }}>
                    📍 {report.location_label}
                  </div>
                )}
                <div style={{ fontSize: '0.7rem', color: '#666', marginBottom: 8 }}>
                  by {report.reporter_name ?? 'Resident'} · {reportTimeAgo(report.created_at)}
                </div>

                <button
                  onClick={() => navigate('/community-reports')}
                  style={{
                    width: '100%', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer',
                    background: 'var(--accent, #0ea5e9)', color: '#fff', border: 'none',
                    borderRadius: 5, padding: '6px 0',
                  }}
                >
                  {report.status === 'pending' ? '✅ Review & Moderate →' : 'View in Reports →'}
                </button>
              </div>
            </LeafletPopup>
          </LeafletMarker>
        ))}
      </MapContainer>

      {/* zIndex above Leaflet's own panes (tilePane 200 / overlayPane 400 /
          shadowPane 500) but below markerPane (600), so weather sits over
          the basemap and boundary without dimming markers/popups. */}
      <RainOverlay rainfallMm={rainfallMm} condition={condition} windSignal={windSignal} zIndex={550} />

      {windDirectionDeg != null && (
        <div style={{
          position: 'absolute', top: 12, left: 12, zIndex: 550,
          background: 'rgba(13, 31, 60, 0.82)', backdropFilter: 'blur(6px)',
          border: '1px solid rgba(56,189,248,0.3)', borderRadius: 8,
          padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <WindDirectionArrow deg={windDirectionDeg} size={15} />
          <span style={{ fontSize: '0.68rem', color: '#e2eaf5', fontWeight: 600 }}>
            {degToCardinal(windDirectionDeg)} · {Math.round(windDirectionDeg)}°
          </span>
        </div>
      )}

      <BasemapSwitcher basemap={basemap} onChange={setBasemap} />
    </div>
  );
}


function AlertLevelTable({ currentAlert }) {
  const levels = [
    { key: 'NORMAL',   range: '< 25%',     action: 'Continue normal activities. Monitor updates.' },
    { key: 'ADVISORY', range: '25 – 49%', action: 'Stay alert. Prepare emergency go-bags.' },
    { key: 'WARNING',  range: '50 – 74%', action: 'Move valuables to higher ground. Be ready to evacuate.' },
    { key: 'CRITICAL', range: '≥ 75%',     action: 'Evacuate immediately to designated evacuation centers.' },
  ];
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.74rem' }}>
      <thead>
        <tr style={{ borderBottom: '1px solid var(--blue-border)' }}>
          {['Class', 'Probability', 'Recommended Action'].map((h, i) => (
            <th key={h} style={{
              textAlign: 'left', padding: '0 8px 8px', fontSize: '0.6rem',
              fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase',
              color: 'var(--text-muted)', width: i === 1 ? 90 : undefined,
            }}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {levels.map(({ key, range, action }) => {
          const info = ALERT_LEVELS[key];
          const isCurrent = currentAlert === key;
          return (
            <tr key={key} style={{
              background: isCurrent ? `${info.color}12` : 'transparent',
              borderBottom: '1px solid var(--blue-border)',
            }}>
              <td style={{ padding: '9px 8px', whiteSpace: 'nowrap' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 9, height: 9, borderRadius: 2, background: info.color, flexShrink: 0 }} />
                  <span style={{ fontWeight: 800, color: info.color, letterSpacing: '0.03em' }}>{info.label}</span>
                  {isCurrent && (
                    <span style={{
                      fontSize: '0.56rem', fontWeight: 700,
                      background: `${info.color}30`, color: info.color,
                      padding: '1px 5px', borderRadius: 3, border: `1px solid ${info.color}40`,
                    }}>
                      CURRENT
                    </span>
                  )}
                </span>
              </td>
              <td style={{ padding: '9px 8px', fontFamily: 'monospace', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                {range}
              </td>
              <td style={{ padding: '9px 8px', color: isCurrent ? 'var(--text-primary)' : 'var(--text-muted)', lineHeight: 1.4 }}>
                {action}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function PredictionInputTable({ prediction }) {
  if (!prediction) return null;
  const m = prediction.live_metrics;
  const rows = [
    { label: 'Rainfall',          value: `${m.rainfall_mm?.toFixed(2) ?? '—'} mm/hr`, icon: '🌧', note: 'Primary flood driver' },
    { label: 'Humidity',          value: `${m.humidity ?? '—'}%`,                      icon: '💨', note: 'Atmospheric moisture' },
    { label: 'Wind Signal',       value: `Signal #${m.wind_signal ?? '—'}`,     icon: '🌀', note: 'PAGASA classification' },
    { label: 'Flood Probability', value: `${(prediction.probability * 100).toFixed(1)}%`, icon: '🤖', note: 'GRU output confidence' },
    { label: 'Alert Level',       value: `Level ${prediction.alert_level}`,            icon: '🚦', note: 'Model classification' },
  ];
  return (
    <div className="card">
      <SectionLabel>📊 Prediction Input Summary</SectionLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {rows.map(({ label, value, icon, note }, i) => (
          <div key={label} style={{
            display: 'grid', gridTemplateColumns: '24px 1fr auto',
            alignItems: 'center', gap: 10, padding: '9px 10px',
            background: i % 2 === 0 ? 'var(--blue-mid)' : 'transparent',
            borderRadius: i === 0 ? '6px 6px 0 0' : i === rows.length - 1 ? '0 0 6px 6px' : 0,
          }}>
            <span style={{ fontSize: '0.9rem', textAlign: 'center' }}>{icon}</span>
            <div>
              <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-primary)' }}>{label}</div>
              <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', marginTop: 1 }}>{note}</div>
            </div>
            <div style={{
              fontFamily: 'var(--font-display)', fontSize: '0.82rem', fontWeight: 700,
              color: 'var(--accent)', textAlign: 'right', whiteSpace: 'nowrap',
            }}>
              {value}
            </div>
          </div>
        ))}
      </div>
      <div style={{
        marginTop: 10, paddingTop: 8,
        borderTop: '1px solid var(--blue-border)',
        fontSize: '0.63rem', color: 'var(--text-muted)',
        display: 'flex', justifyContent: 'space-between',
      }}>
        <span>Model: GRU · Cloud Run (asia-southeast1)</span>
        <span>Poll interval: 30s</span>
      </div>
    </div>
  );
}

function FloodForecastChart() {
  const [view, setView]           = useState('hourly');
  const [chartData, setChartData] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [lastFetched, setLastFetched] = useState(null);

  const fetchData = useCallback(async () => {
    if (view === 'hourly') {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const { data, error } = await supabase
        .from('flood_snapshots')
        .select('created_at, probability')
        .gte('created_at', since.toISOString())
        .order('created_at', { ascending: true })
        .limit(10000);

      if (error) { logger.warn('Fetch failed:', error.message); setLoading(false); return; }

      setChartData((data ?? []).map(row => ({
        label: new Date(row.created_at).toLocaleTimeString('en-PH', {
          hour: 'numeric', minute: '2-digit', hour12: true,
        }),
        time: new Date(row.created_at),
        floodRisk: Math.min(Math.round((row.probability ?? 0) * 100), 100),
      })));
    } else {
      const { data, error } = await supabase.rpc('get_daily_flood_avg', { days_back: 7 });
      if (error) { logger.warn('Fetch failed:', error.message); setLoading(false); return; }

      const days = (data ?? []).map(row => {
        const date = new Date(row.day);
        return {
          label:      date.toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' }),
          shortLabel: date.toLocaleDateString('en-PH', { weekday: 'short' }),
          time:       date,
          floodRisk:  Math.min(Math.round((row.avg_probability ?? 0) * 100), 100),
          readings:   Number(row.readings ?? 0),
          isToday:    new Date().toDateString() === date.toDateString(),
        };
      });
      setChartData(days.slice(-7));
    }

    setLastFetched(new Date());
    setLoading(false);
  }, [view]);

  useEffect(() => {
    setLoading(true);
    fetchData();
    const t = setInterval(fetchData, 30_000);
    return () => clearInterval(t);
  }, [fetchData]);

  useEffect(() => {
    const channel = supabase
      .channel('flood_forecast_live')
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'flood_snapshots' },
        () => fetchData()
      )
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [fetchData]);

  const getRiskColor = (pct) =>
    pct >= 75 ? '#ef4444' :
    pct >= 50 ? '#f97316' :
    pct >= 25 ? '#eab308' : '#22c55e';

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    const val   = payload[0]?.value;
    const color = getRiskColor(val);
    return (
      <div style={{
        background: '#0d1f3c', border: '1px solid #1e3a5f',
        borderRadius: 8, padding: '10px 14px', fontSize: '0.78rem',
        boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
      }}>
        <div style={{ fontWeight: 700, color: '#e2eaf5', marginBottom: 6 }}>{label}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: 2, background: color }} />
          <span style={{ color: '#8da4be' }}>Flood Probability:</span>
          <span style={{ fontWeight: 800, color, fontSize: '0.9rem' }}>{val}%</span>
        </div>
        <div style={{ marginTop: 6, fontSize: '0.65rem', color: getRiskColor(val), opacity: 0.85 }}>
          {val >= 75 ? '⛔ Critical risk' : val >= 50 ? '⚠ High risk' : val >= 25 ? '📢 Elevated risk' : '✅ Low risk'}
        </div>
      </div>
    );
  };

  const latestRisk = chartData[chartData.length - 1]?.floodRisk ?? null;

  return (
    <div className="card" style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <SectionLabel>🤖Flood Probability Trend</SectionLabel>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: -4 }}>
            {lastFetched && (
              <span style={{ marginLeft: 8, color: '#4a6080' }}>
                Synced {lastFetched.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 0, background: 'var(--blue-mid)', border: '1px solid var(--blue-border)', borderRadius: 6, overflow: 'hidden' }}>
          {['hourly', 'daily'].map(v => (
            <button key={v} onClick={() => setView(v)} style={{
              padding: '5px 14px', fontSize: '0.7rem', fontWeight: 700,
              letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer', border: 'none',
              background: view === v ? 'var(--accent)' : 'transparent',
              color: view === v ? '#fff' : 'var(--text-muted)',
              transition: 'all 0.2s',
            }}>
              {v === 'hourly' ? '24-Hour' : '7-Day'}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
            <div style={{ fontSize: '1.5rem', marginBottom: 8, opacity: 0.4 }}>📊</div>
            Loading predictions from Supabase...
          </div>
        </div>
      ) : !chartData.length ? (
        <div style={{
          height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'var(--blue-mid)', borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--blue-border)',
        }}>
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
            <div style={{ fontSize: '1.5rem', marginBottom: 8, opacity: 0.4 }}>⚠️</div>
            No snapshots yet — model must run at least once
          </div>
        </div>
      ) : (
        <>
          {latestRisk !== null && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '10px 14px', marginBottom: 14,
              background: `${getRiskColor(latestRisk)}10`,
              border: `1px solid ${getRiskColor(latestRisk)}30`,
              borderRadius: 'var(--radius-sm)',
            }}>
              <div style={{
                fontFamily: 'var(--font-display)', fontSize: '1.8rem', fontWeight: 900,
                color: getRiskColor(latestRisk), lineHeight: 1,
              }}>
                {latestRisk}%
              </div>
              <div>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  Current Flood Probability
                </div>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: 2 }}>
                  {latestRisk >= 75 ? '⛔ Immediate action may be required'
                    : latestRisk >= 50 ? '⚠ High risk — monitor closely'
                    : latestRisk >= 25 ? '📢 Elevated — stay alert'
                    : '✅ Low risk — conditions normal'}
                </div>
              </div>
            </div>
          )}

          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={chartData} margin={{ top: 10, right: 16, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="riskGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#a855f7" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#a855f7" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e3a5f" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fill: '#4a6080', fontSize: 10, fontWeight: 600 }}
                tickLine={false}
                axisLine={{ stroke: '#1e3a5f' }}
                interval={view === 'hourly' ? Math.floor(chartData.length / 6) : 0}
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fill: '#4a6080', fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={v => `${v}%`}
              />
              <Tooltip content={<CustomTooltip />} />
              <ReferenceLine y={25} stroke="#eab308" strokeDasharray="4 3" strokeOpacity={0.4}
                label={{ value: 'Elevated', position: 'insideTopLeft', fill: '#eab308', fontSize: 9 }} />
              <ReferenceLine y={50} stroke="#f97316" strokeDasharray="4 3" strokeOpacity={0.4}
                label={{ value: 'High', position: 'insideTopLeft', fill: '#f97316', fontSize: 9 }} />
              <ReferenceLine y={75} stroke="#ef4444" strokeDasharray="4 3" strokeOpacity={0.4}
                label={{ value: 'Critical', position: 'insideTopLeft', fill: '#ef4444', fontSize: 9 }} />
              <Area
                type="monotone"
                dataKey="floodRisk"
                name="Flood Probability"
                stroke="#a855f7"
                strokeWidth={2.5}
                fill="url(#riskGradient)"
                dot={(props) => {
                  const { cx, cy, payload } = props;
                  if (view === 'hourly' && chartData.length > 48) return null;
                  const color = getRiskColor(payload.floodRisk);
                  return (
                    <circle key={`dot-${payload.label}`}
                      cx={cx} cy={cy} r={4}
                      fill={color} stroke={color} strokeWidth={1.5}
                    />
                  );
                }}
                activeDot={{ r: 6, strokeWidth: 2, stroke: '#a855f7' }}
              />
            </AreaChart>
          </ResponsiveContainer>

          {view === 'daily' && (
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${chartData.length}, 1fr)`, gap: 4, marginTop: 12 }}>
              {chartData.map((d, i) => {
                const color = getRiskColor(d.floodRisk);
                return (
                  <div key={i} style={{
                    textAlign: 'center', padding: '8px 4px',
                    background: d.isToday ? 'rgba(56,189,248,0.08)' : 'var(--blue-mid)',
                    border: `1px solid ${d.isToday ? 'rgba(56,189,248,0.3)' : 'var(--blue-border)'}`,
                    borderRadius: 6,
                  }}>
                    <div style={{ fontSize: '0.6rem', color: d.isToday ? 'var(--accent)' : 'var(--text-muted)', fontWeight: 700, marginBottom: 3 }}>
                      {d.isToday ? 'TODAY' : d.shortLabel}
                    </div>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: '0.9rem', fontWeight: 800, color }}>
                      {d.floodRisk}%
                    </div>
                    {d.readings > 0 && (
                      <div style={{ fontSize: '0.52rem', color: '#38bdf8', marginTop: 2 }}>{d.readings} rdgs</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      <div style={{ marginTop: 10, fontSize: '0.62rem', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 4 }}>
        <span>Source: flood_snapshots · GRU model output · Poll: 30s · Realtime subscription active</span>
        <span>No physical sensor · For situational awareness only</span>
      </div>
    </div>
  );
}

function DriverModal({ day, onClose }) {
  if (!day) return null;

  const dateObj = new Date(day.date);
  const pct = Math.round((day.flood_probability ?? 0) * 100);
  const riskColor = pct >= 75 ? '#ef4444' : pct >= 50 ? '#f97316' : pct >= 25 ? '#eab308' : '#22c55e';

  const drivers = [
    { label: 'Rainfall',          value: day.rainfall_mm != null ? `${day.rainfall_mm} mm` : '—',            icon: '🌧' },
    { label: 'Wind Speed (max)',  value: day.wind_speed_max_kph != null ? `${day.wind_speed_max_kph} kph` : '—', icon: '🌀' },
    { label: 'Soil Moisture',     value: day.soil_moisture_vwc != null ? `${(day.soil_moisture_vwc * 100).toFixed(1)}% VWC` : '—', icon: '🌱' },
    { label: 'Sea-Level Pressure',value: day.pressure_msl_hpa != null ? `${day.pressure_msl_hpa} hPa` : '—', icon: '📉' },
    { label: 'Surface Pressure',  value: day.surface_pressure_hpa != null ? `${day.surface_pressure_hpa} hPa` : '—', icon: '📊' },
    { label: 'Wind Gusts',        value: day.wind_gusts_kph != null ? `${day.wind_gusts_kph} kph` : '—',      icon: '💨' },
  ];

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000, padding: 20,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="card"
        style={{ maxWidth: 420, width: '100%', maxHeight: '85vh', overflowY: 'auto' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Forecast Drivers
            </div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: 4 }}>
              {dateObj.toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric' })}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent', border: 'none', color: 'var(--text-muted)',
              fontSize: '1.4rem', lineHeight: 1, cursor: 'pointer', padding: 0,
            }}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', marginBottom: 16,
          background: `${riskColor}12`, border: `1px solid ${riskColor}40`, borderRadius: 'var(--radius-sm)',
        }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.8rem', fontWeight: 900, color: riskColor, lineHeight: 1 }}>
            {pct}%
          </div>
          <div>
            <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-primary)' }}>Flood Probability</div>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: 2, textTransform: 'capitalize' }}>
              {day.confidence_band === 'outlook-only' ? 'Outlook only' : `${day.confidence_band} confidence`}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {drivers.map(({ label, value, icon }, i) => (
            <div key={label} style={{
              display: 'grid', gridTemplateColumns: '24px 1fr auto',
              alignItems: 'center', gap: 10, padding: '9px 10px',
              background: i % 2 === 0 ? 'var(--blue-mid)' : 'transparent',
              borderRadius: i === 0 ? '6px 6px 0 0' : i === drivers.length - 1 ? '0 0 6px 6px' : 0,
            }}>
              <span style={{ fontSize: '0.9rem', textAlign: 'center' }}>{icon}</span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-primary)', fontWeight: 600 }}>{label}</span>
              <span style={{
                fontFamily: 'var(--font-display)', fontSize: '0.8rem', fontWeight: 700,
                color: 'var(--accent)', textAlign: 'right', whiteSpace: 'nowrap',
              }}>
                {value}
              </span>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 12, fontSize: '0.62rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
          These are the Open-Meteo-sourced inputs the model used (or had available) for this day's forecast. Reliability decreases further into the horizon.
        </div>
      </div>
    </div>
  );
}

function FloodForecast14Day() {
  const { activeModel } = useModelSelection();
  const { forecast14, meta14, loading14, error14 } = useFloodForecast14Day(activeModel.key);
  const [rangeDays, setRangeDays] = useState(7);
  const [selectedDay, setSelectedDay] = useState(null);

  const bandColor = (band) =>
    band === 'high' ? '#38bdf8' : band === 'moderate' ? '#a78bfa' : '#64748b';

  const riskColor = (pct) =>
    pct >= 75 ? '#ef4444' : pct >= 50 ? '#f97316' : pct >= 25 ? '#eab308' : '#22c55e';

  const visibleForecast = (forecast14 || []).slice(0, rangeDays);

  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <SectionLabel>📅 Flood Forecast</SectionLabel>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: -4 }}>
            Tap a day for drivers · <span style={{ color: activeModel.color, fontWeight: 700 }}>{activeModel.label}</span> engine
          </div>
        </div>
        <div style={{ display: 'flex', gap: 0, background: 'var(--blue-mid)', border: '1px solid var(--blue-border)', borderRadius: 6, overflow: 'hidden' }}>
          {[3, 7, 14].map(n => (
            <button key={n} onClick={() => setRangeDays(n)} style={{
              padding: '5px 14px', fontSize: '0.7rem', fontWeight: 700,
              letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer', border: 'none',
              background: rangeDays === n ? 'var(--accent)' : 'transparent',
              color: rangeDays === n ? '#fff' : 'var(--text-muted)',
              transition: 'all 0.2s',
            }}>
              {n}-Day
            </button>
          ))}
        </div>
      </div>

      {loading14 ? (
        <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
          Loading forecast...
        </div>
      ) : error14 || !visibleForecast.length ? (
        <div style={{
          padding: 16, background: 'var(--blue-mid)', borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--blue-border)', color: 'var(--text-muted)',
          fontSize: '0.82rem', textAlign: 'center',
        }}>
          ⚠️ Forecast unavailable — model backend offline
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 6 }}>
            {visibleForecast.map((d, i) => {
              const pct = Math.round(d.flood_probability * 100);
              const dateObj = new Date(d.date);
              const isToday = i === 0 && d.day_ahead === 0;
              return (
                <button
                  key={d.date}
                  onClick={() => setSelectedDay(d)}
                  style={{
                    minWidth: 62, flexShrink: 0, textAlign: 'center',
                    background: isToday ? `${riskColor(pct)}12` : 'var(--blue-mid)',
                    border: `1px solid ${isToday ? riskColor(pct) + '50' : bandColor(d.confidence_band) + '40'}`,
                    borderTop: `2px solid ${isToday ? riskColor(pct) : bandColor(d.confidence_band)}`,
                    borderRadius: 'var(--radius-sm)', padding: '8px 6px',
                    opacity: d.confidence_band === 'outlook-only' ? 0.65 : 1,
                    cursor: 'pointer', font: 'inherit', transition: 'transform 0.15s ease, opacity 0.15s ease',
                  }}
                  onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
                  onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
                >
                  <div style={{ fontSize: '0.58rem', color: isToday ? 'var(--accent)' : 'var(--text-muted)', fontWeight: 700, marginBottom: 4 }}>
                    {isToday ? 'TODAY' : dateObj.toLocaleDateString('en-PH', { weekday: 'short' })}
                  </div>
                  <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginBottom: 6 }}>
                    {dateObj.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}
                  </div>
                  <div style={{
                    fontFamily: 'var(--font-display)', fontSize: '1rem', fontWeight: 800,
                    color: riskColor(pct), lineHeight: 1, marginBottom: 3,
                  }}>
                    {pct}%
                  </div>
                  <div style={{
                    fontSize: '0.52rem', fontWeight: 700, letterSpacing: '0.03em',
                    color: isToday ? 'var(--accent)' : bandColor(d.confidence_band), textTransform: 'uppercase',
                  }}>
                    {isToday ? 'Live' : d.confidence_band === 'high' ? 'High conf.'
                      : d.confidence_band === 'moderate' ? 'Moderate'
                      : 'Outlook'}
                  </div>
                </button>
              );
            })}
          </div>

          <div style={{
            marginTop: 12, paddingTop: 8, borderTop: '1px solid var(--blue-border)',
            fontSize: '0.62rem', color: 'var(--text-muted)', lineHeight: 1.5,
          }}>
            {meta14?.note ?? 'Confidence decreases further into the forecast horizon.'}
          </div>
        </>
      )}

      <DriverModal day={selectedDay} onClose={() => setSelectedDay(null)} />
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Dashboard() {
  const { user }    = useAuth();
  const { apiBaseUrl } = useDataSource();
  const navigate    = useNavigate();
  const [forecast, setForecast]               = useState([]);
  const [dailyForecast, setDailyForecast]     = useState([]);
  const [minutelyForecast, setMinutelyForecast] = useState([]);
  const [forecastGeneratedAt, setForecastGeneratedAt] = useState(null);
  const [forecastOutlook, setForecastOutlook] = useState(null);
  const [forecastCache, setForecastCache]     = useState(null);
  const [forecastLoading, setForecastLoading] = useState(true);
  const [lastUpdated, setLastUpdated]         = useState(new Date());
  const [recentTrend, setRecentTrend]         = useState(null);
  const [mapView, setMapView] = useState('2d'); // '2d' | '3d'
  
  useEffect(() => {
    setForecastLoading(true);
    fetch(`${apiBaseUrl}/api/forecast`)
      .then(res => res.json())
      .then(data => {
        if (data.hourly) setForecast(data.hourly);
        if (data.daily) setDailyForecast(data.daily);
        if (data.minutely) setMinutelyForecast(data.minutely);
        if (data.generated_at) setForecastGeneratedAt(data.generated_at);
        if (data.outlook) setForecastOutlook(data.outlook);
        if (data.weather_cache) setForecastCache(data.weather_cache);
      })
      .catch(err => logger.warn('Forecast fetch failed:', err))
      .finally(() => setForecastLoading(false));
  }, [apiBaseUrl]);

  useEffect(() => {
    const t = setInterval(() => setLastUpdated(new Date()), 60000);
    return () => clearInterval(t);
  }, []);

  const { activeModel } = useModelSelection();
  const userIsResident = isResident(user);
  // Single shared polling instance lives in MainLayout (it also owns the
  // SMS/push dispatch side effect) — Dashboard just reads from it, so we
  // don't end up with two independent pollers racing to dispatch alerts.
  const { prediction, modelLoading, modelError } = useOutletContext();

  const prevAlertDisplay = useRef(null);

  useEffect(() => {
    if (!prediction) return;
    const current = prediction.alert_level;
    if (prevAlertDisplay.current !== null && prevAlertDisplay.current !== current) {
      Swal.fire({
        title: '⚠️ Alert Level Changed',
        html: `<p style="color:#8da4be">Flood alert has changed from <strong style="color:#e2eaf5">${prevAlertDisplay.current}</strong> → <strong style="color:${ALERT_COLORS[current]}">${current}</strong>.</p><p style="color:#8da4be;margin-top:8px;font-size:0.85rem">A notification will be sent to registered users.</p>`,
        icon: current === 'NORMAL' ? 'success' : 'warning',
        background: '#0d1f3c', color: '#e2eaf5',
        confirmButtonColor: '#0ea5e9',
        timer: 8000, timerProgressBar: true,
      });
    }
    prevAlertDisplay.current = current;
  }, [prediction]);

  // Trend arrow shown in the advisory bulletin. Widened from the original
  // "last 3 snapshots vs previous 3" (~3 minutes at a 30s poll — mostly
  // model jitter) to a ~20-minute window: average of the older half vs the
  // newer half of the last 40 snapshots. Smooths out noise so the arrow
  // reflects a genuine short-term trend rather than one twitchy reading.
  useEffect(() => {
    const POLL_INTERVAL_SEC = 30;
    const TREND_WINDOW_MINUTES = 20;
    const rowsNeeded = Math.max(6, Math.round((TREND_WINDOW_MINUTES * 60) / POLL_INTERVAL_SEC));

    supabase
      .from('flood_snapshots')
      .select('probability, created_at')
      .order('created_at', { ascending: false })
      .limit(rowsNeeded)
      .then(({ data }) => {
        if (!data || data.length < 6) return;
        const probs = data.map(r => r.probability).reverse(); // oldest → newest
        const mid = Math.floor(probs.length / 2);
        const avg = arr => arr.reduce((s, v) => s + v, 0) / arr.length;
        const delta = avg(probs.slice(mid)) - avg(probs.slice(0, mid));
        setRecentTrend(delta > 0.04 ? 'rising' : delta < -0.04 ? 'falling' : 'stable');
      });
  }, [prediction]);

  const currentAlert = typeof prediction?.alert_level === 'number'
    ? alertLevelToKey(prediction.alert_level)
    : (prediction?.alert_level ?? prediction?.alert_key ?? 'NORMAL');
  const alertInfo  = ALERT_LEVELS[currentAlert] ?? ALERT_LEVELS['NORMAL'];
  const alertColor = ALERT_COLORS[currentAlert];

  const probabilityPct = prediction ? `${(prediction.probability * 100).toFixed(0)}%` : '—';
  const rainfallMm     = prediction?.live_metrics?.rainfall_mm ?? 0;
  const humidityVal    = prediction?.live_metrics?.humidity ?? null;
  // Condition string ("Heavy Rain", "Cloudy", etc.) lives on the /api/forecast
  // hourly[] entries (via wmo_label()), not on the flood-prediction endpoint's
  // live_metrics -- forecast[0] is "now" (same convention WeatherForecast.jsx
  // uses for its hero panel).
  const weatherCondition = forecast?.[0]?.condition ?? null;

  const EVACUATION_PRESETS = [
    { label: '🟡 Advisory', type: 'ADVISORY', msg: 'ADVISORY: Flood risk is elevated. Stay alert and prepare your emergency go-bags.' },
    { label: '🟠 Warning',  type: 'WARNING',  msg: 'WARNING: Rising water levels detected. Move valuables to higher ground and be ready to evacuate immediately.' },
    { label: '🔴 Critical', type: 'CRITICAL', msg: 'CRITICAL: Flooding is imminent. EVACUATE NOW to designated evacuation centers.' },
    { label: '✍️ Custom',   type: null,       msg: '' },
  ];

  const handleEvacuationAlert = () => {
    Swal.fire({
      title: '🚨 Send Emergency Alert',
      html: `
        <div style="text-align:left">
          <label style="display:block;font-size:0.75rem;color:#8da4be;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.05em">Select Message</label>
          <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:14px">
            ${EVACUATION_PRESETS.map((p, i) => `
              <label style="display:flex;align-items:flex-start;gap:10px;padding:10px 12px;background:#152a4a;border:1px solid ${i === 2 ? '#ef4444' : '#1e3a5f'};border-radius:8px;cursor:pointer" id="preset-label-${i}">
                <input type="radio" name="preset" value="${i}" ${i === 2 ? 'checked' : ''} style="margin-top:3px;accent-color:#ef4444"
                  onchange="
                    document.querySelectorAll('[id^=preset-label]').forEach(el => el.style.borderColor='#1e3a5f');
                    document.getElementById('preset-label-${i}').style.borderColor='#ef4444';
                    document.getElementById('swal-msg').value='${p.msg.replace(/'/g, "\\'")}';
                    document.getElementById('swal-msg').disabled=${p.msg !== ''};
                    document.getElementById('swal-msg').style.opacity=${p.msg !== '' ? '0.6' : '1'};
                    document.getElementById('swal-type-row').style.display='${p.type === null ? 'block' : 'none'}';
                  ">
                <div>
                  <div style="font-size:0.82rem;font-weight:700;color:#e2eaf5">${p.label}</div>
                  ${p.msg ? `<div style="font-size:0.7rem;color:#8da4be;margin-top:2px">${p.msg}</div>` : '<div style="font-size:0.7rem;color:#8da4be;margin-top:2px">Type your own message below</div>'}
                </div>
              </label>
            `).join('')}
          </div>
          <label style="display:block;font-size:0.75rem;color:#8da4be;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.05em">Message</label>
          <textarea id="swal-msg" rows="3" disabled style="width:100%;padding:10px;background:#152a4a;border:1px solid #1e3a5f;border-radius:8px;color:#e2eaf5;font-size:0.82rem;resize:none;opacity:0.6;box-sizing:border-box">${EVACUATION_PRESETS[2].msg}</textarea>
          <div id="swal-type-row" style="display:none;margin-top:12px">
            <label style="display:block;font-size:0.75rem;color:#8da4be;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.05em">Severity for this message</label>
            <select id="swal-type" style="width:100%;padding:10px;background:#152a4a;border:1px solid #1e3a5f;border-radius:8px;color:#e2eaf5;font-size:0.82rem;box-sizing:border-box">
              <option value="ADVISORY">🟡 Advisory</option>
              <option value="WARNING">🟠 Warning</option>
              <option value="CRITICAL">🔴 Critical</option>
            </select>
          </div>
        </div>
      `,
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#1e3a5f',
      confirmButtonText: '🚨 Send Alert Now',
      cancelButtonText: 'Cancel',
      background: '#0d1f3c', color: '#e2eaf5',
      preConfirm: () => {
        const checkedRadio = document.querySelector('input[name="preset"]:checked');
        const idx = checkedRadio ? parseInt(checkedRadio.value) : 2;
        const msg = document.getElementById('swal-msg').value.trim();
        if (!msg) { Swal.showValidationMessage('Please enter a message.'); return false; }
        const presetType = EVACUATION_PRESETS[idx].type;
        const type = presetType ?? document.getElementById('swal-type').value;
        return { msg, type };
      },
    }).then(async (result) => {
      if (!result.isConfirmed) return;

      const sentBy    = user?.name ?? user?.email ?? 'Admin';
      const message   = result.value.msg;
      const alertType = result.value.type;

      const { error } = await supabase.from('alerts').insert({ type: alertType, message, sent_by: sentBy });
      if (error) {
        Swal.fire({ title: '⚠️ Failed to Save', text: error.message, icon: 'error', background: '#0d1f3c', color: '#e2eaf5', confirmButtonColor: '#0ea5e9' });
        return;
      }

      // SMS + push are dispatched automatically by the on-alert-change DB
      // webhook whenever a row lands in `alerts` — no need to call
      // send-alert / send-push-notification here too (that was firing
      // both notifications twice).

      Swal.fire({
        title: '✅ Alert Dispatched',
        html: `<p style="color:#8da4be;margin-bottom:12px">Evacuation alert sent successfully.</p>
          <div style="background:#112240;border-radius:8px;padding:12px;text-align:left;font-size:0.85rem">
            <div style="color:#22c55e;margin-bottom:4px">📱 SMS is being sent to all residents</div>
            <div style="color:#22c55e;margin-top:4px">🔔 Push notification sent to all app users</div>
          </div>`,
        icon: 'success', background: '#0d1f3c', color: '#e2eaf5', confirmButtonColor: '#0ea5e9',
      });
    });
  };

  return (
    <div className="fade-in">

      {/* ── 0. Station Masthead ─────────────────────────────────── */}
      <StationHeader
        area={TRIANGULO_AREA}
        activeModel={activeModel}
        lastUpdated={lastUpdated}
        engineStatus={modelLoading ? 'checking' : (!modelError && !!prediction) ? 'online' : 'offline'}
        feedStatus={forecastLoading ? 'checking' : forecast.length > 0 ? 'online' : 'offline'}
      />

      {/* ── 1. Offline Banner ──────────────────────────────────── */}
      {modelError && (
        <ErrorBanner>
          <strong>Model backend offline</strong> — displaying fallback data. Start{' '}
          <code style={{ background: 'rgba(255,255,255,0.08)', padding: '1px 5px', borderRadius: 3 }}>app.py</code>{' '}
          to enable live predictions.
        </ErrorBanner>
      )}

      {/* ── 2. Advisory Bulletin ──────────────────────────────── */}
      <AdvisoryBulletin
        alertInfo={alertInfo}
        alertColor={alertColor}
        currentAlert={currentAlert}
        recentTrend={recentTrend}
        onSendAlert={handleEvacuationAlert}
        canSendAlert={!userIsResident}
      />

      {/* ── 3. Current Conditions Strip ─────────────────────────── */}
      <ConditionsStrip
        items={userIsResident ? [
          {
            label: 'Alert Level',
            value: ALERT_LEVELS[currentAlert]?.label ?? currentAlert,
            color: ALERT_COLORS[currentAlert] || ALERT_COLORS.NORMAL,
            sub: 'Barangay Triangulo',
          },
          {
            label: 'Rainfall Intensity',
            value: prediction ? rainfallMm.toFixed(1) : '—',
            unit: 'mm/hr',
            color: 'var(--accent)',
            badge: prediction && rainfallMm > 10 ? 'Heavy' : prediction && rainfallMm > 2 ? 'Moderate' : prediction ? 'Light' : null,
            noData: !prediction,
          },
        ] : [
          {
            label: 'Rainfall Intensity',
            value: prediction ? rainfallMm.toFixed(1) : '—',
            unit: 'mm/hr',
            color: 'var(--accent)',
            badge: prediction && rainfallMm > 10 ? 'Heavy' : prediction && rainfallMm > 2 ? 'Moderate' : prediction ? 'Light' : null,
            noData: !prediction,
          },
          {
            label: 'Humidity',
            value: humidityVal !== null ? humidityVal : '—',
            unit: '%',
            sub: prediction ? 'Atmospheric moisture' : 'Forecast model',
            color: !humidityVal ? 'var(--text-muted)'
              : humidityVal >= 90 ? '#ef4444' : humidityVal >= 80 ? '#f97316' : humidityVal >= 70 ? '#eab308' : '#22c55e',
            badge: !humidityVal ? null : humidityVal >= 90 ? 'Saturated' : humidityVal >= 80 ? 'High' : 'Normal',
            noData: !humidityVal,
          },
          {
            label: 'Flood Probability',
            value: modelLoading ? '…' : probabilityPct,
            sub: prediction ? `Wind signal #${prediction.live_metrics.wind_signal}` : 'Forecast model',
            color: !prediction ? 'var(--text-muted)'
              : prediction.probability >= 0.75 ? '#ef4444' : prediction.probability >= 0.50 ? '#f97316' : prediction.probability >= 0.25 ? '#eab308' : '#22c55e',
            badge: prediction ? 'Model prediction' : null,
            noData: !prediction,
          },
        ]}
      />

      {/* ── 4. Flood Status Map ──────────────────────────────────── */}
      <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 16 }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10,
          padding: '14px 18px', borderBottom: '1px solid var(--blue-border)',
        }}>
          <div>
            <div className="card-title" style={{ marginBottom: 2 }}>
              🗺 Flood Status Map — Barangay Triangulo
            </div>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
              Boundary overlay, color-coded to current alert classification. Tap a pin to view a resident report.
            </div>
          </div>
          {mapView === '2d' && (
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: REPORT_STATUS_COLORS.pending }} />
                <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>Pending report</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: REPORT_STATUS_COLORS.verified }} />
                <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>Verified report</span>
              </div>
            </div>
          )}
          <div style={{ display: 'flex', gap: 0, background: 'var(--blue-mid)', border: '1px solid var(--blue-border)', borderRadius: 6, overflow: 'hidden' }}>
            {['2d', '3d'].map(v => (
              <button key={v} onClick={() => setMapView(v)} style={{
                padding: '5px 14px', fontSize: '0.7rem', fontWeight: 700,
                letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer', border: 'none',
                background: mapView === v ? 'var(--accent)' : 'transparent',
                color: mapView === v ? '#fff' : 'var(--text-muted)',
                transition: 'all 0.2s',
              }}>
                {v === '2d' ? 'Street View' : '3D View'}
              </button>
            ))}
          </div>
        </div>

        {mapView === '2d' ? (
          <FloodMap
            currentAlert={currentAlert}
            rainfallMm={rainfallMm}
            windSignal={prediction?.live_metrics?.wind_signal}
            windDirectionDeg={prediction?.live_metrics?.wind_direction_deg}
            condition={weatherCondition}
          />
        ) : (
          <FloodMap3D
            currentAlert={currentAlert}
            boundary={TRIANGULO_BOUNDARY}
            alertColors={ALERT_COLORS}
            rainfallMm={rainfallMm}
            windSignal={prediction?.live_metrics?.wind_signal}
            windDirectionDeg={prediction?.live_metrics?.wind_direction_deg}
            condition={weatherCondition}
            minutely={minutelyForecast}
          />
        )}

        {/* Cartographic legend — swatch, classification, threshold — rather
            than a row of dots, so the map reads like a hazard map rather
            than a status badge. */}
        <div style={{
          display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px 18px',
          padding: '10px 18px', borderTop: '1px solid var(--blue-border)', background: 'var(--blue-mid)',
        }}>
          <span style={{ fontSize: '0.6rem', fontWeight: 800, letterSpacing: '0.08em', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
            Legend
          </span>
          {[
            ['NORMAL', '< 25%'], ['ADVISORY', '25–49%'], ['WARNING', '50–74%'], ['CRITICAL', '≥ 75%'],
          ].map(([key, range]) => (
            <span key={key} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.66rem' }}>
              <span style={{
                width: 10, height: 10, borderRadius: 2,
                background: ALERT_COLORS[key], opacity: currentAlert === key ? 1 : 0.35,
                flexShrink: 0,
              }} />
              <span style={{ color: currentAlert === key ? ALERT_COLORS[key] : 'var(--text-muted)', fontWeight: currentAlert === key ? 700 : 500 }}>
                {key}
              </span>
              <span style={{ color: 'var(--text-muted)', fontFamily: 'monospace' }}>{range}</span>
            </span>
          ))}
          <span style={{ marginLeft: 'auto', fontSize: '0.62rem', color: 'var(--text-muted)' }}>
            Approximate barangay boundary · &copy; OpenStreetMap contributors
          </span>
        </div>
      </div>

      {/* ── 5. Alert Classification Reference ───────────────────── */}
      <div className="card" style={{ marginBottom: 16 }}>
        <SectionLabel>🚦 Alert Classification Reference</SectionLabel>
        <AlertLevelTable currentAlert={currentAlert} />
      </div>

      {/* ── 6. Flood Forecast Chart ───────────────────── */}
      <div style={{ marginBottom: 18 }}>
        <FloodForecast14Day />
      </div>
      

      {/* ── 7. GRU Flood Probability Chart ───────────────────── */}
      <FloodForecastChart />

      {/* ── 8. Weather Forecast ───────────── */}
      <div style={{ marginBottom: 18 }}>
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <SectionLabel>⛅ Weather Forecast — Barangay Triangulo</SectionLabel>
          </div>
          <WeatherForecast
            hourly={forecast}
            daily={dailyForecast}
            loading={forecastLoading}
            generatedAt={forecastGeneratedAt}
            outlook={forecastOutlook}
            weatherCache={forecastCache}
          />
        </div>

      </div>

      {/* ── 9. Standing Disclaimer ───────────────────────────────── */}
      <DisclaimerFooter />

    </div>
  );
}