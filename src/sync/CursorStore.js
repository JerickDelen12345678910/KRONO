// Where SyncService remembers how far it has pulled, per collection (Phase 7 PACE 3). The value is whatever the adapter
// returned as `cursor` (opaque). Interface: get(collection) -> value | null · set(collection, value). Both async.
//
// Real users keep it in the SAME IndexedDB database as their data (the `syncMetadata` store Phase 6 already creates), so
// clearing a user's local data also clears the cursor and the next pull simply re-downloads everything. A cursor kept
// anywhere else (e.g. localStorage) could outlive wiped data and then never refill it.
import { COLLECTIONS } from '../models/constants.js';

const keyFor = (collection) => `cursor:${collection}`;

export class MemoryCursorStore {
  constructor() { this.values = new Map(); }
  async get(collection) { return this.values.get(collection) ?? null; }
  async set(collection, value) { this.values.set(collection, value); }
}

export class IndexedDBCursorStore {
  /** @param dbPromise the cached open connection from openUserDB(uid) (src/repositories/IndexedDBAdapter.js) */
  constructor(dbPromise) { this.dbPromise = dbPromise; }
  async get(collection) {
    const db = await this.dbPromise;
    const row = await db.get(COLLECTIONS.SYNC_METADATA, keyFor(collection));
    return row?.value ?? null;
  }
  async set(collection, value) {
    const db = await this.dbPromise;
    await db.put(COLLECTIONS.SYNC_METADATA, { id: keyFor(collection), value });
  }
}