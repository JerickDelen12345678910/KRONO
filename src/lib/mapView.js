// src/lib/mapView.js
// Phase 10 PACE 1 — pure logic of the Map screen (no React, no network, no storage): reading search results, matching
// them with saved places, what the map shows, and the texts. pages/MapPage.jsx only renders what this returns;
// scripts/check-map-view.mjs tests it. The network call itself is in src/lib/placeSearch.js.
//
// Selection keys (one string says what is selected): 'r:<providerId>' a search result, 's:<destination id>' a saved place.
import { createDestination } from '../models/destination.js';

export const QUERY_MIN = 3;
export const QUERY_MAX = 120;
/** The Philippines, [[south, west], [north, east]]: the map opens on it ("Search places in the Philippines"). */
export const PH_BOUNDS = Object.freeze([[4.5, 116.9], [21.2, 126.7]]);
/** A search result this close to a saved place of the same name is the same place. */
export const SAME_PLACE_METERS = 50;
const PLACE_ZOOM = 16;

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

/** Where the map should move for these places: one place = centre on it, several = fit them all, none = null. */
export function focusFor(places) {
  const points = places.map(coordsOf).filter(Boolean);
  if (points.length === 0) return null;
  if (points.length === 1) return { ...points[0], zoom: PLACE_ZOOM };
  return { bounds: boundsOf(points) };
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