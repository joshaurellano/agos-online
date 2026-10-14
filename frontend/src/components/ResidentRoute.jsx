import { Navigate } from 'react-router-dom';
import PageLoader from './PageLoader';
import { useAuth } from '../hooks/useAuth';
import { isResident } from '../lib/roles';

export default function ResidentRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) return <PageLoader />;
  if (!user) return <Navigate to="/login" replace />;
  if (isResident(user)) return <Navigate to="/dashboard" replace />;

  return children;
}