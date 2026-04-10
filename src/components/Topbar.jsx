import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';

export default function Topbar({ title, onMenuClick, alertLevel }) {
  const { user } = useAuth();
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const levelColors = { NORMAL: '#22c55e', ADVISORY: '#eab308', WARNING: '#f97316', CRITICAL: '#ef4444' };
  const levelColor = levelColors[alertLevel] || '#22c55e';

  return (
    <div className="topbar">
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <button
          onClick={onMenuClick}
          style={{ display: 'none', background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: '1.3rem', cursor: 'pointer', padding: '4px' }}
          className="mobile-menu-btn"
        >
          ☰
        </button>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            {title}
          </h1>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
            Barangay Triangulo, Naga City · Bicol Region
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        {/* Alert level indicator */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          padding: '6px 14px', borderRadius: '99px',
          background: `${levelColor}15`, border: `1px solid ${levelColor}40`,
        }}>
          <span className="status-dot live" style={{ background: levelColor, boxShadow: `0 0 0 0 ${levelColor}` }} />
          <span style={{ fontSize: '0.78rem', fontWeight: 700, color: levelColor, letterSpacing: '0.05em' }}>
            {alertLevel}
          </span>
        </div>

        {/* Clock */}
        <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }} className="hide-mobile">
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '0.05em' }}>
            {time.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
            {time.toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
          </div>
        </div>
      </div>

      <style>{`
        @media (max-width: 768px) { .mobile-menu-btn { display: block !important; } }
      `}</style>
    </div>
  );
}
