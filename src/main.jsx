import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from './contexts/ThemeContext';
import { AuthProvider } from './contexts/AuthContext';
import { ServicesProvider } from './contexts/ServicesProvider';
import { AppRoutes } from './routes/AppRoutes';
import { UpdateBanner } from './components/ui/UpdateBanner';
import { startPwa } from './pwa/index.js';
import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap-icons/font/bootstrap-icons.css';
import './styles/main.scss';

startPwa();

// eslint-disable-next-line react-refresh/only-export-components
function KronoSplashGate({ children }) {
  const [phase, setPhase] = useState('show'); // 'show' -> 'exit' -> 'done'

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('exit'), 620);
    const t2 = setTimeout(() => setPhase('done'), 940);
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
          <div className="krono-splash-inner">
            <div className="krono-splash-emblem">
              <svg width="42" height="42" viewBox="0 0 36 36" fill="none">
                <circle cx="18" cy="18" r="14" stroke="currentColor" strokeWidth="2.5" strokeDasharray="6 3" />
                <path d="M13 11V25M13 18L22 11M16.5 15.5L23 25" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <span className="krono-splash-wordmark">KRONO</span>
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
          <ServicesProvider>
            <AppRoutes />
          </ServicesProvider>
        </AuthProvider>
        <UpdateBanner />
      </KronoSplashGate>
    </ThemeProvider>
  </StrictMode>
);