// src/lib/placeSearch.js
// Phase 10 PACE 1 — the one network call of the Map screen: place search on OpenStreetMap Nominatim (free, no key).
// Rules of the Nominatim usage policy that this file keeps: Philippines only, a small result limit, one request at a time
// (the screen searches on submit, never while typing), identical searches are answered from a small cache.
// `fetchImpl` is injectable so scripts/check-map-view.mjs can run it without a network.
import { normalizeQuery, parseSearchResults } from './mapView.js';

export const SEARCH_URL = 'https://nominatim.openstreetmap.org/search';
export const RESULT_LIMIT = 8;
const CACHE_SIZE = 20;
const cache = new Map();   // normalized lower-case query -> results

export class PlaceSearchError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'PlaceSearchError';
    this.code = code;   // 'busy' | 'unavailable' | 'network' | 'timeout'
  }
}

export function searchUrl(query) {
  const params = new URLSearchParams({
    q: normalizeQuery(query), format: 'jsonv2', countrycodes: 'ph', limit: String(RESULT_LIMIT), 'accept-language': 'en', dedupe: '1',
  });
  return `${SEARCH_URL}?${params}`;
}

export const clearSearchCache = () => cache.clear();

function remember(key, places) {
  cache.set(key, places);
  if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value);
}

/**
 * Search places in the Philippines. Resolves to [{ key, providerId, name, address, latitude, longitude }] (maybe empty).
 * Rejects with a PlaceSearchError (its message is fit to show) or, when `signal` aborts, with the AbortError.
 */
export async function searchPlaces(query, { fetchImpl = globalThis.fetch, signal, timeoutMs = 10000 } = {}) {
  const q = normalizeQuery(query);
  const cacheKey = q.toLowerCase();
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  const forwardAbort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener('abort', forwardAbort, { once: true });

  try {
    const res = await fetchImpl(searchUrl(q), { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) {
      throw res.status === 429
        ? new PlaceSearchError('Search is busy. Wait a moment and try again.', 'busy')
        : new PlaceSearchError('Search is unavailable right now. Try again later.', 'unavailable');
    }
    let body;
    try { body = await res.json(); } catch { throw new PlaceSearchError('Search is unavailable right now. Try again later.', 'unavailable'); }
    const places = parseSearchResults(body);
    remember(cacheKey, places);
    return places;
  } catch (err) {
    if (err instanceof PlaceSearchError) throw err;
    if (timedOut) throw new PlaceSearchError('The search took too long. Try again.', 'timeout');
    if (err?.name === 'AbortError') throw err;
    throw new PlaceSearchError('Couldn’t reach the search service. Check your connection.', 'network');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', forwardAbort);
  }
}