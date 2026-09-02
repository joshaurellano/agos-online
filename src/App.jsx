import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './hooks/useAuth';
import { ThemeProvider } from './hooks/useTheme';
import { DataSourceProvider } from './hooks/useDataSource';

import LoginPage from './pages/LoginPage';
import RegistrationPage from './pages/RegistrationPage';
import Dashboard from './pages/Dashboard';
import RainfallPage from './pages/RainfallPage';
import FloodMapPage from './pages/FloodMapPage';
import ReportsPage from './pages/ReportsPage';
import CommunityReportsPage from './pages/CommunityReportsPage';
import AnalyticsPage from './pages/AnalyticsPage';

import MainLayout from './components/MainLayout';
import ProtectedRoute from './components/ProtectedRoute';
import AdminRoute from './components/AdminRoute';
import ResidentRoute from './components/ResidentRoute';

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <DataSourceProvider>
          <Router>
            <Routes>
              <Route path="/"      element={<LoginPage />} />
              <Route path="/login" element={<LoginPage />} />

              <Route element={<ProtectedRoute><MainLayout /></ProtectedRoute>}>
                <Route path="/dashboard"    element={<Dashboard />} />
                <Route path="/rainfall"     element={<RainfallPage />} />
                <Route path="/evacuation-map"    element={<FloodMapPage />} />
                <Route path="/reports"   element={
                  <ResidentRoute>
                    <ReportsPage />
                  </ResidentRoute>
                } />

                <Route path="/community-reports" element={
                  <ResidentRoute>
                    <CommunityReportsPage />
                  </ResidentRoute>
                } />

                <Route path="/analytics" element={<AnalyticsPage />} />

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
        </DataSourceProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;