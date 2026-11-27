// src/lib/routeSearch.js
// Phase 10 PACE 2 — routing call on the public FOSSGIS OpenStreetMap routing servers (routing.openstreetmap.de, free,
// no API key). Supports driving (routed-car), walking (routed-foot), cycling (routed-bike), and flight (great-circle air corridor),
// returning the primary route plus up to 2 alternatives with [latitude, longitude] geometry for Leaflet.
// `fetchImpl` is injectable so scripts/check-routes.mjs can run without a network.
import { TRAVEL_MODES } from '../models/constants.js';
import { coordsOf, distanceMeters } from './mapView.js';

export const MAX_ROUTES = 3;   // 1 primary + up to 2 alternatives
const CACHE_SIZE = 20;
const cache = new Map();

const PROFILE = Object.freeze({
  driving: { service: 'routed-car', path: 'driving' },
  walking: { service: 'routed-foot', path: 'foot' },
  cycling: { service: 'routed-bike', path: 'bike' },
});

export class RouteSearchError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'RouteSearchError';
    this.code = code;   // 'invalid' | 'busy' | 'no_route' | 'unavailable' | 'timeout' | 'network'
  }
}

export const normalizeMode = (mode) => (mode === 'flight' || TRAVEL_MODES.includes(mode) ? mode : 'driving');

/** Builds a curved great-circle air corridor and estimated flight time for Plane mode. */
function buildFlightRoutes(from, to) {
  const straightMeters = Math.round(distanceMeters(from, to));
  const points = [];
  const steps = 48;
  const arcOffset = Math.min(2.5, (straightMeters / 1000) * 0.0012);
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const lat = from.latitude + (to.latitude - from.latitude) * t + Math.sin(Math.PI * t) * arcOffset;
    const lon = from.longitude + (to.longitude - from.longitude) * t;
    points.push([lat, lon]);
  }
  // Commercial airliner ~780 km/h + 25 min takeoff/landing taxi buffer
  const airSeconds = Math.round((straightMeters / 1000 / 780) * 3600 + 25 * 60);
  return [{
    id: 'flight-0',
    index: 0,
    mode: 'flight',
    distanceMeters: straightMeters,
    durationSeconds: Math.max(1800, airSeconds),
    summary: 'Direct air corridor (est. flight + taxi)',
    points,
  }];
}

/** Builds the FOSSGIS OSRM route URL (coordinates are ordered longitude,latitude per OSRM spec). */
export function routeUrl({ origin, destination, mode = 'driving' }) {
  const from = coordsOf(origin);
  const to = coordsOf(destination);
  if (!from || !to) throw new RouteSearchError('Choose both a start point and a destination.', 'invalid');
  const m = normalizeMode(mode);
  if (m === 'flight') return '';
  const { service, path } = PROFILE[m];
  const coords = `${from.longitude},${from.latitude};${to.longitude},${to.latitude}`;
  const params = new URLSearchParams({
    overview: 'full',
    geometries: 'geojson',
    alternatives: 'true',
  });
  return `https://routing.openstreetmap.de/${service}/route/v1/${path}/${coords}?${params}`;
}

export const clearRouteCache = () => cache.clear();

function remember(key, routes) {
  cache.set(key, routes);
  if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value);
}

/**
 * Parses an OSRM JSON response into [{ id, index, mode, distanceMeters, durationSeconds, summary, points }].
 * Converts GeoJSON [longitude, latitude] coordinates into Leaflet [latitude, longitude] pairs and caps at MAX_ROUTES.
 */
export function parseRouteResponse(json, mode = 'driving') {
  if (!json || json.code !== 'Ok' || !Array.isArray(json.routes)) return [];
  const m = normalizeMode(mode);
  return json.routes
    .slice(0, MAX_ROUTES)
    .map((r, index) => {
      const rawCoords = Array.isArray(r?.geometry?.coordinates) ? r.geometry.coordinates : [];
      const points = rawCoords
        .filter((pair) => Array.isArray(pair) && pair.length >= 2 && Number.isFinite(pair[0]) && Number.isFinite(pair[1]))
        .map(([lon, lat]) => [lat, lon]);
      const distanceMeters = Math.max(0, Math.round(Number(r?.distance) || 0));
      const durationSeconds = Math.max(0, Math.round(Number(r?.duration) || 0));
      const legSummary = Array.isArray(r?.legs)
        ? r.legs.map((l) => String(l?.summary ?? '').trim()).filter(Boolean).join(' · ')
        : '';
      return {
        id: `${m}-${index}`,
        index,
        mode: m,
        distanceMeters,
        durationSeconds,
        summary: legSummary || (index === 0 ? 'Recommended route' : `Alternative ${index}`),
        points,
      };
    })
    .filter((r) => r.points.length >= 2);
}

/**
 * Fetches routes between `origin` and `destination` for `mode` ('driving' | 'walking' | 'cycling' | 'flight').
 * Resolves to a non-empty array of routes (up to MAX_ROUTES) or rejects with RouteSearchError / AbortError.
 */
export async function fetchRoutes({ origin, destination, mode = 'driving' }, { fetchImpl = globalThis.fetch, signal, timeoutMs = 12000 } = {}) {
  const from = coordsOf(origin);
  const to = coordsOf(destination);
  if (!from || !to) throw new RouteSearchError('Choose both a start point and a destination.', 'invalid');
  const m = normalizeMode(mode);
  if (m === 'flight') {
    return buildFlightRoutes(from, to);
  }
  const cacheKey = `${m}:${from.latitude.toFixed(5)},${from.longitude.toFixed(5)}->${to.latitude.toFixed(5)},${to.longitude.toFixed(5)}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  const forwardAbort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener('abort', forwardAbort, { once: true });

  try {
    const res = await fetchImpl(routeUrl({ origin: from, destination: to, mode: m }), {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      throw res.status === 429
        ? new RouteSearchError('Routing is busy. Wait a moment and try again.', 'busy')
        : new RouteSearchError('Routing is unavailable right now. Try again later.', 'unavailable');
    }
    let body;
    try {
      body = await res.json();
    } catch {
      throw new RouteSearchError('Routing is unavailable right now. Try again later.', 'unavailable');
    }
    if (body?.code === 'NoRoute' || body?.code === 'NoSegment') {
      throw new RouteSearchError('No route found between those two places for this travel mode.', 'no_route');
    }
    const routes = parseRouteResponse(body, m);
    if (routes.length === 0) {
      throw new RouteSearchError('No route found between those two places for this travel mode.', 'no_route');
    }
    remember(cacheKey, routes);
    return routes;
  } catch (err) {
    if (err instanceof RouteSearchError) throw err;
    if (timedOut) throw new RouteSearchError('Finding a route took too long. Try again.', 'timeout');
    if (err?.name === 'AbortError') throw err;
    throw new RouteSearchError('Couldn’t reach the routing service. Check your connection.', 'network');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', forwardAbort);
  }
}