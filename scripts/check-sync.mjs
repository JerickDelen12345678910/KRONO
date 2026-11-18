// Phase 7 PACE 1-3 — sync adapter contract, MemorySyncAdapter (fake/demo), FirestoreSyncAdapter (real cloud, tested here
// against a fake Firestore — no network), cursor stores, Repository.applyRemote, and SyncService (pull, then push, with
// conflicts resolved last-write-wins). Uses the `exerciseHistory` repository as
// a generic stand-in throughout: its factory/validator are deliberately permissive (no required fields), so these
// tests exercise SyncService's own logic without needing the shape of a schedule/workout/destination record.
import {
  createDefaultSyncAdapter, MemorySyncAdapter, FirestoreSyncAdapter, MemoryCursorStore, IndexedDBCursorStore, assertSyncAdapter,
} from '../src/sync/index.js';
import { toRemote, fromRemote } from '../src/sync/FirestoreSyncAdapter.js';
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

// ---- conflict: the newer remote copy wins and replaces the local one (Phase 7 PACE 3), counted correctly ----
{
  const repos = createRepositories({ userId: 'u2', store: createMemoryStore() });
  const adapter = new MemorySyncAdapter();
  const sync = new SyncService({ repos, adapter, intervalMs: null });

  const created = await repos.exerciseHistory.create({ title: 'Push day' });
  // Simulate another device having already pushed a NEWER version of the same record directly to "remote".
  adapter.remote.set('exerciseHistory', new Map([[created.id, { ...created, updatedAt: '2099-01-01T00:00:00.000Z', title: 'Push day (from another device)' }]]));

  const result = await sync.sync();
  check('a conflicting push is counted as a conflict, not applied', result.conflicts === 1 && result.applied === 0);
  const afterConflict = await repos.exerciseHistory.get(created.id);
  check('a conflict is resolved: the winning remote copy replaces the local record', result.resolved === 1 && afterConflict.title === 'Push day (from another device)');
  check('after resolving a conflict the local record is SYNCED, so it is not re-reported', afterConflict.syncStatus === SYNC_STATUS.SYNCED && (await sync.sync()).conflicts === 0);

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
  const docs = new Map();                 // 'users/<uid>/<collection>/<id>' -> data (syncedAt stored as { __ms })
  const log = { transactions: 0, queries: 0 };
  const faults = new Set();               // document paths whose transaction fails (e.g. a rules rejection)
  const queryFaults = new Set();          // collection paths whose query fails
  let clock = 1_700_000_000_000;          // fake SERVER clock (ms); every commit moves it forward, like Firestore's commit time
  const SERVER_TS = { __serverTimestamp: true };
  const hasUndefined = (v) => v === undefined || (v && typeof v === 'object' && Object.values(v).some(hasUndefined));
  const hydrate = (data) => {            // what snap.data() returns: syncedAt becomes a Timestamp-like with toMillis()
    const out = structuredClone(data);
    if (out.syncedAt?.__ms !== undefined) { const ms = out.syncedAt.__ms; out.syncedAt = { toMillis: () => ms }; }
    return out;
  };
  const stamp = (data) => (data.syncedAt?.__serverTimestamp ? { ...data, syncedAt: { __ms: (clock += 5) } } : data);
  const doc = (_db, ...segments) => ({ path: segments.join('/') });
  const runTransaction = async (_db, fn) => {
    log.transactions += 1;
    const writes = [];
    const tx = {
      async get(ref) {
        if (faults.has(ref.path)) throw Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' });
        const data = docs.get(ref.path);
        return { exists: () => data !== undefined, data: () => (data === undefined ? undefined : hydrate(data)) };
      },
      set(ref, data) {
        if (hasUndefined(data)) throw new Error('Unsupported field value: undefined');
        writes.push([ref.path, structuredClone(data)]);
      },
    };
    const out = await fn(tx);
    for (const [path, data] of writes) docs.set(path, stamp(data));
    return out;
  };
  const collection = (_db, ...segments) => ({ path: segments.join('/') });
  const where = (field, op, value) => ({ kind: 'where', field, op, value });
  const orderBy = (field) => ({ kind: 'orderBy', field });
  const query = (ref, ...constraints) => ({ ref, constraints });
  const getDocs = async (q) => {
    log.queries += 1;
    if (queryFaults.has(q.ref.path)) throw Object.assign(new Error('The service is unavailable.'), { code: 'unavailable' });
    const prefix = `${q.ref.path}/`;
    // like Firestore, a document without the ordered field is simply not in the result
    let rows = [...docs.entries()].filter(([path, d]) => path.startsWith(prefix) && !path.slice(prefix.length).includes('/') && d.syncedAt?.__ms !== undefined);
    for (const c of q.constraints) {
      if (c.kind === 'where') {
        if (c.op !== '>') throw new Error('fake Firestore only supports ">"');
        rows = rows.filter(([, d]) => d[c.field].__ms > c.value.getTime());
      }
    }
    rows.sort((x, y) => x[1].syncedAt.__ms - y[1].syncedAt.__ms);
    return { docs: rows.map(([path, d]) => ({ id: path.split('/').pop(), data: () => hydrate(d) })) };
  };
  // Test helper: a document as if another device had pushed it just now.
  const seed = (path, data) => { docs.set(path, { ...data, syncedAt: { __ms: (clock += 5) } }); };
  return {
    db: { name: 'fake-db' }, doc, runTransaction, serverTimestamp: () => SERVER_TS, collection, query, where, orderBy, getDocs,
    docs, log, faults, queryFaults, seed,
  };
}

// ---- construction + factory gating ----
{
  const fake = createFakeFirestore();
  const throwsType = (fn) => { try { fn(); return false; } catch (e) { return e instanceof TypeError; } };
  check('FirestoreSyncAdapter requires a userId', throwsType(() => new FirestoreSyncAdapter({ firestore: fake })));
  check('FirestoreSyncAdapter requires db and every SDK function it uses', throwsType(() => new FirestoreSyncAdapter({ userId: 'u', firestore: { db: {} } })) && throwsType(() => new FirestoreSyncAdapter({ userId: 'u', firestore: { ...fake, getDocs: undefined } })));
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
  check('every push stamps the document with the SERVER time (syncedAt), which pulls follow', typeof fake.docs.get('users/u1/exerciseHistory/a').syncedAt.__ms === 'number');

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
  await sync.sync();   // the first run pulls; after it, ordinary sweeps only push until the pull interval passes
  const created = await repos.exerciseHistory.create({ title: 'Push day' });
  fake.seed(`users/u10/exerciseHistory/${created.id}`, { ...toRemote(created), updatedAt: '2099-01-01T00:00:00.000Z', title: 'from another device' });
  const result = await sync.sync();
  check('a newer cloud copy is counted as a conflict, not overwritten', result.conflicts === 1 && result.applied === 0 && fake.docs.get(`users/u10/exerciseHistory/${created.id}`).title === 'from another device');
  const resolved = await repos.exerciseHistory.get(created.id);
  check('the conflict is resolved locally: the cloud copy replaces the local record and is SYNCED', resolved.title === 'from another device' && resolved.syncStatus === SYNC_STATUS.SYNCED && !('syncedAt' in resolved));
  sync.dispose();
}

// =====================================================================================================
// Phase 7 PACE 3 — pull (remote -> local), conflict resolution, cursors, and the sweep that does pull THEN push.
// "Two devices" = two repository sets + two SyncServices talking to ONE shared adapter / fake Firestore.
// =====================================================================================================
const wait = (ms = 3) => new Promise((resolve) => { setTimeout(resolve, ms); });   // so two edits never share one updatedAt millisecond
function device(userId, adapter, extra = {}) {
  const repos = createRepositories({ userId, store: createMemoryStore() });
  const sync = new SyncService({ repos, adapter, intervalMs: null, ...extra });
  return { repos, repo: repos.exerciseHistory, sync };
}
const pullsOf = (adapter) => adapter.calls.filter((c) => c.method === 'pull' && c.collection === 'exerciseHistory');

// ---- Repository.applyRemote ----
{
  const repo = createRepositories({ userId: 'p1', store: createMemoryStore() }).exerciseHistory;
  const remote = { id: 'r1', createdAt: '2000-01-01T00:00:00.000Z', updatedAt: '2000-01-01T00:00:00.000Z', version: 3, deleted: false, deletedAt: null, syncStatus: 'pending', isSample: false, title: 'remote' };

  const created = await repo.applyRemote(remote);
  const stored = await repo.get('r1');
  check('applyRemote stores an unknown remote record', created.outcome === 'created' && stored.title === 'remote');
  check('applyRemote stores it as SYNCED and keeps its version/updatedAt (it is not a local edit)', stored.syncStatus === SYNC_STATUS.SYNCED && stored.version === 3 && stored.updatedAt === remote.updatedAt);
  check('applying the same remote record again changes nothing', (await repo.applyRemote(remote)).outcome === 'unchanged');
  check('a newer remote record replaces a synced local one', (await repo.applyRemote({ ...remote, updatedAt: '2000-06-01T00:00:00.000Z', title: 'remote v2' })).outcome === 'updated' && (await repo.get('r1')).title === 'remote v2');
  check('an older remote record never overwrites local', (await repo.applyRemote({ ...remote, title: 'ancient' })).outcome === 'unchanged' && (await repo.get('r1')).title === 'remote v2');

  await repo.update('r1', { title: 'local edit' });   // now pending, updatedAt = now
  const kept = await repo.applyRemote({ ...remote, updatedAt: '2001-01-01T00:00:00.000Z', title: 'older than the edit' });
  const afterKept = await repo.get('r1');
  check('a pending local edit NEWER than the remote record is kept (and will push)', kept.outcome === 'kept-local' && afterKept.title === 'local edit' && afterKept.syncStatus !== SYNC_STATUS.SYNCED);
  const lost = await repo.applyRemote({ ...remote, updatedAt: '2099-01-01T00:00:00.000Z', title: 'remote wins' });
  const afterLost = await repo.get('r1');
  check('a remote record NEWER than a pending local edit replaces it (last-write-wins)', lost.outcome === 'updated' && afterLost.title === 'remote wins' && afterLost.syncStatus === SYNC_STATUS.SYNCED);
  await repo.applyRemote({ ...remote, updatedAt: '2099-02-01T00:00:00.000Z', deleted: true, deletedAt: '2099-02-01T00:00:00.000Z' });
  check('a remote deletion marker becomes a local soft delete, stored as SYNCED', (await repo.get('r1')) === null && (await repo.get('r1', { includeDeleted: true })).syncStatus === SYNC_STATUS.SYNCED);

  const invalid = async (value) => { try { await repo.applyRemote(value); return false; } catch (e) { return e instanceof AppError && e.code === ERROR_CODE.INVALID; } };
  check('applyRemote rejects a record with no id or no updatedAt as INVALID', (await invalid({})) && (await invalid({ id: 'x' })) && (await invalid(null)));
}

// ---- Repository.setSyncStatus({ ifUpdatedAt }) ----
{
  const repo = createRepositories({ userId: 'p2', store: createMemoryStore() }).exerciseHistory;
  const rec = await repo.create({ title: 'x' });
  await repo.setSyncStatus(rec.id, SYNC_STATUS.SYNCED, { ifUpdatedAt: '1999-01-01T00:00:00.000Z' });
  check('setSyncStatus with a non-matching ifUpdatedAt writes nothing', (await repo.get(rec.id)).syncStatus !== SYNC_STATUS.SYNCED);
  await repo.setSyncStatus(rec.id, SYNC_STATUS.SYNCED, { ifUpdatedAt: rec.updatedAt });
  check('setSyncStatus with the matching ifUpdatedAt marks it', (await repo.get(rec.id)).syncStatus === SYNC_STATUS.SYNCED);
  await repo.setSyncStatus(rec.id, SYNC_STATUS.PENDING);
  check('setSyncStatus without ifUpdatedAt works as before', (await repo.get(rec.id)).syncStatus === SYNC_STATUS.PENDING);
}

// ---- MemorySyncAdapter.pull ----
{
  const adapter = new MemorySyncAdapter();
  await adapter.push('c', [{ id: 'a', updatedAt: '2026-01-01T00:00:00.000Z' }, { id: 'b', updatedAt: '2026-01-01T00:00:00.000Z' }]);
  const p1 = await adapter.pull('c', { since: null });
  check('pull returns everything pushed, with a cursor', p1.records.length === 2 && typeof p1.cursor === 'number');
  const p2 = await adapter.pull('c', { since: p1.cursor });
  check('pulling from the cursor returns nothing new and keeps the cursor', p2.records.length === 0 && p2.cursor === p1.cursor);
  await adapter.push('c', [{ id: 'a', updatedAt: '2026-01-02T00:00:00.000Z' }]);
  const p3 = await adapter.pull('c', { since: p1.cursor });
  check('a re-pushed record shows up again after the cursor', p3.records.length === 1 && p3.records[0].id === 'a' && p3.cursor > p1.cursor);
  await adapter.push('c', [{ id: 'b', updatedAt: '2025-01-01T00:00:00.000Z' }]);   // loses (conflict)
  check('a losing (conflicting) push does not move anything forward', (await adapter.pull('c', { since: p3.cursor })).records.length === 0);
  const empty = await adapter.pull('nothing-here', { since: null });
  check('pulling an empty collection gives no records and a null cursor', empty.records.length === 0 && empty.cursor === null);
  adapter.dispose();
  check('after dispose(), pull returns nothing', (await adapter.pull('c', { since: null })).records.length === 0);
}

// ---- cursor stores ----
{
  const mem = new MemoryCursorStore();
  check('MemoryCursorStore starts empty', (await mem.get('schedules')) === null);
  await mem.set('schedules', 42);
  await mem.set('occurrences', 7);
  check('MemoryCursorStore keeps one value per collection', (await mem.get('schedules')) === 42 && (await mem.get('occurrences')) === 7);

  const rows = new Map();   // minimal stand-in for an idb connection: get(store, key) / put(store, value)
  const stores = new Set();
  const fakeDb = {
    async get(store, key) { stores.add(store); return rows.get(`${store}/${key}`); },
    async put(store, value) { stores.add(store); rows.set(`${store}/${value.id}`, structuredClone(value)); },
  };
  const idb = new IndexedDBCursorStore(Promise.resolve(fakeDb));
  check('IndexedDBCursorStore starts empty', (await idb.get('schedules')) === null);
  await idb.set('schedules', 1234);
  check('IndexedDBCursorStore round-trips a value', (await idb.get('schedules')) === 1234 && (await idb.get('workouts')) === null);
  check('IndexedDBCursorStore keeps cursors in the syncMetadata store (the same database as the data)', stores.size === 1 && stores.has('syncMetadata'));
}

// ---- FirestoreSyncAdapter.pull ----
{
  const fake = createFakeFirestore();
  const adapter = new FirestoreSyncAdapter({ userId: 'g1', firestore: fake });
  const rec = (id, extra = {}) => ({ id, updatedAt: '2026-05-01T00:00:00.000Z', version: 1, deleted: false, syncStatus: 'pending', title: id, ...extra });
  await adapter.push('exerciseHistory', [rec('a'), rec('b')]);
  const p1 = await adapter.pull('exerciseHistory', { since: null });
  check('pull returns the documents pushed under this user and collection', p1.records.length === 2 && p1.records.every((r) => ['a', 'b'].includes(r.id)));
  check('pulled records are plain records: no syncedAt, no syncStatus', p1.records.every((r) => !('syncedAt' in r) && !('syncStatus' in r)));
  check('the cursor is the newest server syncedAt, in ms', typeof p1.cursor === 'number' && p1.cursor > 1_700_000_000_000);
  check('pulling from the cursor returns nothing new', (await adapter.pull('exerciseHistory', { since: p1.cursor })).records.length === 0);

  await adapter.push('exerciseHistory', [rec('a', { updatedAt: '2026-05-02T00:00:00.000Z', title: 'a2' })]);
  const p2 = await adapter.pull('exerciseHistory', { since: p1.cursor });
  check('only what changed after the cursor comes back', p2.records.length === 1 && p2.records[0].title === 'a2' && p2.cursor > p1.cursor);

  fake.docs.set('users/g1/exerciseHistory/legacy', { id: 'legacy', updatedAt: '2026-05-01T00:00:00.000Z' });   // no syncedAt
  fake.seed('users/g2/exerciseHistory/other-user', { id: 'other-user', updatedAt: '2026-05-01T00:00:00.000Z' });
  fake.seed('users/g1/schedules/other-collection', { id: 'other-collection', updatedAt: '2026-05-01T00:00:00.000Z' });
  const all = await adapter.pull('exerciseHistory', { since: null });
  check('documents without syncedAt, other users and other collections are never returned', all.records.map((r) => r.id).sort().join() === 'a,b');

  fake.seed('users/g1/exerciseHistory/newer', { ...rec('newer'), updatedAt: '2099-01-01T00:00:00.000Z' });
  const [conflict] = await adapter.push('exerciseHistory', [rec('newer')]);
  check('a conflict hands back the winning record without the backend-only syncedAt', conflict.status === 'conflict' && conflict.remote.id === 'newer' && !('syncedAt' in conflict.remote));
  check('fromRemote strips syncedAt and leaves the rest', !('syncedAt' in fromRemote({ id: 'x', syncedAt: 1, title: 't' })) && fromRemote({ id: 'x', syncedAt: 1, title: 't' }).title === 't');

  let online = false;
  const offline = new FirestoreSyncAdapter({ userId: 'g1', firestore: fake, isOnline: () => online });
  const queriesBefore = fake.log.queries;
  let err = null;
  try { await offline.pull('exerciseHistory', { since: null }); } catch (e) { err = e; }
  check('pulling while offline rejects with OFFLINE and sends no query', err instanceof AppError && err.code === ERROR_CODE.OFFLINE && fake.log.queries === queriesBefore);
  online = true;
  fake.queryFaults.add('users/g1/exerciseHistory');
  err = null;
  try { await offline.pull('exerciseHistory', { since: null }); } catch (e) { err = e; }
  check('a failing query rejects (SyncService keeps the old cursor)', err?.code === 'unavailable');
  fake.queryFaults.clear();
  adapter.dispose();
  check('after dispose(), pull returns nothing', (await adapter.pull('exerciseHistory', { since: null })).records.length === 0);
}

// ---- two devices through SyncService: pull, then push ----
{
  const shared = new MemorySyncAdapter();
  const changes = [];
  const a = device('dev-a', shared);
  const b = device('dev-b', shared, { onPulled: (c) => changes.push(c) });

  const made = await a.repo.create({ title: 'from A' });
  await a.sync.sync();
  const rb = await b.sync.sync({ pull: true });
  const onB = await b.repo.get(made.id);
  check('a record pushed by one device is pulled into the other', rb.pulled === 1 && rb.pullApplied === 1 && onB?.title === 'from A');
  check('a pulled record is stored as SYNCED and is not pushed back', onB.syncStatus === SYNC_STATUS.SYNCED && rb.pushed === 0);
  check('onPulled is told which collection received records', changes.length === 1 && changes[0].exerciseHistory === 1);
  const cursorAfter = await b.sync.cursors.get('exerciseHistory');
  const rb2 = await b.sync.sync({ pull: true });
  check('the saved cursor makes the next pull ask only for what is new', rb2.pulled === 0 && pullsOf(shared).at(-1).since === cursorAfter && cursorAfter !== null);

  await wait();
  await b.repo.update(made.id, { title: 'edited on B' });
  await b.sync.sync();
  const ra = await a.sync.sync({ pull: true });
  check('an edit made on one device reaches the other', (await a.repo.get(made.id)).title === 'edited on B' && ra.pullApplied === 1);

  // B edits first (older), A edits afterwards (newer) and syncs: B's next sync must lose to A.
  await wait();
  await b.repo.update(made.id, { title: 'B older edit' });
  await wait();
  await a.repo.update(made.id, { title: 'A newer edit' });
  await a.sync.sync();
  const rLose = await b.sync.sync({ pull: true });
  const afterLose = await b.repo.get(made.id);
  check('pull applies a newer remote edit over an older unsynced local edit (last-write-wins)', afterLose.title === 'A newer edit' && afterLose.syncStatus === SYNC_STATUS.SYNCED && rLose.pushed === 0);

  // A edits and syncs, THEN B edits (newer) before syncing: B's edit must survive the pull and win the push.
  await wait();
  await a.repo.update(made.id, { title: 'A edit 2' });
  await a.sync.sync();
  await wait();
  await b.repo.update(made.id, { title: 'B newer edit' });
  const rWin = await b.sync.sync({ pull: true });
  check('a newer unsynced local edit survives the pull and then wins the push', (await b.repo.get(made.id)).title === 'B newer edit' && rWin.applied === 1);
  await a.sync.sync({ pull: true });
  check('the winning edit is what the other device ends up with', (await a.repo.get(made.id)).title === 'B newer edit');

  // A push conflict (no pull in this run) is resolved on the spot, and reminders-style hooks are told.
  await wait();
  await b.repo.update(made.id, { title: 'B older still' });
  await wait();
  await a.repo.update(made.id, { title: 'A wins the conflict' });
  await a.sync.sync();
  changes.length = 0;
  const rc = await b.sync.sync();   // not due for an automatic pull: only the push runs
  const afterConflict = await b.repo.get(made.id);
  check('a push conflict is resolved: the newer remote copy replaces the local edit', rc.conflicts === 1 && rc.resolved === 1 && afterConflict.title === 'A wins the conflict' && afterConflict.syncStatus === SYNC_STATUS.SYNCED);
  check('onPulled is also told about records applied by conflict resolution', changes.length === 1 && changes[0].exerciseHistory === 1);
}

// ---- pull failure keeps the cursor and is retried; invalid remote records are skipped; no pull() on the adapter ----
{
  class FlakyAdapter extends MemorySyncAdapter {
    constructor() { super(); this.failPull = false; }
    async pull(collection, options) { if (this.failPull) throw new Error('network down'); return super.pull(collection, options); }
  }
  const shared = new FlakyAdapter();
  shared.seed('exerciseHistory', { id: 'remote-1', updatedAt: '2026-06-01T00:00:00.000Z', version: 1, deleted: false, title: 'waiting in the cloud' });
  const b = device('dev-b2', shared);

  shared.failPull = true;
  const failed = await b.sync.sync();
  check('a failing pull makes the run not-ok, records the cause, and pulls nothing', failed.ok === false && failed.pulled === 0 && b.sync.lastError?.message === 'network down');
  check('a failing pull does not advance the cursor', (await b.sync.cursors.get('exerciseHistory')) === null && (await b.repo.get('remote-1')) === null);
  shared.failPull = false;
  const retried = await b.sync.sync();   // no force: a failed pull leaves the next sweep "due" again
  check('the next ordinary sweep retries the pull and succeeds', retried.ok === true && retried.pullApplied === 1 && (await b.repo.get('remote-1'))?.title === 'waiting in the cloud');

  shared.seed('exerciseHistory', { id: 'broken' });   // no updatedAt: can never be applied
  shared.seed('exerciseHistory', { id: 'remote-2', updatedAt: '2026-06-02T00:00:00.000Z', version: 1, deleted: false, title: 'good one' });
  const skipped = await b.sync.sync({ pull: true });
  check('an unusable remote record is skipped and does not block the others', skipped.pullSkipped === 1 && skipped.pullApplied === 1 && (await b.repo.get('remote-2'))?.title === 'good one');
  check('after skipping it, the cursor moved on (it is not retried forever)', (await b.sync.sync({ pull: true })).pulled === 0);

  const noPull = device('dev-b3', { push: async (c, rs) => rs.map((r) => ({ id: r.id, status: 'applied' })) });
  await noPull.repo.create({ title: 'x' });
  const r = await noPull.sync.sync({ pull: true });
  check('an adapter without pull() is still pushed and never pulled', r.ok === true && r.pulled === 0 && r.applied === 1);
}

// ---- when an automatic sweep pulls ----
{
  const shared = new MemorySyncAdapter();
  let t = 0;
  const d = device('dev-t', shared, { pullIntervalMs: 1000, now: () => t });
  await d.sync.sync();
  check('the first run pulls', pullsOf(shared).length === 1);
  t = 500;
  await d.sync.sync();
  check('a sweep before the pull interval has passed does not pull', pullsOf(shared).length === 1);
  t = 1500;
  await d.sync.sync();
  check('a sweep after the pull interval pulls again', pullsOf(shared).length === 2);
  await d.sync.sync({ pull: true });
  check('{ pull: true } pulls even when it is not due', pullsOf(shared).length === 3);

  const never = device('dev-t2', new MemorySyncAdapter(), { pullIntervalMs: null, now: () => t });
  await never.sync.sync();
  t = 99_999_999;
  await never.sync.sync();
  check('with no pull interval, only the first run and forced pulls pull', pullsOf(never.sync.adapter).length === 1);
}

// ---- an edit made while a push is in flight is not marked synced ----
{
  class SlowAdapter extends MemorySyncAdapter {
    async push(collection, records) { const out = await super.push(collection, records); await this.afterPush?.(); return out; }
  }
  const adapter = new SlowAdapter();
  const d = device('dev-race', adapter);
  const rec = await d.repo.create({ title: 'before' });
  adapter.afterPush = async () => { adapter.afterPush = null; await wait(); await d.repo.update(rec.id, { title: 'edited mid-push' }); };
  await d.sync.sync();
  const mid = await d.repo.get(rec.id);
  check('an edit made during a push stays pending instead of being marked synced', mid.title === 'edited mid-push' && mid.syncStatus !== SYNC_STATUS.SYNCED);
  const next = await d.sync.sync();
  check('the next sweep pushes that edit', next.applied === 1 && (await d.repo.get(rec.id)).syncStatus === SYNC_STATUS.SYNCED && adapter.remote.get('exerciseHistory').get(rec.id).title === 'edited mid-push');
}

// ---- the whole thing against the fake Firestore: a device that was offline and pushes LATE is still pulled ----
{
  const fake = createFakeFirestore();
  const make = (name) => device(name, new FirestoreSyncAdapter({ userId: 'shared-user', firestore: fake }));
  const a = make('fs-a');   // will sit "offline" with an old edit
  const b = make('fs-b');
  const c = make('fs-c');

  const early = await a.repo.create({ title: 'made first, synced last' });
  await wait();
  const later = await c.repo.create({ title: 'made later, synced first' });
  await c.sync.sync();
  await b.sync.sync({ pull: true });
  check('device B has what was synced so far, and not the offline device\'s record', (await b.repo.get(later.id)) !== null && (await b.repo.get(early.id)) === null);

  await a.sync.sync();   // A comes back online: pulls, then pushes `early`
  const rb = await b.sync.sync({ pull: true });
  check('a record synced late by a device that was offline is still pulled (the cursor follows server time, not updatedAt)', (await b.repo.get(early.id))?.title === 'made first, synced last' && rb.pullApplied === 1);
  check('and the late device received what it had missed', (await a.repo.get(later.id))?.title === 'made later, synced first');
  const settled = await b.sync.sync({ pull: true });
  check('once everything is synced a pull applies nothing and a push sends nothing', settled.pullApplied === 0 && settled.pushed === 0);
}

if (failures.length) {
  console.error(`Phase 7 PACE 1-3 sync FAILED (${failures.length} of ${passed + failures.length}):`);
  for (const f of failures) console.error(` - ${f}`);
  process.exit(1);
} else {
  console.log(`Phase 7 PACE 1-3 sync OK (${passed} checks)`);
}