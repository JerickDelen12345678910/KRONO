import { SYNC_STATUS } from '../models/constants.js';
import { AppError, ERROR_CODE } from '../lib/errors.js';
import { assertSyncAdapter } from '../sync/SyncAdapter.js';
import { MemorySyncAdapter } from '../sync/MemorySyncAdapter.js';
import { MemoryCursorStore } from '../sync/CursorStore.js';

const NOTHING = { pushed: 0, applied: 0, conflicts: 0, resolved: 0, pulled: 0, pullApplied: 0, pullSkipped: 0 };
const DEFAULT_INTERVAL_MS = 20000;         // how often SyncService sweeps (pushes) on its own, besides being triggered by `online` or a caller
const DEFAULT_PULL_INTERVAL_MS = 300000;   // how often an automatic sweep ALSO pulls (5 min: pushing is cheap, pulling reads the cloud)

/**
 * Keeps the backend (the adapter) and this device equal. Every repository already marks a record's syncStatus
 * `local`/`pending` on create/edit/delete (see models/common.js: touch() / markDeleted()) and `synced` once it's
 * confirmed remotely, so the push "queue" IS the set of not-yet-synced records (Repository.listUnsynced()) — there is
 * no separate operation log (decided 2026-11-17).
 *
 * One run = PULL, then PUSH (Phase 7 PACE 3):
 *  1. pull — only when forced (`sync({ pull: true })`: sign-in, coming back online), on the first run, or when
 *     `pullIntervalMs` has passed. For each collection: read what the backend received after this collection's saved
 *     cursor, apply each record with Repository.applyRemote() (last-write-wins by updatedAt), then save the new cursor.
 *     A failed pull keeps the old cursor, so it is simply retried; a remote record that can never be applied (no id /
 *     updatedAt) is skipped and counted in `pullSkipped` rather than blocking everything behind it. Adapters without
 *     pull() are never pulled.
 *  2. push — every pending record goes to the adapter. A `conflict` (a newer remote copy exists) is resolved on the
 *     spot: the winning remote record replaces the local one and is marked synced, so it is not re-reported every sweep.
 *
 * Pulling first means a pending local edit that is newer than the cloud's copy is kept and then wins the push, while an
 * older one loses to the newer cloud copy (last-write-wins; no manual merge UI by design).
 *
 * sync() is idempotent and safe to call as often as you like: overlapping calls are merged, a run with nothing to do
 * touches nothing, and it NEVER rejects (a failing pull/push, or one record the adapter reports as an `error`, gives
 * { ok: false } and `lastError`; the failed records simply stay pending), so sync can never break saving.
 */
export class SyncService {
  /**
   * @param repos          the raw repository map from createRepositories() (schedules, occurrences, …)
   * @param adapter        a sync adapter (src/sync/SyncAdapter.js); defaults to the in-memory fake
   * @param intervalMs     how often to sweep on its own; pass null/0 to disable the timer (tests do this)
   * @param cursors        where pull positions are kept (src/sync/CursorStore.js); defaults to memory
   * @param pullIntervalMs how often an automatic sweep also pulls; null/0 = only the first run and forced pulls
   * @param onPulled       called (never awaited, never allowed to break sync) with { collection: count } after records
   *                       arrived from the backend — how services outside sync (e.g. reminders) learn about them
   * @param now            clock in ms, injectable for tests
   */
  constructor({
    repos, adapter, intervalMs = DEFAULT_INTERVAL_MS, cursors, pullIntervalMs = DEFAULT_PULL_INTERVAL_MS, onPulled, now = () => Date.now(),
  } = {}) {
    if (!repos) throw new TypeError('SyncService needs the repositories map.');
    this.repos = repos;
    this.adapter = assertSyncAdapter(adapter ?? new MemorySyncAdapter());
    this.cursors = cursors ?? new MemoryCursorStore();
    this.pullIntervalMs = pullIntervalMs;
    this.onPulled = onPulled;
    this.now = now;
    this.running = null;
    this.dirty = false;
    this.forcePull = false;
    this.lastPullAt = null;
    this.disposed = false;
    this.lastResult = null;
    this.lastError = null;
    this.timer = intervalMs ? setInterval(() => this.sync(), intervalMs) : null;
    if (this.timer?.unref) this.timer.unref();   // never keep a Node process alive just for this
  }

  /**
   * Resolves with { ok, pushed, applied, conflicts, resolved, pulled, pullApplied, pullSkipped } (the cause of ok: false is `lastError`).
   * Overlapping calls share one follow-up run. `{ pull: true }` makes the next run pull even if it is not due.
   */
  sync({ pull = false } = {}) {
    if (this.disposed) return Promise.resolve({ ok: true, ...NOTHING });
    if (pull) this.forcePull = true;
    if (this.running) { this.dirty = true; return this.running; }
    this.running = (async () => {
      let result;
      try {
        do {
          this.dirty = false;
          result = await this.run();
        } while (this.dirty && !this.disposed);
      } finally {
        this.running = null;
      }
      return result;
    })();
    return this.running;
  }

  /** Resolves when no sync is running (handy in tests). */
  async whenIdle() {
    while (this.running) await this.running;
  }

  pullDue() {
    if (this.lastPullAt == null) return true;
    return this.pullIntervalMs > 0 && this.now() - this.lastPullAt >= this.pullIntervalMs;
  }

  async run() {
    const sum = { ...NOTHING };
    const changed = {};   // collection -> how many local records came from the backend during this run
    let ok = true;
    let error = null;
    const fail = (e) => { ok = false; error = e; };
    const markChanged = (collection) => { changed[collection] = (changed[collection] ?? 0) + 1; };

    // ---- 1. pull ----
    const force = this.forcePull;
    this.forcePull = false;
    if (typeof this.adapter.pull === 'function' && (force || this.pullDue())) {
      let clean = true;
      await Promise.all(Object.entries(this.repos).map(async ([collection, repo]) => {
        if (this.disposed || typeof repo.applyRemote !== 'function') return;
        try {
          const since = await this.cursors.get(collection);
          const { records, cursor } = await this.adapter.pull(collection, { since });
          if (this.disposed) return;
          sum.pulled += records.length;
          for (const record of records) {
            try {
              const { outcome } = await repo.applyRemote(record);
              if (outcome === 'created' || outcome === 'updated') { sum.pullApplied += 1; markChanged(collection); }
            } catch (e) {
              // A record that can never be applied must not block the ones behind it; anything else (storage trouble) stops this collection.
              if (e instanceof AppError && e.code === ERROR_CODE.INVALID) sum.pullSkipped += 1; else throw e;
            }
          }
          if (cursor != null && cursor !== since && !this.disposed) await this.cursors.set(collection, cursor);
        } catch (e) { clean = false; fail(e); }   // old cursor kept -> retried next time
      }));
      if (clean && !this.disposed) this.lastPullAt = this.now();
    }

    // ---- 2. push ----
    await Promise.all(Object.entries(this.repos).map(async ([collection, repo]) => {
      if (this.disposed || typeof repo.listUnsynced !== 'function') return;
      let records;
      try { records = await repo.listUnsynced(); } catch (e) { fail(e); return; }
      if (!records.length || this.disposed) return;
      sum.pushed += records.length;
      const pushedAt = new Map(records.map((r) => [r.id, r.updatedAt]));
      let results;
      try { results = await this.adapter.push(collection, records); } catch (e) { fail(e); return; }
      if (this.disposed) return;
      await Promise.all(results.map(async (r) => {
        if (r.status === 'applied') {
          sum.applied += 1;
          // Only if the record is still the version that was pushed: an edit made mid-push stays pending for the next sweep.
          try { await repo.setSyncStatus(r.id, SYNC_STATUS.SYNCED, { ifUpdatedAt: pushedAt.get(r.id) }); } catch (e) { fail(e); }
        } else if (r.status === 'conflict') {
          sum.conflicts += 1;
          // A newer copy exists in the backend: it wins (last-write-wins). Store it locally as synced.
          try {
            const { outcome } = await repo.applyRemote(r.remote);
            if (outcome === 'created' || outcome === 'updated') { sum.resolved += 1; markChanged(collection); }
          } catch (e) { fail(e); }
        } else if (r.status === 'error') {
          fail(r.error ?? new Error(`Sync failed for ${collection}/${r.id}`));   // stays pending, retried next sweep; the rest of the batch is unaffected
        }
      }));
    }));

    if (Object.keys(changed).length && this.onPulled && !this.disposed) {
      try { Promise.resolve(this.onPulled(changed)).catch(() => {}); } catch { /* a failing hook can never break sync */ }
    }
    this.lastError = error;
    this.lastResult = { ok, ...sum };
    return this.lastResult;
  }

  /** Stop everything (sign-out, React cleanup). Later sync() calls do nothing. */
  dispose() {
    this.disposed = true;
    if (this.timer) clearInterval(this.timer);
    this.adapter.dispose?.();
  }
}