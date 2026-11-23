// vite.pwa.js — Phase 12: writes dist/sw.js at build time. A small plugin of our own instead of vite-plugin-pwa (no extra dependency,
// and nothing here depends on a particular Vite version: it only uses the standard Rollup `generateBundle` hook).
//
// It reads src/pwa/sw.js, fills its three placeholders (the version, the base path and the list of files to precache) and emits it
// as `sw.js`. The list = every built file + every file of public/ (the manifest and the icons), except source maps, the worker itself
// and the files named in `lazy`. Lazy files (the PDF reader and the OCR engine are big and used rarely) are NOT downloaded on
// install; the worker keeps them the first time they are used instead.
// The pure functions are exported so scripts/check-pwa.mjs can test them without running Vite.
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

export const DEFAULT_LAZY = Object.freeze([/pdf[._-]?worker/i, /tesseract/i]);
const PLACEHOLDERS = Object.freeze({
  version: "/*VERSION*/ 'dev'",
  base: "/*BASE*/ '/'",
  urls: '/*PRECACHE_URLS*/ []',
});

/** '/' stays '/', '/app' becomes '/app/'. Anything that is not an absolute path (e.g. './', used by native builds) becomes '/'. */
export function normalizeBase(base) {
  if (typeof base !== 'string' || !base.startsWith('/')) return '/';
  return base.endsWith('/') ? base : `${base}/`;
}

const matches = (name, patterns) => patterns.some((p) => (p instanceof RegExp ? p.test(name) : name.includes(p)));

/** Which of the built / public files (relative posix paths) go into the install-time cache. */
export function selectPrecache(fileNames, { lazy = DEFAULT_LAZY } = {}) {
  return [...new Set(fileNames)]
    .filter((name) => name && !name.endsWith('.map') && name !== 'sw.js' && !name.endsWith('.DS_Store') && !matches(name, lazy))
    .sort();
}

const hashOf = (content) => createHash('sha1').update(content).digest('hex');

/**
 * Fills the template. `entries` = [{ fileName, content }] for EVERY file that goes into the build (content = string or Uint8Array),
 * so the version changes when any file changes. Returns { source, version, urls }.
 */
export function buildServiceWorker({ template, base = '/', entries, lazy = DEFAULT_LAZY }) {
  const root = normalizeBase(base);
  const wanted = new Set(selectPrecache(entries.map((e) => e.fileName), { lazy }));
  const used = entries.filter((e) => wanted.has(e.fileName)).sort((a, b) => a.fileName.localeCompare(b.fileName));
  const urls = used.map((e) => `${root}${e.fileName}`);
  const version = hashOf(used.map((e) => `${e.fileName}:${hashOf(e.content ?? '')}`).join('\n')).slice(0, 12);
  let source = template;
  for (const [key, text] of Object.entries(PLACEHOLDERS)) {
    if (source.split(text).length !== 2) throw new Error(`sw.js template must contain the placeholder ${text} exactly once (${key}).`);
  }
  source = source
    .replace(PLACEHOLDERS.version, () => JSON.stringify(version))
    .replace(PLACEHOLDERS.base, () => JSON.stringify(root))
    .replace(PLACEHOLDERS.urls, () => JSON.stringify(urls, null, 2));
  return { source, version, urls };
}

function walk(dir, root = dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full, root) : [relative(root, full).split(sep).join('/')];
  });
}

/** The Vite plugin. Options: `lazy` (patterns of files not to precache), `template` (path of the worker source, for tests). */
export function pwaLite({ lazy = DEFAULT_LAZY, template = new URL('./src/pwa/sw.js', import.meta.url) } = {}) {
  let config;
  return {
    name: 'pwa-lite',
    apply: 'build',
    configResolved(resolved) { config = resolved; },
    generateBundle(_options, bundle) {
      const entries = Object.values(bundle).map((item) => ({ fileName: item.fileName, content: item.type === 'chunk' ? item.code : item.source }));
      // public/ is copied by Vite itself (when, depends on the version), so read it from disk instead of the bundle.
      const publicDir = config?.publicDir;
      if (publicDir && existsSync(publicDir)) {
        for (const name of walk(publicDir)) entries.push({ fileName: name, content: readFileSync(join(publicDir, name)) });
      }
      const { source } = buildServiceWorker({ template: readFileSync(template, 'utf8'), base: config?.base, entries, lazy });
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}