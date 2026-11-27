import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { useAuth } from '../contexts/AuthContext';
import { ANDROID_APK_URL } from '../config/appLinks';
import { Button } from '../components/ui/Button';
import { NoteBanner } from '../components/ui/NoteBanner';

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
    <main className="login krono-fade-in">
      <div className="login-card krono-login-card">
        <div className="krono-login-badge">KRONO</div>
        <div className="login-logo krono-logo-mark" aria-hidden="true">
          <svg width="34" height="34" viewBox="0 0 36 36" fill="none">
            <circle cx="18" cy="18" r="14" stroke="currentColor" strokeWidth="2.5" strokeDasharray="6 3" />
            <path d="M13 11V25M13 18L22 11M16.5 15.5L23 25" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h1>KRONO</h1>
        <p className="login-sub">Schedule · Fitness · Navigation</p>

        <div className="krono-login-pillars">
          <span>Class &amp; Task Timeline</span>
          <span>Workout &amp; Macros</span>
          <span>Live Route ETA</span>
        </div>

        {!online && <NoteBanner>Connect to the internet to sign in.</NoteBanner>}
        {error && <NoteBanner>{error}</NoteBanner>}

        <Button fullWidth leftIcon="user" disabled={!online || busy} onClick={handleSignIn}>
          {busy ? 'Opening Google…' : 'Continue with Google'}
        </Button>

        {!isNative && (
          <div className="mt-3 pt-2 border-top">
            <a
              href={ANDROID_APK_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-secondary w-100"
            >
              Download KRONO for Android (Full App + Widget)
            </a>
            <small className="row-subtitle d-block mt-1 text-center">
              Includes Home-Screen Widget, Native Alarm Sound &amp; Custom Icon
            </small>
          </div>
        )}
      </div>
    </main>
  );
}