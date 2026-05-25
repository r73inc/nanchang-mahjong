import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../stores/auth.store';

/**
 * Wraps routes that require authentication.
 * Unauthenticated users are redirected to /auth with the intended URL preserved
 * so they can be sent back after sign-in.
 */
export function ProtectedRoute() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const location = useLocation();

  if (!accessToken) {
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  return <Outlet />;
}
