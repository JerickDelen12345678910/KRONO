import { NavLink, useLocation } from 'react-router-dom';
import { Icon } from '../ui/Icon';

const navItems = [
  { path: '/', label: 'Home', icon: 'home', exact: true },
  { path: '/scheduler', label: 'Scheduler', icon: 'cal' },
  { path: '/fitness', label: 'Fitness', icon: 'dumb' },
  { path: '/map', label: 'Map', icon: 'pin' },
  { path: '/account', label: 'Account', icon: 'user' },
];

export function BottomNav() {
  const { pathname } = useLocation();
  const activeIdx = Math.max(
    0,
    navItems.findIndex((item) => (item.exact ? pathname === item.path : pathname.startsWith(item.path)))
  );

  return (
    <nav className="bottom-nav" role="navigation" aria-label="Main navigation">
      {/* Sliding wave crest & active indicator bar */}
      <div
        className="bottom-nav-indicator"
        style={{ transform: `translateX(${activeIdx * 100}%)` }}
        aria-hidden="true"
      >
        <svg viewBox="0 0 120 26" preserveAspectRatio="none" className="bottom-nav-wave">
          <path d="M0,26 C28,26 36,4 60,4 C84,4 92,26 120,26 Z" />
        </svg>
        <span className="bottom-nav-pill-line" />
      </div>

      {navItems.map(({ path, label, icon, exact }) => (
        <NavLink
          key={path}
          to={path}
          end={exact}
          className={({ isActive }) => `bottom-nav-btn ${isActive ? 'active' : ''}`}
          aria-current={({ isActive }) => (isActive ? 'page' : undefined)}
        >
          <span className="bottom-nav-icon-wrap">
            <Icon name={icon} className="icon-lg" />
          </span>
          <span className="bottom-nav-label">{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}