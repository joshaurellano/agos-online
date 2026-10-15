import { Suspense, useEffect, useRef, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import QuickActionsBar from './QuickActionsBar';
import ErrorBoundary from './ErrorBoundary';
import OfflineBanner from './OfflineBanner';
import AlertChangeToast from './AlertChangeToast';
import PageLoader from './PageLoader';
import { useModelPrediction } from '../lib/modelApi';
import { useModelSelection } from '../hooks/useModelSelection';
import { useAccessibility } from '../hooks/useAccessibility';
import { useLanguage } from '../hooks/useLanguage';

const PAGE_TITLES = {
  '/dashboard':       'Dashboard',
  '/rainfall':        'Rainfall Accumulation',
  '/evacuation-map':  'Evacuation Map',
  '/know-your-hazards': 'Know Your Risk',
  '/reports':         'Daily Flood Log',
  '/community-reports': 'Resident Reports',
  '/analytics':       'ML Analytics',
  '/alerts-log':      'Alert Log',
  '/settings':        'Settings',
  '/staff':           'Staff Accounts',
  '/register':        'New Staff Account',
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
  const pageTitle = PAGE_TITLES[location.pathname] ?? 'AGOS';

  useEffect(() => {
    document.title = pageTitle === 'AGOS' ? 'AGOS — Flood Early Warning System' : `${pageTitle} · AGOS`;
  }, [pageTitle]);

  return (
    <div className="app-layout">
      <a
        href="#main-content"
        className="skip-link"
        onClick={(e) => { e.preventDefault(); document.getElementById('main-content')?.focus(); }}
      >{t('skipToContent')}</a>
      <AlertAnnouncer alertLevel={alertLevel} />
      <AlertChangeToast alertLevel={alertLevel} ready={!modelLoading && !!prediction} resetKey={modelKey} />
      <Sidebar
        mobileOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      <div className="main-content">
        <OfflineBanner />
        <Topbar
          title={pageTitle}
          onMenuClick={() => setSidebarOpen(true)}
          menuOpen={sidebarOpen}
          alertLevel={alertLevel}
        />
        <main id="main-content" tabIndex={-1} className="page-body">
          <ErrorBoundary key={location.pathname}>
            <Suspense fallback={<PageLoader />}>
              <Outlet context={{ prediction, modelLoading, modelError }} />
            </Suspense>
          </ErrorBoundary>
        </main>
        <QuickActionsBar />
      </div>
    </div>
  );
}
