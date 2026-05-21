import { Navigate } from 'react-router-dom';
import { useAuthStore } from '@/shared/stores/auth-store';

/**
 * Guards admin-only routes. The API already rejects non-admins on every
 * /admin/* endpoint (requireAdmin middleware), but without this the panel
 * UI would still render for any logged-in user who types /admin.
 * Non-admins are bounced to home.
 */
export function RequireAdmin({ children }: { children: React.ReactNode }) {
  const isAdmin = useAuthStore((s) => s.user?.isAdmin);
  if (!isAdmin) {
    return <Navigate to="/home" replace />;
  }
  return <>{children}</>;
}
