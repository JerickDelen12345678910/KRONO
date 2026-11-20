import { createBase, isNonEmpty, result } from './common.js';

/**
 * A saved place (collection `destinations`). `providerId` says where the place came from ('osm:node:123' for an OpenStreetMap
 * search result, null for a place typed in by hand) so the same place is never saved twice. `isFavorite` marks the places shown
 * under "Saved places" on the Map screen; PlaceService.setFavorite / listFavorites already use it.
 */
export const createDestination = (o = {}) => ({
  ...createBase(), name: '', address: '', latitude: null, longitude: null, isFavorite: false, providerId: null, ...o,
});

const isNumber = (v, min, max) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;

/** Name is required. Coordinates are optional, but when one is given both must be valid. */
export function validateDestination(d) {
  const e = {};
  if (!isNonEmpty(d.name)) e.name = 'Place name is required.';
  if (d.latitude != null || d.longitude != null) {
    if (!isNumber(d.latitude, -90, 90)) e.latitude = 'Latitude must be a number from -90 to 90.';
    if (!isNumber(d.longitude, -180, 180)) e.longitude = 'Longitude must be a number from -180 to 180.';
  }
  return result(e);
}