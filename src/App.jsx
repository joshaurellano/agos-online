import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './hooks/useAuth';
import { ThemeProvider } from './hooks/useTheme';

import LoginPage from './pages/LoginPage';
import RegistrationPage from './pages/RegistrationPage';
import Dashboard from './pages/Dashboard';
import WaterLevelPage from './pages/WaterLevelPage';
import RainfallPage from './pages/RainfallPage';
import FloodMapPage from './pages/FloodMapPage';
import HistoricalPage from './pages/HistoricalPage';
import AlertsPage from './pages/AlertsPage';
import DataSourcesPage from './pages/DataSourcesPage';
import AnalyticsPage from './pages/AnalyticsPage';

import MainLayout from './components/MainLayout';
import ProtectedRoute from './components/ProtectedRoute';
import AdminRoute from './components/AdminRoute';
import ResidentRoute from './components/ResidentRoute';

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <Router>
          <Routes>
            <Route path="/"      element={<LoginPage />} />
            <Route path="/login" element={<LoginPage />} />

            <Route element={<ProtectedRoute><MainLayout /></ProtectedRoute>}>
              <Route path="/dashboard"    element={<Dashboard />} />
              <Route path="/water-level"  element={<WaterLevelPage />} />
              <Route path="/rainfall"     element={<RainfallPage />} />
              <Route path="/evacuation-map"    element={<FloodMapPage />} />
              <Route path="/reports"   element={<HistoricalPage />} />
              <Route path="/alerts"       element={<AlertsPage />} />

              <Route path="/analytics" element={<AnalyticsPage />} />

              <Route path="/data-sources" element={
                <ResidentRoute>
                  <DataSourcesPage />
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
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
