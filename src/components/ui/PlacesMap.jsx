import { useEffect, useRef } from 'react';
import * as L from 'leaflet';   // namespace import: works with both Leaflet's UMD and ES-module builds
import 'leaflet/dist/leaflet.css';
import { PH_BOUNDS } from '../../lib/mapView.js';

// OpenStreetMap's own tile server: free, no key. Its usage policy asks for light use and a visible credit (the attribution below).
// For heavy production traffic switch TILE_URL to a hosted tile provider; nothing else changes.
const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors';

const prefersReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

// Pins are plain styled <span>s (see .map-pin in _components.scss): no marker image files, so nothing breaks when the app is bundled.
const pinIcon = (kind, selected) => L.divIcon({
  className: `map-pin map-pin-${kind}${selected ? ' is-selected' : ''}`,
  html: '<span></span>',
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

/**
 * An interactive map (Leaflet + OpenStreetMap).
 *   markers  [{ id, kind: 'result'|'saved'|'me', label, latitude, longitude, selected }]  (keep the array stable between renders)
 *   focus    { seq, latitude, longitude, zoom } or { seq, bounds }  — moves the map when `seq` changes
 *   onSelect (id) => void, called when a pin is clicked or activated with the keyboard
 * The lists next to the map are the accessible way to pick a place; the pins are an extra.
 */
export function PlacesMap({ markers = [], focus = null, onSelect, ariaLabel = 'Map' }) {
  const hostRef = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);
  const onSelectRef = useRef(onSelect);
  useEffect(() => { onSelectRef.current = onSelect; });

  // create the map once
  useEffect(() => {
    const calm = prefersReducedMotion();
    const map = L.map(hostRef.current, { zoomAnimation: !calm, fadeAnimation: !calm, markerZoomAnimation: !calm });
    L.tileLayer(TILE_URL, { maxZoom: 19, attribution: ATTRIBUTION }).addTo(map);
    map.zoomControl.setPosition('bottomright');   // the search bar sits at the top
    map.attributionControl.setPrefix(false);
    map.fitBounds(PH_BOUNDS, { animate: false });
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    const watcher = typeof ResizeObserver === 'function' ? new ResizeObserver(() => map.invalidateSize()) : null;
    watcher?.observe(hostRef.current);
    return () => {
      watcher?.disconnect();
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  // draw the pins
  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    layer.clearLayers();
    for (const m of markers) {
      const marker = L.marker([m.latitude, m.longitude], {
        icon: pinIcon(m.kind, m.selected), title: m.label, keyboard: true, riseOnHover: true, zIndexOffset: m.selected ? 1000 : 0,
      });
      if (m.kind !== 'me') marker.on('click', () => onSelectRef.current?.(m.id));
      marker.addTo(layer);
    }
  }, [markers]);

  // move the map
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focus) return;
    const animate = !prefersReducedMotion();
    if (focus.bounds) map.fitBounds(focus.bounds, { paddingTopLeft: [32, 88], paddingBottomRight: [32, 32], maxZoom: 16, animate });
    else map.setView([focus.latitude, focus.longitude], focus.zoom ?? 16, { animate });
  }, [focus]);

  return <div ref={hostRef} className="map-canvas" role="region" aria-label={ariaLabel} />;
}