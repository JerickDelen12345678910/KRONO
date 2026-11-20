// scripts/check-map-view.mjs — Phase 10 PACE 1: the destination model (src/models/destination.js), the pure Map logic
// (src/lib/mapView.js) and the place-search client (src/lib/placeSearch.js, run against a fake `fetch`: no network).
import { createDestination, validateDestination } from '../src/models/destination.js';
import {
  PH_BOUNDS, QUERY_MIN, SAME_PLACE_METERS, boundsOf, coordsOf, distanceMeters, focusFor, geoErrorMessage, isSearchable, markersFor,
  matchSaved, newDestination, normalizeQuery, parseSearchResults, removeMessage, resolveSelection, resultRow, savedRow,
} from '../src/lib/mapView.js';
import { PlaceSearchError, RESULT_LIMIT, SEARCH_URL, clearSearchCache, searchPlaces, searchUrl } from '../src/lib/placeSearch.js';

let count = 0;
const failures = [];
const check = (name, ok) => { count += 1; if (!ok) failures.push(name); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

// ---- destination model ----
const blank = createDestination();
check('createDestination: base fields', typeof blank.id === 'string' && blank.version === 1 && blank.deleted === false && blank.syncStatus === 'local');
check('createDestination: defaults', blank.name === '' && blank.address === '' && blank.latitude === null && blank.longitude === null && blank.isFavorite === false && blank.providerId === null);
check('createDestination: overrides win', createDestination({ name: 'Home', isFavorite: true }).name === 'Home' && createDestination({ isFavorite: true }).isFavorite);
check('validateDestination: name required', !validateDestination(createDestination({ name: '  ' })).valid && Boolean(validateDestination(createDestination({ name: '' })).errors.name));
check('validateDestination: a place without coordinates is fine', validateDestination(createDestination({ name: 'Home' })).valid);
check('validateDestination: valid coordinates', validateDestination(createDestination({ name: 'A', latitude: 14.6, longitude: 121 })).valid);
check('validateDestination: out of range', Boolean(validateDestination(createDestination({ name: 'A', latitude: 91, longitude: 121 })).errors.latitude) && Boolean(validateDestination(createDestination({ name: 'A', latitude: 10, longitude: 181 })).errors.longitude));
check('validateDestination: both or neither', !validateDestination(createDestination({ name: 'A', latitude: 14.6 })).valid && !validateDestination(createDestination({ name: 'A', latitude: '14.6', longitude: 121 })).valid);

// ---- query ----
check('normalizeQuery: trims and collapses spaces', normalizeQuery('  UP   Diliman \n') === 'UP Diliman');
check('normalizeQuery: null and numbers', normalizeQuery(null) === '' && normalizeQuery(12345) === '12345');
check('normalizeQuery: capped length', normalizeQuery('a'.repeat(500)).length === 120);
check('isSearchable: minimum length', !isSearchable('ab') && isSearchable('abc') && !isSearchable('  a  ') && QUERY_MIN === 3);

// ---- coordinates ----
check('coordsOf: latitude/longitude', same(coordsOf({ latitude: 14.5, longitude: 121 }), { latitude: 14.5, longitude: 121 }));
check('coordsOf: lat/lng and lat/lon', same(coordsOf({ lat: 1, lng: 2 }), { latitude: 1, longitude: 2 }) && same(coordsOf({ lat: 1, lon: 2 }), { latitude: 1, longitude: 2 }));
check('coordsOf: numeric text (Nominatim)', same(coordsOf({ lat: '14.6507', lon: '121.0494' }), { latitude: 14.6507, longitude: 121.0494 }));
check('coordsOf: invalid gives null', coordsOf(null) === null && coordsOf({}) === null && coordsOf({ latitude: 95, longitude: 0 }) === null && coordsOf({ latitude: 'x', longitude: 1 }) === null && coordsOf({ latitude: '', longitude: '' }) === null && coordsOf({ latitude: null, longitude: null }) === null);
check('coordsOf: zero is a valid coordinate', same(coordsOf({ latitude: 0, longitude: 0 }), { latitude: 0, longitude: 0 }));
const d1 = distanceMeters({ latitude: 14.5547, longitude: 121.0244 }, { latitude: 14.6760, longitude: 121.0437 });
check('distanceMeters: Makati to Quezon City is about 13.6 km', d1 > 13000 && d1 < 14200);
check('distanceMeters: same point is 0, symmetric', distanceMeters({ latitude: 1, longitude: 1 }, { latitude: 1, longitude: 1 }) === 0 && near(distanceMeters({ latitude: 1, longitude: 2 }, { latitude: 3, longitude: 4 }), distanceMeters({ latitude: 3, longitude: 4 }, { latitude: 1, longitude: 2 }), 1e-6));
check('boundsOf: around the points', same(boundsOf([{ latitude: 1, longitude: 5 }, { latitude: 3, longitude: 2 }, {}]), [[1, 2], [3, 5]]) && boundsOf([{}, null]) === null && boundsOf([]) === null);
check('focusFor: one place centres on it', same(focusFor([{ latitude: 14.6, longitude: 121 }]), { latitude: 14.6, longitude: 121, zoom: 16 }));
check('focusFor: several places fit them all', same(focusFor([{ latitude: 1, longitude: 1 }, { latitude: 2, longitude: 3 }]), { bounds: [[1, 1], [2, 3]] }));
check('focusFor: nothing to show', focusFor([]) === null && focusFor([{ name: 'no coords' }]) === null);
check('PH_BOUNDS is south-west then north-east', PH_BOUNDS[0][0] < PH_BOUNDS[1][0] && PH_BOUNDS[0][1] < PH_BOUNDS[1][1]);

// ---- parsing a Nominatim answer ----
const sample = [
  { place_id: 1, osm_type: 'node', osm_id: 456, lat: '14.6507', lon: '121.0494', category: 'amenity', type: 'university',
    name: 'University of the Philippines Diliman', display_name: 'University of the Philippines Diliman, Katipunan Avenue, Diliman, Quezon City, Metro Manila, 1101, Philippines' },
  { place_id: 2, osm_type: 'way', osm_id: 789, lat: '14.5547', lon: '121.0244', name: '', display_name: 'Ayala Triangle Gardens, Ayala Avenue, Makati, Metro Manila, Philippines' },
  { place_id: 3, osm_type: 'node', osm_id: 456, lat: '14.6507', lon: '121.0494', name: 'Duplicate of the first', display_name: 'Duplicate, X, Philippines' },
  { place_id: 4, osm_type: 'node', osm_id: 999, lat: 'oops', lon: '121', name: 'Bad coordinates', display_name: 'Bad, Philippines' },
  { place_id: 5, lat: '10.3', lon: '123.9', name: 'Cebu Taoist Temple', display_name: 'Cebu Taoist Temple, Beverly Hills, Cebu City, Cebu, Philippines' },
  { lat: '10', lon: '120', name: 'No id at all', display_name: 'No id' },
];
const parsed = parseSearchResults(sample);
check('parse: keeps good results in order, drops bad coordinates, missing ids and duplicates', same(parsed.map((p) => p.key), ['osm:node:456', 'osm:way:789', 'osm:place:5']));
check('parse: name, address without the name and the country', parsed[0].name === 'University of the Philippines Diliman' && parsed[0].address === 'Katipunan Avenue, Diliman, Quezon City, Metro Manila, 1101');
check('parse: coordinates become numbers', parsed[0].latitude === 14.6507 && parsed[0].longitude === 121.0494);
check('parse: an empty name falls back to the first part of the address', parsed[1].name === 'Ayala Triangle Gardens' && parsed[1].address === 'Ayala Avenue, Makati, Metro Manila');
check('parse: the id falls back to the place id', parsed[2].providerId === 'osm:place:5');
check('parse: a name that differs from the first part keeps the whole address', parseSearchResults([{ osm_type: 'node', osm_id: 1, lat: '1', lon: '2', name: 'Kuya’s', display_name: 'Different, Street, Philippines' }])[0].address === 'Different, Street');
check('parse: not an array', same(parseSearchResults(null), []) && same(parseSearchResults({ error: 'x' }), []) && same(parseSearchResults([]), []));

// ---- saved places ----
const home = createDestination({ id: 'd1', name: 'Home', address: 'Quezon City', latitude: 14.676, longitude: 121.0437, isFavorite: true });
const osmSaved = createDestination({ id: 'd2', name: 'UP Diliman', latitude: 14.6507, longitude: 121.0494, providerId: 'osm:node:456', isFavorite: true });
const saved = [home, osmSaved];
check('matchSaved: same provider id', matchSaved(saved, parsed[0])?.id === 'd2');
check('matchSaved: same name nearby, different id', matchSaved(saved, { name: ' home ', latitude: 14.67603, longitude: 121.04371, providerId: 'osm:node:1' })?.id === 'd1');
check('matchSaved: same name but far away is another place', matchSaved(saved, { name: 'Home', latitude: 10.3, longitude: 123.9 }) === null);
check('matchSaved: near but another name is another place', matchSaved(saved, { name: 'Neighbour', latitude: 14.676, longitude: 121.0437 }) === null);
check('matchSaved: a saved place without coordinates only matches by id', matchSaved([createDestination({ name: 'Home' })], { name: 'Home', latitude: 14.676, longitude: 121.0437 }) === null);
check('matchSaved: empty names never match each other', matchSaved([createDestination({ name: '', latitude: 1, longitude: 1 })], { name: '', latitude: 1, longitude: 1 }) === null);
check('matchSaved: nothing saved', matchSaved([], parsed[0]) === null && SAME_PLACE_METERS === 50);
const nd = newDestination(parsed[1]);
check('newDestination: a favourite with the place data', nd.isFavorite === true && nd.name === 'Ayala Triangle Gardens' && nd.address === 'Ayala Avenue, Makati, Metro Manila' && nd.providerId === 'osm:way:789' && nd.latitude === 14.5547 && nd.longitude === 121.0244);
check('newDestination: a full valid record', typeof nd.id === 'string' && nd.version === 1 && validateDestination(nd).valid);
check('newDestination: no coordinates stays valid', validateDestination(newDestination({ name: ' Mom’s house ' })).valid && newDestination({ name: ' Mom’s house ' }).name === 'Mom’s house' && newDestination({ name: 'x' }).latitude === null);

// ---- selection ----
const selResult = resolveSelection({ key: 'r:osm:way:789', results: parsed, saved });
check('resolveSelection: a result', selResult.kind === 'result' && selResult.savedId === null && selResult.name === 'Ayala Triangle Gardens' && selResult.key === 'r:osm:way:789');
const selMatched = resolveSelection({ key: 'r:osm:node:456', results: parsed, saved });
check('resolveSelection: a result that is already saved shows as the saved place', selMatched.kind === 'saved' && selMatched.savedId === 'd2' && selMatched.key === 's:d2');
const selSaved = resolveSelection({ key: 's:d1', results: [], saved });
check('resolveSelection: a saved place', selSaved.kind === 'saved' && selSaved.savedId === 'd1' && selSaved.address === 'Quezon City' && selSaved.latitude === 14.676);
check('resolveSelection: unknown key, wrong types', resolveSelection({ key: 's:nope', saved }) === null && resolveSelection({ key: 'r:nope', results: parsed }) === null && resolveSelection({ key: null }) === null && resolveSelection({ key: 'me' }) === null);
const noCoords = resolveSelection({ key: 's:d9', saved: [createDestination({ id: 'd9', name: 'Somewhere' })] });
check('resolveSelection: a saved place without coordinates still resolves', noCoords.latitude === null && noCoords.longitude === null && focusFor([noCoords]) === null);

// ---- markers ----
const markers = markersFor({ results: parsed, saved, selectedKey: 'r:osm:way:789', me: { latitude: 14.6, longitude: 121 } });
check('markers: results not saved + saved + me', same(markers.map((m) => m.id), ['r:osm:way:789', 'r:osm:place:5', 's:d1', 's:d2', 'me']));
check('markers: a result that is already saved appears only as the saved pin', !markers.some((m) => m.id === 'r:osm:node:456'));
check('markers: kinds', same(markers.map((m) => m.kind), ['result', 'result', 'saved', 'saved', 'me']));
check('markers: exactly the selected one is flagged', markers.filter((m) => m.selected).length === 1 && markers[0].selected);
check('markers: labels and coordinates', markers[2].label === 'Home' && markers[2].latitude === 14.676 && markers[4].label === 'Your location');
check('markers: a saved place without coordinates has no pin', markersFor({ saved: [createDestination({ id: 'x', name: 'No coords' })] }).length === 0);
check('markers: nothing at all', same(markersFor({}), []) && markersFor({ me: null }).length === 0 && markersFor({ me: { latitude: 'x' } }).length === 0);

// ---- rows and texts ----
check('resultRow: address, and Saved as a word', resultRow(parsed[1], saved).subtitle === 'Ayala Avenue, Makati, Metro Manila' && resultRow(parsed[0], saved).subtitle.endsWith(' · Saved') && resultRow(parsed[0], saved).title === 'University of the Philippines Diliman');
check('resultRow: Saved without an address', resultRow({ key: 'k', name: 'N', address: '', providerId: 'osm:node:456' }, saved).subtitle === 'Saved');
check('savedRow: name and address, with fallbacks', savedRow(home).title === 'Home' && savedRow(home).subtitle === 'Quezon City' && savedRow(home).key === 's:d1' && savedRow(createDestination({ id: 'z', name: '' })).title === 'Saved place' && savedRow(createDestination({ id: 'z' })).subtitle === 'No address');
check('removeMessage: names the place', removeMessage('Home').includes('“Home”') && removeMessage('').includes('this place'));
check('geoErrorMessage: each case has its own text', new Set([1, 2, 3, 0].map(geoErrorMessage)).size === 4 && geoErrorMessage(1).includes('permission'));

// ---- search URL ----
const url = new URL(searchUrl('  UP   Diliman '));
check('searchUrl: host and path', `${url.origin}${url.pathname}` === SEARCH_URL);
check('searchUrl: query, Philippines only, limit, format', url.searchParams.get('q') === 'UP Diliman' && url.searchParams.get('countrycodes') === 'ph' && url.searchParams.get('limit') === String(RESULT_LIMIT) && url.searchParams.get('format') === 'jsonv2');
check('searchUrl: special characters are encoded', new URL(searchUrl('a&b=c#d')).searchParams.get('q') === 'a&b=c#d' && !searchUrl('a&b=c#d').includes('#'));

// ---- searchPlaces with a fake fetch ----
const okFetch = (body, calls = []) => async (u, init) => { calls.push({ u, init }); return { ok: true, status: 200, json: async () => body }; };
{
  clearSearchCache();
  const calls = [];
  const found = await searchPlaces('Diliman', { fetchImpl: okFetch(sample, calls) });
  check('searchPlaces: parsed results', found.length === 3 && found[0].key === 'osm:node:456');
  check('searchPlaces: one request to the search URL, asking for JSON', calls.length === 1 && calls[0].u.startsWith(SEARCH_URL) && calls[0].init.headers.Accept === 'application/json');
  const again = await searchPlaces('  diliman ', { fetchImpl: okFetch([], calls) });
  check('searchPlaces: the same search (any case or spacing) comes from the cache', calls.length === 1 && again === found);
  await searchPlaces('Makati', { fetchImpl: okFetch([], calls) });
  check('searchPlaces: a different search is a new request', calls.length === 2);
  check('searchPlaces: an empty answer is a result, not an error', same(await searchPlaces('zzzzzz', { fetchImpl: okFetch([]) }), []));
}
{
  clearSearchCache();
  const fail = async (fetchImpl, query = 'Diliman') => { try { await searchPlaces(query, { fetchImpl }); return null; } catch (e) { return e; } };
  const e429 = await fail(async () => ({ ok: false, status: 429 }));
  check('searchPlaces: 429 is "busy"', e429 instanceof PlaceSearchError && e429.code === 'busy' && e429.message.includes('busy'));
  const e500 = await fail(async () => ({ ok: false, status: 503 }), 'q500');
  check('searchPlaces: another HTTP error is "unavailable"', e500 instanceof PlaceSearchError && e500.code === 'unavailable');
  const eJson = await fail(async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('bad'); } }), 'qjson');
  check('searchPlaces: an answer that is not JSON is "unavailable"', eJson instanceof PlaceSearchError && eJson.code === 'unavailable');
  const eNet = await fail(async () => { throw new TypeError('Failed to fetch'); }, 'qnet');
  check('searchPlaces: a network failure is "network"', eNet instanceof PlaceSearchError && eNet.code === 'network' && eNet.message.includes('connection'));
  const eSlow = await (async () => { try { await searchPlaces('qslow', { timeoutMs: 20, fetchImpl: (u, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))) }); return null; } catch (e) { return e; } })();
  check('searchPlaces: no answer in time is "timeout"', eSlow instanceof PlaceSearchError && eSlow.code === 'timeout');
  const ctl = new AbortController();
  const pending = searchPlaces('qabort', { signal: ctl.signal, fetchImpl: (u, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))) }).then(() => null, (e) => e);
  ctl.abort();
  const eAbort = await pending;
  check('searchPlaces: the caller aborting gives the AbortError, not a message', eAbort?.name === 'AbortError' && !(eAbort instanceof PlaceSearchError));
  const pre = new AbortController(); pre.abort();
  const ePre = await searchPlaces('qpre', { signal: pre.signal, fetchImpl: (u, { signal }) => (signal.aborted ? Promise.reject(Object.assign(new Error('aborted'), { name: 'AbortError' })) : Promise.resolve({ ok: true, json: async () => [] })) }).then(() => null, (e) => e);
  check('searchPlaces: an already aborted signal never searches', ePre?.name === 'AbortError');
  check('searchPlaces: a failed search is not cached', (await searchPlaces('Diliman', { fetchImpl: okFetch(sample) })).length === 3);
}
{
  clearSearchCache();
  for (let i = 0; i < 25; i += 1) await searchPlaces(`query ${i}`, { fetchImpl: okFetch([]) });
  let calls = 0;
  await searchPlaces('query 0', { fetchImpl: async () => { calls += 1; return { ok: true, json: async () => [] }; } });
  await searchPlaces('query 24', { fetchImpl: async () => { calls += 1; return { ok: true, json: async () => [] }; } });
  check('searchPlaces: the cache is bounded (oldest dropped, newest kept)', calls === 1);
}

if (failures.length > 0) {
  console.error(`Phase 10 PACE 1 map: ${failures.length} of ${count} checks FAILED:`);
  failures.forEach((f) => console.error(`  ✗ ${f}`));
  process.exit(1);
}
console.log(`Phase 10 PACE 1 map OK (${count} checks)`);