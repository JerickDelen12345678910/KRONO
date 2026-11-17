// Picks the sync adapter for this environment. For now this ALWAYS returns the in-memory fake — there is no real
// backend yet. Phase 7 PACE 2 adds a Firestore adapter and extends this to return it when Firebase is configured
// and the user is not in demo mode — the same pattern createDefaultReminderAdapter() already uses.
import { MemorySyncAdapter } from './MemorySyncAdapter.js';

export function createDefaultSyncAdapter() {
  return new MemorySyncAdapter();
}

export { MemorySyncAdapter };
export { assertSyncAdapter, SYNC_RESULT, ADAPTER_METHODS } from './SyncAdapter.js';