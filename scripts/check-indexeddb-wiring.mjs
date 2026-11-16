// Phase 6 PACE 2 — IndexedDBAdapter wired into createRepositories for real (non-demo) users. check-indexeddb.mjs
// (PACE 1) proved the adapter itself works; this proves the WIRING: createRepositories({ createAdapter }) actually
// produces IndexedDBAdapter-backed repositories, the generic Repository class works against one end-to-end, data
// survives a close/reopen cycle (= sign-out then a later sign-in on the same device), createServices() boots cleanly
// against it, and demo-mode style wiring (store, no createAdapter) is unaffected.
import 'fake-indexeddb/auto';
import {
  createRepositories, createMemoryStore, createIndexedDBAdapterFactory, openUserDB, closeUserDB, IndexedDBAdapter, MemoryAdapter, Repository,
} from '../src/repositories/index.js';
import { createServices } from '../src/services/index.js';
import { COLLECTIONS } from '../src/models/constants.js';

// A real collection name, since IndexedDBAdapter's object stores are the fixed set from COLLECTIONS
// (declared once at the versioned upgrade) — an invented name has no object store to open.
const PROBE_COLLECTION = COLLECTIONS.DESTINATIONS;

let passed = 0;
const failures = [];
function check(label, cond) { if (cond) passed += 1; else failures.push(label); }
const randomUser = () => `wiring-test-${Math.random().toString(36).slice(2)}`;

async function main() {
  // ---- structural: a real user's repositories are backed by IndexedDBAdapter ----
  {
    const userId = randomUser();
    const repos = createRepositories({ userId, createAdapter: createIndexedDBAdapterFactory(userId) });
    check('schedules repository uses IndexedDBAdapter', repos.schedules.adapter instanceof IndexedDBAdapter);
    check('occurrences repository uses IndexedDBAdapter', repos.occurrences.adapter instanceof IndexedDBAdapter);
    check('destinations repository uses IndexedDBAdapter', repos.destinations.adapter instanceof IndexedDBAdapter);
    await closeUserDB(userId);
  }

  // ---- structural: demo-mode style wiring (store, no createAdapter) is unaffected — still MemoryAdapter ----
  {
    const store = createMemoryStore();
    const repos = createRepositories({ userId: 'demo-user', store });
    check('demo-mode repositories still use MemoryAdapter', repos.schedules.adapter instanceof MemoryAdapter);
  }

  // ---- the generic Repository class actually works end-to-end against IndexedDBAdapter (no business model needed) ----
  {
    const userId = randomUser();
    const repo = new Repository({
      adapter: new IndexedDBAdapter(openUserDB(userId), PROBE_COLLECTION),
      factory: (input) => ({ id: input.id ?? 'r1', title: input.title ?? '' }),
    });
    const saved = await repo.create({ title: 'Hello' });
    check('Repository.create() through IndexedDBAdapter returns the record', saved.title === 'Hello');
    check('Repository.get() reads back what create() stored', (await repo.get(saved.id))?.title === 'Hello');
    const updated = await repo.update(saved.id, { title: 'Changed' });
    check('Repository.update() persists through IndexedDBAdapter', updated.title === 'Changed');
    await repo.remove(saved.id);
    check('Repository.remove() (soft delete) hides the record from list()', (await repo.list()).length === 0);
    await closeUserDB(userId);
  }

  // ---- data survives a close/reopen cycle: sign-out, then a later sign-in on the same device ----
  {
    const userId = randomUser();
    {
      const repo = new Repository({
        adapter: new IndexedDBAdapter(openUserDB(userId), PROBE_COLLECTION),
        factory: (input) => ({ id: input.id ?? 'r1', title: input.title ?? '' }),
      });
      await repo.create({ id: 'persisted', title: 'Survives reopen' });
      await closeUserDB(userId);   // simulates sign-out
    }
    {
      const repo = new Repository({
        adapter: new IndexedDBAdapter(openUserDB(userId), PROBE_COLLECTION),
        factory: (input) => ({ id: input.id ?? 'r1', title: input.title ?? '' }),
      });   // simulates a later sign-in
      check('a reopened session sees the record created in the earlier session', (await repo.get('persisted'))?.title === 'Survives reopen');
      await closeUserDB(userId);
    }
  }

  // ---- createServices() boots cleanly against IndexedDB-backed repositories (what ServicesProvider.jsx actually does) ----
  {
    const userId = randomUser();
    const repos = createRepositories({ userId, createAdapter: createIndexedDBAdapterFactory(userId) });
    const services = createServices(repos, { today: () => '2026-01-05', now: () => '2026-01-05T07:00' });
    const result = await services.reminders.sync();
    check('createServices() against an IndexedDB-backed repo set boots without throwing', result.ok === true);
    services.reminders.dispose();
    await closeUserDB(userId);
  }

  if (failures.length) {
    console.error(`Phase 6 PACE 2 IndexedDB wiring FAILED (${failures.length} of ${passed + failures.length}):`);
    for (const f of failures) console.error(` - ${f}`);
    process.exit(1);
  } else {
    console.log(`Phase 6 PACE 2 IndexedDB wiring OK (${passed} checks)`);
  }
}

await main();