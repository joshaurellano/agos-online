import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Swal from 'sweetalert2';
import { APIProvider, Map, Polygon, AdvancedMarker } from '@vis.gl/react-google-maps';

import { ALERT_LEVELS, DATA_SOURCES } from '../data/mockData';
import { useAuth } from '../hooks/useAuth';
import { useModelPrediction, alertLevelToKey } from '../lib/modelApi';
import { supabase } from '../lib/supabaseClient';

const ALERT_COLORS = {
  NORMAL:   '#22c55e',
  ADVISORY: '#eab308',
  WARNING:  '#f97316',
  CRITICAL: '#ef4444',
};

// Approximate boundary of Barangay Triangulo
// Accurate boundary from Google Maps right-click coordinates
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

function FloodMap({ currentAlert }) {
  const color = ALERT_COLORS[currentAlert] || ALERT_COLORS.NORMAL;

  return (
    <APIProvider apiKey={import.meta.env.VITE_GOOGLE_MAPS_KEY}>
      <Map
        defaultCenter={{ lat: 13.6190, lng: 123.1920 }}
        defaultZoom={16}
        mapId="agos-flood-map"
        style={{ width: '100%', height: 480, borderRadius: 'var(--radius-sm)' }}
        gestureHandling="cooperative"
      >
        <Polygon
          paths={TRIANGULO_BOUNDARY}
          strokeColor={color}
          strokeOpacity={0.9}
          strokeWeight={2.5}
          fillColor={color}
          fillOpacity={0.35}
        />
       
      </Map>
    </APIProvider>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [forecast, setForecast] = useState([]);
  const [forecastLoading, setForecastLoading] = useState(true);

  useEffect(() => {
    fetch('https://flood-prediction-api-553657561163.asia-southeast1.run.app/api/forecast')
      .then(res => res.json())
      .then(data => { if (data.hourly) setForecast(data.hourly); })
      .catch(err => console.warn('Forecast fetch failed:', err))
      .finally(() => setForecastLoading(false));
  }, []);

  const isResident = user?.role_id === 7;
  const { prediction, loading: modelLoading, error: modelError } = useModelPrediction();

  const currentAlert = prediction ? alertLevelToKey(prediction.alert_level) : 'NORMAL';
  const alertInfo = ALERT_LEVELS[currentAlert];
  const alertColor = ALERT_COLORS[currentAlert];

  const probabilityPct  = prediction ? `${(prediction.probability * 100).toFixed(0)}%` : '—';
  const leadTimeDisplay = prediction?.lead_time_estimate ?? '6-12 hrs';
  const rainfallDisplay = prediction ? `${prediction.live_metrics.rainfall_mm.toFixed(1)}mm` : '45.1mm';

  const BASELINE_LEVEL = 1.4;
  const RISE_RATE = 0.045;
  const rainfallMm = prediction?.live_metrics?.rainfall_mm ?? 0;
  const hasRainfall = rainfallMm > 0;
  const estimatedLevel = prediction
    ? parseFloat((BASELINE_LEVEL + rainfallMm * RISE_RATE).toFixed(2))
    : null;
  const waterLevelDisplay = estimatedLevel !== null ? `${estimatedLevel}m` : 'N/A';

  const waterLevelColor = (!estimatedLevel || !hasRainfall) ? 'var(--text-muted)'
    : estimatedLevel >= 4.5 ? 'var(--red)'
    : estimatedLevel >= 3.5 ? 'var(--orange)'
    : estimatedLevel >= 2.5 ? 'var(--accent)'
    : 'var(--green)';

  const waterLevelSub = !estimatedLevel
    ? 'No data available'
    : !hasRainfall
    ? 'Est. · No active rainfall · Baseline level'
    : estimatedLevel >= 4.5 ? 'Est. · Critical threshold exceeded'
    : estimatedLevel >= 3.5 ? 'Est. · Warning threshold exceeded'
    : estimatedLevel >= 2.5 ? 'Est. · Advisory range'
    : 'Est. · Within safe range';

  const handleEvacuationAlert = () => {
    Swal.fire({
      title: '⚠️ Send Evacuation Alert?',
      html: `
        <p style="color:#8da4be;margin-bottom:16px">This will send an evacuation alert to all registered officials and residents in Barangay Triangulo.</p>
        <div style="background:#152a4a;border-radius:8px;padding:14px;text-align:left">
          <div style="color:#ef4444;font-weight:700;margin-bottom:8px">📢 Alert Message:</div>
          <div style="color:#e2eaf5;font-size:0.9rem">"Flooding possible in the next 6 hours. Please proceed to designated evacuation centers immediately."</div>
        </div>
      `,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#1e3a5f',
      confirmButtonText: '🚨 Send Alert Now',
      cancelButtonText: 'Cancel',
      background: '#0d1f3c',
      color: '#e2eaf5',
    }).then(async (result) => {
      if (!result.isConfirmed) return;
      const sentBy = user?.name ?? user?.email ?? 'Admin';
      const message = 'Flooding possible in the next 6 hours. Please proceed to designated evacuation centers immediately.';
      const { error } = await supabase.from('alerts').insert({ type: 'CRITICAL', message, sent_by: sentBy });
      if (error) {
        Swal.fire({ title: '⚠️ Failed to Send', text: error.message, icon: 'error', background: '#0d1f3c', color: '#e2eaf5', confirmButtonColor: '#0ea5e9' });
        return;
      }

      // 2. Send SMS to all residents via httpsms Edge Function
      const { data: smsData, error: smsError } = await supabase.functions.invoke('send-alert', {
        body: { message, type: 'CRITICAL' },
      });

      if (smsError) {
        Swal.fire({
          title: '⚠️ Alert Saved, SMS Failed',
          text: 'The alert was recorded but SMS notifications could not be sent. Check your httpsms setup.',
          icon: 'warning',
          background: '#0d1f3c',
          color: '#e2eaf5',
          confirmButtonColor: '#0ea5e9',
        });
        return;
      }

      // 3. Both succeeded
      Swal.fire({
        title: '✅ Alert Sent!',
        html: `
          <p style="color:#8da4be;margin-bottom:12px">Evacuation alert dispatched successfully.</p>
          <div style="background:#112240;border-radius:8px;padding:12px;text-align:left;font-size:0.85rem">
            <div style="color:#22c55e;margin-bottom:4px">📱 SMS sent to: <strong>${smsData?.sent ?? 0} residents</strong></div>
            ${smsData?.failed ? `<div style="color:#f97316">⚠️ Failed: ${smsData.failed}</div>` : ''}
          </div>
        `,
        icon: 'success',
        background: '#0d1f3c',
        color: '#e2eaf5',
        confirmButtonColor: '#0ea5e9',
      });
    });
  };

  return (
    <div className="fade-in">

      {/* Model backend error banner */}
      {modelError && (
        <div style={{
          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)',
          borderLeft: '4px solid #ef4444', borderRadius: 'var(--radius)',
          padding: '10px 16px', marginBottom: '14px', fontSize: '0.82rem', color: '#ef4444',
        }}>
          ⚠️ Model backend offline — showing simulated data. Start <code>app.py</code> to enable live predictions.
        </div>
      )}

      {/* Alert Banner */}
      <div style={{
        background: `${alertInfo.color}15`, border: `1px solid ${alertInfo.color}50`,
        borderLeft: `4px solid ${alertInfo.color}`, borderRadius: 'var(--radius)',
        padding: '16px 20px', marginBottom: '20px',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        gap: '16px', flexWrap: 'wrap',
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
            <span className="status-dot live" style={{ background: alertInfo.color }} />
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.1rem', color: alertInfo.color, letterSpacing: '0.05em' }}>
              {alertInfo.label.toUpperCase()} LEVEL
            </span>
            {prediction && (
              <span style={{
                fontSize: '0.72rem', background: `${alertInfo.color}25`, color: alertInfo.color,
                padding: '2px 10px', borderRadius: '99px', fontWeight: 700, border: `1px solid ${alertInfo.color}40`,
              }}>
                AI: {probabilityPct} flood risk
              </span>
            )}
          </div>
          <div style={{ color: 'var(--text-primary)', fontWeight: 500, marginBottom: '4px' }}>{alertInfo.description}</div>
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>🔔 {alertInfo.action}</div>
        </div>
        <div style={{
          background: 'rgba(0,0,0,0.2)', borderRadius: 'var(--radius-sm)',
          padding: '12px 16px', minWidth: '200px', border: `1px solid ${alertInfo.color}30`,
        }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            {prediction ? 'Model Status' : 'Status Message'}
          </div>
          <div style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: '0.9rem', lineHeight: 1.4 }}>
            {prediction ? prediction.status : '⚠️ Flooding possible in the next 6 hrs'}
          </div>
          {prediction && (
            <div style={{ marginTop: '6px', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              ⏱ Lead time: {leadTimeDisplay}
            </div>
          )}
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid-4" style={{ marginBottom: '20px' }}>
        <StatCard
          icon="💧" label="Est. Water Level" value={waterLevelDisplay}
          sub={waterLevelSub} color={waterLevelColor} noData={!estimatedLevel || !hasRainfall}
        />
        <StatCard
          icon="🌧" label="Rainfall (Current)" value={rainfallDisplay}
          sub={prediction ? 'WeatherAPI · Live' : 'PAGASA Station'} color="var(--accent)"
        />
        <StatCard
          icon="🌀" label="Wind Signal"
          value={prediction ? `#${prediction.live_metrics.wind_signal}` : '—'}
          sub={
            !prediction ? 'PAGASA Signal'
            : prediction.live_metrics.wind_signal >= 4 ? 'Extremely destructive · >185 km/h'
            : prediction.live_metrics.wind_signal === 3 ? 'Destructive · >121 km/h'
            : prediction.live_metrics.wind_signal === 2 ? 'Damaging · >61 km/h'
            : prediction.live_metrics.wind_signal === 1 ? 'Strong · >30 km/h'
            : 'No active signal'
          }
          color={
            !prediction ? 'var(--text-secondary)'
            : prediction.live_metrics.wind_signal >= 3 ? 'var(--red)'
            : prediction.live_metrics.wind_signal === 2 ? 'var(--orange)'
            : prediction.live_metrics.wind_signal === 1 ? 'var(--accent)'
            : 'var(--green)'
          }
        />
        <StatCard
          icon="🤖" label="Flood Probability"
          value={modelLoading ? '...' : probabilityPct}
          sub={prediction ? `${prediction.live_metrics.humidity}% humidity` : 'LSTM Model'}
          color={
            !prediction ? 'var(--text-secondary)'
            : prediction.alert_level === 2 ? 'var(--red)'
            : prediction.alert_level === 1 ? 'var(--orange)'
            : 'var(--green)'
          }
        />
      </div>

      {/* Flood Map */}
      <div className="card" style={{ marginBottom: '20px' }}>
        <div className="card-title">
          🗺 Flood Status Map — Barangay Triangulo
          <span style={{ marginLeft: 'auto', fontSize: '0.72rem', fontFamily: 'var(--font-body)', fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: 'var(--text-muted)' }}>
            Overlay reflects current alert level
          </span>
        </div>
        <FloodMap currentAlert={currentAlert} />
        {/* Alert color legend */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginTop: '10px', flexWrap: 'wrap' }}>
          {Object.entries(ALERT_COLORS).map(([key, color]) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 20, height: 8, background: color, borderRadius: 2, opacity: currentAlert === key ? 1 : 0.35 }} />
              <span style={{ fontSize: '0.7rem', color: currentAlert === key ? color : 'var(--text-muted)', fontWeight: currentAlert === key ? 700 : 400 }}>
                {key}
              </span>
            </div>
          ))}
          <span style={{ marginLeft: 'auto', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
            Approximate boundary · PAGASA & OCD Region V
          </span>
        </div>
      </div>

      {/* Water Level Gauge */}
      <div className="card" style={{ marginBottom: '20px' }}>
        <div className="card-title">
          💧 Estimated Water Level Gauge
          <span style={{ marginLeft: 'auto', fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'var(--font-body)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>
            {estimatedLevel ? 'Derived from rainfall · No physical sensor' : 'No live feed'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '20px', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
            <div style={{ width: 16, height: 3, background: 'var(--orange)', borderRadius: 2 }} /> Warning Threshold (3.5m)
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
            <div style={{ width: 16, height: 3, background: 'var(--red)', borderRadius: 2 }} /> Critical (4.5m)
          </div>
        </div>
        <div style={{
          height: 220, display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', gap: '10px', background: 'var(--blue-mid)',
          borderRadius: 'var(--radius-sm)', border: '1px dashed var(--blue-border)',
          position: 'relative', overflow: 'hidden',
        }}>
          {estimatedLevel ? (
            <>
              <div style={{
                position: 'absolute', bottom: 0, left: 0, right: 0,
                height: `${Math.min((estimatedLevel / 6) * 100, 100)}%`,
                background: estimatedLevel >= 4.5 ? 'rgba(239,68,68,0.15)'
                  : estimatedLevel >= 3.5 ? 'rgba(249,115,22,0.15)'
                  : estimatedLevel >= 2.5 ? 'rgba(56,189,248,0.15)'
                  : 'rgba(34,197,94,0.10)',
                borderRadius: 'var(--radius-sm)', transition: 'height 0.8s ease',
              }} />
              <div style={{ position: 'absolute', bottom: `${(3.5/6)*100}%`, left: 0, right: 0, borderTop: '1px dashed var(--orange)', opacity: 0.6 }}>
                <span style={{ position: 'absolute', right: 8, top: -16, fontSize: '0.65rem', color: 'var(--orange)' }}>3.5m</span>
              </div>
              <div style={{ position: 'absolute', bottom: `${(4.5/6)*100}%`, left: 0, right: 0, borderTop: '1px dashed var(--red)', opacity: 0.6 }}>
                <span style={{ position: 'absolute', right: 8, top: -16, fontSize: '0.65rem', color: 'var(--red)' }}>4.5m</span>
              </div>
              <div style={{ position: 'relative', textAlign: 'center' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '3rem', fontWeight: 800, color: waterLevelColor, lineHeight: 1 }}>
                  {waterLevelDisplay}
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '6px' }}>
                  Baseline 1.4m + rainfall factor (×0.045)
                </div>
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: '2rem', opacity: 0.3 }}>📡</div>
              <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: 600 }}>No sensor data available</div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', opacity: 0.7 }}>
                Start the model backend to see estimated water level
              </div>
            </>
          )}
        </div>
      </div>

      {/* Windy Forecast */}
      <div className="card" style={{ marginBottom: '20px' }}>
        <div className="card-title">🛰 Live Weather Radar — Naga City Area</div>
        <div style={{ borderRadius: 'var(--radius-sm)', overflow: 'hidden', border: '1px solid var(--blue-border)' }}>
          <iframe
            width="100%" height="400"
            src="https://www.windy.com/embed2.html?lat=13.621&lon=123.194&zoom=8&level=surface&overlay=rain&product=ecmwf&message=true&marker=true&location=coordinates"
            frameBorder="0" title="Windy Live Forecast"
          />
        </div>
        <div style={{ marginTop: '8px', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
          Powered by Windy.com · ECMWF forecast model · Surface rain overlay
        </div>
      </div>

      {/* Bottom row */}
      <div className="grid-2" style={{ marginBottom: '20px' }}>
        <div className="card">
          <div className="card-title">⛅ Weather Forecast Strip — Next 72 Hours</div>
          {forecastLoading ? (
            <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', padding: '20px 0' }}>Loading forecast...</div>
          ) : forecast.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', padding: '20px 0' }}>⚠️ Forecast unavailable — backend offline</div>
          ) : (
            <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
              {forecast.map(f => (
                <div key={f.time} style={{
                  minWidth: '80px', textAlign: 'center',
                  background: 'var(--blue-mid)', borderRadius: 'var(--radius-sm)',
                  padding: '12px 8px', flexShrink: 0, border: '1px solid var(--blue-border)',
                }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 600 }}>
                    {new Date(f.time).toLocaleString('en-PH', { weekday: 'short', hour: 'numeric', hour12: true })}
                  </div>
                  <div style={{ fontSize: '1.4rem', marginBottom: '2px' }}>
                    {f.precipitation > 10 ? '⛈' : f.precipitation > 2 ? '🌧' : f.precipitation > 0 ? '🌦' : '☀️'}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-primary)', fontWeight: 600 }}>{f.temperature_c}°C</div>
                  <div style={{ fontSize: '0.68rem', color: '#38bdf8', marginTop: '2px' }}>{f.precipitation} mm 🌧</div>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '2px' }}>{f.wind_speed_kph} km/h</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-title">🚦 Flood Risk Alert Levels</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {Object.entries(ALERT_LEVELS).map(([key, info]) => (
              <div key={key} style={{
                display: 'flex', alignItems: 'center', gap: '12px',
                padding: '10px 14px', borderRadius: 'var(--radius-sm)',
                background: currentAlert === key ? `${info.color}15` : 'var(--blue-mid)',
                border: `1px solid ${currentAlert === key ? info.color + '60' : 'var(--blue-border)'}`,
                transition: 'all 0.2s',
              }}>
                <div style={{ width: 12, height: 12, borderRadius: '50%', background: info.color, flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <span style={{ fontWeight: 700, color: info.color, fontSize: '0.85rem', letterSpacing: '0.05em' }}>{info.label}</span>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '1px' }}>{info.description.split('.')[0]}</div>
                </div>
                {currentAlert === key && (
                  <span style={{ fontSize: '0.68rem', background: `${info.color}30`, color: info.color, padding: '2px 8px', borderRadius: '99px', fontWeight: 700 }}>CURRENT</span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* One-Click Evacuation Button */}
      {!isResident && (
        <div className="card" style={{ textAlign: 'center', padding: '28px', background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.2)' }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Emergency Action</div>
          <button className="btn btn-danger" onClick={handleEvacuationAlert} style={{ fontSize: '1.05rem', padding: '16px 36px' }}>
            🚨 Send One-Click Evacuation Alert
          </button>
          <div style={{ marginTop: '10px', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            Notifies all registered officials and residents in Barangay Triangulo
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon, label, value, sub, color, noData }) {
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '8px', opacity: noData ? 0.6 : 1 }}>
      <div style={{ fontSize: '1.3rem' }}>{icon}</div>
      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.8rem', fontWeight: 800, color: color || 'var(--accent)', lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
        {noData && <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: 'var(--text-muted)', flexShrink: 0 }} />}
        {sub}
      </div>
    </div>
  );
}
