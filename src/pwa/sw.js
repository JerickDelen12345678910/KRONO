// src/pwa/sw.js — the service worker (Phase 12). NOT bundled by Vite: vite.pwa.js reads this file at build time, fills the three
// marked placeholders below and writes it to dist/sw.js. It is plain JavaScript on purpose (no imports), and it is tested by
// scripts/check-pwa.mjs.
//
// What it does:
//   * installs: downloads every built file of the app (the "app shell") into one cache, so the app opens and works offline;
//   * serves every page navigation from that cached shell (the app is a single-page app, so one index.html serves all routes);
//   * keeps lazily loaded build files (the PDF reader, OCR) once they have been used, and the Google Fonts the design uses;
//   * waits for the person to choose "Reload" before a new version takes over (a silent reload could lose an unsaved edit).
// What it NEVER touches (goes straight to the network): Firebase / Firestore / sign-in, place search, map tiles, any other site,
// any non-GET request, and Firebase Hosting's /__/ paths (sign-in handler).
const VERSION = /*VERSION*/ 'dev';
const BASE = /*BASE*/ '/';
const PRECACHE_URLS = /*PRECACHE_URLS*/ [];

const PRECACHE = `app-shell-${VERSION}`;
const RUNTIME = `runtime-${VERSION}`;
const FONTS = 'fonts-v1';
const SHELL = `${BASE}index.html`;
const PRECACHED = new Set(PRECACHE_URLS);
const OWN_CACHES = [PRECACHE, RUNTIME, FONTS];

self.addEventListener('install', (event) => {
  // Not skipWaiting(): an updated worker waits until the page asks for it (message below). The very first install has nothing to wait for.
  event.waitUntil(caches.open(PRECACHE).then((cache) => cache.addAll(PRECACHE_URLS.map((url) => new Request(url, { cache: 'reload' })))));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Old app shells and old runtime caches go; the fonts cache and caches that are not ours stay.
    const names = await caches.keys();
    await Promise.all(names
      .filter((name) => (name.startsWith('app-shell-') || name.startsWith('runtime-')) && !OWN_CACHES.includes(name))
      .map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

// A page address that is one of the app's routes: no file extension, and not Firebase Hosting's reserved /__/ paths.
const isAppRoute = (url) => !url.pathname.startsWith('/__/') && !/\.[a-z0-9]+$/i.test(url.pathname);
const cacheable = (response) => response && (response.ok || response.type === 'opaque');

async function shell() {
  const cached = await caches.match(SHELL, { cacheName: PRECACHE });
  if (cached) return cached;
  // The shell is missing (the install did not finish): try the network, then say so plainly.
  try {
    return await fetch(SHELL);
  } catch {
    return new Response(
      '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline</title>'
      + '<body style="font:16px system-ui,sans-serif;margin:2rem"><h1>You’re offline</h1><p>This app has not finished loading yet. Connect to the internet and open it once; after that it works offline.</p>',
      { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    );
  }
}

async function precached(request) {
  return (await caches.match(request, { cacheName: PRECACHE })) || fetch(request);
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (cacheable(response)) await cache.put(request, response.clone());
  return response;
}

async function staleWhileRevalidate(event, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(event.request);
  const refresh = fetch(event.request).then(async (response) => {
    if (cacheable(response)) await cache.put(event.request, response.clone());
    return response;
  });
  if (hit) {
    event.waitUntil(refresh.catch(() => {}));   // update in the background; a failure (offline) is fine
    return hit;
  }
  return refresh;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (url.origin === self.location.origin) {
    if (request.mode === 'navigate') {
      if (isAppRoute(url)) event.respondWith(shell());
      return;
    }
    if (PRECACHED.has(url.pathname)) {
      event.respondWith(precached(request));
      return;
    }
    // Built files that were not precached (lazily loaded ones such as the PDF reader): keep them once used.
    if (url.pathname.startsWith(`${BASE}assets/`)) event.respondWith(cacheFirst(request, RUNTIME));
    return;
  }

  if (url.hostname === 'fonts.googleapis.com') event.respondWith(staleWhileRevalidate(event, FONTS));
  else if (url.hostname === 'fonts.gstatic.com') event.respondWith(cacheFirst(request, FONTS));
  // Everything else (Firebase, place search, map tiles, other sites) is left alone: the browser fetches it as usual.
});

self.addEventListener('notificationclick', (event) => {
  const targetPath = event.notification?.data?.url || '/widget';
  if (event.notification?.tag !== 'cadence-live-schedule') {
    event.notification?.close();
  }
  const targetUrl = new URL(targetPath.replace(/^\//, ''), new URL(BASE, self.location.origin)).href;

  event.waitUntil((async () => {
    const windowClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windowClients) {
      if (client.url.startsWith(self.location.origin) && 'focus' in client) {
        if ('navigate' in client) await client.navigate(targetUrl);
        return client.focus();
      }
    }
    if (self.clients.openWindow) {
      return self.clients.openWindow(targetUrl);
    }
    return undefined;
  })());
});