// Shared helpers for every model. Dates are 'YYYY-MM-DD', times are 'HH:mm' (local), timestamps are ISO strings.
import { SYNC_STATUS } from './constants.js';

export const newId = () =>
  globalThis.crypto?.randomUUID?.() ?? `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
export const nowIso = () => new Date().toISOString();

/** Fields every synced record has: stable id, timestamps, version, soft-delete marker, sync state. */
export function createBase() {
  const now = nowIso();
  return { id: newId(), createdAt: now, updatedAt: now, version: 1, deleted: false, deletedAt: null, syncStatus: SYNC_STATUS.LOCAL, isSample: false };
}

const needsSync = (r) => (r.syncStatus === SYNC_STATUS.SYNCED ? SYNC_STATUS.PENDING : r.syncStatus);

/** Return an updated copy: new timestamp, version + 1, and "waiting to sync" if it was synced. */
export function touch(record, changes = {}) {
  return { ...record, ...changes, updatedAt: nowIso(), version: record.version + 1, syncStatus: needsSync(record) };
}

/** Soft delete (deletion marker) so another device cannot restore the record by mistake. */
export function markDeleted(record) {
  const now = nowIso();
  return { ...record, deleted: true, deletedAt: now, updatedAt: now, version: record.version + 1, syncStatus: needsSync(record) };
}

// ---- validation helpers (no dependencies) ----
export const isTime = (s) => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
export function isDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}
export const isNonEmpty = (v) => typeof v === 'string' && v.trim().length > 0;
export const isInt = (v, min = 0, max = Infinity) => Number.isInteger(v) && v >= min && v <= max;
/** Build the standard validation result: { valid, errors: { field: message } }. */
export const result = (errors) => ({ valid: Object.keys(errors).length === 0, errors });
