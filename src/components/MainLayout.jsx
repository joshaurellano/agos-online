import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import { useModelPrediction } from '../lib/modelApi';

const PAGE_TITLES = {
  '/dashboard':       'Dashboard Overview',
  '/rainfall':        'Rainfall Accumulation',
  '/evacuation-map':  'Evacuation Map',
  '/reports':         'Flood Incident Reports',
  '/analytics':       'ML Analytics',
  '/register':        'Register Page',
  '/add-resident':    'Add Resident',
};

export default function MainLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { prediction, loading: modelLoading, error: modelError } = useModelPrediction();
  const alertLevel = prediction?.alert_level ?? 'NORMAL';
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
          <Outlet context={{ prediction, modelLoading, modelError }} />
        </div>
      </div>
    </div>
  );
}
