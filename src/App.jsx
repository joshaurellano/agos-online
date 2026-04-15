import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './hooks/useAuth';

import LoginPage from './pages/LoginPage';
import RegistrationPage from './pages/RegistrationPage';
import Dashboard from './pages/Dashboard';
import WaterLevelPage from './pages/WaterLevelPage';
import RainfallPage from './pages/RainfallPage';
import FloodMapPage from './pages/FloodMapPage';
import HistoricalPage from './pages/HistoricalPage';
import AlertsPage from './pages/AlertsPage';
import DataSourcesPage from './pages/DataSourcesPage';

import MainLayout from './components/MainLayout';
import ProtectedRoute from './components/ProtectedRoute';
import AdminRoute from './components/AdminRoute';

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/"         element={<LoginPage />} />
          <Route path="/login"    element={<LoginPage />} />
          <Route path="/register" element={
            <AdminRoute>
              <RegistrationPage />
            </AdminRoute>
          } />

          <Route element={<ProtectedRoute><MainLayout /></ProtectedRoute>}>
            <Route path="/dashboard"    element={<Dashboard />} />
            <Route path="/water-level"  element={<WaterLevelPage />} />
            <Route path="/rainfall"     element={<RainfallPage />} />
            <Route path="/flood-map"    element={<FloodMapPage />} />
            <Route path="/historical"   element={<HistoricalPage />} />
            <Route path="/alerts"       element={<AlertsPage />} />
            <Route path="/data-sources" element={<DataSourcesPage />} />
          </Route>
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
