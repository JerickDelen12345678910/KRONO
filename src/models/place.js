import { TRAVEL_MODES } from './constants.js';
import { createBase, isNonEmpty, result } from './common.js';

/** A saved place / destination (works offline; live routes need internet). */
export const createDestination = (o = {}) => ({
  ...createBase(), name: '', address: '', latitude: null, longitude: null, googlePlaceId: null,
  isFavorite: false, notes: '', preferredMode: 'driving', ...o,
});

export function validateDestination(d) {
  const e = {};
  if (!isNonEmpty(d.name)) e.name = 'Place name is required.';
  if (!Number.isFinite(d.latitude) || d.latitude < -90 || d.latitude > 90) e.latitude = 'Latitude must be between -90 and 90.';
  if (!Number.isFinite(d.longitude) || d.longitude < -180 || d.longitude > 180) e.longitude = 'Longitude must be between -180 and 180.';
  if (!TRAVEL_MODES.includes(d.preferredMode)) e.preferredMode = 'Choose driving, walking or cycling.';
  return result(e);
}
