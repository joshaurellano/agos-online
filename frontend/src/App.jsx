import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/queryClient';
import { AuthProvider } from './hooks/useAuth';
import { ThemeProvider } from './hooks/useTheme';
import { LanguageProvider } from './hooks/useLanguage';
import { DataSourceProvider } from './hooks/useDataSource';
import { ModelSelectionProvider } from './hooks/useModelSelection';
import { AccessibilityProvider } from './hooks/useAccessibility';

import MainLayout from './components/MainLayout';
import AdminRoute from './components/AdminRoute';
import ResidentRoute from './components/ResidentRoute';
import PageLoader from './components/PageLoader';

// Each page loads when first visited, so the maps and charts on the
// dashboard are not downloaded by someone who only opens the login page.
const LoginPage = lazy(() => import('./pages/LoginPage'));
const RegistrationPage = lazy(() => import('./pages/RegistrationPage'));
const StaffPage = lazy(() => import('./pages/StaffPage'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const RainfallPage = lazy(() => import('./pages/RainfallPage'));
const FloodMapPage = lazy(() => import('./pages/FloodMapPage'));
const KnowYourHazardsPage = lazy(() => import('./pages/KnowYourHazardsPage'));
const ReportsPage = lazy(() => import('./pages/ReportsPage'));
const CommunityReportsPage = lazy(() => import('./pages/CommunityReportsPage'));
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage'));
const AlertsLogPage = lazy(() => import('./pages/AlertsLogPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const ResidentRegistryPage = lazy(() => import('./pages/ResidentRegistryPage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));

function App() {
  return (
    <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <AccessibilityProvider>
      <LanguageProvider>
      <AuthProvider>
        <DataSourceProvider>
        <ModelSelectionProvider>
          <Router>
            <Suspense fallback={<PageLoader fullscreen />}>
            <Routes>
              <Route path="/login" element={<LoginPage />} />

              {/* Shared shell (Sidebar/Topbar). Public pages live here with
                  no guard — Sidebar/Topbar render a logged-out state on
                  their own (login button, nav items filtered) rather than
                  this route tree needing to know who's signed in. Only the
                  staff/admin/resident action pages below are individually
                  wrapped in an auth guard. */}
              <Route element={<MainLayout />}>
                <Route path="/"              element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard"     element={<Dashboard />} />
                <Route path="/rainfall"      element={<RainfallPage />} />
                <Route path="/evacuation-map" element={<FloodMapPage />} />
                <Route path="/know-your-hazards" element={<KnowYourHazardsPage />} />
                <Route path="/analytics" element={
                  <AdminRoute>
                    <AnalyticsPage />
                  </AdminRoute>
                } />
                <Route path="/alerts-log"    element={<AlertsLogPage />} />
                <Route path="/settings"      element={<SettingsPage />} />

                <Route path="/reports" element={
                  <ResidentRoute>
                    <ReportsPage />
                  </ResidentRoute>
                } />

                <Route path="/community-reports" element={
                  <ResidentRoute>
                    <CommunityReportsPage />
                  </ResidentRoute>
                } />

                <Route path="/staff" element={
                  <AdminRoute>
                    <StaffPage />
                  </AdminRoute>
                } />

                <Route path="/register" element={
                  <AdminRoute>
                    <RegistrationPage />
                  </AdminRoute>
                } />

                <Route path="/residents" element={
                  <ResidentRoute>
                    <ResidentRegistryPage />
                  </ResidentRoute>
                } />

                <Route path="/add-resident" element={
                  <ResidentRoute>
                    <RegistrationPage />
                  </ResidentRoute>
                } />

                <Route path="*" element={<NotFoundPage />} />
              </Route>
            </Routes>
            </Suspense>
          </Router>
        </ModelSelectionProvider>
        </DataSourceProvider>
      </AuthProvider>
      </LanguageProvider>
      </AccessibilityProvider>
    </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;