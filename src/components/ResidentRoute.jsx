import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export default function ResidentRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) return null;

  if (!user) return <Navigate to="/login" replace />;

  if (user.role_id === 7) return <Navigate to="/dashboard" replace />;

  return children;
}
