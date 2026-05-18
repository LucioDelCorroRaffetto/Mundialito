import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/shared/stores/auth-store';

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const token = useAuthStore((s) => s.token);
  const location = useLocation();

  if (token) {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      if (payload.exp && payload.exp * 1000 < Date.now()) {
        useAuthStore.getState().logout();
        return <Navigate to={`/login?returnTo=${encodeURIComponent(location.pathname)}`} replace />;
      }
    } catch {
      // token no es JWT válido (caso del mock 'dev-token'), seguir con el flujo de isAuthenticated
    }
  }

  if (!isAuthenticated) {
    return <Navigate to={`/login?returnTo=${encodeURIComponent(location.pathname)}`} replace />;
  }
  return <>{children}</>;
}
