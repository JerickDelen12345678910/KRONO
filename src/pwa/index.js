import { createPwaStore } from '../lib/pwa.js';

/** The one PWA store of the app (install / update / offline state). Screens read it through src/hooks/usePwa.js. */
export const pwa = createPwaStore({ win: window });

/**
 * Call once at startup (src/main.jsx). The service worker is registered only in a production build (during `npm run dev` it would
 * serve stale files), and not inside the Android app, which has its own packaging (Phase 13).
 */
export function startPwa() {
  pwa.attach();
  const native = window.Capacitor?.isNativePlatform?.() === true;
  if (!import.meta.env.PROD || native || !('serviceWorker' in navigator)) return;
  const register = () => { pwa.register(`${import.meta.env.BASE_URL}sw.js`); };
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });   // after the page has loaded, so it never competes with it
}