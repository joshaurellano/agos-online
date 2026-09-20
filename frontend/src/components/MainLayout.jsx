import { useEffect, useRef, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import QuickActionsBar from './QuickActionsBar';
import { useModelPrediction } from '../lib/modelApi';
import { useModelSelection } from '../hooks/useModelSelection';
import { useAccessibility } from '../hooks/useAccessibility';
import { useLanguage } from '../hooks/useLanguage';

const PAGE_TITLES = {
  '/dashboard':       'Dashboard',
  '/rainfall':        'Rainfall Accumulation',
  '/evacuation-map':  'Evacuation Map',
  '/reports':         'Flood Incident Reports',
  '/community-reports': 'Resident Reports',
  '/analytics':       'ML Analytics',
  '/alerts-log':      'Alert Log',
  '/settings':        'Settings',
  '/register':        'Register Page',
  '/add-resident':    'Add Resident',
  '/residents':       'Residents',
};

// Screen-reader announcement when the alert level changes. Sighted users see
// the Topbar pill and dashboard colors change; without this, someone using a
// screen reader would only find out by navigating back to the pill. CRITICAL
// uses an assertive alert region so it interrupts; everything else waits its
// turn politely. Nothing is announced on first load, only on a real change.
function AlertAnnouncer({ alertLevel }) {
  const { t } = useLanguage();
  const { announceAlerts } = useAccessibility();
  const previous = useRef(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (previous.current !== null && previous.current !== alertLevel && announceAlerts) {
      setMessage(
        `${t('alertChanged')} ${t(`alertLevel.${alertLevel}.name`)}. ${t(`alertLevel.${alertLevel}.desc`)}`
      );
    }
    previous.current = alertLevel;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alertLevel]);

  const isCritical = alertLevel === 'CRITICAL';
  return (
    <>
      <div role="status" aria-live="polite" className="visually-hidden">{isCritical ? '' : message}</div>
      <div role="alert" className="visually-hidden">{isCritical ? message : ''}</div>
    </>
  );
}

export default function MainLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { modelKey } = useModelSelection();
  // Single shared poller for whichever algorithm is currently selected —
  // switching algorithms here re-fetches day-1 predictions, alerts, and
  // Supabase snapshot logging for the newly selected model everywhere
  // downstream (Topbar alert pill, Dashboard, AnalyticsPage).
  const { prediction, loading: modelLoading, error: modelError } = useModelPrediction(modelKey);
  const alertLevel = prediction?.alert_level ?? 'NORMAL';
  const location = useLocation();
  const { t } = useLanguage();

  return (
    <div className="app-layout">
      <a
        href="#main-content"
        className="skip-link"
        onClick={(e) => { e.preventDefault(); document.getElementById('main-content')?.focus(); }}
      >{t('skipToContent')}</a>
      <AlertAnnouncer alertLevel={alertLevel} />
      <Sidebar
        mobileOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      <div className="main-content">
        <Topbar
          title={PAGE_TITLES[location.pathname] ?? 'AGOS'}
          onMenuClick={() => setSidebarOpen(true)}
          menuOpen={sidebarOpen}
          alertLevel={alertLevel}
        />
        <main id="main-content" tabIndex={-1} className="page-body">
          <Outlet context={{ prediction, modelLoading, modelError }} />
        </main>
        <QuickActionsBar />
      </div>
    </div>
  );
}
