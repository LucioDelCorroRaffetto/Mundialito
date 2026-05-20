import { Outlet } from 'react-router-dom';
import { TabBar } from './tab-bar';
import { Sidebar } from './sidebar';

export function AppShell() {
  return (
    <div className="min-h-screen bg-bg text-text flex">
      {/* Desktop sidebar */}
      <Sidebar />

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0">
        <main className="flex-1 pb-24 lg:pb-8 safe-top">
          {/* Constrain content width on large screens */}
          <div className="w-full max-w-3xl mx-auto lg:px-6 xl:px-8">
            <Outlet />
          </div>
        </main>

        {/* Mobile bottom tab bar */}
        <TabBar />
      </div>
    </div>
  );
}
