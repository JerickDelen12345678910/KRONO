import { NavLink } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useSyncStatus } from '../../hooks/useSyncStatus';
import { syncCard } from '../../lib/dashboardView.js';
import { Icon } from '../ui/Icon';

const navItems = [
  { path: '/', label: 'Home', icon: 'home', exact: true },
  { path: '/scheduler', label: 'Scheduler', icon: 'cal' },
  { path: '/fitness', label: 'Fitness', icon: 'dumb' },
  { path: '/map', label: 'Map', icon: 'pin' },
  { path: '/account', label: 'Account', icon: 'user' },
];

export function Sidebar() {
  const { online } = useAuth();
  const syncStatus = useSyncStatus();
  const sync = syncCard(syncStatus, online, Date.now());

  return (
    <aside className="sidebar" role="navigation" aria-label="Main navigation">
      <div className="brand">
        <div className="brand-icon" aria-hidden="true">
          <img src="/favicon.svg" alt="" width="28" height="28" style={{ borderRadius: '8px', display: 'block' }} />
        </div>
        <div className="brand-copy">
          <strong className="brand-name">KRONO</strong>
          <small>Schedule · Fitness · Map</small>
        </div>
      </div>

      <nav className="sidebar-nav">
        {navItems.map(({ path, label, icon, exact }) => (
          <NavLink
            key={path}
            to={path}
            end={exact}
            className={({ isActive }) => `sidebar-btn ${isActive ? 'active' : ''}`}
            aria-current={({ isActive }) => (isActive ? 'page' : undefined)}
          >
            <Icon name={icon} className="icon-lg" />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="sync-status">
        <div className="sync-status-row">
          <span className={`sync-dot ${online ? 'is-online' : 'is-offline'}`} />
          <b>{sync.pill.label}</b>
        </div>
        <span>{sync.title}</span>
      </div>
    </aside>
  );
}