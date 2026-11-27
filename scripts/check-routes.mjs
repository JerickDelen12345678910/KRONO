// scripts/check-routes.mjs — Phase 10 PACE 2: pure route parsing, FOSSGIS OSRM client (src/lib/routeSearch.js),
// and route view helpers (src/lib/mapView.js). Runs in plain Node via `npm run check`.
import assert from 'node:assert/strict';
import {
  MAX_ROUTES, RouteSearchError, clearRouteCache, fetchRoutes, normalizeMode, parseRouteResponse, routeUrl,
} from '../src/lib/routeSearch.js';
import {
  TRAVEL_MODE_OPTIONS, boundsOfPoints, buildPlaceOptions, computeLeaveAt, focusForRoute, formatDistance, formatRouteDuration,
  googleMapsUrl, resolvePointKey, routeOptionView,
} from '../src/lib/mapView.js';

let n = 0;
const eq = (a, b, m) => { assert.equal(a, b, m); n += 1; };
const deepEq = (a, b, m) => { assert.deepEqual(a, b, m); n += 1; };
const ok = (c, m) => { assert.ok(c, m); n += 1; };

const calapan = { latitude: 13.4117, longitude: 121.1803 };
const naujan = { latitude: 13.3236, longitude: 121.3028 };

// ================= FOSSGIS URL & mode =================
eq(normalizeMode('walking'), 'walking', 'keeps valid mode');
eq(normalizeMode('teleport'), 'driving', 'unknown mode falls back to driving');
const carUrl = routeUrl({ origin: calapan, destination: naujan, mode: 'driving' });
ok(carUrl.startsWith('https://routing.openstreetmap.de/routed-car/route/v1/driving/121.1803,13.4117;121.3028,13.3236?'), 'driving URL orders lon,lat and targets routed-car');
ok(carUrl.includes('alternatives=true') && carUrl.includes('geometries=geojson'), 'requests GeoJSON alternatives');
ok(routeUrl({ origin: calapan, destination: naujan, mode: 'walking' }).includes('/routed-foot/route/v1/foot/'), 'walking uses routed-foot');
ok(routeUrl({ origin: calapan, destination: naujan, mode: 'cycling' }).includes('/routed-bike/route/v1/bike/'), 'cycling uses routed-bike');
assert.throws(() => routeUrl({ origin: null, destination: naujan }), (e) => e instanceof RouteSearchError && e.code === 'invalid', 'missing origin throws RouteSearchError');
n += 1;

// ================= OSRM response parsing =================
const sampleOsrm = {
  code: 'Ok',
  routes: [
    {
      distance: 18420.4, duration: 1510.2,
      legs: [{ summary: 'Calapan South Rd' }],
      geometry: { coordinates: [[121.1803, 13.4117], [121.24, 13.37], [121.3028, 13.3236]] },
    },
    {
      distance: 21100, duration: 1860,
      legs: [{ summary: 'Nautical Hwy' }],
      geometry: { coordinates: [[121.1803, 13.4117], [121.3028, 13.3236]] },
    },
    {
      distance: 23000, duration: 2100,
      legs: [{ summary: '' }],
      geometry: { coordinates: [[121.1803, 13.4117], [121.3028, 13.3236]] },
    },
    {
      distance: 25000, duration: 2400,
      legs: [{ summary: 'Extra fourth route' }],
      geometry: { coordinates: [[121.1803, 13.4117], [121.3028, 13.3236]] },
    },
  ],
};
const parsed = parseRouteResponse(sampleOsrm, 'driving');
eq(parsed.length, MAX_ROUTES, 'caps routes at MAX_ROUTES (1 primary + up to 2 alternatives)');
deepEq(parsed[0].points, [[13.4117, 121.1803], [13.37, 121.24], [13.3236, 121.3028]], 'flips GeoJSON [lon, lat] to Leaflet [lat, lon]');
eq(parsed[0].distanceMeters, 18420, 'rounds distance');
eq(parsed[0].durationSeconds, 1510, 'rounds duration');
eq(parsed[0].summary, 'Calapan South Rd', 'extracts leg summary');
eq(parsed[2].summary, 'Alternative 2', 'falls back to Alternative N when summary is blank');
deepEq(parseRouteResponse({ code: 'NoRoute', routes: [] }), [], 'non-Ok code returns empty');

// ================= fetchRoutes (caching & errors) =================
clearRouteCache();
let calls = 0;
const mockFetch = async () => {
  calls += 1;
  return { ok: true, status: 200, json: async () => sampleOsrm };
};
const r1 = await fetchRoutes({ origin: calapan, destination: naujan, mode: 'driving' }, { fetchImpl: mockFetch });
const r2 = await fetchRoutes({ origin: calapan, destination: naujan, mode: 'driving' }, { fetchImpl: mockFetch });
eq(calls, 1, 'identical route query is served from cache');
ok(r1.length === 3 && r2.length === 3, 'cached result preserved');

await assert.rejects(
  () => fetchRoutes({ origin: calapan, destination: naujan, mode: 'walking' }, {
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ code: 'NoRoute', routes: [] }) }),
  }),
  (e) => e instanceof RouteSearchError && e.code === 'no_route',
  'NoRoute maps to RouteSearchError(no_route)',
);
n += 1;

await assert.rejects(
  () => fetchRoutes({ origin: calapan, destination: naujan, mode: 'cycling' }, {
    fetchImpl: async () => ({ ok: false, status: 429, json: async () => ({}) }),
  }),
  (e) => e instanceof RouteSearchError && e.code === 'busy',
  'HTTP 429 maps to RouteSearchError(busy)',
);
n += 1;

// ================= distance, duration, Leave at, Google Maps URL =================
eq(formatDistance(450), '450 m', 'sub-km in metres');
eq(formatDistance(1460), '1.5 km', '1–10 km with one decimal');
eq(formatDistance(18420), '18 km', '10+ km rounded to whole km');

eq(formatRouteDuration(20), '1 min', 'minimum 1 min');
eq(formatRouteDuration(25 * 60), '25 min', 'under 1 hour');
eq(formatRouteDuration(75 * 60), '1 hr 15 min', 'hours and minutes');
eq(formatRouteDuration(120 * 60), '2 hr', 'exact hours');

const nowFixed = new Date(2026, 10, 23, 14, 30, 0);   // 2:30 PM
deepEq(computeLeaveAt({ durationSeconds: 25 * 60, arriveBy: '', nowDate: nowFixed }), {
  leaveText: 'Leave now',
  detailText: 'Arrive around 2:55 PM',
}, 'no arrive-by time -> Leave now + arrival estimate');
deepEq(computeLeaveAt({ durationSeconds: 25 * 60, arriveBy: '08:00', nowDate: nowFixed }), {
  leaveText: 'Leave at 7:35 AM',
  detailText: 'To arrive by 8:00 AM',
}, 'arrive-by time -> exact Leave at time');
deepEq(computeLeaveAt({ durationSeconds: 30 * 60, arriveBy: '00:10', nowDate: nowFixed }), {
  leaveText: 'Leave at 11:40 PM',
  detailText: 'To arrive by 12:10 AM',
}, 'wraps cleanly across midnight');

const gUrl = googleMapsUrl({ origin: calapan, destination: naujan, mode: 'cycling' });
ok(gUrl.startsWith('https://www.google.com/maps/dir/?'), 'uses universal Google Maps directions URL');
ok(gUrl.includes('origin=13.4117%2C121.1803') && gUrl.includes('destination=13.3236%2C121.3028') && gUrl.includes('travelmode=bicycling'), 'includes origin, destination, and bicycling mode');
ok(!googleMapsUrl({ destination: naujan }).includes('origin='), 'omits origin when not provided');

// ================= point options, bounds & routeOptionView =================
const savedList = [{ id: 'd1', name: 'Campus', latitude: 13.41, longitude: 121.18, providerId: 'osm:way:1' }];
const resultList = [
  { key: 'osm:way:1', providerId: 'osm:way:1', name: 'Campus', latitude: 13.41, longitude: 121.18 },
  { key: 'osm:node:2', providerId: 'osm:node:2', name: 'Pier', latitude: 13.43, longitude: 121.19 },
];
const startOpts = buildPlaceOptions({ me: calapan, saved: savedList, results: resultList, includeMyLocation: true });
deepEq(startOpts.map((o) => o.key), ['me', 's:d1', 'r:osm:node:2'], 'deduplicates saved result and includes My location for start');
deepEq(resolvePointKey({ key: 'me', me: calapan }), { key: 'me', name: 'My location', latitude: 13.4117, longitude: 121.1803 }, 'resolves me');
eq(resolvePointKey({ key: 'me', me: null }), null, 'me without coordinates resolves to null');
eq(resolvePointKey({ key: 's:d1', saved: savedList })?.name, 'Campus', 'resolves saved place');

deepEq(boundsOfPoints(parsed[0].points), [[13.3236, 121.1803], [13.4117, 121.3028]], 'boundsOfPoints computes SW/NE corners');
deepEq(focusForRoute(parsed[0]), { bounds: [[13.3236, 121.1803], [13.4117, 121.3028]] }, 'focusForRoute wraps bounds');

deepEq(TRAVEL_MODE_OPTIONS.map((o) => o.value), ['driving', 'walking', 'cycling'], 'travel mode chips match constants');
const card = routeOptionView(parsed[0], 0, { selected: true, arriveBy: '08:00', nowDate: nowFixed });
deepEq(card, {
  id: 'driving-0', label: 'Fastest', summary: 'Calapan South Rd', durationText: '25 min', distanceText: '18 km',
  leaveText: 'Leave at 7:35 AM', detailText: 'To arrive by 8:00 AM', selected: true,
}, 'formats route option view');

console.log(`Phase 10 PACE 2 routes OK (${n} checks)`);