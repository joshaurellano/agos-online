import { useState } from 'react';
import { AuthProvider, useAuth } from './hooks/useAuth';
import LoginPage from './pages/LoginPage';
import Dashboard from './pages/Dashboard';
import WaterLevelPage from './pages/WaterLevelPage';
import RainfallPage from './pages/RainfallPage';
import FloodMapPage from './pages/FloodMapPage';
import HistoricalPage from './pages/HistoricalPage';
import AlertsPage from './pages/AlertsPage';
import DataSourcesPage from './pages/DataSourcesPage';
import Sidebar from './components/Sidebar';
import Topbar from './components/Topbar';

const PAGE_TITLES = {
  'dashboard': 'Dashboard Overview',
  'water-level': 'Real-Time Water Level',
  'rainfall': 'Rainfall Accumulation',
  'flood-map': 'Flood Zone Map',
  'historical': 'Historical Flood Events',
  'alerts': 'Alert Notification Log',
  'data-sources': 'Data Sources',
};

function AppInner() {
  const { user } = useAuth();
  const [page, setPage] = useState('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [alertLevel] = useState('WARNING');

  if (!user) return <LoginPage />;

  const renderPage = () => {
    switch (page) {
      case 'dashboard':    return <Dashboard onNavigate={setPage} />;
      case 'water-level':  return <WaterLevelPage />;
      case 'rainfall':     return <RainfallPage />;
      case 'flood-map':    return <FloodMapPage />;
      case 'historical':   return <HistoricalPage />;
      case 'alerts':       return <AlertsPage />;
      case 'data-sources': return <DataSourcesPage />;
      default:             return <Dashboard onNavigate={setPage} />;
    }
  };

  return (
    <div className="app-layout">
      <Sidebar
        activePage={page}
        onNavigate={setPage}
        mobileOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      <div className="main-content">
        <Topbar
          title={PAGE_TITLES[page]}
          onMenuClick={() => setSidebarOpen(true)}
          alertLevel={alertLevel}
        />
        <div className="page-body">
          {renderPage()}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  );
}
