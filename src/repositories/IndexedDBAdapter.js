// IndexedDB storage adapter (Phase 6 PACE 1). Same four methods as MemoryAdapter, same semantics
// (all async, all return copies): get(id) · getAll() · put(record) · hardDelete(id).
// Not wired into the app yet — PACE 2 swaps it in for real (non-demo) users via createRepositories({ createAdapter }).
//
// One IndexedDB DATABASE PER USER (named off their uid), with one OBJECT STORE PER COLLECTION (fixed set from
// COLLECTIONS, declared once at the versioned "upgrade"). This mirrors MemoryAdapter's users/{userId}/{collection}
// partitioning without needing to create stores dynamically per user, which IndexedDB does not support.
import { openDB } from 'idb';
import { COLLECTIONS } from '../models/constants.js';

const DB_VERSION = 1;
const dbNameFor = (userId) => `local-data_${userId}`;
const dbCache = new Map();   // userId -> Promise<IDBPDatabase>, so every collection's adapter shares one open connection

/** Opens (or returns the cached open promise for) this user's database, with one object store per collection. */
export function openUserDB(userId) {
  if (!dbCache.has(userId)) {
    dbCache.set(userId, openDB(dbNameFor(userId), DB_VERSION, {
      upgrade(db) {
        for (const name of Object.values(COLLECTIONS)) {
          if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'id' });
        }
      },
    }));
  }
  return dbCache.get(userId);
}

/** Drops the cached connection (sign-out, React cleanup) so a later sign-in re-opens cleanly. Never deletes the database itself. Resolves once the old connection is actually closed. */
export function closeUserDB(userId) {
  const existing = dbCache.get(userId);
  dbCache.delete(userId);
  return existing ? existing.then((db) => db.close()).catch(() => {}) : Promise.resolve();
}

const clone = (v) => (v == null ? v : structuredClone(v));

export class IndexedDBAdapter {
  constructor(dbPromise, storeName) {
    this.dbPromise = dbPromise;
    this.storeName = storeName;
  }
  async get(id) {
    const db = await this.dbPromise;
    return clone((await db.get(this.storeName, id)) ?? null);
  }
  async getAll() {
    const db = await this.dbPromise;
    return (await db.getAll(this.storeName)).map(clone);
  }
  async put(record) {
    const db = await this.dbPromise;
    await db.put(this.storeName, clone(record));
    return clone(record);
  }
  async hardDelete(id) {
    const db = await this.dbPromise;
    const existed = (await db.get(this.storeName, id)) != null;
    await db.delete(this.storeName, id);
    return existed;
  }
}

/** Matches createRepositories({ createAdapter }): one adapter per collection, all sharing one open connection for this user. */
export function createIndexedDBAdapterFactory(userId) {
  const dbPromise = openUserDB(userId);
  return (collection) => new IndexedDBAdapter(dbPromise, collection);
}