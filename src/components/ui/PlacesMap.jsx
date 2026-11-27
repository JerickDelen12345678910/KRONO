import { useEffect, useRef } from 'react';
import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { PH_BOUNDS } from '../../lib/mapView.js';

const OSM_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ESRI_STREET_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}';
const ESRI_SATELLITE_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const ATTRIBUTION = '&copy; OpenStreetMap contributors &copy; Esri';

const prefersReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

const pinIcon = (kind, selected) => L.divIcon({
  className: `map-pin map-pin-${kind}${selected ? ' is-selected' : ''}`,
  html: '<span></span>',
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

export function PlacesMap({ markers = [], routes = [], focus = null, onSelect, onSelectRoute, onPickMap, ariaLabel = 'Map' }) {
  const hostRef = useRef(null);
  const mapRef = useRef(null);
  const routeLayerRef = useRef(null);
  const layerRef = useRef(null);
  const onSelectRef = useRef(onSelect);
  const onSelectRouteRef = useRef(onSelectRoute);
  const onPickMapRef = useRef(onPickMap);
  useEffect(() => {
    onSelectRef.current = onSelect;
    onSelectRouteRef.current = onSelectRoute;
    onPickMapRef.current = onPickMap;
  });

  useEffect(() => {
    const calm = prefersReducedMotion();
    const map = L.map(hostRef.current, { zoomAnimation: !calm, fadeAnimation: !calm, markerZoomAnimation: !calm });
    const osm = L.tileLayer(OSM_URL, { maxZoom: 19, attribution: ATTRIBUTION });
    const esriStreet = L.tileLayer(ESRI_STREET_URL, { maxZoom: 19, attribution: ATTRIBUTION });
    const esriSatellite = L.tileLayer(ESRI_SATELLITE_URL, { maxZoom: 19, attribution: ATTRIBUTION });
    osm.addTo(map);
    L.control.layers(
      { 'Street & POIs': osm, 'Detailed Map': esriStreet, Satellite: esriSatellite },
      null,
      { position: 'bottomleft' },
    ).addTo(map);
    map.zoomControl.setPosition('bottomright');
    map.attributionControl.setPrefix(false);
    map.fitBounds(PH_BOUNDS, { animate: false });
    map.on('click', (e) => {
      if (e?.latlng) {
        onPickMapRef.current?.({ latitude: e.latlng.lat, longitude: e.latlng.lng });
      }
    });
    routeLayerRef.current = L.layerGroup().addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    const watcher = typeof ResizeObserver === 'function' ? new ResizeObserver(() => map.invalidateSize()) : null;
    watcher?.observe(hostRef.current);
    return () => {
      watcher?.disconnect();
      map.remove();
      mapRef.current = null;
      routeLayerRef.current = null;
      layerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const layer = routeLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    if (!Array.isArray(routes) || routes.length === 0) return;
    const styles = hostRef.current ? getComputedStyle(hostRef.current) : null;
    const activeColor = styles?.getPropertyValue('--map').trim() || '#0d9488';
    const altColor = styles?.getPropertyValue('--mu').trim() || '#64748b';
    const ordered = [...routes].sort((a, b) => Number(Boolean(a.selected)) - Number(Boolean(b.selected)));
    for (const r of ordered) {
      if (!Array.isArray(r.points) || r.points.length < 2) continue;
      const isFlight = String(r.id || '').startsWith('flight');
      const line = L.polyline(r.points, {
        color: r.selected ? activeColor : altColor,
        weight: r.selected ? 5 : 4,
        opacity: r.selected ? 0.92 : 0.5,
        dashArray: isFlight ? '10, 8' : undefined,
      });
      line.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        onSelectRouteRef.current?.(r.id);
      });
      line.addTo(layer);
    }
  }, [routes]);

  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    layer.clearLayers();
    for (const m of markers) {
      const marker = L.marker([m.latitude, m.longitude], {
        icon: pinIcon(m.kind, m.selected), title: m.label, keyboard: true, riseOnHover: true, zIndexOffset: m.selected ? 1000 : 0,
      });
      if (m.kind !== 'me') {
        marker.on('click', (e) => {
          L.DomEvent.stopPropagation(e);
          onSelectRef.current?.(m.id);
        });
      }
      marker.addTo(layer);
    }
  }, [markers]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focus) return;
    const animate = !prefersReducedMotion();
    if (focus.bounds) map.fitBounds(focus.bounds, { paddingTopLeft: [32, 88], paddingBottomRight: [32, 32], maxZoom: 16, animate });
    else map.setView([focus.latitude, focus.longitude], focus.zoom ?? 16, { animate });
  }, [focus]);

  return <div ref={hostRef} className="map-canvas" role="region" aria-label={ariaLabel} />;
}