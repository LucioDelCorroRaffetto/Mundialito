import { useState, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';
import { Toaster } from 'sonner';
import { GoogleOAuthProvider } from '@react-oauth/google';
import axios from 'axios';
import { ThemeProvider } from '@/theme/theme-provider';
import { router } from './router';
import { useApiWakeup } from '@/shared/hooks/use-api-wakeup';
import { ApiWakeupScreen } from '@/shared/components/api-wakeup-screen';
import { usePwaUpdate } from '@/shared/hooks/use-pwa-update';
import { useAuthStore } from '@/shared/stores/auth-store';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 2,
      gcTime: 1000 * 60 * 10,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '';
const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api/v1';

/** Decodifica el exp de un JWT sin verificar firma. */
function jwtExpiry(token: string): number | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return typeof payload.exp === 'number' ? payload.exp : null;
  } catch {
    return null;
  }
}

/** True si el token expira en menos de 60 segundos (o ya expiró). */
function isExpiredOrExpiring(token: string): boolean {
  const exp = jwtExpiry(token);
  if (exp == null) return true;
  return exp - Date.now() / 1000 < 60;
}

/**
 * Refresca el access token de forma proactiva al montar la app si el
 * almacenado está expirado o a punto de expirar. Esto evita que los
 * queries iniciales (auth/me, leagues/mine, etc.) reciban un 401 y
 * generen ruido en la consola.
 */
function useEagerTokenRefresh() {
  const [ready, setReady] = useState(false);
  const { token, user, login } = useAuthStore();

  useEffect(() => {
    async function tryRefresh() {
      const storedRefresh = localStorage.getItem('mundialito_refresh');
      if (token && isExpiredOrExpiring(token) && storedRefresh) {
        try {
          const { data } = await axios.post(`${BASE_URL}/auth/refresh`, {
            refreshToken: storedRefresh,
          });
          if (user) login(user, data.accessToken);
          localStorage.setItem('mundialito_refresh', data.refreshToken);
        } catch {
          // Refresh falló → el interceptor de api-client lo manejará
          // en la primera request real; no rompemos el flujo aquí.
        }
      }
      setReady(true);
    }
    tryRefresh();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return ready;
}

function AppWithWakeup() {
  const wakeup = useApiWakeup();
  // Avisa (toast, no invasivo) cuando hay un deploy nuevo para no quedar
  // pegado en un bundle viejo cacheado por el service worker.
  usePwaUpdate();
  return (
    <>
      <RouterProvider router={router} />
      <Toaster position="top-center" richColors />
      <ApiWakeupScreen visible={wakeup === 'waking'} />
    </>
  );
}

function AppReady() {
  const ready = useEagerTokenRefresh();
  // Espera el check de token antes de montar el router para evitar
  // 401s en los queries iniciales.
  if (!ready) return null;
  return <AppWithWakeup />;
}

export function Providers() {
  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <AppReady />
        </QueryClientProvider>
      </ThemeProvider>
    </GoogleOAuthProvider>
  );
}
