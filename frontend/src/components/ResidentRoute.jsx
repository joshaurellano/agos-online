import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { isResident } from '../lib/roles';

export default function ResidentRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (isResident(user)) return <Navigate to="/dashboard" replace />;

  return children;
}