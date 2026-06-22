import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../../stores/auth.store';

/**
 * Wraps routes that require the 'devTestRoom' permission.
 * - Unauthenticated → /auth
 * - No devTestRoom permission → /home
 * - Has permission → renders the outlet
 */
export function DevTestRoute() {
  const user = useAuthStore((s) => s.user);

  if (!user) return <Navigate to="/auth" replace />;
  if (!user.permissions.includes('devTestRoom')) return <Navigate to="/home" replace />;

  return <Outlet />;
}
