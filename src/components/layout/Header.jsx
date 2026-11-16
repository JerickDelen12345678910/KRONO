import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { Icon } from '../ui/Icon';
import { useLocation } from 'react-router-dom';

export function Header() {
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  
  const { user, profile } = useAuth();
  const first = (profile?.displayName || user?.displayName || '').split(' ')[0];
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const today = new Date().toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric' });
  const route = location.pathname.split('/')[1] || 'home';
  const titles = {
    home: [first ? `${greeting}, ${first}` : greeting, today],
    scheduler: ['Scheduler', 'Your classes and plans'],
    fitness: ['Fitness', 'Workouts and progress'],
    map: ['Map', 'Philippines'],
    account: ['Account and sync', profile?.displayName || 'Your profile'],
  };
  const [title, subtitle] = titles[route] || titles.home;

  return (
    <header className="header" role="banner">
      <div>
        <h2 className="header-title">{title}</h2>
        <small className="header-subtitle">{subtitle}</small>
      </div>
      <div className="header-actions">
        <div className="search-input" role="search">
          <Icon name="search" />
          <span>Search schedules, exercises, places</span>
        </div>
        <button 
          className="icon-btn" 
          onClick={toggleTheme}
          aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
        >
          <Icon name={theme === 'light' ? 'moon' : 'sun'} />
        </button>
        <button className="icon-btn" aria-label="Notifications">
          <Icon name="bell" />
        </button>
        <div className="avatar" aria-label="Account">{user?.photoURL ? <img src={user.photoURL} alt="" referrerPolicy="no-referrer" /> : (first[0] || 'A')}</div>
      </div>
    </header>
  );
}