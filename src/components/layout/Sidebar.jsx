import { NavLink } from 'react-router-dom';
import { Icon } from '../ui/Icon';

const navItems = [
  { path: '/', label: 'Home', icon: 'home' },
  { path: '/scheduler', label: 'Scheduler', icon: 'cal' },
  { path: '/fitness', label: 'Fitness', icon: 'dumb' },
  { path: '/map', label: 'Map', icon: 'pin' },
  { path: '/account', label: 'Account', icon: 'user' },
];

export function Sidebar() {
  return (
    <aside className="sidebar" role="navigation" aria-label="Main navigation">
      <div className="brand">
        <div className="brand-icon">
          <Icon name="home" size={20} />
        </div>
        <div>
          All-in-One
          <small>Name to be decided</small>
        </div>
      </div>
      <nav className="sidebar-nav">
        {navItems.map(({ path, label, icon }) => (
          <NavLink
            key={path}
            to={path}
            className={({ isActive }) => `sidebar-btn ${isActive ? 'active' : ''}`}
            aria-current={({ isActive }) => isActive ? 'page' : undefined}
          >
            <Icon name={icon} className="icon-lg" />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="sync-status">
        <b>Synced</b>
        <span>Last sync 2 min ago</span>
      </div>
    </aside>
  );
}
