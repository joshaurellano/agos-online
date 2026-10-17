import { useEffect, useRef } from 'react';
import { NavLink } from 'react-router-dom';
import {
  LuLayoutDashboard, LuCloudRain, LuActivity, LuBellRing, LuSettings,
  LuClipboardList, LuMegaphone, LuWaves, LuUserCog, LuUsers, LuUserPlus,
  LuX, LuLogOut, LuLogIn, LuChevronLeft, LuChevronRight,
} from 'react-icons/lu';
import { useAuth } from '../hooks/useAuth';
import agosLogo from '../assets/agos-logo.png';
import { isAdmin, isResident } from '../lib/roles';

// One icon family (Lucide, bundled -- no network fetch, so the menu still
// renders on a bad connection) drawn in the link's own color, instead of the
// mix of emoji and multi-color sets used before.
//
// Items are grouped so the sidebar can label the staff cluster. Keeping the
// everyday, resident-facing pages together means a first-time public visitor
// sees a short list instead of scanning past moderation and account links
// that don't apply to them.
const NAV_ITEMS = [
  { path: '/dashboard',         label: 'Dashboard',        icon: LuLayoutDashboard, group: 'community' },
  { path: '/rainfall',          label: 'Rainfall',         icon: LuCloudRain,       group: 'community' },
  { path: '/know-your-hazards', label: 'Know Your Risk', icon: LuWaves,        group: 'community' },
  { path: '/alerts-log',        label: 'Alert Log',        icon: LuBellRing,        group: 'community' },
  { path: '/settings',          label: 'Settings',         icon: LuSettings,        group: 'community' },
  { path: '/reports',           label: 'Flood Log',        icon: LuClipboardList,   staffOnly: true, group: 'staff' },
  { path: '/community-reports', label: 'Resident Reports', icon: LuMegaphone,       staffOnly: true, group: 'staff' },
  { path: '/analytics',         label: 'ML Analytics',     icon: LuActivity,        adminOnly: true, group: 'staff' },
  { path: '/staff',             label: 'Staff',            icon: LuUserCog,         adminOnly: true, group: 'staff' },
  { path: '/residents',         label: 'Residents',        icon: LuUsers,           staffOnly: true, group: 'staff' },
  { path: '/add-resident',      label: 'Add Resident',     icon: LuUserPlus,        staffOnly: true, group: 'staff' },
];

const GROUP_LABELS = {
  community: null, // no header for the public-facing cluster -- it's the default view
  staff:     'Staff tools',
};

// Desktop collapse (icon-only rail). Only applies above the tablet breakpoint;
// on narrow screens the sidebar stays an off-canvas drawer and these rules
// do nothing. Kept here so the collapse feature is not spread over index.css.
const COLLAPSE_STYLES = `
.sidebar-collapse-btn { display: none; }
@media (min-width: 1025px) {
  .sidebar { transition: width 0.25s ease, background 0.25s ease, border-color 0.25s ease; }
  .main-content { transition: margin-left 0.25s ease; }

  .sidebar-collapse-btn {
    display: inline-flex; align-items: center; justify-content: center;
    position: absolute; top: 20px; right: -17px; z-index: 2;
    width: 34px; height: 34px; padding: 0; border-radius: 50%; cursor: pointer;
    background: #0284c7; color: #fff; border: 3px solid #fff;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.35);
    transition: background 0.15s ease, transform 0.15s ease;
  }
  .sidebar-collapse-btn:hover { background: #0369a1; transform: scale(1.1); }
  .sidebar-collapse-btn:focus-visible { outline: 3px solid #facc15; outline-offset: 2px; }

  .sidebar-collapsed .sidebar { width: 76px; }
  .sidebar-collapsed .main-content { margin-left: 76px; }
  .sidebar-collapsed .sidebar-nav { overflow-x: hidden; padding: 8px 10px 12px; }

  .sidebar-collapsed .sidebar-brand { justify-content: center; padding: 18px 0 16px; }
  .sidebar-collapsed .sidebar-brand-text { display: none; }

  .sidebar-collapsed .sidebar-group-label { display: none; }
  .sidebar-collapsed .sidebar-group + .sidebar-group {
    margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--blue-border);
  }

  .sidebar-collapsed .sidebar-link { justify-content: center; padding: 12px 0; gap: 0; }
  .sidebar-collapsed .sidebar-link span,
  .sidebar-collapsed .sidebar-btn-label,
  .sidebar-collapsed .sidebar-user-text {
    position: absolute; width: 1px; height: 1px; overflow: hidden;
    clip: rect(0 0 0 0); white-space: nowrap;
  }

  .sidebar-collapsed .sidebar-account { padding: 14px 10px 16px; }
  .sidebar-collapsed .sidebar-user { justify-content: center; }
  .sidebar-collapsed .sidebar-account-btn { padding-left: 0; padding-right: 0; gap: 0; }
}
@media (prefers-reduced-motion: reduce) {
  .sidebar, .main-content { transition: none !important; }
}
`;

export default function Sidebar({ mobileOpen, onClose, collapsed = false, onToggleCollapse }) {
  const { user, logout } = useAuth();
  const isAdminUser = isAdmin(user);
  const closeBtnRef = useRef(null);
  const wasOpen = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Off-canvas drawer behavior (narrow screens only): move focus into the
  // menu when it opens, close on Escape, stop the page behind from
  // scrolling, and hand focus back to the menu button when it closes.
  useEffect(() => {
    if (!mobileOpen) {
      if (wasOpen.current) {
        wasOpen.current = false;
        document.querySelector('.mobile-menu-btn')?.focus();
      }
      return undefined;
    }
    wasOpen.current = true;
    closeBtnRef.current?.focus();

    const onKey = (e) => { if (e.key === 'Escape') onCloseRef.current(); };
    document.addEventListener('keydown', onKey);

    const narrow = window.matchMedia('(max-width: 1024px)').matches;
    const previousOverflow = document.body.style.overflow;
    if (narrow) document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileOpen]);

  // staffOnly/adminOnly items require a signed-in, non-resident (or admin)
  // account -- not just "isResident(user) is false". With Dashboard,
  // Rainfall etc. public, isResident(null) is false for a logged-out visitor
  // too, so these checks must require `user` explicitly or staff-only pages
  // would leak into the anonymous nav.
  const visible = NAV_ITEMS.filter((item) => {
    if (item.adminOnly && !isAdminUser) return false;
    if (item.staffOnly && (!user || isResident(user))) return false;
    return true;
  });

  const groups = [];
  for (const item of visible) {
    let group = groups[groups.length - 1];
    if (!group || group.key !== item.group) {
      group = { key: item.group, items: [] };
      groups.push(group);
    }
    group.items.push(item);
  }

  const initial = user?.name?.trim()?.[0]?.toUpperCase() ?? '?';

  return (
    <>
      <div className={`sidebar-overlay${mobileOpen ? ' show' : ''}`} onClick={onClose} aria-hidden="true" />

      <aside id="app-sidebar" className={`sidebar${mobileOpen ? ' open' : ''}`}>
        <style>{COLLAPSE_STYLES}</style>
        <button
          type="button"
          className="sidebar-collapse-btn"
          onClick={onToggleCollapse}
          aria-expanded={!collapsed}
          aria-controls="app-sidebar"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <LuChevronRight size={20} strokeWidth={3} aria-hidden="true" /> : <LuChevronLeft size={20} strokeWidth={3} aria-hidden="true" />}
        </button>
        <div className="sidebar-brand">
          <img className="sidebar-brand-mark" src={agosLogo} alt="" width="40" height="40" />
          <div className="sidebar-brand-text">
            <div className="sidebar-brand-name">AGOS</div>
            <div className="sidebar-brand-sub">Flood Early Warning</div>
          </div>
          <button ref={closeBtnRef} type="button" className="sidebar-close" onClick={onClose} aria-label="Close menu">
            <LuX size={20} aria-hidden="true" />
          </button>
        </div>

        <nav className="sidebar-nav" aria-label="Main navigation">
          {groups.map((group) => {
            const label = GROUP_LABELS[group.key];
            return (
              <div key={group.key} className="sidebar-group">
                {label && <div className="sidebar-group-label" id={`nav-group-${group.key}`}>{label}</div>}
                <ul className="sidebar-list" aria-labelledby={label ? `nav-group-${group.key}` : undefined}>
                  {group.items.map(({ path, label: text, icon: ItemIcon }) => (
                    <li key={path}>
                      <NavLink
                        to={path}
                        onClick={onClose}
                        title={collapsed ? text : undefined}
                        className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}
                      >
                        <ItemIcon aria-hidden="true" />
                        <span>{text}</span>
                      </NavLink>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </nav>

        <div className="sidebar-account">
          {user ? (
            <>
              <div className="sidebar-user" title={collapsed ? user.name : undefined}>
                <div className="sidebar-avatar" aria-hidden="true">{initial}</div>
                <div className="sidebar-user-text">
                  <div className="sidebar-user-name">{user.name}</div>
                  <div className="sidebar-user-role">{user.roles?.role_desc}</div>
                </div>
              </div>
              <button
                type="button"
                className="btn btn-ghost sidebar-account-btn"
                onClick={logout}
                title={collapsed ? 'Sign out' : undefined}
              >
                <LuLogOut size={17} aria-hidden="true" /> <span className="sidebar-btn-label">Sign out</span>
              </button>
            </>
          ) : (
            <NavLink
              to="/login"
              onClick={onClose}
              title={collapsed ? 'Staff sign in' : undefined}
              className="btn btn-primary sidebar-account-btn"
            >
              <LuLogIn size={17} aria-hidden="true" /> <span className="sidebar-btn-label">Staff sign in</span>
            </NavLink>
          )}
        </div>
      </aside>
    </>
  );
}