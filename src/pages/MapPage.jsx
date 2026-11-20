import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useServices } from '../hooks/useServices';
import { useRemoteChanges } from '../hooks/useRemoteChanges';
import { handleError } from '../lib/errors';
import { searchPlaces } from '../lib/placeSearch.js';
import {
  QUERY_MIN, focusFor, geoErrorMessage, isSearchable, markersFor, newDestination, normalizeQuery, removeMessage, resolveSelection,
  resultRow, savedRow,
} from '../lib/mapView.js';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Icon } from '../components/ui/Icon';
import { NoteBanner } from '../components/ui/NoteBanner';
import { PlacesMap } from '../components/ui/PlacesMap';
import { Pill } from '../components/ui/Pill';
import { Row } from '../components/ui/Row';

// What this screen shows comes from the saved places: re-read when another device's changes arrive.
const REMOTE_COLLECTIONS = ['destinations'];

const subscribeOnline = (notify) => {
  window.addEventListener('online', notify);
  window.addEventListener('offline', notify);
  return () => { window.removeEventListener('online', notify); window.removeEventListener('offline', notify); };
};
const useOnline = () => useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);

const countLabel = (n) => `${n} ${n === 1 ? 'place' : 'places'}`;

/** One tappable list row (a search result or a saved place). */
function PlaceItem({ title, subtitle, selected, onClick }) {
  return (
    <button type="button" className="place-item" aria-current={selected ? 'true' : undefined} onClick={onClick}>
      <Row time="" barColor="pri" title={title} subtitle={subtitle} />
    </button>
  );
}

/**
 * Phase 10 PACE 1: find places and save them. Search needs internet (OpenStreetMap Nominatim, one request per submit); the map
 * tiles need internet too; the saved places are stored on the device and work offline. All rules are pure in src/lib/mapView.js.
 */
export function MapPage() {
  const { place: placeService } = useServices();
  const online = useOnline();
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState(null);        // null = no search yet
  const [saved, setSaved] = useState([]);
  const [selectedKey, setSelectedKey] = useState(null);
  const [focus, setFocus] = useState(null);
  const [me, setMe] = useState(null);                  // the user's position, only after they asked; never stored
  const [locating, setLocating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState({ load: '', search: '', action: '', geo: '' });
  const [reload, setReload] = useState(0);
  const searchAbort = useRef(null);
  useRemoteChanges(REMOTE_COLLECTIONS, () => setReload((n) => n + 1));

  const setError = (key, message) => setErrors((e) => ({ ...e, [key]: message }));
  const pushFocus = (target) => { if (target) setFocus((f) => ({ ...target, seq: (f?.seq ?? 0) + 1 })); };

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

  useEffect(() => () => searchAbort.current?.abort(), []);   // leaving the screen cancels a search in flight

  const markers = useMemo(() => markersFor({ results: results ?? [], saved, selectedKey, me }), [results, saved, selectedKey, me]);
  const selection = useMemo(() => resolveSelection({ key: selectedKey, results: results ?? [], saved }), [selectedKey, results, saved]);

  function select(key) {
    if (!key || key === 'me') return;
    const place = resolveSelection({ key, results: results ?? [], saved });
    if (!place) return;
    setSelectedKey(place.key);          // a result that is already saved selects the saved place
    pushFocus(focusFor([place]));
  }

  async function runSearch(event) {
    event.preventDefault();
    if (!online || searching) return;
    const q = normalizeQuery(query);
    if (!isSearchable(q)) { setError('search', `Type at least ${QUERY_MIN} characters to search.`); return; }
    setSearching(true);
    setError('search', '');
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

  function locate() {
    if (!('geolocation' in navigator)) { setError('geo', geoErrorMessage(0)); return; }
    setLocating(true);
    setError('geo', '');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const here = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
        setLocating(false);
        setMe(here);
        pushFocus({ ...here, zoom: 15 });
      },
      (err) => { setLocating(false); setError('geo', geoErrorMessage(err?.code)); },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
    );
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
      if (id) setSelectedKey(`s:${id}`);
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
    } catch (e) {
      setError('action', handleError(e, 'map'));
    } finally {
      setBusy(false);
    }
  }

  const messages = [errors.load, errors.action, errors.geo, errors.search].filter(Boolean);
  const mapLabel = `Map of the Philippines with ${countLabel(markers.length)} marked. Choose a place from the lists to move the map to it.`;

  return (
    <div>
      {messages.map((m) => <NoteBanner key={m} className="mb-3">{m}</NoteBanner>)}

      <div className="cols">
        <div className="stack">
          <div className="map-card">
            <PlacesMap markers={markers} focus={focus} onSelect={select} ariaLabel={mapLabel} />
            <form className="map-search" role="search" onSubmit={runSearch}>
              <Icon name="search" />
              <input
                type="search" name="q" value={query} onChange={(e) => setQuery(e.target.value)} disabled={!online}
                placeholder="Search places in the Philippines" aria-label="Search places in the Philippines"
                autoComplete="off" enterKeyHint="search" maxLength={120}
              />
              <Button type="submit" variant="secondary" size="sm" loading={searching} disabled={!online}>Search</Button>
              <Button variant="ghost" size="sm" leftIcon="nav" loading={locating} onClick={locate} aria-label="Show my location" title="Show my location" />
            </form>
          </div>
          <small className="fit-note">Your location is only shown on this screen. It isn’t saved.</small>
        </div>

        <div className="stack">
          {!online && (
            <Card variant="map" header={<>Search <Pill variant="warn">Needs internet</Pill></>}>
              <p className="empty-hint">Searching and the map tiles need internet. Your saved places still work.</p>
            </Card>
          )}

          {selection && (
            <Card variant="map" header={<>{selection.name} {selection.savedId && <Pill variant="map">Saved</Pill>}</>}>
              {selection.address && <p className="place-address">{selection.address}</p>}
              <div className="place-actions">
                {selection.savedId
                  ? <Button variant="secondary" fullWidth disabled={busy} onClick={() => removePlace(selection)}>Remove from saved</Button>
                  : <Button variant="map" fullWidth leftIcon="plus" loading={busy} onClick={() => savePlace(selection)}>Save place</Button>}
              </div>
            </Card>
          )}

          {results && (
            <Card variant="map" header={<>Search results <span>{countLabel(results.length)}</span></>}>
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