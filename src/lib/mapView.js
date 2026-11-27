// src/lib/mapView.js
// Phase 10 PACE 1 + 2 + 3 — pure logic of the Map screen and travel schedule integration (no React, no network,
// no storage): reading search results, matching them with saved places, what the map shows, route formatting,
// "Leave at" times, Google Maps handoff URLs, travel schedule details, and screen texts.
//
// Selection / point keys: 'me' = current device location, 'r:<providerId>' = search result, 's:<destination id>' = saved place.
import { createDestination } from '../models/destination.js';

export const QUERY_MIN = 3;
export const QUERY_MAX = 120;
/** The Philippines, [[south, west], [north, east]]: the map opens on it ("Search places in the Philippines"). */
export const PH_BOUNDS = Object.freeze([[4.5, 116.9], [21.2, 126.7]]);
/** A search result this close to a saved place of the same name is the same place. */
export const SAME_PLACE_METERS = 50;
const PLACE_ZOOM = 16;

export const TRAVEL_MODE_OPTIONS = Object.freeze([
  { value: 'driving', label: 'Driving' },
  { value: 'walking', label: 'Walking' },
  { value: 'cycling', label: 'Cycling' },
  { value: 'flight', label: 'Plane' },
]);

// ---- the query ----
export const normalizeQuery = (q) => String(q ?? '').replace(/\s+/g, ' ').trim().slice(0, QUERY_MAX);
export const isSearchable = (q) => normalizeQuery(q).length >= QUERY_MIN;

// ---- coordinates ----
const toNumber = (v) => {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};

/** { latitude, longitude } of a place, or null. Accepts latitude/longitude, lat/lng and lat/lon, as numbers or numeric text. */
export function coordsOf(place) {
  const latitude = toNumber(place?.latitude ?? place?.lat);
  const longitude = toNumber(place?.longitude ?? place?.lng ?? place?.lon);
  const valid = latitude != null && longitude != null && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180;
  return valid ? { latitude, longitude } : null;
}

/** Straight-line distance in metres between two { latitude, longitude } points (haversine). */
export function distanceMeters(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLng = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** [[south, west], [north, east]] around the given places that have coordinates, or null. */
export function boundsOf(places) {
  const points = places.map(coordsOf).filter(Boolean);
  if (points.length === 0) return null;
  const lats = points.map((p) => p.latitude);
  const lngs = points.map((p) => p.longitude);
  return [[Math.min(...lats), Math.min(...lngs)], [Math.max(...lats), Math.max(...lngs)]];
}

/** [[south, west], [north, east]] around [latitude, longitude] polyline points, or null. */
export function boundsOfPoints(points) {
  const valid = (points ?? []).filter((p) => Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]));
  if (valid.length === 0) return null;
  const lats = valid.map((p) => p[0]);
  const lngs = valid.map((p) => p[1]);
  return [[Math.min(...lats), Math.min(...lngs)], [Math.max(...lats), Math.max(...lngs)]];
}

/** Where the map should move for these places: one place = centre on it, several = fit them all, none = null. */
export function focusFor(places) {
  const points = places.map(coordsOf).filter(Boolean);
  if (points.length === 0) return null;
  if (points.length === 1) return { ...points[0], zoom: PLACE_ZOOM };
  return { bounds: boundsOf(points) };
}

/** Where the map should move to frame a route polyline, or null when empty. */
export function focusForRoute(route) {
  const bounds = boundsOfPoints(route?.points);
  return bounds ? { bounds } : null;
}

// ---- search results ----
/**
 * OpenStreetMap Nominatim `jsonv2` answer -> [{ key, providerId, name, address, latitude, longitude }].
 * Results without usable coordinates or an id are dropped, duplicates are merged. The address is Nominatim's
 * `display_name` without the leading name and without the country.
 */
export function parseSearchResults(json) {
  if (!Array.isArray(json)) return [];
  const seen = new Set();
  const places = [];
  for (const r of json) {
    const coords = coordsOf({ lat: r?.lat, lon: r?.lon });
    const providerId = r?.osm_type && r?.osm_id != null ? `osm:${r.osm_type}:${r.osm_id}` : r?.place_id != null ? `osm:place:${r.place_id}` : null;
    if (!coords || !providerId || seen.has(providerId)) continue;
    seen.add(providerId);
    const parts = String(r.display_name ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    const given = String(r.name ?? '').trim();
    const name = given || parts[0] || 'Place';
    if (parts[0] === name) parts.shift();
    if (parts[parts.length - 1] === 'Philippines') parts.pop();
    places.push({ key: providerId, providerId, name, address: parts.join(', '), ...coords });
  }
  return places;
}

// ---- saved places ----
const sameName = (a, b) => String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase() && String(a ?? '').trim() !== '';

/** The saved place that is the same as `place` (same provider id, or same name within SAME_PLACE_METERS), or null. */
export function matchSaved(saved, place) {
  const here = coordsOf(place);
  return saved.find((d) => {
    if (place.providerId && d.providerId === place.providerId) return true;
    const there = coordsOf(d);
    return Boolean(here && there && sameName(d.name, place.name) && distanceMeters(here, there) <= SAME_PLACE_METERS);
  }) ?? null;
}

/** The record PlaceService.save stores for a place the user saves. */
export function newDestination(place) {
  const coords = coordsOf(place);
  return createDestination({
    name: String(place.name ?? '').trim(),
    address: place.address ?? '',
    latitude: coords?.latitude ?? null,
    longitude: coords?.longitude ?? null,
    providerId: place.providerId ?? null,
    isFavorite: true,
  });
}

const fromSaved = (d) => ({
  key: `s:${d.id}`, kind: 'saved', savedId: d.id, providerId: d.providerId ?? null,
  name: d.name || 'Saved place', address: d.address ?? '', ...(coordsOf(d) ?? { latitude: null, longitude: null }),
});

/** What a selection key points at, as one shape for the detail card and the map: { key, kind: 'result'|'saved', savedId, name, address, latitude, longitude, providerId } or null. */
export function resolveSelection({ key, results = [], saved = [] }) {
  if (typeof key !== 'string') return null;
  if (key.startsWith('s:')) {
    const d = saved.find((x) => x.id === key.slice(2));
    return d ? fromSaved(d) : null;
  }
  if (key.startsWith('r:')) {
    const r = results.find((x) => x.key === key.slice(2));
    if (!r) return null;
    const match = matchSaved(saved, r);
    if (match) return fromSaved(match);
    return { key, kind: 'result', savedId: null, providerId: r.providerId, name: r.name, address: r.address, latitude: r.latitude, longitude: r.longitude };
  }
  return null;
}

// ---- what the map shows ----
/**
 * Pins: search results (a result that is already saved shows only as the saved pin), saved places, and the user's own
 * position when they asked for it. `selected` marks the one chosen in a list or on the map.
 */
export function markersFor({ results = [], saved = [], selectedKey = null, me = null }) {
  const markers = [];
  for (const r of results) {
    if (matchSaved(saved, r)) continue;
    markers.push({ id: `r:${r.key}`, kind: 'result', label: r.name, latitude: r.latitude, longitude: r.longitude });
  }
  for (const d of saved) {
    const coords = coordsOf(d);
    if (coords) markers.push({ id: `s:${d.id}`, kind: 'saved', label: d.name || 'Saved place', ...coords });
  }
  const mine = coordsOf(me);
  if (mine) markers.push({ id: 'me', kind: 'me', label: 'Your location', ...mine });
  return markers.map((m) => ({ ...m, selected: m.id === selectedKey }));
}

// ---- list rows and texts ----
/** A search result row. Saved status is a word, not only a colour. */
export function resultRow(place, saved = []) {
  const isSaved = Boolean(matchSaved(saved, place));
  return { key: place.key, title: place.name, subtitle: [place.address, isSaved ? 'Saved' : null].filter(Boolean).join(' · ') };
}

export const savedRow = (d) => ({ id: d.id, key: `s:${d.id}`, title: d.name || 'Saved place', subtitle: d.address || 'No address' });

export const removeMessage = (name) => `Remove “${name || 'this place'}” from your saved places? You can save it again from a search.`;

/** GeolocationPositionError.code -> text (0 = the device has no location support). */
export function geoErrorMessage(code) {
  if (code === 1) return 'Location permission was denied. You can still search for a place.';
  if (code === 2) return 'Your location isn’t available right now. Try again, or search for a place.';
  if (code === 3) return 'Finding your location took too long. Try again.';
  return 'This device can’t share its location here. Search for a place instead.';
}

// ---- routing (Phase 10 PACE 2) ----
/** Formats distance in metres: "850 m" under 1 km, "1.4 km" under 10 km, "18 km" at 10 km+. */
export function formatDistance(meters) {
  const m = Math.max(0, Math.round(Number(meters) || 0));
  if (m < 1000) return `${m} m`;
  const km = m / 1000;
  return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`;
}

/** Formats travel duration in seconds: "1 min" minimum, "24 min", "1 hr 15 min", "2 hr". */
export function formatRouteDuration(seconds) {
  const totalMin = Math.max(1, Math.round((Number(seconds) || 0) / 60));
  if (totalMin < 60) return `${totalMin} min`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
}

function formatMinutes12h(totalMinutes) {
  const wrapped = ((totalMinutes % 1440) + 1440) % 1440;
  const h24 = Math.floor(wrapped / 60);
  const mins = wrapped % 60;
  const h12 = h24 % 12 || 12;
  const suffix = h24 < 12 ? 'AM' : 'PM';
  return `${h12}:${String(mins).padStart(2, '0')} ${suffix}`;
}

export function parseHhMm(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm ?? '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h >= 0 && h <= 23 && min >= 0 && min <= 59 ? h * 60 + min : null;
}

/**
 * Computes the "Leave at" text for a route duration:
 * - When `arriveBy` ('HH:mm') is given: `{ leaveText: 'Leave at 7:36 AM', detailText: 'To arrive by 8:00 AM' }`.
 * - Otherwise: `{ leaveText: 'Leave now', detailText: 'Arrive around 3:06 PM' }` based on `nowDate`.
 */
export function computeLeaveAt({ durationSeconds, arriveBy = '', nowDate = new Date() }) {
  const mins = Math.max(1, Math.round((Number(durationSeconds) || 0) / 60));
  const target = parseHhMm(arriveBy);
  if (target != null) {
    return {
      leaveText: `Leave at ${formatMinutes12h(target - mins)}`,
      detailText: `To arrive by ${formatMinutes12h(target)}`,
    };
  }
  const base = nowDate instanceof Date && !Number.isNaN(nowDate.getTime()) ? nowDate : new Date();
  const nowMins = base.getHours() * 60 + base.getMinutes();
  return {
    leaveText: 'Leave now',
    detailText: `Arrive around ${formatMinutes12h(nowMins + mins)}`,
  };
}

const GMAPS_MODE = Object.freeze({ driving: 'driving', walking: 'walking', cycling: 'bicycling', flight: 'transit' });

/** Universal Google Maps directions link (plain URL, no API key). */
export function googleMapsUrl({ origin = null, destination, mode = 'driving' }) {
  const to = coordsOf(destination);
  if (!to) return '';
  const params = new URLSearchParams({
    api: '1',
    destination: `${to.latitude},${to.longitude}`,
    travelmode: GMAPS_MODE[mode] ?? 'driving',
  });
  const from = coordsOf(origin);
  if (from) params.set('origin', `${from.latitude},${from.longitude}`);
  return `https://www.google.com/maps/dir/?${params}`;
}

/**
 * Builds selectable place options for Start / Destination pickers:
 * - Start includes "My location" (always selectable; triggers geolocation if not yet located)
 * - Saved places with coordinates
 * - Search results not already in saved places
 */
export function buildPlaceOptions({ me = null, saved = [], results = [], includeMyLocation = false }) {
  const options = [];
  if (includeMyLocation) {
    options.push({ key: 'me', label: coordsOf(me) ? 'My location (current)' : 'My location' });
  }
  for (const d of saved) {
    if (coordsOf(d)) options.push({ key: `s:${d.id}`, label: `${d.name || 'Saved place'} (Saved)` });
  }
  for (const r of results) {
    if (matchSaved(saved, r)) continue;
    options.push({ key: `r:${r.key}`, label: r.name });
  }
  return options;
}

/** Resolves a point key ('me' | 's:...' | 'r:...') into `{ key, name, latitude, longitude }`, or null. */
export function resolvePointKey({ key, me = null, saved = [], results = [] }) {
  if (typeof key !== 'string' || !key) return null;
  if (key === 'me') {
    const coords = coordsOf(me);
    return coords ? { key: 'me', name: 'My location', ...coords } : null;
  }
  const sel = resolveSelection({ key, results, saved });
  if (!sel || sel.latitude == null || sel.longitude == null) return null;
  return { key: sel.key, name: sel.name, latitude: sel.latitude, longitude: sel.longitude };
}

/** Formats one route alternative row for the Route card. */
export function routeOptionView(route, index, { selected = false, arriveBy = '', nowDate = new Date() } = {}) {
  const timing = computeLeaveAt({ durationSeconds: route.durationSeconds, arriveBy, nowDate });
  return {
    id: route.id,
    label: index === 0 ? 'Fastest' : `Alternative ${index}`,
    summary: route.summary || (index === 0 ? 'Recommended route' : `Alternative ${index}`),
    durationText: formatRouteDuration(route.durationSeconds),
    distanceText: formatDistance(route.distanceMeters),
    leaveText: timing.leaveText,
    detailText: timing.detailText,
    selected: Boolean(selected),
  };
}

// ---- travel schedule integration (Phase 10 PACE 3) ----
/** Builds the `/map` deep link for a saved destination and optional `arriveBy` ('HH:mm') time. */
export function mapRouteLink({ destinationId = null, arriveBy = '' } = {}) {
  if (!destinationId) return '/map';
  const params = new URLSearchParams({ dest: destinationId });
  if (parseHhMm(arriveBy) != null) params.set('arrive', String(arriveBy).trim());
  return `/map?${params}`;
}

/** Formats the destination and "Leave at" summary shown on a Travel schedule detail card in Scheduler. */
export function travelScheduleView({ schedule, destination = null, routeEstimate = null }) {
  if (!schedule) return null;
  const hasTravel = schedule.category === 'Travel' || Boolean(destination) || Boolean(schedule.destinationId);
  if (!hasTravel) return null;
  const destName = destination?.name || schedule.location || '';
  const mapHref = mapRouteLink({ destinationId: destination?.id ?? null, arriveBy: schedule.startTime });
  if (destination && routeEstimate && Number.isFinite(routeEstimate.durationSeconds)) {
    const timing = computeLeaveAt({ durationSeconds: routeEstimate.durationSeconds, arriveBy: schedule.startTime });
    return {
      destinationName: destName,
      leaveText: timing.leaveText,
      subtitle: `${formatRouteDuration(routeEstimate.durationSeconds)} · ${formatDistance(routeEstimate.distanceMeters)} · ${timing.detailText}`,
      mapHref,
    };
  }
  return {
    destinationName: destName,
    leaveText: null,
    subtitle: destination
      ? 'Open route on Map to see travel time and Leave at'
      : 'Link a saved place in Edit schedule for route timing',
    mapHref,
  };
}