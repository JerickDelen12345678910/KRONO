// Phase 6 PACE 1 — IndexedDB storage adapter. Node has no IndexedDB, so this polyfills one for the test run only
// (fake-indexeddb is a devDependency; the browser provides its own real IndexedDB, nothing extra ships to users).
import 'fake-indexeddb/auto';
import {
  IndexedDBAdapter, openUserDB, closeUserDB, createIndexedDBAdapterFactory,
} from '../src/repositories/IndexedDBAdapter.js';
import { COLLECTIONS } from '../src/models/constants.js';

let passed = 0;
const failures = [];
function check(label, cond) { if (cond) passed += 1; else failures.push(label); }
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const randomUser = () => `test-user-${Math.random().toString(36).slice(2)}`;

// ---- basic CRUD, one collection ----
{
  const userId = randomUser();
  const adapter = new IndexedDBAdapter(openUserDB(userId), COLLECTIONS.SCHEDULES);

  check('get(): missing id returns null', (await adapter.get('nope')) === null);
  check('getAll(): empty store returns []', eq(await adapter.getAll(), []));

  const record = { id: 's1', title: 'Test', version: 1 };
  const put1 = await adapter.put(record);
  check('put(): resolves with the stored record', eq(put1, record));
  check('get(): returns what was put', eq(await adapter.get('s1'), record));
  check('getAll(): includes the put record', eq(await adapter.getAll(), [record]));

  const updated = { id: 's1', title: 'Changed', version: 2 };
  await adapter.put(updated);
  check('put(): same id REPLACES, never duplicates', eq(await adapter.getAll(), [updated]));

  const existed = await adapter.hardDelete('s1');
  check('hardDelete(): returns true when the record existed', existed === true);
  check('hardDelete(): the record is actually gone', (await adapter.get('s1')) === null);
  const existedAgain = await adapter.hardDelete('s1');
  check('hardDelete(): returns false for an id that does not exist', existedAgain === false);

  await closeUserDB(userId);
}

// ---- isolation: returned records are copies, not live references (matches MemoryAdapter's contract) ----
{
  const userId = randomUser();
  const adapter = new IndexedDBAdapter(openUserDB(userId), COLLECTIONS.WORKOUTS);
  const original = { id: 'w1', tags: ['a', 'b'] };
  await adapter.put(original);
  original.tags.push('mutated-after-put');
  const stored = await adapter.get('w1');
  check("put(): mutating the caller's object after put() does not affect what was stored", eq(stored.tags, ['a', 'b']));

  stored.tags.push('mutated-after-get');
  const again = await adapter.get('w1');
  check('get(): mutating a returned record does not affect the store', eq(again.tags, ['a', 'b']));

  await closeUserDB(userId);
}

// ---- multiple collections share one open connection without colliding ----
{
  const userId = randomUser();
  const makeAdapter = createIndexedDBAdapterFactory(userId);
  const schedules = makeAdapter(COLLECTIONS.SCHEDULES);
  const workouts = makeAdapter(COLLECTIONS.WORKOUTS);

  await schedules.put({ id: 'shared-id', kind: 'schedule' });
  await workouts.put({ id: 'shared-id', kind: 'workout' });
  check(
    'two collections with the SAME id do not collide (separate object stores)',
    (await schedules.get('shared-id')).kind === 'schedule' && (await workouts.get('shared-id')).kind === 'workout',
  );

  const everyCollectionWorks = (await Promise.all(Object.values(COLLECTIONS).map(async (col) => {
    const a = makeAdapter(col);
    await a.put({ id: 'probe' });
    const ok = (await a.get('probe')) != null;
    await a.hardDelete('probe');
    return ok;
  }))).every(Boolean);
  check('every COLLECTIONS entry has its own usable object store', everyCollectionWorks);

  await closeUserDB(userId);
}

// ---- two different users never see each other's data (one database per user, like MemoryAdapter's per-user namespace) ----
{
  const userA = randomUser();
  const userB = randomUser();
  const adapterA = new IndexedDBAdapter(openUserDB(userA), COLLECTIONS.SCHEDULES);
  const adapterB = new IndexedDBAdapter(openUserDB(userB), COLLECTIONS.SCHEDULES);
  await adapterA.put({ id: 'x', owner: 'A' });
  check("user B's database starts empty even though user A just wrote the same id", (await adapterB.get('x')) === null);
  await closeUserDB(userA);
  await closeUserDB(userB);
}

// ---- reopening the same user's database later sees the same data (persistence across "sessions") ----
{
  const userId = randomUser();
  const first = new IndexedDBAdapter(openUserDB(userId), COLLECTIONS.DESTINATIONS);
  await first.put({ id: 'd1', name: 'Home' });
  await closeUserDB(userId);   // simulates sign-out / app close

  const second = new IndexedDBAdapter(openUserDB(userId), COLLECTIONS.DESTINATIONS);
  check("reopening the same user's database later still has the earlier record", eq(await second.get('d1'), { id: 'd1', name: 'Home' }));
  await closeUserDB(userId);
}

if (failures.length) {
  console.error(`Phase 6 PACE 1 IndexedDB adapter FAILED (${failures.length} of ${passed + failures.length}):`);
  for (const f of failures) console.error(` - ${f}`);
  process.exit(1);
} else {
  console.log(`Phase 6 PACE 1 IndexedDB adapter OK (${passed} checks)`);
}