import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';

const PAGE_TITLES = {
  '/dashboard':    'Dashboard Overview',
  '/water-level':  'Real-Time Water Level',
  '/rainfall':     'Rainfall Accumulation',
  '/flood-map':    'Flood Zone Map',
  '/historical':   'Historical Flood Events',
  '/alerts':       'Alert Notification Log',
  '/data-sources': 'Data Sources',
  '/register':     'Register Page'
};

export default function MainLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [alertLevel] = useState('WARNING');
  const location = useLocation();

  return (
    <div className="app-layout">
      <Sidebar
        mobileOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      <div className="main-content">
        <Topbar
          title={PAGE_TITLES[location.pathname] ?? 'AGOS'}
          onMenuClick={() => setSidebarOpen(true)}
          alertLevel={alertLevel}
        />
        <div className="page-body">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
