// Firestore sync adapter (Phase 7 PACE 2): the real cloud backend behind SyncAdapter's push() contract.
// Layout: users/{userId}/{collection}/{record.id} — the same path MemoryAdapter and the plan (section 8) use, so
// the existing owner-only rules for users/{uid} cover it. Nothing here imports the Firebase SDK: the caller passes
// `firestore = { db, doc, runTransaction }` (from 'firebase/firestore' + src/lib/firebase.js), which keeps this
// file loadable in Node, so scripts/check-sync.mjs can test the whole last-write-wins logic with a fake Firestore.
//
// Policy (decided 2026-11-17): last-write-wins by `updatedAt`. Each record is pushed in its OWN transaction that
// reads the remote copy first and writes only if the remote is not newer — atomic, so two devices pushing at once
// cannot overwrite each other's newer edit. Retries are safe: the document id IS record.id and an identical
// re-push (same updatedAt) is simply applied again, so nothing is ever duplicated.
import { AppError, ERROR_CODE } from '../lib/errors.js';
import { SYNC_RESULT } from './SyncAdapter.js';

const DEFAULT_CONCURRENCY = 5;   // transactions in flight at once per push() call (keeps big first syncs quick without flooding)
const defaultIsOnline = () => globalThis.navigator?.onLine !== false;

/** What is stored remotely: the record as plain JSON (Firestore rejects `undefined`), minus device-local sync state. */
export function toRemote(record) {
  const copy = JSON.parse(JSON.stringify(record));
  delete copy.syncStatus;
  return copy;
}

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
   * @param firestore   { db, doc, runTransaction } — the Firestore instance and the two SDK functions this needs
   * @param isOnline    () => boolean; offline pushes fail fast instead of waiting on a transaction timeout
   * @param concurrency max transactions in flight per push()
   */
  constructor({ userId, firestore, isOnline = defaultIsOnline, concurrency = DEFAULT_CONCURRENCY } = {}) {
    if (!userId) throw new TypeError('FirestoreSyncAdapter needs a userId.');
    const { db, doc, runTransaction } = firestore ?? {};
    if (!db || typeof doc !== 'function' || typeof runTransaction !== 'function') {
      throw new TypeError('FirestoreSyncAdapter needs firestore = { db, doc, runTransaction }.');
    }
    this.name = 'firestore';
    this.userId = userId;
    this.db = db;
    this.doc = doc;
    this.runTransaction = runTransaction;
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
    try {
      const ref = this.doc(this.db, 'users', this.userId, collection, id);
      return await this.runTransaction(this.db, async (tx) => {
        const snap = await tx.get(ref);
        if (snap.exists()) {
          const remote = snap.data();
          if (typeof remote.updatedAt === 'string' && remote.updatedAt > record.updatedAt) {
            return { id, status: SYNC_RESULT.CONFLICT, remote };
          }
        }
        tx.set(ref, toRemote(record));
        return { id, status: SYNC_RESULT.APPLIED };
      });
    } catch (error) {
      return { id, status: SYNC_RESULT.ERROR, error };
    }
  }

  dispose() { this.disposed = true; }
}