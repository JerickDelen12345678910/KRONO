// Firestore sync adapter (Phase 7 PACE 2 push, PACE 3 pull): the real cloud backend behind SyncAdapter's contract.
// Layout: users/{userId}/{collection}/{record.id} — the same path MemoryAdapter and the plan (section 8) use, so
// the existing owner-only rules for users/{uid} cover it. Nothing here imports the Firebase SDK: the caller passes
// `firestore = { db, doc, runTransaction, serverTimestamp, collection, query, where, orderBy, getDocs }` (from
// 'firebase/firestore' + src/lib/firebase.js), which keeps this file loadable in Node, so scripts/check-sync.mjs can
// test the whole last-write-wins + pull logic with a fake Firestore.
//
// Policy (decided 2026-11-17): last-write-wins by `updatedAt`. Each record is pushed in its OWN transaction that
// reads the remote copy first and writes only if the remote is not newer — atomic, so two devices pushing at once
// cannot overwrite each other's newer edit. Retries are safe: the document id IS record.id and an identical
// re-push (same updatedAt) is simply applied again, so nothing is ever duplicated.
//
// Pull (PACE 3) follows `syncedAt`, a SERVER timestamp written with every push. It must not follow the record's own
// `updatedAt`: that is the device's clock, so a device that edited offline and pushes days later would be older than
// every other device's cursor and never be pulled. `syncedAt` is stripped from everything handed back to SyncService.
import { AppError, ERROR_CODE } from '../lib/errors.js';
import { SYNC_RESULT } from './SyncAdapter.js';

const DEFAULT_CONCURRENCY = 5;   // transactions in flight at once per push() call (keeps big first syncs quick without flooding)
const SDK_FUNCTIONS = ['doc', 'runTransaction', 'serverTimestamp', 'collection', 'query', 'where', 'orderBy', 'getDocs'];
const defaultIsOnline = () => globalThis.navigator?.onLine !== false;

/** What is stored remotely: the record as plain JSON (Firestore rejects `undefined`), minus device-local sync state. */
export function toRemote(record) {
  const copy = JSON.parse(JSON.stringify(record));
  delete copy.syncStatus;
  return copy;
}

/** What SyncService/Repository get back: the stored record minus the backend-only `syncedAt`. */
export function fromRemote(data) {
  const record = { ...data };
  delete record.syncedAt;
  return record;
}

const millisOf = (timestamp) => (typeof timestamp?.toMillis === 'function' ? Math.floor(timestamp.toMillis()) : null);

// Runs fn over items with at most `limit` in flight; results keep the input order. Stops early once stop() is true.
async function mapLimit(items, limit, stop, fn) {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length && !stop()) {
      const i = next;
      next += 1;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

export class FirestoreSyncAdapter {
  /**
   * @param userId      the signed-in user's uid (records go under users/{userId}/…)
   * @param firestore   { db, doc, runTransaction, serverTimestamp, collection, query, where, orderBy, getDocs }
   * @param isOnline    () => boolean; offline calls fail fast instead of waiting on a network timeout
   * @param concurrency max transactions in flight per push()
   */
  constructor({ userId, firestore, isOnline = defaultIsOnline, concurrency = DEFAULT_CONCURRENCY } = {}) {
    if (!userId) throw new TypeError('FirestoreSyncAdapter needs a userId.');
    const missing = SDK_FUNCTIONS.filter((name) => typeof firestore?.[name] !== 'function');
    if (!firestore?.db || missing.length) {
      throw new TypeError(`FirestoreSyncAdapter needs firestore = { db, ${SDK_FUNCTIONS.join(', ')} }.`);
    }
    this.name = 'firestore';
    this.userId = userId;
    this.db = firestore.db;
    this.sdk = firestore;
    this.isOnline = isOnline;
    this.concurrency = Math.max(1, concurrency);
    this.disposed = false;
  }

  /**
   * One result per record, same order: applied | conflict (+ remote) | error (+ error). A failing record never
   * blocks the others — it just stays pending locally and is retried on the next sweep. Rejects only when the whole
   * push cannot even start (offline), which SyncService reports as a failed run and leaves everything pending.
   */
  async push(collection, records) {
    if (this.disposed) return [];   // ignored after dispose(); never claim records were applied
    if (!this.isOnline()) throw new AppError(ERROR_CODE.OFFLINE, 'Offline: nothing was sent to the cloud.');
    const results = await mapLimit(records, this.concurrency, () => this.disposed, (record) => this.pushOne(collection, record));
    return this.disposed ? [] : results;
  }

  async pushOne(collection, record) {
    const id = record?.id;
    // A Firestore document id cannot be empty or contain "/" — report it instead of throwing mid-batch.
    if (typeof id !== 'string' || !id || id.includes('/')) {
      return { id, status: SYNC_RESULT.ERROR, error: new AppError(ERROR_CODE.INVALID, 'Record has no usable id to sync.') };
    }
    const { doc, runTransaction, serverTimestamp } = this.sdk;
    try {
      const ref = doc(this.db, 'users', this.userId, collection, id);
      return await runTransaction(this.db, async (tx) => {
        const snap = await tx.get(ref);
        if (snap.exists()) {
          const remote = snap.data();
          if (typeof remote.updatedAt === 'string' && remote.updatedAt > record.updatedAt) {
            return { id, status: SYNC_RESULT.CONFLICT, remote: fromRemote(remote) };
          }
        }
        tx.set(ref, { ...toRemote(record), syncedAt: serverTimestamp() });
        return { id, status: SYNC_RESULT.APPLIED };
      });
    } catch (error) {
      return { id, status: SYNC_RESULT.ERROR, error };
    }
  }

  /**
   * Everything under users/{uid}/{collection} whose server `syncedAt` is after `since` (ms), oldest first. The cursor is
   * the newest `syncedAt` seen, in whole ms: the last document is therefore re-read by the next pull (harmless — applying
   * it is a no-op), but a document can never be skipped. Documents with no `syncedAt` (not written by this adapter) are
   * not returned. Rejects when offline or when the query fails; SyncService then keeps the old cursor and retries later.
   */
  async pull(collection, { since = null } = {}) {
    if (this.disposed) return { records: [], cursor: since };
    if (!this.isOnline()) throw new AppError(ERROR_CODE.OFFLINE, 'Offline: nothing was fetched from the cloud.');
    const { collection: collectionRef, query, where, orderBy, getDocs } = this.sdk;
    const ref = collectionRef(this.db, 'users', this.userId, collection);
    const constraints = since == null ? [orderBy('syncedAt')] : [where('syncedAt', '>', new Date(since)), orderBy('syncedAt')];
    const snapshot = await getDocs(query(ref, ...constraints));
    if (this.disposed) return { records: [], cursor: since };
    const records = [];
    let cursor = since;
    for (const d of snapshot.docs) {
      const data = d.data();
      const ms = millisOf(data.syncedAt);
      if (ms == null) continue;
      records.push(fromRemote(data));
      if (cursor == null || ms > cursor) cursor = ms;
    }
    return { records, cursor };
  }

  dispose() { this.disposed = true; }
}