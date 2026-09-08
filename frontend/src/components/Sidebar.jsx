import { NavLink } from 'react-router-dom';
import { Nav, Button, Image } from 'react-bootstrap';
import { useAuth } from '../hooks/useAuth';
import { isAdmin, isResident } from '../lib/roles';

import { FaUserCircle } from "react-icons/fa";
import { Icon } from '@iconify/react';

import { CgLogOut } from "react-icons/cg";

// Nav items are grouped under a `group` key so the sidebar can render a
// section label above each cluster. Keeping the everyday, resident-facing
// pages (Dashboard, Rainfall, Evacuation Map) visually separate from the
// staff/admin tools means a first-time public visitor sees a short, clear
// list instead of scanning past moderation and account-management links
// that don't apply to them.
const NAV_ITEMS = [
  { path: '/dashboard',     label: 'Dashboard',         icon: <Icon icon="fluent-color:calendar-data-bar-16" width={20} />, group: 'community' },
  { path: '/rainfall',      label: 'Rainfall',          icon: <Icon icon="noto:cloud-with-rain" width={20} />, group: 'community' },
  { path: '/evacuation-map',label: 'Evacuation Map',    icon: <Icon icon="fluent-color:location-ripple-16" width={20} />, group: 'community' },
  { path: '/analytics',     label: 'ML Analytics',      icon: <Icon icon="noto:bar-chart" width={20} />, group: 'community' },
  { path: '/reports',       label: 'Flood Reports',     icon: <Icon icon="flat-color-icons:overtime" width={20} />, staffOnly: true, group: 'staff' },
  { path: '/community-reports', label: 'Resident Reports', icon: <Icon icon="fluent-color:megaphone-loud-16" width={20} />, staffOnly: true, group: 'staff' },
  { path: '/register',      label: 'Register',          icon: <Icon icon="flat-color-icons:businessman" width={20} />, adminOnly: true, group: 'staff' },
  { path: '/add-resident',  label: 'Add Resident',      icon: <Icon icon="fluent-color:people-community-16" width={20} />, staffOnly: true, group: 'staff' },
];

const GROUP_LABELS = {
  community: null, // no header for the public-facing cluster — it's the default view
  staff:     'Staff tools',
};

export default function Sidebar({ mobileOpen, onClose }) {
  const { user, logout } = useAuth();
  const isAdminUser = isAdmin(user);

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
          {(() => {
            const visible = NAV_ITEMS.filter(item => {
              // staffOnly/adminOnly items require a signed-in, non-resident
              // (or admin) account — not just "isResident(user) is false".
              // With Dashboard/Rainfall/etc. now public, isResident(null) is
              // false for a logged-out visitor too, so these checks must
              // require `user` explicitly or staff-only pages would leak
              // into the anonymous nav.
              if (item.adminOnly && !isAdminUser) return false;
              if (item.staffOnly && (!user || isResident(user))) return false;
              return true;
            });

            let lastGroup = null;
            return visible.map(item => {
              const showHeader = item.group !== lastGroup && GROUP_LABELS[item.group];
              lastGroup = item.group;
              return (
                <div key={item.path}>
                  {showHeader && (
                    <div style={{
                      padding: '14px 20px 6px', fontSize: '0.62rem', fontWeight: 800,
                      letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--text-muted)',
                    }}>
                      {GROUP_LABELS[item.group]}
                    </div>
                  )}
                  <Nav.Link
                    as={NavLink}
                    to={item.path}
                    onClick={onClose}
                    className="d-flex align-items-center gap-2 px-3 py-2 sidebar-nav-link"
                    style={({ isActive }) => ({
                      background:  isActive ? 'rgba(56,189,248,0.1)' : 'transparent',
                      color:       isActive ? 'var(--accent)' : 'var(--text-secondary)',
                      borderLeft:  isActive ? '3px solid var(--accent)' : '3px solid transparent',
                      fontSize:    '0.88rem',
                      fontWeight:  isActive ? 600 : 400,
                      transition:  'background 0.15s ease, color 0.15s ease, border-color 0.15s ease',
                      textDecoration: 'none',
                    })}
                  >
                    <span>{item.icon}</span>
                    {item.label}
                  </Nav.Link>
                </div>
              );
            });
          })()}
        </Nav>

        {/* Account panel — signed-in user info + sign out, or a sign-in
            prompt for anonymous visitors (the primary sign-in control is
            the button in the Topbar; this is a fallback for the mobile
            slide-out sidebar where the Topbar button may be less visible). */}
        <div style={{ padding: '16px 20px', borderTop: '1px solid var(--blue-border)' }}>
          {user ? (
            <>
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
            </>
          ) : (
            <>
              <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginBottom: 10 }}>
                Viewing as public — sign in for staff and admin tools.
              </div>
              <Button
                as={NavLink}
                to="/login"
                onClick={onClose}
                variant="outline-primary"
                size="sm"
                className="w-100"
                style={{ fontSize: '0.82rem' }}
              >
                <FaUserCircle style={{ fontSize: 16, marginRight: 6 }} /> Staff / Admin Sign In
              </Button>
            </>
          )}
        </div>
      </aside>
    </>
  );
}