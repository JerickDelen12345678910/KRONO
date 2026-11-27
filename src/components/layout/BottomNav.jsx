import { NavLink, useLocation } from 'react-router-dom';
import { Icon } from '../ui/Icon';

const navItems = [
  { path: '/', label: 'Home', icon: 'home', exact: true },
  { path: '/scheduler', label: 'Schedule', icon: 'cal' },
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
      <div
        className="bottom-nav-pill-track"
        style={{ transform: `translateX(${activeIdx * 100}%)` }}
        aria-hidden="true"
      >
        <div className="bottom-nav-pill-glow" />
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