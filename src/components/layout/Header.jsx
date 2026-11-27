import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useServices } from '../../hooks/useServices';
import { useRemoteChanges } from '../../hooks/useRemoteChanges';
import { reminderNotifications, searchAll } from '../../lib/headerView.js';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { Pill } from '../ui/Pill';

const REMOTE_COLLECTIONS = ['schedules', 'occurrences', 'workouts', 'destinations'];

const POPOVER_STYLE = {
  position: 'absolute',
  top: 'calc(100% + 10px)',
  zIndex: 120,
  background: 'var(--sf)',
  color: 'var(--ink)',
  border: '1px solid var(--bd)',
  borderRadius: '16px',
  boxShadow: 'var(--lift)',
  padding: '14px',
  maxHeight: '72vh',
  overflowY: 'auto',
};

export function Header() {
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { schedule, place, workout, reminders } = useServices();

  const navKey = `${location.pathname}${location.search}`;
  const [now, setNow] = useState(() => new Date());
  const [query, setQuery] = useState('');
  const [popover, setPopover] = useState({ kind: null, navKey: '' });
  const [snoozingId, setSnoozingId] = useState(null);
  const [reload, setReload] = useState(0);
  const [index, setIndex] = useState({ schedules: [], places: [], workouts: [], scheduled: [] });

  const searchWrapRef = useRef(null);
  const bellWrapRef = useRef(null);
  const searchInputRef = useRef(null);

  const searchOpen = popover.kind === 'search' && popover.navKey === navKey;
  const bellOpen = popover.kind === 'bell' && popover.navKey === navKey;

  useRemoteChanges(REMOTE_COLLECTIONS, () => setReload((n) => n + 1));

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [schedules, places, workouts, scheduled] = await Promise.all([
          schedule.list(),
          place.listFavorites(),
          typeof workout?.list === 'function' ? workout.list().catch(() => []) : Promise.resolve([]),
          reminders.listScheduled(),
        ]);
        if (alive) setIndex({ schedules, places, workouts, scheduled });
      } catch {
        // Keep previous cached index
      }
    })();
    return () => { alive = false; };
  }, [schedule, place, workout, reminders, reload, location.pathname]);

  useEffect(() => {
    if (!searchOpen && !bellOpen) return undefined;
    const onPointerDown = (e) => {
      if (searchOpen && searchWrapRef.current && !searchWrapRef.current.contains(e.target)) {
        setPopover({ kind: null, navKey: '' });
      }
      if (bellOpen && bellWrapRef.current && !bellWrapRef.current.contains(e.target)) {
        setPopover({ kind: null, navKey: '' });
      }
    };
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setPopover({ kind: null, navKey: '' });
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [searchOpen, bellOpen]);

  const searchResults = useMemo(
    () => searchAll({ query, schedules: index.schedules, places: index.places, workouts: index.workouts }),
    [query, index.schedules, index.places, index.workouts],
  );

  const snoozeMinutes = reminders.getSettings().snoozeMinutes;
  const notifications = useMemo(
    () => reminderNotifications({ scheduled: index.scheduled, schedules: index.schedules, now, snoozeMinutes }),
    [index.scheduled, index.schedules, now, snoozeMinutes],
  );

  const first = (profile?.displayName || user?.displayName || '').split(' ')[0];
  const hour = now.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const today = now.toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' });
  const route = location.pathname.split('/')[1] || 'home';
  const titles = {
    home: [first ? `${greeting}, ${first}` : greeting, today],
    scheduler: ['Scheduler', today],
    fitness: ['Fitness', today],
    map: ['Map', 'Philippines'],
    account: ['Account', profile?.displayName || 'Profile'],
  };
  const [title, subtitle] = titles[route] || titles.home;

  function openResult(item) {
    setPopover({ kind: null, navKey: '' });
    setQuery('');
    navigate(item.route);
  }

  async function handleSnooze(item) {
    if (snoozingId) return;
    setSnoozingId(item.id);
    try {
      await reminders.snooze(item.id, item.snoozeMinutes);
      const scheduled = await reminders.listScheduled();
      setIndex((prev) => ({ ...prev, scheduled }));
    } finally {
      setSnoozingId(null);
    }
  }

  return (
    <header className="header krono-header" role="banner">
      <div className="krono-header-left">
        <div className="krono-header-kicker">
          <span className="krono-brand-tag">KRONO</span>
          <span className="krono-date-chip">{subtitle}</span>
        </div>
        <h2 className="header-title">{title}</h2>
      </div>

      <div className="header-actions">
        <div ref={searchWrapRef} style={{ position: 'relative' }}>
          <div
            className="search-input"
            role="search"
            onClick={() => { setPopover({ kind: 'search', navKey }); searchInputRef.current?.focus(); }}
          >
            <Icon name="search" />
            <input
              ref={searchInputRef}
              type="search"
              value={query}
              onFocus={() => setPopover({ kind: 'search', navKey })}
              onChange={(e) => { setQuery(e.target.value); setPopover({ kind: 'search', navKey }); }}
              placeholder="Search schedules, exercises, places"
              aria-label="Search"
              autoComplete="off"
              style={{
                border: 'none',
                background: 'transparent',
                color: 'inherit',
                font: 'inherit',
                outline: 'none',
                width: '100%',
                minWidth: 0,
              }}
            />
          </div>

          {searchOpen && query.trim().length > 0 && (
            <div
              role="region"
              aria-label="Search results"
              className="krono-pop-in"
              style={{ ...POPOVER_STYLE, left: 0, width: 'min(380px, calc(100vw - 24px))' }}
            >
              {searchResults.total === 0 ? (
                <p className="empty-hint" style={{ margin: 0 }}>No matches found.</p>
              ) : (
                <div className="stack">
                  {searchResults.groups.map((g) => (
                    <div key={g.key}>
                      <div className="ui-card-header" style={{ marginBottom: '6px' }}>
                        <span>{g.label}</span>
                        <Pill variant={g.variant}>{g.items.length}</Pill>
                      </div>
                      {g.items.map((item) => (
                        <button
                          key={item.key}
                          type="button"
                          className="place-item"
                          onClick={() => openResult(item)}
                        >
                          <div className="list-row">
                            <div className="row-content">
                              <b className="row-title">{item.title}</b>
                              {item.subtitle && <small className="row-subtitle">{item.subtitle}</small>}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <button
          type="button"
          className="icon-btn"
          onClick={toggleTheme}
          aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
        >
          <Icon name={theme === 'light' ? 'moon' : 'sun'} />
        </button>

        <div ref={bellWrapRef} style={{ position: 'relative' }}>
          <button
            type="button"
            className="icon-btn"
            aria-label="Notifications"
            aria-expanded={bellOpen}
            onClick={() => setPopover((p) => (p.kind === 'bell' && p.navKey === navKey ? { kind: null, navKey: '' } : { kind: 'bell', navKey }))}
            style={{ position: 'relative' }}
          >
            <Icon name="bell" />
            {notifications.count > 0 && (
              <span aria-hidden="true" className="krono-bell-badge">
                {notifications.count > 9 ? '9+' : notifications.count}
              </span>
            )}
          </button>

          {bellOpen && (
            <div
              role="region"
              aria-label="Upcoming reminders"
              className="krono-pop-in"
              style={{ ...POPOVER_STYLE, right: 0, width: 'min(360px, calc(100vw - 24px))' }}
            >
              <div className="ui-card-header" style={{ marginBottom: '8px' }}>
                <b>Reminders</b>
                <Pill variant={notifications.count > 0 ? 'pri' : 'fit'}>
                  {notifications.count > 0 ? `${notifications.count} active` : 'Clear'}
                </Pill>
              </div>

              {notifications.items.length === 0 ? (
                <p className="empty-hint" style={{ margin: 0 }}>No upcoming reminders.</p>
              ) : (
                <div className="stack">
                  {notifications.items.map((item) => (
                    <div key={item.id} className="list-row" style={{ alignItems: 'flex-start', gap: '8px' }}>
                      <div className="row-content" style={{ flex: 1, minWidth: 0 }}>
                        <b className="row-title">{item.title}</b>
                        <small className="row-subtitle">
                          {item.when ? `${item.when} · ` : ''}{item.fireTimeText}
                        </small>
                        <div className="status-actions mt-2">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => { setPopover({ kind: null, navKey: '' }); navigate(item.route); }}
                          >
                            Open
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={snoozingId === item.id}
                            onClick={() => handleSnooze(item)}
                          >
                            {snoozingId === item.id ? 'Snoozing…' : `+${item.snoozeMinutes}m`}
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <button
          type="button"
          className="avatar krono-avatar-ring"
          onClick={() => navigate('/account')}
          aria-label="Account"
        >
          {user?.photoURL ? <img src={user.photoURL} alt="" referrerPolicy="no-referrer" /> : (first[0] || 'K')}
        </button>
      </div>
    </header>
  );
}