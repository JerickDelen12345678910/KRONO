import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useServices } from '../hooks/useServices';
import { useRemoteChanges } from '../hooks/useRemoteChanges';
import { handleError } from '../lib/errors';
import { searchPlaces } from '../lib/placeSearch.js';
import { fetchRoutes } from '../lib/routeSearch.js';
import { setWidgetMapMode, resetWidgetToAutoMode } from '../lib/scheduleWidgetBridge.js';
import {
  QUERY_MIN, TRAVEL_MODE_OPTIONS, buildPlaceOptions, distanceMeters, focusFor, focusForRoute, geoErrorMessage,
  googleMapsUrl, isSearchable, markersFor, newDestination, normalizeQuery, parseHhMm, removeMessage, resolvePointKey,
  resolveSelection, resultRow, routeOptionView, savedRow,
} from '../lib/mapView.js';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { FilterChips } from '../components/ui/FilterChips';
import { Icon } from '../components/ui/Icon';
import { NoteBanner } from '../components/ui/NoteBanner';
import { PlacesMap } from '../components/ui/PlacesMap';
import { Pill } from '../components/ui/Pill';
import { Row } from '../components/ui/Row';

const REMOTE_COLLECTIONS = ['destinations'];
const REROUTE_THRESHOLD_METERS = 25;

const subscribeOnline = (notify) => {
  window.addEventListener('online', notify);
  window.addEventListener('offline', notify);
  return () => { window.removeEventListener('online', notify); window.removeEventListener('offline', notify); };
};
const useOnline = () => useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);

const countLabel = (n) => `${n} ${n === 1 ? 'place' : 'places'}`;

function PlaceItem({ title, subtitle, selected, onClick }) {
  return (
    <button type="button" className="place-item" aria-current={selected ? 'true' : undefined} onClick={onClick}>
      <Row time="" barColor="pri" title={title} subtitle={subtitle} />
    </button>
  );
}

export function MapPage() {
  const { place: placeService } = useServices();
  const [params] = useSearchParams();
  const online = useOnline();
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState(null);
  const [pinnedResults, setPinnedResults] = useState([]);
  const [saved, setSaved] = useState([]);
  const [selectedKey, setSelectedKey] = useState(null);
  const [focus, setFocus] = useState(null);
  const [me, setMe] = useState(null);
  const [routedMe, setRoutedMe] = useState(null);      // throttled GPS anchor for route recalculation (updates every >= 25m)
  const [locating, setLocating] = useState(false);
  const [trackingLive, setTrackingLive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState({ load: '', search: '', action: '', geo: '', route: '' });
  const [reload, setReload] = useState(0);

  // Route state + direct Start/Destination search inputs
  const [activeTarget, setActiveTarget] = useState('start');
  const [startQuery, setStartQuery] = useState('');
  const [destQuery, setDestQuery] = useState('');
  const [routeStartKey, setRouteStartKey] = useState('');
  const [routeDestKey, setRouteDestKey] = useState('');
  const [travelMode, setTravelMode] = useState('driving');
  const [arriveBy, setArriveBy] = useState('');
  const [routing, setRouting] = useState(false);
  const [routes, setRoutes] = useState([]);
  const [selectedRouteId, setSelectedRouteId] = useState(null);
  const [routeTrigger, setRouteTrigger] = useState(0);
  const [nowTick, setNowTick] = useState(() => new Date());

  const searchAbort = useRef(null);
  const routeAbort = useRef(null);
  const routedMeRef = useRef(null);
  const appliedDeepLink = useRef('');
  useRemoteChanges(REMOTE_COLLECTIONS, () => setReload((n) => n + 1));

  const setError = (key, message) => setErrors((e) => ({ ...e, [key]: message }));
  const pushFocus = (target) => { if (target) setFocus((f) => ({ ...target, seq: (f?.seq ?? 0) + 1 })); };

  useEffect(() => {
    const t = setInterval(() => setNowTick(new Date()), 60000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const rows = await placeService.listFavorites();
        if (alive) { setSaved(rows); setErrors((e) => ({ ...e, load: '' })); }
      } catch (e) {
        if (alive) setErrors((prev) => ({ ...prev, load: handleError(e, 'map') }));
      }
    })();
    return () => { alive = false; };
  }, [placeService, reload]);

  const destParam = params.get('dest') ?? '';
  const arriveParam = params.get('arrive') ?? '';
  useEffect(() => {
    if (!destParam || saved.length === 0) return;
    const token = `${destParam}|${arriveParam}`;
    if (appliedDeepLink.current === token) return;
    const match = saved.find((d) => d.id === destParam);
    if (!match) return;
    appliedDeepLink.current = token;
    const key = `s:${match.id}`;
    setSelectedKey(key);
    setRouteDestKey(key);
    setDestQuery(match.name || '');
    setActiveTarget('start');
    if (parseHhMm(arriveParam) != null) setArriveBy(arriveParam.trim());
    pushFocus(focusFor([match]));
  }, [destParam, arriveParam, saved]);

  useEffect(() => () => {
    searchAbort.current?.abort();
    routeAbort.current?.abort();
    resetWidgetToAutoMode();
  }, []);

  // Live GPS watcher whenever Start is set to "My location" (`routeStartKey === 'me'`)
  useEffect(() => {
    if (routeStartKey !== 'me') {
      setTrackingLive(false);
      return undefined;
    }
    if (!('geolocation' in navigator)) {
      setError('geo', geoErrorMessage(0));
      return undefined;
    }

    setLocating(true);
    setError('geo', '');
    let firstFix = true;

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const here = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
        setLocating(false);
        setTrackingLive(true);
        setMe(here);

        const prevAnchor = routedMeRef.current;
        if (!prevAnchor || distanceMeters(prevAnchor, here) >= REROUTE_THRESHOLD_METERS) {
          routedMeRef.current = here;
          setRoutedMe(here);
        }

        if (firstFix) {
          firstFix = false;
          if (!routeDestKey) pushFocus({ ...here, zoom: 16 });
        }
      },
      (err) => {
        setLocating(false);
        setTrackingLive(false);
        setError('geo', geoErrorMessage(err?.code));
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 },
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
      setTrackingLive(false);
    };
  }, [routeStartKey, routeDestKey]);

  const mergedResults = useMemo(() => {
    const map = new Map();
    for (const p of pinnedResults) map.set(p.key, p);
    for (const r of results ?? []) map.set(r.key, r);
    return [...map.values()];
  }, [pinnedResults, results]);

  const markers = useMemo(() => markersFor({ results: mergedResults, saved, selectedKey, me }), [mergedResults, saved, selectedKey, me]);
  const selection = useMemo(() => resolveSelection({ key: selectedKey, results: mergedResults, saved }), [selectedKey, mergedResults, saved]);
  const startOptions = useMemo(() => buildPlaceOptions({ me, saved, results: mergedResults, includeMyLocation: true }), [me, saved, mergedResults]);
  const destOptions = useMemo(() => buildPlaceOptions({ saved, results: mergedResults, includeMyLocation: false }), [saved, mergedResults]);

  const routeOrigin = useMemo(
    () => resolvePointKey({ key: routeStartKey, me: routedMe ?? me, saved, results: mergedResults }),
    [routeStartKey, routedMe, me, saved, mergedResults],
  );
  const routeDestination = useMemo(
    () => resolvePointKey({ key: routeDestKey, me: routedMe ?? me, saved, results: mergedResults }),
    [routeDestKey, routedMe, me, saved, mergedResults],
  );

  const rememberResultPlace = useCallback((key, list = mergedResults) => {
    if (!key?.startsWith('r:')) return;
    const raw = list.find((r) => `r:${r.key}` === key);
    if (!raw) return;
    setPinnedResults((prev) => (prev.some((p) => p.key === raw.key) ? prev : [...prev, raw]));
  }, [mergedResults]);

  const assignPointToTarget = useCallback((place, target = activeTarget) => {
    if (!place) return;
    rememberResultPlace(place.key);
    if (target === 'start') {
      setRouteStartKey(place.key);
      setStartQuery(place.name || '');
      if (!routeDestKey) setActiveTarget('dest');
    } else {
      setRouteDestKey(place.key);
      setDestQuery(place.name || '');
    }
  }, [activeTarget, rememberResultPlace, routeDestKey]);

  // Fetch routes whenever origin, destination, travel mode, online status, or live movement triggers
  useEffect(() => {
    if (!routeOrigin || !routeDestination) {
      setRoutes([]);
      setSelectedRouteId(null);
      setError('route', '');
      return undefined;
    }
    if (!online) {
      setRoutes([]);
      setSelectedRouteId(null);
      setError('route', '');
      return undefined;
    }
    if (routeOrigin.key === routeDestination.key) {
      setRoutes([]);
      setSelectedRouteId(null);
      setError('route', 'Choose a different start and destination.');
      return undefined;
    }

    routeAbort.current?.abort();
    const controller = new AbortController();
    routeAbort.current = controller;
    setRouting(true);
    setError('route', '');

    fetchRoutes({ origin: routeOrigin, destination: routeDestination, mode: travelMode }, { signal: controller.signal })
      .then((found) => {
        if (controller.signal.aborted) return;
        setRoutes(found);
        setSelectedRouteId(found[0]?.id ?? null);
        if (found[0]) {
          const primaryView = routeOptionView(found[0], 0, { selected: true, arriveBy, nowDate: new Date() });
          setWidgetMapMode(routeDestination.name || destQuery || 'Destination', primaryView.durationText || 'Navigating');
        }
        // Auto-fit route on initial calculation or manual Show Route; keep current zoom while walking live
        if (found[0] && routeStartKey !== 'me') pushFocus(focusForRoute(found[0]));
        else if (found[0] && routeTrigger > 0) pushFocus(focusForRoute(found[0]));
      })
      .catch((e) => {
        if (controller.signal.aborted || e?.name === 'AbortError') return;
        setRoutes([]);
        setSelectedRouteId(null);
        setError('route', e?.name === 'RouteSearchError' ? e.message : handleError(e, 'map'));
      })
      .finally(() => {
        if (!controller.signal.aborted) setRouting(false);
      });

    return () => controller.abort();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeOrigin, routeDestination, travelMode, online, routeTrigger, routeStartKey]);

  const mapRoutes = useMemo(
    () => routes.map((r) => ({ id: r.id, points: r.points, selected: r.id === selectedRouteId })),
    [routes, selectedRouteId],
  );
  const routeCards = useMemo(
    () => routes.map((r, i) => routeOptionView(r, i, { selected: r.id === selectedRouteId, arriveBy, nowDate: nowTick })),
    [routes, selectedRouteId, arriveBy, nowTick],
  );
  const mapsHref = useMemo(
    () => (routeDestination ? googleMapsUrl({ origin: me ?? routeOrigin, destination: routeDestination, mode: travelMode }) : ''),
    [me, routeOrigin, routeDestination, travelMode],
  );

  function select(key, overrideTarget = null) {
    if (!key || key === 'me') return;
    const place = resolveSelection({ key, results: mergedResults, saved });
    if (!place) return;
    setSelectedKey(place.key);
    pushFocus(focusFor([place]));
    assignPointToTarget(place, overrideTarget ?? activeTarget);
  }

  function handlePickMap({ latitude, longitude }) {
    const lat = Number(latitude.toFixed(5));
    const lng = Number(longitude.toFixed(5));
    const id = `pin-${lat}-${lng}`;
    const label = activeTarget === 'start' ? `Start pin (${lat}, ${lng})` : `Destination pin (${lat}, ${lng})`;
    const customPlace = {
      key: id,
      providerId: id,
      name: label,
      address: `${lat}, ${lng}`,
      latitude: lat,
      longitude: lng,
    };
    setPinnedResults((prev) => [...prev.filter((p) => p.key !== id), customPlace]);
    setResults((prev) => {
      const base = Array.isArray(prev) ? prev.filter((p) => p.key !== id) : [];
      return [customPlace, ...base];
    });
    const fullKey = `r:${id}`;
    setSelectedKey(fullKey);
    pushFocus({ latitude: lat, longitude: lng, zoom: 16 });
    assignPointToTarget({ ...customPlace, key: fullKey }, activeTarget);
  }

  function selectRoute(id) {
    setSelectedRouteId(id);
    const chosen = routes.find((r) => r.id === id);
    if (chosen) {
      pushFocus(focusForRoute(chosen));
      const chosenView = routeOptionView(chosen, 0, { selected: true, arriveBy, nowDate: nowTick });
      setWidgetMapMode(routeDestination?.name || destQuery || 'Destination', chosenView.durationText || 'Navigating');
    }
  }

  function locate({ setAsRouteStart = false } = {}) {
    if (!('geolocation' in navigator)) { setError('geo', geoErrorMessage(0)); return; }
    if (setAsRouteStart) {
      setRouteStartKey('me');
      setStartQuery('My location');
      if (!routeDestKey) setActiveTarget('dest');
      return;
    }
    setLocating(true);
    setError('geo', '');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const here = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
        setLocating(false);
        setMe(here);
        routedMeRef.current = here;
        setRoutedMe(here);
        pushFocus({ ...here, zoom: 16 });
      },
      (err) => {
        setLocating(false);
        setError('geo', geoErrorMessage(err?.code));
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 15000 },
    );
  }

  function routeToPlace(place) {
    if (!place) return;
    rememberResultPlace(place.key);
    setRouteDestKey(place.key);
    setDestQuery(place.name || '');
    setWidgetMapMode(place.name || 'Destination', 'Navigating');
    if (!routeStartKey) {
      locate({ setAsRouteStart: true });
    }
    setRouteTrigger((n) => n + 1);
  }

  function setAsStart(place) {
    if (!place) return;
    rememberResultPlace(place.key);
    setRouteStartKey(place.key);
    setStartQuery(place.name || '');
    if (!routeDestKey) setActiveTarget('dest');
  }

  function handleStartChange(nextKey) {
    if (nextKey === 'me') {
      setStartQuery('My location');
      setRouteStartKey('me');
      if (!routeDestKey) setActiveTarget('dest');
      return;
    }
    if (nextKey) {
      const resolved = resolvePointKey({ key: nextKey, me, saved, results: mergedResults });
      if (resolved) setStartQuery(resolved.name);
      rememberResultPlace(nextKey);
    }
    setRouteStartKey(nextKey);
  }

  function handleDestChange(nextKey) {
    if (nextKey) {
      const resolved = resolvePointKey({ key: nextKey, me, saved, results: mergedResults });
      if (resolved) setDestQuery(resolved.name);
      rememberResultPlace(nextKey);
    }
    setRouteDestKey(nextKey);
  }

  function swapRouteEndpoints() {
    if (!routeStartKey || !routeDestKey || routeStartKey === 'me') return;
    setRouteStartKey(routeDestKey);
    setRouteDestKey(routeStartKey);
    setStartQuery(destQuery);
    setDestQuery(startQuery);
  }

  async function executePlaceSearch(rawText, targetField = activeTarget) {
    if (!online || searching) return;
    const q = normalizeQuery(rawText);
    if (!isSearchable(q)) { setError('search', `Type at least ${QUERY_MIN} characters to search.`); return; }
    setSearching(true);
    setError('search', '');
    setActiveTarget(targetField);
    setQuery(q);
    searchAbort.current = new AbortController();
    try {
      const found = await searchPlaces(q, { signal: searchAbort.current.signal });
      setResults(found);
      setSelectedKey(null);
      pushFocus(focusFor(found));
    } catch (e) {
      if (e?.name !== 'AbortError') setError('search', e?.name === 'PlaceSearchError' ? e.message : handleError(e, 'map'));
    } finally {
      setSearching(false);
    }
  }

  async function runSearch(event) {
    event.preventDefault();
    await executePlaceSearch(query, activeTarget);
  }

  function handleShowRoute() {
    if (!routeStartKey || !routeDestKey) {
      setError('route', 'Please select both a Start point and a Destination first.');
      return;
    }
    setError('route', '');
    setWidgetMapMode(routeDestination?.name || destQuery || 'Destination', 'Navigating');
    if (me && routeStartKey === 'me') {
      routedMeRef.current = me;
      setRoutedMe(me);
    }
    if (routes[0]) pushFocus(focusForRoute(routes[0]));
    setRouteTrigger((n) => n + 1);
  }

  async function savePlace(place) {
    if (busy) return;
    setBusy(true);
    setError('action', '');
    try {
      const created = await placeService.save(newDestination(place));
      const rows = await placeService.listFavorites();
      setSaved(rows);
      const id = created?.id ?? rows.find((d) => d.providerId && d.providerId === place.providerId)?.id;
      if (id) {
        const nextSavedKey = `s:${id}`;
        setSelectedKey(nextSavedKey);
        if (routeStartKey === place.key) setRouteStartKey(nextSavedKey);
        if (routeDestKey === place.key) setRouteDestKey(nextSavedKey);
      }
    } catch (e) {
      setError('action', handleError(e, 'map'));
    } finally {
      setBusy(false);
    }
  }

  async function removePlace(place) {
    if (busy || !window.confirm(removeMessage(place.name))) return;
    setBusy(true);
    setError('action', '');
    try {
      await placeService.remove(place.savedId);
      setSaved(await placeService.listFavorites());
      setSelectedKey(null);
      if (routeStartKey === place.key) setRouteStartKey('');
      if (routeDestKey === place.key) setRouteDestKey('');
    } catch (e) {
      setError('action', handleError(e, 'map'));
    } finally {
      setBusy(false);
    }
  }

  const messages = [errors.load, errors.action, errors.geo, errors.search, errors.route].filter(Boolean);
  const mapLabel = `Map of the Philippines with ${countLabel(markers.length)} marked. Tap a place or tap anywhere on the map to set Start or Destination.`;

  return (
    <div>
      {messages.map((m) => <NoteBanner key={m} className="mb-3">{m}</NoteBanner>)}

      <div className="cols">
        <div className="stack">
          <div className="map-card">
            <PlacesMap
              markers={markers}
              routes={mapRoutes}
              focus={focus}
              onSelect={select}
              onSelectRoute={selectRoute}
              onPickMap={handlePickMap}
              ariaLabel={mapLabel}
            />
            <form className="map-search" role="search" onSubmit={runSearch}>
              <Icon name="search" />
              <input
                type="search" name="q" value={query} onChange={(e) => setQuery(e.target.value)} disabled={!online}
                placeholder={`Search ${activeTarget === 'start' ? 'start point' : 'destination'} in the Philippines`}
                aria-label="Search places in the Philippines"
                autoComplete="off" enterKeyHint="search" maxLength={120}
              />
              <Button type="submit" variant="secondary" size="sm" loading={searching} disabled={!online}>Search</Button>
              <Button variant="ghost" size="sm" leftIcon="nav" loading={locating} onClick={() => locate({ setAsRouteStart: true })} aria-label="Use my live location as start" title="Use my live location as start" />
            </form>
          </div>
          <small className="fit-note">
            {trackingLive
              ? 'Live GPS tracking is active: your pin and route update automatically as you move.'
              : <>Tapping a place or tapping on the map sets it as <b>{activeTarget === 'start' ? 'Start' : 'Destination'}</b>. Your location isn’t saved.</>}
          </small>
        </div>

        <div className="stack">
          {!online && (
            <Card variant="map" header={<>Search <Pill variant="warn">Needs internet</Pill></>}>
              <p className="empty-hint">Searching, map tiles, and route calculation need internet. Your saved places still work.</p>
            </Card>
          )}

          {selection && (
            <Card variant="map" header={<>{selection.name} {selection.savedId && <Pill variant="map">Saved</Pill>}</>}>
              {selection.address && <p className="place-address">{selection.address}</p>}
              <div className="status-actions">
                <Button variant="secondary" onClick={() => setAsStart(selection)}>Set as Start</Button>
                <Button variant="map" leftIcon="nav" onClick={() => routeToPlace(selection)}>Route here</Button>
                {selection.savedId
                  ? <Button variant="secondary" disabled={busy} onClick={() => removePlace(selection)}>Remove from saved</Button>
                  : <Button variant="secondary" leftIcon="plus" loading={busy} onClick={() => savePlace(selection)}>Save place</Button>}
              </div>
            </Card>
          )}

          <Card variant="map" header={<>Route {trackingLive ? <Pill variant="ok">Tracking live</Pill> : <Pill variant="warn">Needs internet</Pill>}</>}>
            <div className="form-grid">
              <div className="form-field">
                <span>Start {activeTarget === 'start' && <Pill variant="map">Tap map to set</Pill>}</span>
                <div className="d-flex gap-2">
                  <input
                    type="text"
                    value={startQuery}
                    onFocus={() => setActiveTarget('start')}
                    onChange={(e) => { setStartQuery(e.target.value); setActiveTarget('start'); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); executePlaceSearch(startQuery, 'start'); } }}
                    placeholder="Type start place or choose My location"
                    aria-label="Search start point"
                    disabled={!online}
                  />
                  <Button type="button" variant="secondary" size="sm" loading={searching && activeTarget === 'start'} disabled={!online} onClick={() => executePlaceSearch(startQuery, 'start')}>
                    Find
                  </Button>
                </div>
                <select value={routeStartKey} onFocus={() => setActiveTarget('start')} onChange={(e) => handleStartChange(e.target.value)} aria-label="Route start">
                  <option value="">Choose a start point</option>
                  {startOptions.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
                </select>
              </div>

              <div className="form-field">
                <span>Destination {activeTarget === 'dest' && <Pill variant="map">Tap map to set</Pill>}</span>
                <div className="d-flex gap-2">
                  <input
                    type="text"
                    value={destQuery}
                    onFocus={() => setActiveTarget('dest')}
                    onChange={(e) => { setDestQuery(e.target.value); setActiveTarget('dest'); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); executePlaceSearch(destQuery, 'dest'); } }}
                    placeholder="Type destination (e.g. Calamba, Laguna)"
                    aria-label="Search destination"
                    disabled={!online}
                  />
                  <Button type="button" variant="secondary" size="sm" loading={searching && activeTarget === 'dest'} disabled={!online} onClick={() => executePlaceSearch(destQuery, 'dest')}>
                    Find
                  </Button>
                </div>
                <select value={routeDestKey} onFocus={() => setActiveTarget('dest')} onChange={(e) => handleDestChange(e.target.value)} aria-label="Route destination">
                  <option value="">Choose a destination</option>
                  {destOptions.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
                </select>
              </div>

              <div className="toolbar">
                <FilterChips options={TRAVEL_MODE_OPTIONS} value={travelMode} onChange={setTravelMode} label="Travel mode" />
                {routeStartKey && routeDestKey && routeStartKey !== 'me' && (
                  <Button variant="ghost" size="sm" onClick={swapRouteEndpoints}>Swap</Button>
                )}
              </div>

              <label className="form-field">
                Arrive by (optional)
                <input type="time" value={arriveBy} onChange={(e) => setArriveBy(e.target.value)} aria-label="Arrive by time" />
              </label>

              <Button type="button" variant="map" fullWidth leftIcon="nav" loading={routing} disabled={!online} onClick={handleShowRoute}>
                Show route
              </Button>
            </div>

            {!online && (
              <p className="empty-hint mt-3">Connect to the internet to calculate routes, or open the destination in Google Maps.</p>
            )}

            {online && routing && (
              <p className="empty-hint mt-3" role="status">Finding routes…</p>
            )}

            {online && !routing && routeCards.length === 0 && (
              <p className="empty-hint mt-3">
                {destOptions.length === 0
                  ? 'Select My location or type a start and destination above to plan a route.'
                  : 'Tap Show route to see distance, travel time, and route line on the map.'}
              </p>
            )}

            {routeCards.length > 0 && (
              <div className="mt-3" role="group" aria-label="Route options">
                {routeCards.map((rc) => (
                  <button
                    key={rc.id}
                    type="button"
                    className={`alt-route${rc.selected ? ' selected' : ''}`}
                    aria-pressed={rc.selected}
                    onClick={() => selectRoute(rc.id)}
                  >
                    <div>
                      <b>{rc.durationText}</b>
                      <div className="row-subtitle">{`${rc.label} · ${rc.distanceText} · ${rc.summary}`}</div>
                    </div>
                    <div className="text-end">
                      <Pill variant={rc.selected ? 'map' : 'pri'}>{rc.leaveText}</Pill>
                      <div className="row-subtitle mt-1">{rc.detailText}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {mapsHref && (
              <div className="place-actions">
                <a
                  className="btn btn-secondary btn-full"
                  href={mapsHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setWidgetMapMode(routeDestination?.name || destQuery || 'Destination', 'Google Maps')}
                >
                  Open in Google Maps
                </a>
              </div>
            )}
          </Card>

          {results && (
            <Card variant="map" header={<>Search results <span>{countLabel(results.length)} · tap to set as {activeTarget === 'start' ? 'Start' : 'Destination'}</span></>}>
              {results.length === 0 && <p className="empty-hint">No places found. Try a different spelling, or add the city.</p>}
              {results.length > 0 && (
                <div role="group" aria-label="Search results">
                  {results.map((r) => {
                    const row = resultRow(r, saved);
                    return <PlaceItem key={row.key} title={row.title} subtitle={row.subtitle} selected={selection?.key === `r:${row.key}` || selection?.providerId === r.providerId} onClick={() => select(`r:${row.key}`)} />;
                  })}
                </div>
              )}
            </Card>
          )}

          <Card variant="map" header={<>Saved places <span>available offline</span></>}>
            {saved.length === 0 && <p className="empty-hint">No saved places yet. Search for a place and choose Save place.</p>}
            {saved.length > 0 && (
              <div role="group" aria-label="Saved places">
                {saved.map((d) => {
                  const row = savedRow(d);
                  return <PlaceItem key={row.id} title={row.title} subtitle={row.subtitle} selected={selection?.key === row.key} onClick={() => select(row.key)} />;
                })}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}