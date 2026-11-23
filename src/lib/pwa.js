// src/lib/pwa.js
// Phase 12 — what the app knows about being a PWA: can it be installed, is it ready to work offline, is a new version waiting.
// No React and no direct use of `window`: everything comes in through `win`, so scripts/check-pwa.mjs runs it in Node with fake browser
// objects. src/pwa/index.js creates the one real store; src/hooks/usePwa.js lets screens read it.
//
// State: { offlineReady, updateReady, updateDismissed, canInstall, installed, iosHint }
//   offlineReady  the service worker is active and has the app saved: it opens without internet
//   updateReady   a new version has been downloaded and waits for the person to choose "Reload"
//   canInstall    the browser offered to install the app (Chrome / Edge / Android); `promptInstall()` shows its dialog
//   iosHint       iPhone / iPad: no install dialog exists there, so the screen shows how to do it by hand
const HOUR = 60 * 60 * 1000;
const INITIAL = Object.freeze({ offlineReady: false, updateReady: false, updateDismissed: false, canInstall: false, installed: false, iosHint: false });

/** iPhone, iPad and iPod (iPadOS also says "MacIntel" but has a touch screen). */
export const isIos = ({ userAgent = '', platform = '', maxTouchPoints = 0 } = {}) =>
  /iPhone|iPad|iPod/i.test(userAgent) || (platform === 'MacIntel' && maxTouchPoints > 1);

export function createPwaStore({ win, reload = () => win.location.reload(), updateEveryMs = HOUR } = {}) {
  const nav = win.navigator;
  const listeners = new Set();
  let state = { ...INITIAL };
  let deferredPrompt = null;
  let registration = null;
  let reloadOnControllerChange = false;
  let timer = null;
  const cleanups = [];

  const standalone = () => Boolean(win.matchMedia?.('(display-mode: standalone)').matches || nav.standalone === true);

  /** Merge a change; listeners are told (and the snapshot replaced) only when something really changed. */
  function set(patch) {
    if (Object.keys(patch).every((key) => state[key] === patch[key])) return;
    state = { ...state, ...patch };
    listeners.forEach((listener) => listener());
  }
  const hints = () => {
    const installed = standalone();
    set({ installed, canInstall: Boolean(deferredPrompt) && !installed, iosHint: isIos(nav) && !installed && !deferredPrompt });
  };
  const on = (target, type, handler) => {
    target.addEventListener(type, handler);
    cleanups.push(() => target.removeEventListener(type, handler));
  };

  /** Start listening for the browser's install events. Returns nothing; `destroy()` stops everything. */
  function attach() {
    on(win, 'beforeinstallprompt', (event) => {
      event.preventDefault();   // keep the event: the browser's own mini-banner stays away and OUR button shows the dialog
      deferredPrompt = event;
      hints();
    });
    on(win, 'appinstalled', () => { deferredPrompt = null; set({ installed: true, canInstall: false, iosHint: false }); });
    hints();
  }

  /** Show the browser's install dialog (only call from a click). Resolves 'accepted' | 'dismissed' | 'unavailable'. */
  async function promptInstall() {
    const event = deferredPrompt;
    if (!event) return 'unavailable';
    deferredPrompt = null;   // a prompt can only be used once
    set({ canInstall: false });
    try {
      await event.prompt();
      const choice = await event.userChoice;
      if (choice?.outcome === 'accepted') set({ installed: true });
      return choice?.outcome === 'accepted' ? 'accepted' : 'dismissed';
    } catch {
      return 'dismissed';
    }
  }

  function trackWorker(worker) {
    on(worker, 'statechange', () => {
      if (worker.state === 'installed' && nav.serviceWorker.controller) set({ updateReady: true, updateDismissed: false });   // a NEW version, waiting
      if (worker.state === 'activated') set({ offlineReady: true });
    });
  }

  /** Register the service worker at `swUrl`. Never rejects; resolves with the registration, or null when it cannot be used. */
  async function register(swUrl) {
    const container = nav.serviceWorker;
    if (!container) return null;
    try {
      registration = await container.register(swUrl);
    } catch {
      return null;
    }
    if (registration.active && container.controller) set({ offlineReady: true });
    if (registration.waiting && container.controller) set({ updateReady: true });
    if (registration.installing) trackWorker(registration.installing);
    on(registration, 'updatefound', () => { if (registration.installing) trackWorker(registration.installing); });
    on(container, 'controllerchange', () => {
      // Only reload when the person asked for the update: the first install also changes the controller, and must not reload the page.
      if (reloadOnControllerChange) { reloadOnControllerChange = false; reload(); }
    });
    timer = win.setInterval(checkForUpdate, updateEveryMs);
    if (win.document) {
      on(win.document, 'visibilitychange', () => { if (win.document.visibilityState === 'visible') checkForUpdate(); });
    }
    return registration;
  }

  /** Ask the browser to look for a newer service worker now (it also does so by itself, and we ask hourly and when the app comes back to the front). */
  function checkForUpdate() {
    try { return Promise.resolve(registration?.update()).then(() => undefined, () => undefined); } catch { return Promise.resolve(); }
  }

  /** The person chose "Reload": let the waiting version take over; the page reloads once it has. Returns false when nothing is waiting. */
  function applyUpdate() {
    const waiting = registration?.waiting;
    if (!waiting) return false;
    reloadOnControllerChange = true;
    waiting.postMessage({ type: 'SKIP_WAITING' });
    return true;
  }

  /** "Later": hide the update message for now (it comes back with the next launch). */
  const dismissUpdate = () => set({ updateDismissed: true });

  function destroy() {
    cleanups.splice(0).forEach((cleanup) => cleanup());
    if (timer != null) win.clearInterval(timer);
    timer = null;
  }

  return {
    attach, register, checkForUpdate, applyUpdate, dismissUpdate, promptInstall, destroy,
    getState: () => state,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  };
}