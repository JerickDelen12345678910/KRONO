// Picks the sync adapter for this environment. Real (non-demo) users with Firebase configured get the Firestore
// adapter (Phase 7 PACE 2); demo mode, or anything without a Firestore instance, gets the in-memory fake — the same
// pattern createDefaultReminderAdapter() uses. `firestore` is { db, doc, runTransaction, serverTimestamp, collection,
// query, where, orderBy, getDocs }; ServicesProvider supplies it (this file never imports src/lib/firebase.js, which
// needs Vite's import.meta.env and so cannot load in Node tests).
import { MemorySyncAdapter } from './MemorySyncAdapter.js';
import { FirestoreSyncAdapter } from './FirestoreSyncAdapter.js';

export function createDefaultSyncAdapter({ userId = null, demo = true, firestore = null } = {}) {
  if (!demo && userId && firestore?.db) return new FirestoreSyncAdapter({ userId, firestore });
  return new MemorySyncAdapter();
}

export { MemorySyncAdapter, FirestoreSyncAdapter };
export { MemoryCursorStore, IndexedDBCursorStore } from './CursorStore.js';
export { assertSyncAdapter, SYNC_RESULT, ADAPTER_METHODS } from './SyncAdapter.js';