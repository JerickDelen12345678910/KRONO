// One shared repository for every collection: validation + timestamps/version + soft delete + sync status.
// Storage is delegated to an adapter, so screens/services never know which database is used.
import { markDeleted, touch } from '../models/common.js';
import { SYNC_STATUS } from '../models/constants.js';
import { AppError, ERROR_CODE } from '../lib/errors.js';

const PROTECTED = ['id', 'createdAt', 'updatedAt', 'version', 'deleted', 'deletedAt', 'syncStatus'];

export class Repository {
  /** @param {{ adapter, factory: (input)=>record, validate?: (record)=>{valid,errors} }} deps */
  constructor({ adapter, factory, validate = null }) {
    this.adapter = adapter;
    this.factory = factory;
    this.validate = validate;
  }

  _check(record) {
    if (!this.validate) return;
    const { valid, errors } = this.validate(record);
    if (!valid) throw new AppError(ERROR_CODE.VALIDATION, 'Some fields need attention.', { errors });
  }

  /** list({ where: {field: value}, predicate, orderBy, direction, includeDeleted }) */
  async list({ where, predicate, orderBy, direction = 'asc', includeDeleted = false } = {}) {
    let rows = await this.adapter.getAll();
    if (!includeDeleted) rows = rows.filter((r) => !r.deleted);
    if (where) rows = rows.filter((r) => Object.entries(where).every(([k, v]) => r[k] === v));
    if (predicate) rows = rows.filter(predicate);
    if (orderBy) {
      const dir = direction === 'desc' ? -1 : 1;
      rows.sort((a, b) => (a[orderBy] < b[orderBy] ? -dir : a[orderBy] > b[orderBy] ? dir : 0));
    }
    return rows;
  }

  async get(id, { includeDeleted = false } = {}) {
    const record = await this.adapter.get(id);
    return !record || (record.deleted && !includeDeleted) ? null : record;
  }

  async require(id) {
    const record = await this.get(id);
    if (!record) throw new AppError(ERROR_CODE.NOT_FOUND, 'Record not found.', { id });
    return record;
  }

  async create(input = {}) {
    const record = this.factory(input);
    this._check(record);
    if (await this.adapter.get(record.id)) throw new AppError(ERROR_CODE.CONFLICT, 'A record with this id already exists.', { id: record.id });
    await this.adapter.put(record);
    return record;
  }

  /** Retry-safe create: if the id already exists, return it instead of creating a duplicate. */
  async getOrCreate(input = {}) {
    if (input.id) {
      const existing = await this.adapter.get(input.id);
      if (existing) return existing;
    }
    return this.create(input);
  }

  /** Update with optional version check (`expectedVersion`) so an out-of-date edit is rejected, not overwritten. */
  async update(id, changes = {}, { expectedVersion } = {}) {
    const current = await this.require(id);
    if (expectedVersion != null && current.version !== expectedVersion) {
      throw new AppError(ERROR_CODE.CONFLICT, 'This record changed elsewhere. Reload and try again.', { id, expected: expectedVersion, actual: current.version });
    }
    const safe = Object.fromEntries(Object.entries(changes).filter(([k]) => !PROTECTED.includes(k)));
    const next = touch(current, safe);
    this._check(next);
    await this.adapter.put(next);
    return next;
  }

  /** Soft delete (keeps a deletion marker for sync). Safe to call twice. */
  async remove(id) {
    const current = await this.adapter.get(id);
    if (!current) throw new AppError(ERROR_CODE.NOT_FOUND, 'Record not found.', { id });
    if (current.deleted) return current;
    const next = markDeleted(current);
    await this.adapter.put(next);
    return next;
  }

  /** Undo a soft delete (used when a removed occurrence comes back after a schedule edit). */
  async restore(id) {
    const current = await this.adapter.get(id);
    if (!current) throw new AppError(ERROR_CODE.NOT_FOUND, 'Record not found.', { id });
    if (!current.deleted) return current;
    const next = touch({ ...current, deleted: false, deletedAt: null });
    await this.adapter.put(next);
    return next;
  }

  /**
   * Sync bookkeeping only: changes syncStatus without bumping the version.
   * `ifUpdatedAt` (optional): only write when the record is still exactly the version that was pushed. SyncService passes it
   * so an edit made while a push was in flight stays pending instead of being marked synced without ever being pushed.
   */
  async setSyncStatus(id, status, { ifUpdatedAt } = {}) {
    if (!Object.values(SYNC_STATUS).includes(status)) throw new AppError(ERROR_CODE.INVALID, 'Unknown sync status.', { status });
    const current = await this.adapter.get(id);
    if (!current) throw new AppError(ERROR_CODE.NOT_FOUND, 'Record not found.', { id });
    if (ifUpdatedAt != null && current.updatedAt !== ifUpdatedAt) return current;
    return this.adapter.put({ ...current, syncStatus: status });
  }

  /**
   * Store a record that came FROM the backend (a pull, or the winning side of a push conflict). It is not a local edit:
   * no touch(), no version bump, and it is stored as SYNCED so it is never pushed back. Last-write-wins by `updatedAt`,
   * the same policy push() uses:
   *  - no local copy                      -> stored                                   { outcome: 'created' }
   *  - remote newer than local            -> replaces local, even over unsynced edits { outcome: 'updated' }
   *  - local same age or newer, synced    -> nothing to do                            { outcome: 'unchanged' }
   *  - local same age or newer, unsynced  -> local kept; it pushes on the next sweep  { outcome: 'kept-local' }
   * Throws INVALID for a record with no usable id/updatedAt (nothing can be done with it). Not validated otherwise: it
   * was validated by the device that made it, and an app update must not make older cloud data unreadable.
   */
  async applyRemote(remote) {
    if (!remote || typeof remote.id !== 'string' || !remote.id || typeof remote.updatedAt !== 'string') {
      throw new AppError(ERROR_CODE.INVALID, 'Remote record has no usable id or updatedAt.', { id: remote?.id });
    }
    const local = await this.adapter.get(remote.id);
    if (!local || remote.updatedAt > local.updatedAt) {
      await this.adapter.put({ ...remote, syncStatus: SYNC_STATUS.SYNCED });
      return { outcome: local ? 'updated' : 'created' };
    }
    return { outcome: local.syncStatus === SYNC_STATUS.SYNCED ? 'unchanged' : 'kept-local' };
  }

  /** Everything not yet synced, including deletion markers (used by Phase 7). */
  listUnsynced() {
    return this.list({ includeDeleted: true, predicate: (r) => r.syncStatus !== SYNC_STATUS.SYNCED });
  }

  /** Remove only sample records (isSample = true); real records are never touched. Returns how many. */
  async removeSamples() {
    const samples = await this.list({ where: { isSample: true } });
    await Promise.all(samples.map((r) => this.remove(r.id)));
    return samples.length;
  }
}