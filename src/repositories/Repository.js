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

  /** Sync bookkeeping only: changes syncStatus without bumping the version. */
  async setSyncStatus(id, status) {
    if (!Object.values(SYNC_STATUS).includes(status)) throw new AppError(ERROR_CODE.INVALID, 'Unknown sync status.', { status });
    const current = await this.adapter.get(id);
    if (!current) throw new AppError(ERROR_CODE.NOT_FOUND, 'Record not found.', { id });
    return this.adapter.put({ ...current, syncStatus: status });
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
