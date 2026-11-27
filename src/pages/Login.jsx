import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { useAuth } from '../contexts/AuthContext';
import { ANDROID_APK_URL, GITHUB_RELEASES_URL } from '../config/appLinks';
import { Button } from '../components/ui/Button';
import { NoteBanner } from '../components/ui/NoteBanner';

const MASCOT_PILLARS = [
  {
    key: 'schedule',
    title: 'Smart Schedule',
    desc: 'COR OCR & Background Alarms',
    img: '/mascots/mascot_schedule.jpg',
    accent: '#38bdf8',
  },
  {
    key: 'fitness',
    title: 'Fitness & Macros',
    desc: 'Workouts & Rest Timers',
    img: '/mascots/mascot_gym.jpg',
    accent: '#22c55e',
  },
  {
    key: 'map',
    title: 'Live Route ETA',
    desc: 'Saved Places & Directions',
    img: '/mascots/mascot_map.jpg',
    accent: '#f59e0b',
  },
];

export function Login() {
  const { user, loading, online, signInWithGoogle } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const isNative = Capacitor.isNativePlatform();

  if (!loading && user) return <Navigate to="/" replace />;

  const handleSignIn = async () => {
    setBusy(true);
    setError('');
    try {
      await signInWithGoogle();
    } catch (e) {
      if (e.code !== 'auth/popup-closed-by-user') {
        setError('Sign-in did not finish. Please try again.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="login krono-login-screen krono-fade-in">
      {/* Ambient Background KRONO Icon Watermark */}
      <div className="krono-login-bg-art" aria-hidden="true">
        <div className="krono-login-glow krono-login-glow-1" />
        <div className="krono-login-glow krono-login-glow-2" />
        <img src="/favicon.svg" alt="" className="krono-login-watermark" />
      </div>

      <div className="login-card krono-login-card">
        <div className="krono-login-header">
          <div className="krono-login-logo-wrap">
            <img src="/favicon.svg" alt="KRONO Logo" width="56" height="56" />
          </div>
          <div className="krono-login-badge">KRONO · ALL-IN-ONE</div>
          <h1>KRONO</h1>
          <p className="login-sub">Schedule · Fitness · Navigation</p>
        </div>

        {/* 3 Mascot Showcase Cards */}
        <div className="krono-mascot-grid" aria-label="Core Features">
          {MASCOT_PILLARS.map((item) => (
            <div
              key={item.key}
              className="krono-mascot-card"
              style={{ '--pillar-accent': item.accent }}
            >
              <div className="krono-mascot-avatar">
                <img src={item.img} alt={item.title} loading="eager" />
              </div>
              <div className="krono-mascot-copy">
                <strong>{item.title}</strong>
                <span>{item.desc}</span>
              </div>
            </div>
          ))}
        </div>

        {!online && <NoteBanner>Connect to the internet to sign in.</NoteBanner>}
        {error && <NoteBanner>{error}</NoteBanner>}

        <div className="krono-login-cta">
          <Button fullWidth leftIcon="user" disabled={!online || busy} onClick={handleSignIn}>
            {busy ? 'Opening Google…' : 'Continue with Google'}
          </Button>

          {!isNative && (
            <div className="krono-apk-box">
              <a
                href={ANDROID_APK_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="krono-apk-btn"
              >
                <span className="krono-apk-btn-title">Download KRONO for Android</span>
                <span className="krono-apk-btn-sub">Latest APK · Home Widget &amp; Background Alarms</span>
              </a>
              <a
                href={GITHUB_RELEASES_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="krono-release-fallback"
              >
                View all release notes on GitHub →
              </a>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}