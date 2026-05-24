import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/shared/stores/auth-store';

/**
 * Guards authenticated routes.
 *
 * We intentionally do NOT check token expiry here — an expired access token
 * is handled transparently by the api-client interceptor (auto-refresh).
 * Kicking the user to /login at this point would break that flow.
 *
 * The only reason to redirect is if there is no session at all (no token stored).
 */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to={`/login?returnTo=${encodeURIComponent(location.pathname)}`} replace />;
  }

  return <>{children}</>;
}
