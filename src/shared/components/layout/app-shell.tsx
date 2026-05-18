import { Outlet } from 'react-router-dom';
import { TabBar } from './tab-bar';

export function AppShell() {
  return (
    <div className="min-h-screen bg-bg text-text flex flex-col">
      <main className="flex-1 pb-24 safe-top">
        <Outlet />
      </main>
      <TabBar />
    </div>
  );
}
