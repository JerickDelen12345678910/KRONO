// Phase 7 PACE 1 — sync adapter contract, MemorySyncAdapter (fake/default), and SyncService (the sweep that keeps
// the backend equal to whatever repositories report as not-yet-synced). Uses the `exerciseHistory` repository as
// a generic stand-in throughout: its factory/validator are deliberately permissive (no required fields), so these
// tests exercise SyncService's own logic without needing the shape of a schedule/workout/destination record.
import {
  createDefaultSyncAdapter, MemorySyncAdapter, assertSyncAdapter,
} from '../src/sync/index.js';
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

if (failures.length) {
  console.error(`Phase 7 PACE 1 sync service FAILED (${failures.length} of ${passed + failures.length}):`);
  for (const f of failures) console.error(` - ${f}`);
  process.exit(1);
} else {
  console.log(`Phase 7 PACE 1 sync service OK (${passed} checks)`);
}