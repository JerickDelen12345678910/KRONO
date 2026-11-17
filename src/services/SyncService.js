import { SYNC_STATUS } from '../models/constants.js';
import { assertSyncAdapter } from '../sync/SyncAdapter.js';
import { MemorySyncAdapter } from '../sync/MemorySyncAdapter.js';

const NOTHING = { pushed: 0, applied: 0, conflicts: 0 };
const DEFAULT_INTERVAL_MS = 20000;   // how often SyncService sweeps on its own, besides being triggered by `online` or a caller

/**
 * Keeps the backend (the adapter) equal to what's pending locally. Every repository already marks a record's
 * syncStatus `local`/`pending` on create/edit/delete (see models/common.js: touch() / markDeleted()) and `synced`
 * once it's confirmed remotely, so the "queue" IS the set of not-yet-synced records (Repository.listUnsynced()) —
 * there is no separate operation log (decided 2026-11-17).
 *
 * sync() is idempotent and safe to call as often as you like: overlapping calls are merged, a run with nothing
 * pending touches nothing, and it NEVER rejects (a failing push gives { ok: false, error } and `lastError`), so
 * sync can never break saving. Conflicts (a newer remote record already exists) are counted but left pending —
 * resolving them by pulling the remote winner down into local storage is Phase 7 PACE 3; until then a conflicting
 * record is safely re-attempted (and re-reported as a conflict) on every sweep without duplicating or corrupting
 * anything, since push() is an upsert check, not an append.
 */
export class SyncService {
  /**
   * @param repos      the raw repository map from createRepositories() (schedules, occurrences, …)
   * @param adapter    a sync adapter (src/sync/SyncAdapter.js); defaults to the in-memory fake
   * @param intervalMs how often to sweep on its own; pass null/0 to disable the timer (tests do this)
   */
  constructor({ repos, adapter, intervalMs = DEFAULT_INTERVAL_MS } = {}) {
    if (!repos) throw new TypeError('SyncService needs the repositories map.');
    this.repos = repos;
    this.adapter = assertSyncAdapter(adapter ?? new MemorySyncAdapter());
    this.running = null;
    this.dirty = false;
    this.disposed = false;
    this.lastResult = null;
    this.lastError = null;
    this.timer = intervalMs ? setInterval(() => this.sync(), intervalMs) : null;
    if (this.timer?.unref) this.timer.unref();   // never keep a Node process alive just for this
  }

  /** Resolves with { ok, pushed, applied, conflicts } (+ `error` when ok is false). Overlapping calls share one follow-up run. */
  sync() {
    if (this.disposed) return Promise.resolve({ ok: true, ...NOTHING });
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

  async run() {
    let pushed = 0;
    let applied = 0;
    let conflicts = 0;
    let ok = true;
    let error = null;
    await Promise.all(Object.entries(this.repos).map(async ([collection, repo]) => {
      if (this.disposed || typeof repo.listUnsynced !== 'function') return;
      let records;
      try { records = await repo.listUnsynced(); } catch (e) { ok = false; error = e; return; }
      if (!records.length || this.disposed) return;
      pushed += records.length;
      let results;
      try { results = await this.adapter.push(collection, records); } catch (e) { ok = false; error = e; return; }
      if (this.disposed) return;
      await Promise.all(results.map(async (r) => {
        if (r.status === 'applied') {
          applied += 1;
          try { await repo.setSyncStatus(r.id, SYNC_STATUS.SYNCED); } catch (e) { ok = false; error = e; }
        } else if (r.status === 'conflict') {
          conflicts += 1;
        }
      }));
    }));
    this.lastError = error;
    this.lastResult = { ok, pushed, applied, conflicts };
    return this.lastResult;
  }

  /** Stop everything (sign-out, React cleanup). Later sync() calls do nothing. */
  dispose() {
    this.disposed = true;
    if (this.timer) clearInterval(this.timer);
    this.adapter.dispose?.();
  }
}