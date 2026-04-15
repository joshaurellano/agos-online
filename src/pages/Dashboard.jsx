import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import Swal from 'sweetalert2';
import { ALERT_LEVELS, generateWaterLevelData, WEATHER_FORECAST, DATA_SOURCES } from '../data/mockData';

export default function Dashboard() {
  const navigate = useNavigate();
  const [currentAlert, setCurrentAlert] = useState('WARNING');
  const [waterData, setWaterData] = useState(generateWaterLevelData());
  const [currentLevel, setCurrentLevel] = useState(3.4);
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const intervalRef = useRef(null);

  // Simulate live data updates
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setWaterData(prev => {
        const last = prev[prev.length - 1];
        const newLevel = parseFloat((last.level + (Math.random() - 0.45) * 0.15).toFixed(2));
        const clamped = Math.max(0.5, Math.min(6.0, newLevel));
        setCurrentLevel(clamped);
        if (clamped >= 4.5) setCurrentAlert('CRITICAL');
        else if (clamped >= 3.5) setCurrentAlert('WARNING');
        else if (clamped >= 2.5) setCurrentAlert('ADVISORY');
        else setCurrentAlert('NORMAL');
        const now = new Date();
        setLastUpdate(now);
        const newPoint = {
          time: now.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' }),
          level: clamped,
          threshold: 3.5,
          critical: 4.5,
        };
        return [...prev.slice(1), newPoint];
      });
    }, 5000);
    return () => clearInterval(intervalRef.current);
  }, []);

  const alertInfo = ALERT_LEVELS[currentAlert];

  const handleEvacuationAlert = () => {
    Swal.fire({
      title: '⚠️ Send Evacuation Alert?',
      html: `
        <p style="color:#8da4be;margin-bottom:16px">This will send an evacuation alert to all registered officials and residents in Barangay Triangulo.</p>
        <div style="background:#152a4a;border-radius:8px;padding:14px;text-align:left">
          <div style="color:#ef4444;font-weight:700;margin-bottom:8px">📢 Alert Message:</div>
          <div style="color:#e2eaf5;font-size:0.9rem">"Flooding possible in the next 6 hours in Zone 3. Please proceed to designated evacuation centers immediately."</div>
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
    }).then(result => {
      if (result.isConfirmed) {
        Swal.fire({
          title: '✅ Alert Sent!',
          html: `<p style="color:#8da4be">Evacuation alert dispatched to all officials and residents.<br><br><strong style="color:#22c55e">Log entry created.</strong></p>`,
          icon: 'success',
          background: '#0d1f3c',
          color: '#e2eaf5',
          confirmButtonColor: '#0ea5e9',
        });
      }
    });
  };

  const liveSourceCount = DATA_SOURCES.filter(s => s.status === 'live').length;

  return (
    <div className="fade-in">
      {/* Alert Banner */}
      <div style={{
        background: `${alertInfo.color}15`,
        border: `1px solid ${alertInfo.color}50`,
        borderLeft: `4px solid ${alertInfo.color}`,
        borderRadius: 'var(--radius)',
        padding: '16px 20px',
        marginBottom: '20px',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: '16px',
        flexWrap: 'wrap',
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
            <span className="status-dot live" style={{ background: alertInfo.color }} />
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.1rem', color: alertInfo.color, letterSpacing: '0.05em' }}>
              {alertInfo.label.toUpperCase()} LEVEL
            </span>
          </div>
          <div style={{ color: 'var(--text-primary)', fontWeight: 500, marginBottom: '4px' }}>{alertInfo.description}</div>
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>🔔 {alertInfo.action}</div>
        </div>
        {/* Plain language status */}
        <div style={{
          background: 'rgba(0,0,0,0.2)',
          borderRadius: 'var(--radius-sm)',
          padding: '12px 16px',
          minWidth: '200px',
          border: `1px solid ${alertInfo.color}30`,
        }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Status Message</div>
          <div style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: '0.9rem', lineHeight: 1.4 }}>
            ⚠️ Flooding possible in the next 6 hrs in Zone 3
          </div>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid-4" style={{ marginBottom: '20px' }}>
        <StatCard icon="💧" label="Current Water Level" value={`${currentLevel}m`} sub="Bicol River Station" color={currentLevel >= 3.5 ? 'var(--orange)' : 'var(--green)'} />
        <StatCard icon="🌧" label="Rainfall (Last 3hr)" value="45.1mm" sub="PAGASA Station" color="var(--accent)" />
        <StatCard icon="📡" label="Data Sources Live" value={`${liveSourceCount}/${DATA_SOURCES.length}`} sub="Active connections" color="var(--green)" />
        <StatCard icon="🏠" label="Households at Risk" value="156" sub="Zone 3 — High Risk" color="var(--orange)" />
      </div>

      {/* Water Level Chart */}
      <div className="card" style={{ marginBottom: '20px' }}>
        <div className="card-title">
          💧 Real-Time Water Level Gauge
          <span style={{ marginLeft: 'auto', fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'var(--font-body)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>
            Updated: {lastUpdate.toLocaleTimeString('en-PH')}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '20px', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
            <div style={{ width: 16, height: 3, background: 'var(--orange)', borderRadius: 2 }} /> Warning Threshold (3.5m)
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
            <div style={{ width: 16, height: 3, background: 'var(--red)', borderRadius: 2, borderTop: '2px dashed var(--red)' }} /> Critical (4.5m)
          </div>
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={waterData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="waterGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#38bdf8" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e3a5f" />
            <XAxis dataKey="time" tick={{ fill: '#4a6080', fontSize: 10 }} tickLine={false} interval={3} />
            <YAxis tick={{ fill: '#4a6080', fontSize: 10 }} tickLine={false} unit="m" domain={[0, 6]} />
            <Tooltip
              contentStyle={{ background: '#112240', border: '1px solid #1e3a5f', borderRadius: 8, color: '#e2eaf5', fontSize: 12 }}
              formatter={(v) => [`${v}m`, 'Water Level']}
            />
            <ReferenceLine y={3.5} stroke="#f97316" strokeWidth={2} strokeDasharray="4 2" />
            <ReferenceLine y={4.5} stroke="#ef4444" strokeWidth={2} strokeDasharray="4 2" />
            <Area type="monotone" dataKey="level" stroke="#38bdf8" strokeWidth={2} fill="url(#waterGrad)" dot={false} activeDot={{ r: 4, fill: '#38bdf8' }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Bottom row */}
      <div className="grid-2" style={{ marginBottom: '20px' }}>
        {/* Weather Forecast */}
        <div className="card">
          <div className="card-title">⛅ Weather Forecast Strip — Next 72 Hours</div>
          <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
            {WEATHER_FORECAST.map(f => (
              <div key={f.time} style={{
                minWidth: '80px', textAlign: 'center',
                background: 'var(--blue-mid)', borderRadius: 'var(--radius-sm)',
                padding: '12px 8px', flexShrink: 0,
                border: '1px solid var(--blue-border)',
              }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 600 }}>{f.time}</div>
                <div style={{ fontSize: '1.4rem', marginBottom: '4px' }}>{f.icon}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-primary)', fontWeight: 600 }}>{f.temp}</div>
                <div style={{ fontSize: '0.68rem', color: '#38bdf8', marginTop: '2px' }}>{f.rain_chance}% 🌧</div>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '2px' }}>{f.wind}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Alert Levels Reference */}
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
                {currentAlert === key && <span style={{ fontSize: '0.68rem', background: `${info.color}30`, color: info.color, padding: '2px 8px', borderRadius: '99px', fontWeight: 700 }}>CURRENT</span>}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* One-Click Evacuation Button */}
      <div className="card" style={{ textAlign: 'center', padding: '28px', background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.2)' }}>
        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Emergency Action</div>
        <button className="btn btn-danger" onClick={handleEvacuationAlert} style={{ fontSize: '1.05rem', padding: '16px 36px' }}>
          🚨 Send One-Click Evacuation Alert
        </button>
        <div style={{ marginTop: '10px', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
          Notifies all registered officials and residents in Barangay Triangulo
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, sub, color }) {
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div style={{ fontSize: '1.3rem' }}>{icon}</div>
      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.8rem', fontWeight: 800, color: color || 'var(--accent)', lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{sub}</div>
    </div>
  );
}
