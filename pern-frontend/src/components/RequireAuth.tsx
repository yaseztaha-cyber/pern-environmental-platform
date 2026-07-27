/**
 * RequireAuth — route guard that redirects unauthenticated users to /login.
 */

import { Navigate, useLocation } from 'react-router';
import { useAuth } from '../lib/auth-context';
import { LoadingState } from './ui';

export default function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingState />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}
