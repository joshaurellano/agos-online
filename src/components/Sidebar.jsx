import { NavLink } from 'react-router-dom';
import { Nav, Button } from 'react-bootstrap';
import { useAuth } from '../hooks/useAuth';

const NAV_ITEMS = [
  { path: '/dashboard',    label: 'Dashboard',         icon: '📊' },
  { path: '/water-level',  label: 'Water Level',       icon: '💧' },
  { path: '/rainfall',     label: 'Rainfall',          icon: '🌧'  },
  { path: '/flood-map',    label: 'Flood Map',         icon: '🗺'  },
  { path: '/historical',   label: 'Historical Events', icon: '📋' },
  { path: '/alerts',       label: 'Alert Logs',        icon: '🔔' },
  { path: '/data-sources', label: 'Data Sources',      icon: '📡' },
  { path: '/register',     label: 'Register',          icon: '📡', adminOnly: true },
];

export default function Sidebar({ mobileOpen, onClose }) {
  const { user, logout } = useAuth();
  const isAdmin = user?.roles?.role_desc === 'Admin';

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
          <div className="d-flex align-items-center gap-2">
            <span style={{ fontSize: '1.6rem' }}>🌊</span>
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.3rem', color: 'var(--accent)', letterSpacing: '-0.02em' }}>AGOS</div>
              <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', lineHeight: 1.2 }}>Flood Early Warning<br />Barangay Triangulo</div>
            </div>
          </div>
        </div>

        {/* Nav */}
        

        <Nav className="flex-column flex-grow-1 py-2 overflow-auto">
          {NAV_ITEMS.filter(item => !item.adminOnly || isAdmin).map(item => (
            <Nav.Link
              key={item.path}
              as={NavLink}
              to={item.path}
              onClick={onClose}
              className="d-flex align-items-center gap-2 px-3 py-2"
              style={({ isActive }) => ({
                background:  isActive ? 'rgba(56,189,248,0.1)' : 'transparent',
                color:       isActive ? 'var(--accent)' : 'var(--text-secondary)',
                borderLeft:  isActive ? '3px solid var(--accent)' : '3px solid transparent',
                fontSize:    '0.88rem',
                fontWeight:  isActive ? 600 : 400,
                transition:  'all 0.15s',
                textDecoration: 'none',
              })}
            >
              <span>{item.icon}</span>
              {item.label}
            </Nav.Link>
          ))}
        </Nav>

        {/* User info */}
        <div style={{ padding: '16px 20px', borderTop: '1px solid var(--blue-border)' }}>
          <div className="mb-3">
            <div className="text-truncate" style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              {user?.name}
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
              {user?.roles?.role_desc}
            </div>
          </div>
          <Button
            variant="outline-secondary"
            size="sm"
            onClick={logout}
            className="w-100"
            style={{ fontSize: '0.82rem' }}
          >
            🚪 Sign Out
          </Button>
        </div>
      </aside>
    </>
  );
}
