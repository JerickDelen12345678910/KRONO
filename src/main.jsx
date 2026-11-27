import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from './contexts/ThemeContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ServicesProvider } from './contexts/ServicesProvider';
import { AppRoutes } from './routes/AppRoutes';
import { UpdateBanner } from './components/ui/UpdateBanner';
import { startPwa } from './pwa/index.js';
import { stopAlarmAudio, subscribeActiveAlarm } from './reminders/alarmAudio.js';
import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap-icons/font/bootstrap-icons.css';
import './styles/main.scss';

startPwa();

const ONBOARDING_KEY = 'krono_onboarding_accepted_v1';

const MASCOTS = [
  {
    id: 'schedule',
    name: 'Chrono',
    role: 'Smart Timeline & Alarms',
    src: '/mascots/mascot_schedule.jpg',
    accent: '#38BDF8',
  },
  {
    id: 'gym',
    name: 'Titan',
    role: 'Workouts & Macro Coach',
    src: '/mascots/mascot_gym.jpg',
    accent: '#FB923C',
  },
  {
    id: 'map',
    name: 'Atlas',
    role: 'Live Route & ETA Radar',
    src: '/mascots/mascot_map.jpg',
    accent: '#34D399',
  },
];

// eslint-disable-next-line react-refresh/only-export-components
function ActiveAlarmOverlay() {
  const [alarm, setAlarm] = useState(null);

  useEffect(() => subscribeActiveAlarm(setAlarm), []);

  if (!alarm) return null;

  const handleStop = () => {
    const dismissFn = alarm.onDismiss;
    stopAlarmAudio();
    if (typeof dismissFn === 'function') dismissFn();
  };

  const handleSnooze = () => {
    const snoozeFn = alarm.onSnooze;
    stopAlarmAudio();
    if (typeof snoozeFn === 'function') snoozeFn();
  };

  return (
    <div className="krono-alarm-banner" role="alertdialog" aria-live="assertive" aria-label="Alarm ringing">
      <div className="krono-alarm-banner-card krono-pop-in">
        <div className="krono-alarm-pulse" aria-hidden="true">🔔</div>
        <div className="krono-alarm-copy">
          <span className="krono-alarm-kicker">ALARM RINGING</span>
          <b>{alarm.title}</b>
          {alarm.body && <small>{alarm.body}</small>}
        </div>
        <div className="krono-alarm-actions">
          {alarm.onSnooze && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={handleSnooze}>
              Snooze 5m
            </button>
          )}
          <button type="button" className="btn btn-sm krono-alarm-stop-btn" onClick={handleStop}>
            Stop Alarm
          </button>
        </div>
      </div>
    </div>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
function FirstInstallReviewGate({ children }) {
  const { user, loading } = useAuth();
  const [accepted, setAccepted] = useState(() => {
    try {
      return localStorage.getItem(ONBOARDING_KEY) === 'true';
    } catch {
      return false;
    }
  });

  if (loading || user || accepted) return children;

  const handleContinue = async () => {
    try {
      localStorage.setItem(ONBOARDING_KEY, 'true');
    } catch {
      // Ignore storage restrictions
    }
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      try {
        await Notification.requestPermission();
      } catch {
        // Non-blocking
      }
    }
    setAccepted(true);
  };

  return (
    <div className="krono-onboard-backdrop">
      <div className="krono-onboard-card krono-fade-in">
        <div className="krono-onboard-mascots">
          {MASCOTS.map((m, idx) => (
            <div key={m.id} className="krono-onboard-avatar" style={{ '--delay': `${idx * 90}ms`, '--ring': m.accent }}>
              <img src={m.src} alt={m.name} />
            </div>
          ))}
        </div>

        <span className="krono-login-badge">WELCOME TO KRONO</span>
        <h2>Everything in Sync</h2>
        <p className="krono-onboard-lead">
          Before signing in, review what KRONO includes and the device permissions it uses to keep your day on track:
        </p>

        <div className="krono-onboard-list">
          <div className="krono-onboard-item">
            <span className="krono-onboard-dot" style={{ background: '#38BDF8' }} />
            <div>
              <b>Schedules, COR &amp; Alarms</b>
              <small>Uses Notifications &amp; Exact Alarms to alert you before classes and tasks.</small>
            </div>
          </div>
          <div className="krono-onboard-item">
            <span className="krono-onboard-dot" style={{ background: '#FB923C' }} />
            <div>
              <b>Fitness &amp; Program Scanner</b>
              <small>Reads uploaded COR/workout PDFs and images locally to build your routines.</small>
            </div>
          </div>
          <div className="krono-onboard-item">
            <span className="krono-onboard-dot" style={{ background: '#34D399' }} />
            <div>
              <b>Live Route &amp; Leave-By Radar</b>
              <small>Uses Location (only while navigating) to estimate travel time and departure alerts.</small>
            </div>
          </div>
        </div>

        <button type="button" className="btn btn-full" onClick={handleContinue}>
          Accept &amp; Continue to Sign In
        </button>
      </div>
    </div>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
function KronoSplashGate({ children }) {
  const [phase, setPhase] = useState('show');

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('exit'), 1550);
    const t2 = setTimeout(() => setPhase('done'), 1950);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  return (
    <>
      {children}
      {phase !== 'done' && (
        <div className={`krono-splash-overlay${phase === 'exit' ? ' is-exiting' : ''}`} aria-hidden="true">
          <div className="krono-splash-stage">
            <div className="krono-mascot-trio">
              {MASCOTS.map((m, i) => (
                <div
                  key={m.id}
                  className={`krono-mascot-card is-pos-${i}`}
                  style={{ '--stagger': `${i * 130}ms`, '--accent': m.accent }}
                >
                  <div className="krono-mascot-ring">
                    <img src={m.src} alt={m.name} />
                  </div>
                  <span className="krono-mascot-tag">{m.name}</span>
                </div>
              ))}
            </div>
            <div className="krono-splash-copy">
              <span className="krono-splash-wordmark">KRONO</span>
              <small className="krono-splash-sub">Schedule · Fitness · Navigation</small>
            </div>
            <div className="krono-splash-bar"><span /></div>
          </div>
        </div>
      )}
    </>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider>
      <KronoSplashGate>
        <AuthProvider>
          <FirstInstallReviewGate>
            <ServicesProvider>
              <AppRoutes />
            </ServicesProvider>
          </FirstInstallReviewGate>
        </AuthProvider>
        <ActiveAlarmOverlay />
        <UpdateBanner />
      </KronoSplashGate>
    </ThemeProvider>
  </StrictMode>
);