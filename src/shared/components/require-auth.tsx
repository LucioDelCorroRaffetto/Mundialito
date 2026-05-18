import { Navigate, useLocation } from 'react-router-dom';

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem('mundialito_token');
  const location = useLocation();
  if (!token) {
    return <Navigate to={`/login?returnTo=${encodeURIComponent(location.pathname)}`} replace />;
  }
  return <>{children}</>;
}
