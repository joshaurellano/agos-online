import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './hooks/useAuth';
import { ThemeProvider } from './hooks/useTheme';
import { DataSourceProvider } from './hooks/useDataSource';
import { ModelSelectionProvider } from './hooks/useModelSelection';

import LoginPage from './pages/LoginPage';
import RegistrationPage from './pages/RegistrationPage';
import Dashboard from './pages/Dashboard';
import RainfallPage from './pages/RainfallPage';
import FloodMapPage from './pages/FloodMapPage';
import ReportsPage from './pages/ReportsPage';
import CommunityReportsPage from './pages/CommunityReportsPage';
import AnalyticsPage from './pages/AnalyticsPage';

import MainLayout from './components/MainLayout';
import AdminRoute from './components/AdminRoute';
import ResidentRoute from './components/ResidentRoute';

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <DataSourceProvider>
        <ModelSelectionProvider>
          <Router>
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
                <Route path="/analytics"     element={<AnalyticsPage />} />

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

                <Route path="/register" element={
                  <AdminRoute>
                    <RegistrationPage />
                  </AdminRoute>
                } />

                <Route path="/add-resident" element={
                  <ResidentRoute>
                    <RegistrationPage />
                  </ResidentRoute>
                } />
              </Route>
            </Routes>
          </Router>
        </ModelSelectionProvider>
        </DataSourceProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;