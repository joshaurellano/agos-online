import { useState, useEffect } from 'react';
import Swal from 'sweetalert2';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../hooks/useTheme';
import { useDataSource } from '../hooks/useDataSource';
import { isAdmin } from '../lib/roles';

export default function Topbar({ title, onMenuClick, alertLevel }) {
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { isMock, toggleDataSource } = useDataSource();
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const levelColors = { NORMAL: '#22c55e', ADVISORY: '#eab308', WARNING: '#f97316', CRITICAL: '#ef4444' };
  const levelColor = levelColors[alertLevel] || '#22c55e';

  const handleToggleDataSource = async () => {
    const switchingTo = isMock ? 'live' : 'mock';
    const result = await Swal.fire({
      title: switchingTo === 'mock' ? 'Switch to Mock Data?' : 'Switch to Live Data?',
      html: switchingTo === 'mock'
        ? '<p style="color:#8da4be">The dashboard will use the <strong style="color:#eab308">mock API server</strong> for predictions and forecasts.</p>'
        : '<p style="color:#8da4be">The dashboard will reconnect to the <strong style="color:#22c55e">live model server</strong> for real predictions and forecasts.</p>',
      icon: 'question',
      background: '#0d1f3c', color: '#e2eaf5',
      showCancelButton: true,
      confirmButtonText: 'Switch',
      confirmButtonColor: switchingTo === 'mock' ? '#eab308' : '#0ea5e9',
      cancelButtonColor: '#334155',
    });

    if (result.isConfirmed) {
      toggleDataSource();
      Swal.fire({
        title: switchingTo === 'mock' ? 'Mock Data Active' : 'Live Data Active',
        text: switchingTo === 'mock'
          ? 'AGOS is now displaying simulated data from the mock server.'
          : 'AGOS is now displaying real-time data from the live model server.',
        icon: 'success',
        background: '#0d1f3c', color: '#e2eaf5',
        confirmButtonColor: '#0ea5e9',
        timer: 4000, timerProgressBar: true,
      });
    }
  };

  return (
    <div className="topbar">
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <button
          onClick={onMenuClick}
          style={{ display: 'none', background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: '1.3rem', cursor: 'pointer', padding: '4px' }}
          // className="mobile-menu-btn"
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

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>

        {/* Admin-only: Live / Mock data source toggle */}
        {isAdmin(user) && (
          <button
            className="btn"
            onClick={handleToggleDataSource}
            title={isMock
              ? 'Currently using MOCK data — click to switch to live data'
              : 'Currently using LIVE data — click to switch to mock data'}
            style={{
              background: isMock ? '#eab308' : '#22c55e',
              color: '#0d1f3c',
              fontSize: '0.78rem',
              fontWeight: 700,
              padding: '8px 14px',
              border: 'none',
            }}
          >
            {isMock ? 'MOCK DATA' : 'LIVE DATA'}
            <span style={{ fontSize: '0.85rem', opacity: 0.7 }}>⇄</span>
          </button>
        )}

        {/* Dark / Light toggle */}
        <button
          className="theme-toggle"
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {theme === 'dark' ? '☀️' : '🌙'}
        </button>

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
