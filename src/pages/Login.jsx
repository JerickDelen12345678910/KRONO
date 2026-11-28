import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { useAuth } from '../contexts/AuthContext';
import { ANDROID_APK_URL, GITHUB_RELEASES_URL } from '../config/appLinks';
import { Button } from '../components/ui/Button';
import { NoteBanner } from '../components/ui/NoteBanner';
import { Krono3DMascot } from '../components/ui/Krono3DMascot';

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
      <div className="krono-login-bg-art" aria-hidden="true">
        <div className="krono-login-glow krono-login-glow-1" />
        <div className="krono-login-glow krono-login-glow-2" />
        <img src="/favicon.svg" alt="" className="krono-login-watermark" />
      </div>

      {/* Pure 3D Mascots with zero edge shading: Titan top-center, Chrono & Atlas on sides */}
      <div className="krono-scatter-stage" aria-hidden="true">
        <div className="krono-login-pos-top">
          <Krono3DMascot variant="titan" action="lift" size={114} />
        </div>
        <div className="krono-login-pos-left">
          <Krono3DMascot variant="chrono" action="idle" size={102} />
        </div>
        <div className="krono-login-pos-right">
          <Krono3DMascot variant="atlas" action="wave" size={104} />
        </div>
      </div>

      <div className="login-card krono-login-card krono-login-card-clean">
        <div className="krono-login-header">
          <div className="krono-login-logo-wrap">
            <img src="/favicon.svg" alt="KRONO Logo" width="54" height="54" />
          </div>
          <div className="krono-login-badge">KRONO · ALL-IN-ONE</div>
          <h1 className="krono-styled-title">KRONO</h1>
          <p className="login-sub krono-styled-sub">Schedule · Fitness · Navigation</p>
        </div>

        {!online && <NoteBanner>Connect to the internet to sign in.</NoteBanner>}
        {error && <NoteBanner>{error}</NoteBanner>}

        <div className="krono-login-cta">
          <Button fullWidth leftIcon="user" disabled={!online || busy} onClick={handleSignIn}>
            {busy ? 'Signing in…' : 'Continue with Google'}
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

      {/* True 3D Human-Like Walking Mascot (articulated swinging arms + alternating legs & feet) at bottom */}
      <div className="krono-bottom-walk-track" aria-hidden="true">
        <div className="krono-articulated-walker">
          <Krono3DMascot variant="atlas" action="walk" size={96} />
        </div>
      </div>
    </main>
  );
}
