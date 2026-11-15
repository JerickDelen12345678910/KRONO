import { Outlet } from 'react-router-dom';
import { Header } from './Header';
import { BottomNav } from './BottomNav';
import { Sidebar } from './Sidebar';
import { StatusBar } from './StatusBar';

export function AppShell() {
  return (
    <div className="app-shell">
      <StatusBar />
      <Header />
      <main className="main-content" role="main">
        <Outlet />
      </main>
      <BottomNav />
      <Sidebar />
    </div>
  );
}
