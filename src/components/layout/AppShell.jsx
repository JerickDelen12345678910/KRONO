import { Outlet } from 'react-router-dom';
import { Header } from './Header';
import { BottomNav } from './BottomNav';
import { Sidebar } from './Sidebar';

export function AppShell() {
  return (
    <div className="app-shell">
      <Header />
      <main className="main-content" role="main">
        <Outlet />
      </main>
      <BottomNav />
      <Sidebar />
    </div>
  );
}