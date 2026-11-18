// Phase 7 PACE 1 + 2 — sync adapter contract, MemorySyncAdapter (fake/demo), FirestoreSyncAdapter (real cloud, tested here
// against a fake Firestore — no network), and SyncService (the sweep that keeps the backend equal to whatever
// repositories report as not-yet-synced). Uses the `exerciseHistory` repository as
// a generic stand-in throughout: its factory/validator are deliberately permissive (no required fields), so these
// tests exercise SyncService's own logic without needing the shape of a schedule/workout/destination record.
import {
  createDefaultSyncAdapter, MemorySyncAdapter, FirestoreSyncAdapter, assertSyncAdapter,
} from '../src/sync/index.js';
import { toRemote } from '../src/sync/FirestoreSyncAdapter.js';
import { AppError, ERROR_CODE } from '../src/lib/errors.js';
import { SyncService } from '../src/services/SyncService.js';
import { createServices } from '../src/services/index.js';
import { createRepositories, createMemoryStore } from '../src/repositories/index.js';
import { SYNC_STATUS } from '../src/models/constants.js';

let passed = 0;
const failures = [];
function check(label, cond) { if (cond) passed += 1; else failures.push(label); }

// ---- assertSyncAdapter ----
{
  let threw = false;
  try { assertSyncAdapter({}); } catch (e) { threw = e instanceof TypeError; }
  check('assertSyncAdapter throws for an adapter missing push()', threw);
  check('assertSyncAdapter returns the adapter when it has push()', assertSyncAdapter({ push: async () => [] }) !== undefined);
}

// ---- MemorySyncAdapter: apply, newer-wins, older-loses-as-conflict, call log ----
{
  const adapter = new MemorySyncAdapter();
  const r1 = { id: 'a', updatedAt: '2026-01-01T00:00:00.000Z', title: 'first' };
  const [res1] = await adapter.push('exerciseHistory', [r1]);
  check('first push of a new record is applied', res1.status === 'applied');

  const r1Edited = { ...r1, updatedAt: '2026-01-02T00:00:00.000Z', title: 'second' };
  const [res2] = await adapter.push('exerciseHistory', [r1Edited]);
  check('a later push (newer updatedAt) is applied', res2.status === 'applied');

  const staleEdit = { ...r1, updatedAt: '2026-01-01T12:00:00.000Z', title: 'stale' };
  const [res3] = await adapter.push('exerciseHistory', [staleEdit]);
  check('a push with an OLDER updatedAt than what is already remote is a conflict, not an overwrite', res3.status === 'conflict');
  check('a conflict result carries the winning remote record', res3.remote?.title === 'second');
  check('adapter.calls records every push() call for tests to inspect', adapter.calls.filter((c) => c.method === 'push').length === 3);
}

// ---- SyncService end-to-end: create -> sync -> synced; edit -> re-pending -> sync -> synced again; delete -> sync ----
{
  const repos = createRepositories({ userId: 'u1', store: createMemoryStore() });
  const adapter = new MemorySyncAdapter();
  const sync = new SyncService({ repos, adapter, intervalMs: null });

  const created = await repos.exerciseHistory.create({ title: 'Leg day' });
  check('a brand-new record starts out NOT synced', created.syncStatus !== SYNC_STATUS.SYNCED);

  const result1 = await sync.sync();
  check('sync() resolves ok', result1.ok === true);
  check('sync() pushed exactly the one pending record and it applied', result1.pushed === 1 && result1.applied === 1);
  check('after a successful sync, the local record is marked SYNCED', (await repos.exerciseHistory.get(created.id)).syncStatus === SYNC_STATUS.SYNCED);

  const result2 = await sync.sync();
  check('a second sync() with nothing pending does no work', result2.pushed === 0);

  await repos.exerciseHistory.update(created.id, { title: 'Leg day (renamed)' });
  check('editing an already-synced record marks it pending again (touch() resets syncStatus)', (await repos.exerciseHistory.get(created.id)).syncStatus !== SYNC_STATUS.SYNCED);
  const result3 = await sync.sync();
  check('the edited record gets pushed and re-synced', result3.applied === 1 && (await repos.exerciseHistory.get(created.id)).syncStatus === SYNC_STATUS.SYNCED);

  await repos.exerciseHistory.remove(created.id);
  const result4 = await sync.sync();
  check('a soft-deleted record is pushed too (as a deletion marker) and marked synced', result4.applied === 1);
  check('the deletion marker itself ends up SYNCED', (await repos.exerciseHistory.get(created.id, { includeDeleted: true })).syncStatus === SYNC_STATUS.SYNCED);

  sync.dispose();
}

// ---- conflict: local stays un-synced, nothing is corrupted, counted correctly ----
{
  const repos = createRepositories({ userId: 'u2', store: createMemoryStore() });
  const adapter = new MemorySyncAdapter();
  const sync = new SyncService({ repos, adapter, intervalMs: null });

  const created = await repos.exerciseHistory.create({ title: 'Push day' });
  // Simulate another device having already pushed a NEWER version of the same record directly to "remote".
  adapter.remote.set('exerciseHistory', new Map([[created.id, { ...created, updatedAt: '2099-01-01T00:00:00.000Z', title: 'Push day (from another device)' }]]));

  const result = await sync.sync();
  check('a conflicting push is counted as a conflict, not applied', result.conflicts === 1 && result.applied === 0);
  check('on conflict, the local record is NOT marked synced (left for a future pull, Phase 7 PACE 3)', (await repos.exerciseHistory.get(created.id)).syncStatus !== SYNC_STATUS.SYNCED);

  sync.dispose();
}

// ---- overlapping sync() calls are merged into one follow-up run (same pattern as ReminderService) ----
{
  const repos = createRepositories({ userId: 'u3', store: createMemoryStore() });
  const adapter = new MemorySyncAdapter();
  const sync = new SyncService({ repos, adapter, intervalMs: null });
  await repos.exerciseHistory.create({ title: 'A' });
  await repos.exerciseHistory.create({ title: 'B' });
  const [resultA, resultB] = await Promise.all([sync.sync(), sync.sync()]);
  check('overlapping sync() calls both resolve without throwing', resultA.ok === true && resultB.ok === true);
  check('every record ends up synced once overlapping calls settle', (await repos.exerciseHistory.list()).every((r) => r.syncStatus === SYNC_STATUS.SYNCED));
  sync.dispose();
}

// ---- dispose(): stops further work immediately ----
{
  const repos = createRepositories({ userId: 'u4', store: createMemoryStore() });
  const adapter = new MemorySyncAdapter();
  const sync = new SyncService({ repos, adapter, intervalMs: null });
  await repos.exerciseHistory.create({ title: 'X' });
  sync.dispose();
  const result = await sync.sync();
  check('sync() after dispose() resolves immediately with nothing done', result.ok === true && result.pushed === 0);
  check('dispose() prevents any further adapter.push calls', adapter.calls.filter((c) => c.method === 'push').length === 0);
}

// ---- createServices() wiring: services.sync exists and actually works through the default adapter ----
{
  const repos = createRepositories({ userId: 'u5', store: createMemoryStore() });
  const services = createServices(repos, { today: () => '2026-01-05', now: () => '2026-01-05T07:00', syncIntervalMs: null });
  check('createServices() exposes a SyncService at services.sync', services.sync instanceof SyncService);
  await repos.exerciseHistory.create({ title: 'Wired' });
  const result = await services.sync.sync();
  check('services.sync.sync() actually pushes through the default sync adapter', result.applied === 1);
  check('createDefaultSyncAdapter() is usable on its own too', typeof createDefaultSyncAdapter().push === 'function');
  services.reminders.dispose();
  services.sync.dispose();
}

// =====================================================================================================
// Phase 7 PACE 2 — FirestoreSyncAdapter against a FAKE Firestore (same transaction semantics the adapter relies on:
// tx.get(ref) -> snapshot with exists()/data(); tx.set(ref, data) applied on commit; `undefined` values rejected
// like the real SDK does). Real-project checks need .env keys and are done by hand (see docs/PROGRESS.md).
// =====================================================================================================
function createFakeFirestore() {
  const docs = new Map();                 // 'users/<uid>/<collection>/<id>' -> data
  const log = { transactions: 0 };
  const faults = new Set();               // paths whose transaction fails (e.g. a rules rejection)
  const hasUndefined = (v) => v === undefined || (v && typeof v === 'object' && Object.values(v).some(hasUndefined));
  const doc = (_db, ...segments) => ({ path: segments.join('/') });
  const runTransaction = async (_db, fn) => {
    log.transactions += 1;
    const writes = [];
    const tx = {
      async get(ref) {
        if (faults.has(ref.path)) throw Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' });
        const data = docs.get(ref.path);
        return { exists: () => data !== undefined, data: () => (data === undefined ? undefined : structuredClone(data)) };
      },
      set(ref, data) {
        if (hasUndefined(data)) throw new Error('Unsupported field value: undefined');
        writes.push([ref.path, structuredClone(data)]);
      },
    };
    const out = await fn(tx);
    for (const [path, data] of writes) docs.set(path, data);
    return out;
  };
  return { db: { name: 'fake-db' }, doc, runTransaction, docs, log, faults };
}

// ---- construction + factory gating ----
{
  const fake = createFakeFirestore();
  const throwsType = (fn) => { try { fn(); return false; } catch (e) { return e instanceof TypeError; } };
  check('FirestoreSyncAdapter requires a userId', throwsType(() => new FirestoreSyncAdapter({ firestore: fake })));
  check('FirestoreSyncAdapter requires { db, doc, runTransaction }', throwsType(() => new FirestoreSyncAdapter({ userId: 'u', firestore: { db: {} } })));
  check('FirestoreSyncAdapter satisfies the adapter contract', assertSyncAdapter(new FirestoreSyncAdapter({ userId: 'u', firestore: fake })) !== undefined);
  check('createDefaultSyncAdapter() with no arguments is the in-memory fake', createDefaultSyncAdapter() instanceof MemorySyncAdapter);
  check('demo mode never gets Firestore, even when a Firestore instance is passed', createDefaultSyncAdapter({ userId: 'demo', demo: true, firestore: fake }) instanceof MemorySyncAdapter);
  check('a real user without a Firestore instance falls back to the in-memory fake', createDefaultSyncAdapter({ userId: 'u', demo: false, firestore: null }) instanceof MemorySyncAdapter);
  check('a real user with Firestore gets FirestoreSyncAdapter', createDefaultSyncAdapter({ userId: 'u', demo: false, firestore: fake }) instanceof FirestoreSyncAdapter);
}

// ---- toRemote ----
{
  const remote = toRemote({ id: 'a', syncStatus: 'pending', title: 'x', optional: undefined, nested: { keep: 1, drop: undefined } });
  check('toRemote strips device-local syncStatus', !('syncStatus' in remote));
  check('toRemote drops undefined values (Firestore rejects them) and keeps the rest', !('optional' in remote) && !('drop' in remote.nested) && remote.nested.keep === 1 && remote.title === 'x');
}

// ---- push: path, apply, idempotent retry, newer wins, older loses ----
{
  const fake = createFakeFirestore();
  const adapter = new FirestoreSyncAdapter({ userId: 'u1', firestore: fake });
  const r1 = { id: 'a', updatedAt: '2026-01-01T00:00:00.000Z', version: 1, deleted: false, syncStatus: 'pending', title: 'first', note: undefined };

  const [res1] = await adapter.push('exerciseHistory', [r1]);
  check('first push of a new record is applied', res1.status === 'applied' && res1.id === 'a');
  check('the record is stored at users/{uid}/{collection}/{id}', fake.docs.has('users/u1/exerciseHistory/a'));
  check('the stored copy has no syncStatus and no undefined fields', !('syncStatus' in fake.docs.get('users/u1/exerciseHistory/a')) && !('note' in fake.docs.get('users/u1/exerciseHistory/a')));

  const [again] = await adapter.push('exerciseHistory', [r1]);
  check('re-pushing the exact same record is applied again (safe retry)', again.status === 'applied');
  check('a retry never creates a duplicate document', fake.docs.size === 1);

  const [newer] = await adapter.push('exerciseHistory', [{ ...r1, updatedAt: '2026-01-02T00:00:00.000Z', version: 2, title: 'second' }]);
  check('a newer updatedAt is applied and replaces the remote copy', newer.status === 'applied' && fake.docs.get('users/u1/exerciseHistory/a').title === 'second');

  const [stale] = await adapter.push('exerciseHistory', [{ ...r1, updatedAt: '2026-01-01T12:00:00.000Z', title: 'stale' }]);
  check('an OLDER updatedAt than the remote copy is a conflict', stale.status === 'conflict');
  check('a conflict carries the winning remote record', stale.remote?.title === 'second');
  check('a conflict leaves the remote copy untouched', fake.docs.get('users/u1/exerciseHistory/a').title === 'second');

  const [deleted] = await adapter.push('exerciseHistory', [{ ...r1, updatedAt: '2026-01-03T00:00:00.000Z', version: 3, deleted: true, deletedAt: '2026-01-03T00:00:00.000Z' }]);
  check('a soft-delete marker syncs like any other record (never hard-deleted remotely)', deleted.status === 'applied' && fake.docs.get('users/u1/exerciseHistory/a').deleted === true);
}

// ---- batches: order preserved with limited concurrency, per-record failures isolated, other users untouched ----
{
  const fake = createFakeFirestore();
  const adapter = new FirestoreSyncAdapter({ userId: 'u2', firestore: fake, concurrency: 3 });
  const records = Array.from({ length: 12 }, (_, i) => ({ id: `r${i}`, updatedAt: '2026-02-01T00:00:00.000Z', version: 1, deleted: false }));
  const results = await adapter.push('schedules', records);
  check('a batch returns one result per record, in the same order', results.length === 12 && results.every((r, i) => r.id === `r${i}` && r.status === 'applied'));
  check('every record of the batch is stored, and only under this user', fake.docs.size === 12 && [...fake.docs.keys()].every((p) => p.startsWith('users/u2/schedules/')));

  fake.faults.add('users/u2/schedules/r5');
  const mixed = await adapter.push('schedules', [records[4], records[5], { id: 'a/b', updatedAt: 'x' }, { updatedAt: 'x' }, records[6]]);
  check('a record the backend rejects comes back as an error with the cause', mixed[1].status === 'error' && mixed[1].error?.code === 'permission-denied');
  check('a failing record does not stop the records around it', mixed[0].status === 'applied' && mixed[4].status === 'applied');
  check('an id containing "/" or a missing id is reported as an error, not thrown', mixed[2].status === 'error' && mixed[3].status === 'error');
}

// ---- offline + dispose ----
{
  const fake = createFakeFirestore();
  let online = false;
  const adapter = new FirestoreSyncAdapter({ userId: 'u3', firestore: fake, isOnline: () => online });
  let err = null;
  try { await adapter.push('schedules', [{ id: 'a', updatedAt: 'x' }]); } catch (e) { err = e; }
  check('pushing while offline rejects with the OFFLINE error', err instanceof AppError && err.code === ERROR_CODE.OFFLINE);
  check('pushing while offline starts no transaction', fake.log.transactions === 0);
  online = true;
  const [ok] = await adapter.push('schedules', [{ id: 'a', updatedAt: '2026-03-01T00:00:00.000Z', version: 1, deleted: false }]);
  check('pushing works again once back online', ok.status === 'applied');
  adapter.dispose();
  const afterDispose = await adapter.push('schedules', [{ id: 'b', updatedAt: '2026-03-01T00:00:00.000Z' }]);
  check('after dispose() push does nothing and claims nothing was applied', afterDispose.length === 0 && fake.docs.size === 1);
}

// ---- SyncService + FirestoreSyncAdapter end to end ----
{
  const fake = createFakeFirestore();
  const repos = createRepositories({ userId: 'u9', store: createMemoryStore() });
  const sync = new SyncService({ repos, adapter: new FirestoreSyncAdapter({ userId: 'u9', firestore: fake }), intervalMs: null });
  const a = await repos.exerciseHistory.create({ title: 'A' });
  const b = await repos.exerciseHistory.create({ title: 'B' });
  const c = await repos.exerciseHistory.create({ title: 'C' });
  fake.faults.add(`users/u9/exerciseHistory/${b.id}`);

  const r1 = await sync.sync();
  check('one failing record makes the run not-ok but the others still sync', r1.ok === false && r1.applied === 2 && r1.pushed === 3);
  check('the failed record stays un-synced locally and lastError is set', (await repos.exerciseHistory.get(b.id)).syncStatus !== SYNC_STATUS.SYNCED && sync.lastError != null);
  check('the others are marked SYNCED locally', (await repos.exerciseHistory.get(a.id)).syncStatus === SYNC_STATUS.SYNCED && (await repos.exerciseHistory.get(c.id)).syncStatus === SYNC_STATUS.SYNCED);

  fake.faults.clear();
  const r2 = await sync.sync();
  check('once the fault clears, only the failed record is retried and it syncs', r2.ok === true && r2.pushed === 1 && r2.applied === 1);
  check('the cloud now holds all three records under this user', fake.docs.size === 3 && fake.docs.has(`users/u9/exerciseHistory/${b.id}`));

  await repos.exerciseHistory.update(a.id, { title: 'A (edited)' });
  const r3 = await sync.sync();
  check('an edit after syncing is pushed again and replaces the cloud copy', r3.applied === 1 && fake.docs.get(`users/u9/exerciseHistory/${a.id}`).title === 'A (edited)');
  sync.dispose();
}
{
  const fake = createFakeFirestore();
  const repos = createRepositories({ userId: 'u10', store: createMemoryStore() });
  const sync = new SyncService({ repos, adapter: new FirestoreSyncAdapter({ userId: 'u10', firestore: fake }), intervalMs: null });
  const created = await repos.exerciseHistory.create({ title: 'Push day' });
  fake.docs.set(`users/u10/exerciseHistory/${created.id}`, { ...toRemote(created), updatedAt: '2099-01-01T00:00:00.000Z', title: 'from another device' });
  const result = await sync.sync();
  check('a newer cloud copy is counted as a conflict, not overwritten', result.conflicts === 1 && result.applied === 0 && fake.docs.get(`users/u10/exerciseHistory/${created.id}`).title === 'from another device');
  check('on conflict the local record stays un-synced (pull is Phase 7 PACE 3)', (await repos.exerciseHistory.get(created.id)).syncStatus !== SYNC_STATUS.SYNCED);
  sync.dispose();
}

if (failures.length) {
  console.error(`Phase 7 PACE 1-2 sync FAILED (${failures.length} of ${passed + failures.length}):`);
  for (const f of failures) console.error(` - ${f}`);
  process.exit(1);
} else {
  console.log(`Phase 7 PACE 1-2 sync OK (${passed} checks)`);
}