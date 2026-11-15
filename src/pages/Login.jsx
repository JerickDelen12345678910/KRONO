import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/Button';
import { Icon } from '../components/ui/Icon';
import { NoteBanner } from '../components/ui/NoteBanner';

export function Login() {
  const { user, loading, online, signInWithGoogle } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!loading && user) return <Navigate to="/" replace />;

  const handleSignIn = async () => {
    setBusy(true); setError('');
    try { await signInWithGoogle(); }
    catch (e) {
      if (e.code !== 'auth/popup-closed-by-user') setError('Sign-in did not finish. Please try again.');
    } finally { setBusy(false); }
  };

  return (
    <main className="login">
      <div className="login-card">
        <div className="login-logo"><Icon name="home" size={36} /></div>
        <h1>All-in-One App</h1>
        <p className="login-sub">Sign in with Google to continue</p>
        {!online && <NoteBanner>You are offline. Signing in needs an internet connection.</NoteBanner>}
        {error && <NoteBanner>{error}</NoteBanner>}
        <Button fullWidth leftIcon="user" disabled={!online || busy} onClick={handleSignIn}>
          {busy ? 'Opening Google…' : 'Continue with Google'}
        </Button>
        <p className="login-note">Your profile is created the first time you sign in.</p>
      </div>
    </main>
  );
}
