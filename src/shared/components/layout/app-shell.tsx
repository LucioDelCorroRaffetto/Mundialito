import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { TabBar } from './tab-bar';
import { Sidebar } from './sidebar';
import { useMe } from '@/shared/hooks/use-auth';
import { useAuthStore } from '@/shared/stores/auth-store';

export function AppShell() {
  const { data: meData } = useMe();
  const storeLogin = useAuthStore((s) => s.login);
  const token = useAuthStore((s) => s.token);

  // Refresh user data (including isAdmin) whenever /auth/me resolves
  useEffect(() => {
    if (meData && token) {
      storeLogin(meData, token);
    }
  }, [meData, token, storeLogin]);

  return (
    <div className="min-h-screen bg-bg text-text flex flex-col">
      {/* Identidad WC26: barra tri-anfitrión fija en el techo de la app */}
      <div className="wc26-stripe flex-shrink-0" aria-hidden />

      <div className="flex flex-1 min-h-0">
      {/* Desktop sidebar */}
      <Sidebar />

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0">
        <main className="flex-1 pb-24 md:pb-8 safe-top">
          {/* Constrain content width on large screens */}
          <div className="w-full max-w-3xl mx-auto md:px-6 xl:px-8">
            <Outlet />
          </div>
        </main>

        {/* Mobile bottom tab bar */}
        <TabBar />
      </div>
      </div>
    </div>
  );
}
