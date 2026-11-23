// scripts/check-pwa.mjs — Phase 12: the install / update store (src/lib/pwa.js), the build functions of vite.pwa.js and the service
// worker itself (src/pwa/sw.js, run inside a Node `vm` with a fake cache storage and fake network). Plain Node, no browser, no Vite.
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import vm from 'node:vm';
import { createPwaStore, isIos } from '../src/lib/pwa.js';
import { DEFAULT_LAZY, buildServiceWorker, normalizeBase, pwaLite, selectPrecache } from '../vite.pwa.js';

let count = 0;
const failures = [];
const check = (name, ok) => { count += 1; if (!ok) failures.push(name); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ================= the store (src/lib/pwa.js) =================
class FakeWorker extends EventTarget {
  constructor(state = 'installing') { super(); this.state = state; this.messages = []; }
  postMessage(message) { this.messages.push(message); }
  setState(state) { this.state = state; this.dispatchEvent(new Event('statechange')); }
}
class FakeRegistration extends EventTarget {
  constructor() { super(); this.installing = null; this.waiting = null; this.active = null; this.updates = 0; this.failUpdate = false; }
  update() { this.updates += 1; return this.failUpdate ? Promise.reject(new Error('offline')) : Promise.resolve(); }
}
class FakeContainer extends EventTarget {
  constructor() { super(); this.controller = null; this.registered = []; this.reg = new FakeRegistration(); this.failRegister = false; }
  async register(url) { this.registered.push(url); if (this.failRegister) throw new Error('blocked'); return this.reg; }
}
function makeEnv({ standalone = false, userAgent = 'Mozilla/5.0 (Windows NT 10.0) Chrome/120', platform = 'Win32', maxTouchPoints = 0, withSw = true, iosStandalone } = {}) {
  const container = new FakeContainer();
  const win = new EventTarget();
  win.navigator = { userAgent, platform, maxTouchPoints, standalone: iosStandalone, serviceWorker: withSw ? container : undefined };
  win.matchMedia = () => ({ matches: standalone });
  win.document = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  win.setInterval = (fn, ms) => globalThis.setInterval(fn, ms);
  win.clearInterval = (id) => globalThis.clearInterval(id);
  const reloads = { n: 0 };
  const store = createPwaStore({ win, reload: () => { reloads.n += 1; }, updateEveryMs: 20 });
  return { win, container, store, reloads, reg: container.reg };
}
const installEvent = (outcome = 'accepted') => {
  const e = new Event('beforeinstallprompt', { cancelable: true });
  e.prompted = 0;
  e.prompt = async () => { e.prompted += 1; };
  e.userChoice = Promise.resolve({ outcome });
  return e;
};

check('isIos: iPhone, iPad, iPod', isIos({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)' }) && isIos({ userAgent: 'iPad' }) && isIos({ userAgent: 'iPod touch' }));
check('isIos: iPadOS that says MacIntel has a touch screen, a Mac does not', isIos({ platform: 'MacIntel', maxTouchPoints: 5 }) && !isIos({ platform: 'MacIntel', maxTouchPoints: 0 }));
check('isIos: Android, Windows and nothing', !isIos({ userAgent: 'Mozilla/5.0 (Linux; Android 14)' }) && !isIos({ userAgent: 'Windows' }) && !isIos());

{
  const { store } = makeEnv();
  const s0 = store.getState();
  check('store: starts with nothing true', Object.values(s0).every((v) => v === false));
  let calls = 0;
  const off = store.subscribe(() => { calls += 1; });
  store.dismissUpdate(); store.dismissUpdate();
  check('store: a change tells listeners once, a repeat of the same change tells nobody', calls === 1 && store.getState().updateDismissed === true);
  check('store: the snapshot object is replaced on change and stable otherwise', store.getState() !== s0 && store.getState() === store.getState());
  off(); store.dismissUpdate();
  check('store: unsubscribe works', calls === 1);
}
{
  const { win, store } = makeEnv();
  store.attach();
  const ev = installEvent();
  win.dispatchEvent(ev);
  check('install: the browser event is kept and its own banner prevented', ev.defaultPrevented && store.getState().canInstall === true);
  check('install: no iOS hint where the install button works', store.getState().iosHint === false);
  const outcome = await store.promptInstall();
  check('install: the dialog is shown and an accept is reported', outcome === 'accepted' && ev.prompted === 1 && store.getState().installed === true && store.getState().canInstall === false);
  check('install: a prompt cannot be used twice', (await store.promptInstall()) === 'unavailable' && ev.prompted === 1);
}
{
  const { win, store } = makeEnv();
  store.attach();
  win.dispatchEvent(installEvent('dismissed'));
  check('install: dismissing the dialog is reported and the button goes away', (await store.promptInstall()) === 'dismissed' && store.getState().installed === false && store.getState().canInstall === false);
}
{
  const { win, store } = makeEnv();
  store.attach();
  const ev = installEvent();
  ev.prompt = async () => { throw new Error('not allowed'); };
  win.dispatchEvent(ev);
  check('install: a failing prompt is "dismissed", never an exception', (await store.promptInstall()) === 'dismissed');
}
{
  const { win, store } = makeEnv();
  store.attach();
  win.dispatchEvent(installEvent());
  win.dispatchEvent(new Event('appinstalled'));
  check('install: after "appinstalled" the app is installed and cannot be installed again', store.getState().installed === true && store.getState().canInstall === false);
}
{
  const { store } = makeEnv({ standalone: true });
  store.attach();
  check('install: opened as an installed app (standalone window)', store.getState().installed === true && store.getState().canInstall === false);
  check('install: iOS home-screen app (navigator.standalone) counts as installed too', (() => { const e = makeEnv({ iosStandalone: true }); e.store.attach(); return e.store.getState().installed; })());
}
{
  const e = makeEnv({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' });
  e.store.attach();
  check('iOS: browser tab shows the hint, no install button', e.store.getState().iosHint === true && e.store.getState().canInstall === false);
  const standalone = makeEnv({ userAgent: 'iPhone', iosStandalone: true });
  standalone.store.attach();
  check('iOS: once added to the home screen the hint is gone', standalone.store.getState().iosHint === false);
}
{
  const { win, store } = makeEnv();
  store.attach(); store.destroy();
  win.dispatchEvent(installEvent());
  check('destroy: stops listening', store.getState().canInstall === false);
}

// registration and updates
{
  const e = makeEnv({ withSw: false });
  check('register: a browser without service workers is fine', (await e.store.register('/sw.js')) === null && e.store.getState().offlineReady === false);
}
{
  const e = makeEnv();
  e.container.failRegister = true;
  check('register: a refused registration never throws', (await e.store.register('/sw.js')) === null);
}
{
  const e = makeEnv();
  const installing = new FakeWorker('installing');
  e.reg.installing = installing;
  await e.store.register('/app/sw.js');
  check('register: the URL it was given', same(e.container.registered, ['/app/sw.js']));
  installing.setState('installed');
  check('first visit: installed is not an update (no page controlled yet)', e.store.getState().updateReady === false && e.store.getState().offlineReady === false);
  installing.setState('activated');
  check('first visit: once active the app is ready for offline', e.store.getState().offlineReady === true && e.store.getState().updateReady === false);
  e.container.dispatchEvent(new Event('controllerchange'));
  check('first visit: taking control of the page does NOT reload it', e.reloads.n === 0);
  e.store.destroy();
}
{
  const e = makeEnv();
  e.container.controller = new FakeWorker('activated');
  e.reg.active = e.container.controller;
  await e.store.register('/sw.js');
  check('next visit: already active = ready for offline', e.store.getState().offlineReady === true && e.store.getState().updateReady === false);
  const next = new FakeWorker('installing');
  e.reg.installing = next;
  e.reg.dispatchEvent(new Event('updatefound'));
  next.setState('installed');
  check('update: a new version installed while the old one controls the page = update ready', e.store.getState().updateReady === true);
  check('update: applyUpdate without a waiting worker does nothing', e.store.applyUpdate() === false && e.reloads.n === 0);
  e.reg.waiting = next;
  check('update: applyUpdate asks the waiting worker to take over', e.store.applyUpdate() === true && same(next.messages, [{ type: 'SKIP_WAITING' }]));
  check('update: the page does not reload until the new worker has taken over', e.reloads.n === 0);
  e.container.dispatchEvent(new Event('controllerchange'));
  check('update: it reloads exactly once when it has', e.reloads.n === 1);
  e.container.dispatchEvent(new Event('controllerchange'));
  check('update: a later controller change does not reload again', e.reloads.n === 1);
  e.store.destroy();
}
{
  const e = makeEnv();
  e.container.controller = new FakeWorker('activated');
  e.reg.active = e.container.controller;
  e.reg.waiting = new FakeWorker('installed');
  await e.store.register('/sw.js');
  check('update: one that was already waiting when the app opened is offered', e.store.getState().updateReady === true);
  e.store.dismissUpdate();
  check('update: "Later" hides it', e.store.getState().updateDismissed === true);
  const again = new FakeWorker('installing');
  e.reg.installing = again;
  e.reg.dispatchEvent(new Event('updatefound'));
  again.setState('installed');
  check('update: an even newer version brings the message back', e.store.getState().updateDismissed === false && e.store.getState().updateReady === true);
  e.store.destroy();
}
{
  const e = makeEnv();
  await e.store.register('/sw.js');
  await e.store.checkForUpdate();
  check('checkForUpdate: asks the browser', e.reg.updates === 1);
  e.reg.failUpdate = true;
  await e.store.checkForUpdate();
  check('checkForUpdate: offline is not an error', e.reg.updates === 2);
  e.reg.failUpdate = false;
  e.win.document.dispatchEvent(new Event('visibilitychange'));
  check('checkForUpdate: also when the app comes back to the front', e.reg.updates === 3);
  e.win.document.visibilityState = 'hidden';
  e.win.document.dispatchEvent(new Event('visibilitychange'));
  check('checkForUpdate: not while it is hidden', e.reg.updates === 3);
  await new Promise((resolve) => { setTimeout(resolve, 70); });
  check('checkForUpdate: and on a timer', e.reg.updates > 3);
  e.store.destroy();
  const after = e.reg.updates;
  await new Promise((resolve) => { setTimeout(resolve, 60); });
  check('destroy: stops the timer', e.reg.updates === after);
  check('checkForUpdate: before registering is harmless', (await makeEnv().store.checkForUpdate()) === undefined);
}

// ================= the build functions (vite.pwa.js) =================
const template = readFileSync(new URL('../src/pwa/sw.js', import.meta.url), 'utf8');
check('normalizeBase', normalizeBase('/') === '/' && normalizeBase('/app') === '/app/' && normalizeBase('/app/') === '/app/' && normalizeBase('./') === '/' && normalizeBase('') === '/' && normalizeBase(undefined) === '/' && normalizeBase('https://x.test/') === '/');
check('selectPrecache: drops source maps, the worker itself and lazy files, sorts, de-duplicates', same(
  selectPrecache(['index.html', 'assets/b.js', 'assets/a.js', 'assets/a.js.map', 'sw.js', 'assets/pdf.worker.min-ab12.mjs', 'assets/tesseract-core.wasm', '.DS_Store', 'assets/a.js', '']),
  ['assets/a.js', 'assets/b.js', 'index.html']));
check('selectPrecache: custom lazy patterns (text or regex)', same(selectPrecache(['a.js', 'big.bin', 'c.js'], { lazy: ['big'] }), ['a.js', 'c.js']) && same(selectPrecache(['a.js', 'big.bin'], { lazy: [/\.bin$/] }), ['a.js']));
check('DEFAULT_LAZY covers the PDF worker and Tesseract', DEFAULT_LAZY.some((p) => p.test('assets/pdf.worker.min-x.mjs')) && DEFAULT_LAZY.some((p) => p.test('assets/tesseract-core-simd.wasm')));
const entries = [
  { fileName: 'index.html', content: '<html>1</html>' }, { fileName: 'assets/index-abc.js', content: 'js1' }, { fileName: 'assets/index-abc.css', content: 'css1' },
  { fileName: 'manifest.webmanifest', content: Buffer.from('{}') }, { fileName: 'pwa/icon-192.png', content: new Uint8Array([1, 2, 3]) },
  { fileName: 'assets/index-abc.js.map', content: 'map' }, { fileName: 'assets/pdf.worker.min-9.mjs', content: 'big' },
];
const built = buildServiceWorker({ template, base: '/', entries });
check('build: URLs are the shell files with the base path', same(built.urls, ['/assets/index-abc.css', '/assets/index-abc.js', '/index.html', '/manifest.webmanifest', '/pwa/icon-192.png']));
check('build: the result is valid JavaScript and has no placeholder left', (() => { try { new vm.Script(built.source); return !built.source.includes('/*VERSION*/') && !built.source.includes('/*BASE*/') && !built.source.includes('/*PRECACHE_URLS*/'); } catch { return false; } })());
check('build: the version is in the worker and looks like a short hash', /^[0-9a-f]{12}$/.test(built.version) && built.source.includes(`"${built.version}"`));
check('build: the same files in another order give the same worker', buildServiceWorker({ template, base: '/', entries: [...entries].reverse() }).source === built.source);
check('build: changing a file changes the version', buildServiceWorker({ template, base: '/', entries: entries.map((e) => (e.fileName === 'assets/index-abc.js' ? { ...e, content: 'js2' } : e)) }).version !== built.version);
check('build: a changed icon (same name) changes the version too', buildServiceWorker({ template, base: '/', entries: entries.map((e) => (e.fileName === 'pwa/icon-192.png' ? { ...e, content: new Uint8Array([9]) } : e)) }).version !== built.version);
check('build: a new file changes the version', buildServiceWorker({ template, base: '/', entries: [...entries, { fileName: 'assets/new.js', content: 'n' }] }).version !== built.version);
check('build: a changed lazy or map file does NOT (they are not in the shell)', buildServiceWorker({ template, base: '/', entries: entries.map((e) => (e.fileName.endsWith('.map') || e.fileName.includes('pdf.worker') ? { ...e, content: 'other' } : e)) }).version === built.version);
check('build: a sub-folder base', (() => { const b = buildServiceWorker({ template, base: '/app', entries }); return b.urls[0] === '/app/assets/index-abc.css' && b.source.includes('"/app/"'); })());
check('build: a template without a placeholder is refused', (() => { try { buildServiceWorker({ template: template.replace("/*VERSION*/ 'dev'", "'dev'"), entries }); return false; } catch (e) { return /placeholder/.test(e.message); } })());
check('build: a template with a placeholder twice is refused', (() => { try { buildServiceWorker({ template: `${template}\n// ${"/*BASE*/ '/'"}`, entries }); return false; } catch (e) { return /exactly once/.test(e.message); } })());
check('build: file names with "$" are not mangled by String.replace', (() => { const b = buildServiceWorker({ template, entries: [{ fileName: "assets/a$&b.js", content: 'x' }] }); return b.source.includes('a$&b.js'); })());

// the plugin hook, with a fake Rollup context and a real temporary public/ folder
{
  const dir = mkdtempSync(join(tmpdir(), 'pwa-check-'));
  mkdirSync(join(dir, 'public', 'pwa'), { recursive: true });
  writeFileSync(join(dir, 'public', 'manifest.webmanifest'), '{"name":"x"}');
  writeFileSync(join(dir, 'public', 'pwa', 'icon.svg'), '<svg/>');
  writeFileSync(join(dir, 'public', 'sw.js'), '// must never be precached');
  const plugin = pwaLite();
  plugin.configResolved({ base: '/', publicDir: join(dir, 'public') });
  const emitted = [];
  plugin.generateBundle.call({ emitFile: (f) => emitted.push(f) }, {}, {
    'index.html': { type: 'asset', fileName: 'index.html', source: '<html/>' },
    'assets/index-1.js': { type: 'chunk', fileName: 'assets/index-1.js', code: 'console.log(1)' },
    'assets/index-1.js.map': { type: 'asset', fileName: 'assets/index-1.js.map', source: '{}' },
  });
  check('plugin: emits exactly one asset named sw.js', emitted.length === 1 && emitted[0].type === 'asset' && emitted[0].fileName === 'sw.js');
  const out = emitted[0].source;
  check('plugin: precaches built files and the files of public/', ['"/index.html"', '"/assets/index-1.js"', '"/manifest.webmanifest"', '"/pwa/icon.svg"'].every((u) => out.includes(u)));
  check('plugin: no source maps and no public/sw.js in the list', !out.includes('.js.map"') && !out.includes('"/sw.js"'));
  check('plugin: only runs in builds', plugin.apply === 'build' && plugin.name === 'pwa-lite');
  const bare = pwaLite();
  bare.configResolved({ base: '/', publicDir: join(dir, 'nope') });
  const none = [];
  bare.generateBundle.call({ emitFile: (f) => none.push(f) }, {}, { 'index.html': { type: 'asset', fileName: 'index.html', source: '<html/>' } });
  check('plugin: a missing public/ folder is fine', none.length === 1 && none[0].source.includes('"/index.html"'));
  const off = pwaLite();
  off.configResolved({ base: '/', publicDir: false });
  const nopub = [];
  off.generateBundle.call({ emitFile: (f) => nopub.push(f) }, {}, { 'index.html': { type: 'asset', fileName: 'index.html', source: '<html/>' } });
  check('plugin: publicDir turned off is fine', nopub.length === 1);
  rmSync(dir, { recursive: true, force: true });
}

// ================= the service worker (src/pwa/sw.js in a vm) =================
const ORIGIN = 'https://app.test';
// Like in a browser, a relative address is resolved against the page's origin (Node's own Request refuses a relative address).
class ScopedRequest extends Request {
  constructor(input, init) { super(typeof input === 'string' ? new URL(input, ORIGIN).href : input, init); }
}
class FakeCache {
  constructor(fetcher) { this.map = new Map(); this.fetcher = fetcher; }
  keyOf(request) { return new URL(typeof request === 'string' ? request : request.url, ORIGIN).href; }
  async put(request, response) { this.map.set(this.keyOf(request), response); }
  async match(request) { const hit = this.map.get(this.keyOf(request)); return hit ? hit.clone() : undefined; }
  async addAll(requests) {   // like the real one: ONE bad answer rejects the whole call and nothing is saved
    const answers = await Promise.all(requests.map(async (request) => {
      const response = await this.fetcher(request);
      if (!response.ok) throw new TypeError(`addAll: bad response ${response.status}`);
      return [request, response];
    }));
    for (const [request, response] of answers) await this.put(request, response);
  }
}
class FakeCacheStorage {
  constructor(fetcher) { this.caches = new Map(); this.fetcher = fetcher; }
  async open(name) { if (!this.caches.has(name)) this.caches.set(name, new FakeCache(this.fetcher)); return this.caches.get(name); }
  async keys() { return [...this.caches.keys()]; }
  async delete(name) { return this.caches.delete(name); }
  async match(request, { cacheName } = {}) {
    for (const name of cacheName ? [cacheName] : [...this.caches.keys()]) {
      const hit = await this.caches.get(name)?.match(request);
      if (hit) return hit;
    }
    return undefined;
  }
}

/** A worker built from the real template for the given shell files, running in a vm with a fake network (`net.online`, `net.calls`, `net.routes[pathname]`, `net.byHost(url)`). */
function makeWorker(files, { routes = {}, byHost = null } = {}) {
  const net = { online: true, calls: [], byHost, routes: {} };
  for (const f of files) net.routes[`/${f}`] = () => new Response(f === 'index.html' ? 'SHELL' : f, { status: 200 });
  Object.assign(net.routes, routes);
  const fetcher = async (input) => {
    const request = typeof input === 'string' ? new Request(new URL(input, ORIGIN)) : input;
    net.calls.push(request.url);
    if (!net.online) throw new TypeError('Failed to fetch');
    const url = new URL(request.url);
    if (url.origin !== ORIGIN) return net.byHost ? net.byHost(url) : new Response('other', { status: 200 });
    const route = net.routes[url.pathname];
    return route ? route(request) : new Response('not found', { status: 404 });
  };
  const storage = new FakeCacheStorage(fetcher);
  const handlers = {};
  const state = { skipped: 0, claimed: 0 };
  const self = {
    location: { origin: ORIGIN }, registration: {},
    addEventListener: (type, fn) => { handlers[type] = fn; },
    skipWaiting: () => { state.skipped += 1; },
    clients: { claim: async () => { state.claimed += 1; } },
  };
  const source = buildServiceWorker({ template, base: '/', entries: files.map((fileName) => ({ fileName, content: fileName })) }).source;
  vm.runInNewContext(source, { self, caches: storage, fetch: fetcher, Request: ScopedRequest, Response, URL, Set, Promise });
  const lifecycle = async (type, data) => {
    const waits = [];
    handlers[type]({ waitUntil: (p) => waits.push(p), data });
    await Promise.all(waits);
  };
  /** Sends a request through the worker: { handled, response }. A handled request whose network fails REJECTS, like in a browser. */
  const send = async (url, { method = 'GET', mode = 'cors' } = {}) => {
    const request = new Request(new URL(url, ORIGIN), { method });
    Object.defineProperty(request, 'mode', { value: mode });
    const event = { request, waits: [], respondWith(p) { this.response = Promise.resolve(p); }, waitUntil(p) { this.waits.push(p); } };
    handlers.fetch(event);
    const response = event.response ? await event.response : undefined;
    await Promise.all(event.waits);
    return { handled: Boolean(event.response), response };
  };
  return { net, storage, state, lifecycle, send };
}
const SHELL_FILES = ['index.html', 'assets/index-abc.js', 'assets/index-abc.css', 'manifest.webmanifest'];
const body = async (r) => (r ? r.text() : undefined);
const rejects = async (promise) => { try { await promise; return false; } catch { return true; } };

{
  const w = makeWorker(SHELL_FILES);
  await w.lifecycle('install');
  const names = await w.storage.keys();
  check('sw install: one app-shell cache named after the version', names.length === 1 && names[0].startsWith('app-shell-'));
  check('sw install: every shell file is saved', (await Promise.all(SHELL_FILES.map((f) => w.storage.match(`/${f}`)))).every(Boolean));
  check('sw install: it asked the network once per file', w.net.calls.length === SHELL_FILES.length);
  check('sw install: does not take over by itself (an update waits for the person)', w.state.skipped === 0);
}
{
  const w = makeWorker(SHELL_FILES, { routes: { '/assets/index-abc.css': () => new Response('x', { status: 404 }) } });
  check('sw install: one missing file fails the whole install (never a half-saved app)', await rejects(w.lifecycle('install')) && (await w.storage.match('/index.html')) === undefined);
}
{
  const w = makeWorker(SHELL_FILES);
  await w.lifecycle('install');
  const current = (await w.storage.keys())[0];
  for (const name of ['app-shell-old', 'runtime-old', 'fonts-v1', 'someone-elses-cache']) await w.storage.open(name);
  await w.lifecycle('activate');
  const names = await w.storage.keys();
  check('sw activate: old app shells and old runtime caches are removed', !names.includes('app-shell-old') && !names.includes('runtime-old'));
  check('sw activate: the fonts cache and caches that are not ours stay', names.includes('fonts-v1') && names.includes('someone-elses-cache'));
  check('sw activate: the current shell stays and the open page is taken over', names.includes(current) && w.state.claimed === 1);
}
{
  const w = makeWorker(SHELL_FILES);
  await w.lifecycle('install');
  w.net.online = false;
  w.net.calls.length = 0;
  const route = await w.send('/scheduler', { mode: 'navigate' });
  check('sw navigate: an app route gets the saved shell, offline too, without touching the network', route.handled && (await body(route.response)) === 'SHELL' && w.net.calls.length === 0);
  check('sw navigate: the home page', (await body((await w.send('/', { mode: 'navigate' })).response)) === 'SHELL');
  check('sw navigate: a deep route with a query string', (await body((await w.send('/fitness/session/abc?x=1', { mode: 'navigate' })).response)) === 'SHELL');
  check('sw navigate: Firebase Hosting /__/ paths (the sign-in handler) are left alone', !(await w.send('/__/auth/handler?apiKey=1', { mode: 'navigate' })).handled);
  check('sw navigate: a file address (a PDF, an image) is left alone', !(await w.send('/report.pdf', { mode: 'navigate' })).handled);
  const asset = await w.send('/assets/index-abc.js');
  check('sw precached file: served from the cache with no network', asset.handled && (await body(asset.response)) === 'assets/index-abc.js' && w.net.calls.length === 0);
}
{
  const w = makeWorker(SHELL_FILES);   // never installed: the shell is not saved
  w.net.online = false;
  const offline = await w.send('/scheduler', { mode: 'navigate' });
  check('sw navigate: shell not saved and no network gives a plain "offline" page, not a browser error', offline.handled && offline.response.status === 503 && (await body(offline.response)).includes('offline'));
  w.net.online = true;
  check('sw navigate: shell not saved but online falls back to the network', (await body((await w.send('/scheduler', { mode: 'navigate' })).response)) === 'SHELL');
}
{
  const w = makeWorker(SHELL_FILES, { routes: { '/assets/pdf.worker.min-9.mjs': () => new Response('PDFWORKER'), '/assets/gone.js': () => new Response('x', { status: 404 }) } });
  await w.lifecycle('install');
  const first = await w.send('/assets/pdf.worker.min-9.mjs');
  check('sw lazy file: the first use comes from the network', first.handled && (await body(first.response)) === 'PDFWORKER');
  w.net.online = false;
  check('sw lazy file: after that it works offline', (await body((await w.send('/assets/pdf.worker.min-9.mjs')).response)) === 'PDFWORKER');
  w.net.online = true;
  const gone = await w.send('/assets/gone.js');
  const runtime = await w.storage.open((await w.storage.keys()).find((n) => n.startsWith('runtime-')));
  check('sw lazy file: a 404 is passed on, never saved', gone.response.status === 404 && (await runtime.match('/assets/gone.js')) === undefined);
  w.net.online = false;
  check('sw lazy file: never used and offline is an ordinary network error', await rejects(w.send('/assets/never-seen.js')));
}
{
  const w = makeWorker(['index.html'], { byHost: (url) => new Response(url.hostname === 'fonts.googleapis.com' ? w.css : url.hostname === 'fonts.gstatic.com' ? 'FONTFILE' : 'other') });
  w.css = 'v1';
  await w.lifecycle('install');
  const sheet = 'https://fonts.googleapis.com/css2?family=Manrope';
  check('sw fonts: the first stylesheet request comes from the network', (await body((await w.send(sheet)).response)) === 'v1');
  w.css = 'v2';
  check('sw fonts: the saved stylesheet is returned at once ...', (await body((await w.send(sheet)).response)) === 'v1');
  check('sw fonts: ... and it was refreshed in the background for next time', (await body((await w.send(sheet)).response)) === 'v2');
  w.net.online = false;
  check('sw fonts: offline the saved stylesheet still answers', (await body((await w.send(sheet)).response)) === 'v2');
  check('sw fonts: and a refresh that fails offline is not an error', !(await rejects(w.send(sheet))));
  w.net.online = true;
  await w.send('https://fonts.gstatic.com/s/manrope/v1/a.woff2');
  w.net.online = false;
  check('sw fonts: a font file is saved on first use and works offline', (await body((await w.send('https://fonts.gstatic.com/s/manrope/v1/a.woff2')).response)) === 'FONTFILE');
  w.net.online = true;
  for (const url of [
    'https://firestore.googleapis.com/google.firestore.v1.Firestore/Listen', 'https://identitytoolkit.googleapis.com/v1/accounts:lookup',
    'https://securetoken.googleapis.com/v1/token', 'https://nominatim.openstreetmap.org/search?q=x', 'https://tile.openstreetmap.org/5/1/2.png',
    'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/worker.min.js', 'https://example.com/anything',
  ]) check(`sw never touches ${new URL(url).hostname}`, !(await w.send(url)).handled);
}
{
  const w = makeWorker(SHELL_FILES);
  await w.lifecycle('install');
  check('sw: POST requests are never handled', !(await w.send('/assets/index-abc.js', { method: 'POST' })).handled && !(await w.send('/scheduler', { method: 'POST', mode: 'navigate' })).handled);
  check('sw: same-origin requests that are not part of the app are left alone (an API, other files)', !(await w.send('/api/thing')).handled && !(await w.send('/pwa/other.png')).handled);
  await w.lifecycle('message', { type: 'SKIP_WAITING' });
  check('sw message: SKIP_WAITING makes a waiting version take over', w.state.skipped === 1);
  await w.lifecycle('message', { type: 'SOMETHING_ELSE' });
  await w.lifecycle('message', undefined);
  check('sw message: other messages are ignored', w.state.skipped === 1);
}
{
  const v1 = makeWorker(SHELL_FILES);
  const v2 = makeWorker([...SHELL_FILES, 'assets/new-chunk.js']);
  await v1.lifecycle('install');
  await v2.lifecycle('install');
  check('sw versions: different builds use different cache names (old and new coexist until activation)', (await v1.storage.keys())[0] !== (await v2.storage.keys())[0]);
}

if (failures.length > 0) {
  console.error(`Phase 12 PWA: ${failures.length} of ${count} checks FAILED:`);
  failures.forEach((f) => console.error(`  ✗ ${f}`));
  process.exit(1);
}
console.log(`Phase 12 PWA OK (${count} checks)`);