import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: '📊' },
  { id: 'water-level', label: 'Water Level', icon: '💧' },
  { id: 'rainfall', label: 'Rainfall', icon: '🌧' },
  { id: 'flood-map', label: 'Flood Map', icon: '🗺' },
  { id: 'historical', label: 'Historical Events', icon: '📋' },
  { id: 'alerts', label: 'Alert Logs', icon: '🔔' },
  { id: 'data-sources', label: 'Data Sources', icon: '📡' },
];

export default function Sidebar({ activePage, onNavigate, mobileOpen, onClose }) {
  const { user, logout } = useAuth();

  return (
    <>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          onClick={onClose}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 99 }}
        />
      )}

      <aside className={`sidebar ${mobileOpen ? 'open' : ''}`}>
        {/* Logo */}
        <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid var(--blue-border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '1.6rem' }}>🌊</span>
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.3rem', color: 'var(--accent)', letterSpacing: '-0.02em' }}>AGOS</div>
              <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', lineHeight: 1.2 }}>Flood Early Warning<br />Barangay Triangulo</div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '12px 0', overflowY: 'auto' }}>
          {NAV_ITEMS.map(item => (
            <button
              key={item.id}
              onClick={() => { onNavigate(item.id); onClose?.(); }}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: '10px',
                padding: '11px 20px', border: 'none', cursor: 'pointer',
                background: activePage === item.id ? 'rgba(56,189,248,0.1)' : 'transparent',
                color: activePage === item.id ? 'var(--accent)' : 'var(--text-secondary)',
                borderLeft: activePage === item.id ? '3px solid var(--accent)' : '3px solid transparent',
                fontFamily: 'var(--font-body)', fontSize: '0.88rem', fontWeight: activePage === item.id ? 600 : 400,
                textAlign: 'left', transition: 'all 0.15s',
              }}
              onMouseEnter={e => { if (activePage !== item.id) e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
              onMouseLeave={e => { if (activePage !== item.id) e.currentTarget.style.background = 'transparent'; }}
            >
              <span>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>

        {/* User info */}
        <div style={{ padding: '16px 20px', borderTop: '1px solid var(--blue-border)' }}>
          <div style={{ marginBottom: '12px' }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.name}</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>{user?.role}</div>
          </div>
          <button className="btn btn-ghost" onClick={logout} style={{ width: '100%', justifyContent: 'center', fontSize: '0.82rem', padding: '8px' }}>
            🚪 Sign Out
          </button>
        </div>
      </aside>
    </>
  );
}
