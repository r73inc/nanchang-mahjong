import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../../stores/auth.store';

/**
 * Wraps routes that require the 'admin' role.
 * - Unauthenticated → /auth
 * - Authenticated but not admin → /home
 * - Admin → renders the outlet
 */
export function AdminRoute() {
  const user = useAuthStore((s) => s.user);

  if (!user) return <Navigate to="/auth" replace />;
  if (user.role !== 'admin') return <Navigate to="/home" replace />;

  return <Outlet />;
}
