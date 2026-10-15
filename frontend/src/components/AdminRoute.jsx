import { Navigate } from 'react-router-dom';
import PageLoader from './PageLoader';
import { useAuth } from '../hooks/useAuth';
import { isAdmin } from '../lib/roles';

export default function AdminRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) return <PageLoader />;
  if (!user) return <Navigate to="/login" replace />;
  if (!isAdmin(user)) return <Navigate to="/dashboard" replace />;

  return children;
}