import { NavLink } from 'react-router-dom';
import { Icon } from '../ui/Icon';

const navItems = [
  { path: '/', label: 'Home', icon: 'home' },
  { path: '/scheduler', label: 'Scheduler', icon: 'cal' },
  { path: '/fitness', label: 'Fitness', icon: 'dumb' },
  { path: '/map', label: 'Map', icon: 'pin' },
  { path: '/account', label: 'Account', icon: 'user' },
];

export function BottomNav() {
  return (
    <nav className="bottom-nav" role="navigation" aria-label="Main navigation">
      {navItems.map(({ path, label, icon }) => (
        <NavLink
          key={path}
          to={path}
          className={({ isActive }) => `bottom-nav-btn ${isActive ? 'active' : ''}`}
          aria-current={({ isActive }) => isActive ? 'page' : undefined}
        >
          <Icon name={icon} className="icon-lg" />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
