import { NavLink } from 'react-router-dom';
import { Nav, Button, Image } from 'react-bootstrap';
import { useAuth } from '../hooks/useAuth';

import { FaUserCircle } from "react-icons/fa";
import { Icon } from '@iconify/react';

import { CgLogOut } from "react-icons/cg";

const NAV_ITEMS = [
  { path: '/dashboard',    label: 'Dashboard',         icon: <Icon icon="fluent-color:calendar-data-bar-16" width={20} /> },
  { path: '/water-level',  label: 'Water Level',       icon: <Icon icon="noto:water-wave" width={20} /> },
  { path: '/rainfall',     label: 'Rainfall',          icon: <Icon icon="noto:cloud-with-rain" width={20} /> },
  { path: '/flood-map',    label: 'Flood Map',         icon: <Icon icon="fluent-color:location-ripple-16" width={20} /> },
  { path: '/historical',   label: 'Historical Events', icon: <Icon icon="flat-color-icons:overtime" width={20} /> },
  { path: '/alerts',       label: 'Alert Logs',        icon: <Icon icon="fluent-color:alert-48" width={20} />, hideFromResidents: true },
  { path: '/data-sources', label: 'Data Sources',      icon: <Icon icon="fluent-color:data-line-16" width={20} />, hideFromResidents: true },
  { path: '/register',      label: 'Register',          icon: <Icon icon="flat-color-icons:businessman" width={20} />, adminOnly: true },
  { path: '/add-resident',  label: 'Add Resident',      icon: <Icon icon="fluent-color:people-community-16" width={20} />, hideFromResidents: true },
];

export default function Sidebar({ mobileOpen, onClose }) {
  const { user, logout } = useAuth();
  const isAdmin = user.roles?.role_desc === 'Admin';

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
          {NAV_ITEMS.filter(item => {
            if (item.adminOnly && !isAdmin) return false;
            if (item.hideFromResidents && user?.role_id === 7) return false;
            return true;
          }).map(item => (
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
            
            <div className="text-truncate" style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', display:'flex', height:'100%', width:'100%', justifyContent:'start', alignItem:'center', gap:5 }}>
              
              <div style={{width: '25px', height:'25px', borderRadius:'50%', background:'rgba(56,189,248,0.15)', display:'flex', alignItems:'center', justifyContent:'center'}}>
                <Icon icon="glyphs-poly:user" width="20" height="20" />
              </div>
              <div>
                {user?.name}
              </div>
              
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
            <CgLogOut style={{fontSize:20}}/> Sign Out
          </Button>
        </div>
      </aside>
    </>
  );
}
