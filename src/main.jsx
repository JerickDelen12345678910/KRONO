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

const BOOT_STEPS = [
  { label: 'Syncing your schedule...', pct: 28 },
  { label: 'Warming up workouts...', pct: 55 },
  { label: 'Locating routes...', pct: 99 },
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
  const [agreed, setAgreed] = useState(false);
  const [accepted, setAccepted] = useState(() => {
    try {
      return localStorage.getItem(ONBOARDING_KEY) === 'true';
    } catch {
      return false;
    }
  });

  if (loading || user || accepted) return children;

  const handleContinue = async () => {
    if (!agreed) return;
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
    <div className="krono-onboard-backdrop krono-dark-unified">
      <div className="krono-login-bg-art" aria-hidden="true">
        <div className="krono-login-glow krono-login-glow-1" />
        <div className="krono-login-glow krono-login-glow-2" />
        <img src="/favicon.svg" alt="" className="krono-login-watermark" />
      </div>

      {/* Centered top brand header + full-body standing mascots (hands & feet visible, no circle crop) */}
      <div className="krono-onboard-shell krono-fade-in">
        <div className="krono-top-center-brand">
          <img src="/favicon.svg" alt="KRONO" width="38" height="38" />
          <span>KRONO</span>
        </div>

        <div className="krono-standing-trio" aria-hidden="true">
          <div className="krono-full-mascot is-left-study">
            <img src="/mascots/mascot_schedule.jpg" alt="" />
          </div>
          <div className="krono-full-mascot is-center-gym">
            <img src="/mascots/mascot_gym.jpg" alt="" />
          </div>
          <div className="krono-full-mascot is-right-wave">
            <img src="/mascots/mascot_map.jpg" alt="" />
            <span className="krono-wave-hand">👋</span>
          </div>
        </div>

        <div className="krono-onboard-card krono-login-card krono-onboard-card-centered">
          <div className="krono-centered-header">
            <span className="krono-login-badge">WELCOME TO KRONO</span>
            <h2 className="krono-styled-heading">Everything in Sync</h2>
            <p className="krono-onboard-lead">
              Review what KRONO includes and the device permissions it uses to keep your day on track:
            </p>
          </div>

          <div className="krono-onboard-list">
            <div className="krono-onboard-item">
              <span className="krono-onboard-dot" />
              <div>
                <b>Schedules, COR &amp; Alarms</b>
                <small>Uses Notifications &amp; Exact Alarms to alert you before classes and tasks.</small>
              </div>
              <span className="krono-pillar-tag">CHRONO</span>
            </div>
            <div className="krono-onboard-item">
              <span className="krono-onboard-dot" />
              <div>
                <b>Fitness &amp; Program Scanner</b>
                <small>Reads uploaded COR/workout PDFs and images locally to build your routines.</small>
              </div>
              <span className="krono-pillar-tag">TITAN</span>
            </div>
            <div className="krono-onboard-item">
              <span className="krono-onboard-dot" />
              <div>
                <b>Live Route &amp; Leave-By Radar</b>
                <small>Uses Location (only while navigating) to estimate travel time and departure alerts.</small>
              </div>
              <span className="krono-pillar-tag">ATLAS</span>
            </div>
          </div>

          <label className="krono-terms-check">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
            />
            <span>I agree to the Terms &amp; Agreement</span>
          </label>

          <button
            type="button"
            className="btn btn-full"
            disabled={!agreed}
            onClick={handleContinue}
          >
            Accept &amp; Continue to Sign In
          </button>
        </div>
      </div>
    </div>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
function KronoSplashGate({ children }) {
  const [phase, setPhase] = useState('show');
  const [stepIdx, setStepIdx] = useState(0);

  useEffect(() => {
    const s1 = setTimeout(() => setStepIdx(1), 650);
    const s2 = setTimeout(() => setStepIdx(2), 1300);
    const t1 = setTimeout(() => setPhase('exit'), 1950);
    const t2 = setTimeout(() => setPhase('done'), 2400);
    return () => {
      clearTimeout(s1);
      clearTimeout(s2);
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  const currentStep = BOOT_STEPS[stepIdx] || BOOT_STEPS[BOOT_STEPS.length - 1];

  return (
    <>
      {children}
      {phase !== 'done' && (
        <div
          className={`krono-splash-overlay krono-chrono-splash${phase === 'exit' ? ' is-exiting' : ''}`}
          aria-hidden="true"
        >
          <div className="krono-chrono-stage">
            <div className="krono-chrono-ring-wrap">
              <div className="krono-chrono-orbit" />
              <div className="krono-chrono-core">
                <svg width="64" height="64" viewBox="0 0 108 108" fill="none">
                  <path
                    d="M39 28V80M69 28L45 54L71 80"
                    stroke="#F8FAFC"
                    strokeWidth="11"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
            </div>

            <div className="krono-chrono-brand">
              <div className="krono-chrono-title">KRONO</div>
              <div className="krono-chrono-pillars">SCHEDULE · FITNESS · NAVIGATION</div>
            </div>

            <div className="krono-chrono-progress-wrap">
              <div className="krono-chrono-track">
                <div
                  className="krono-chrono-fill"
                  style={{ width: `${currentStep.pct}%` }}
                />
              </div>
              <div className="krono-chrono-status">
                {currentStep.label} · {currentStep.pct}%
              </div>
            </div>

            <div className="krono-chrono-footer">
              All-in-one organizer · Keep moving forward
            </div>
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
