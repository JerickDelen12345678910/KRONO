import { OCCURRENCE_STATUS } from '../models/constants.js';
import { nowIso, toLocalDate } from '../models/common.js';
import { createOccurrence } from '../models/schedule.js';
import { occurrenceDates, scheduleWindow } from '../lib/recurrence.js';
import { AppError, ERROR_CODE } from '../lib/errors.js';

const byDateTime = (a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`);

export class ScheduleService {
  constructor({ schedules, occurrences }, { today = () => toLocalDate(), onChange } = {}) {
    this.schedules = schedules; this.occurrences = occurrences; this.today = today; this.onChange = onChange;
  }

  changed(change) {
    try { Promise.resolve(this.onChange?.(change)).catch(() => {}); } catch { /* saving must never fail because of a hook */ }
  }

  /** Creating a schedule also generates its occurrences. */
  async create(input) {
    const schedule = await this.schedules.create(input);
    await this.syncOccurrences(schedule.id);
    return schedule;
  }

  /** Editing a schedule re-syncs its occurrences (past, done and skipped history is kept). */
  async update(id, changes, opts) {
    const schedule = await this.schedules.update(id, changes, opts);
    await this.syncOccurrences(schedule.id);
    return schedule;
  }

  async syncOccurrences(scheduleId, { today = this.today() } = {}) {
    const s = await this.schedules.require(scheduleId);
    const oneTime = !s.repeat || s.repeat.type === 'none';
    const target = new Set(scheduleWindow(s).from ? occurrenceDates(s) : []);
    const all = await this.occurrences.list({ where: { scheduleId }, includeDeleted: true });
    const byDate = new Map(all.map((o) => [o.date, o]));
    const editable = (o) => o.status === OCCURRENCE_STATUS.SCHEDULED && (oneTime || o.date >= today);
    const sum = { created: 0, restored: 0, updated: 0, removed: 0, kept: 0 };

    for (const date of target) {
      const ex = byDate.get(date);
      if (!ex) {
        await this.occurrences.create(createOccurrence(s, date, { isSample: s.isSample }));
        sum.created += 1;
      } else if (ex.deleted) {
        await this.occurrences.restore(ex.id);
        await this.occurrences.update(ex.id, { startTime: s.startTime, endTime: s.endTime, status: OCCURRENCE_STATUS.SCHEDULED, completedAt: null });
        sum.restored += 1;
      } else if (editable(ex) && (ex.startTime !== s.startTime || ex.endTime !== s.endTime)) {
        await this.occurrences.update(ex.id, { startTime: s.startTime, endTime: s.endTime });
        sum.updated += 1;
      } else sum.kept += 1;
    }
    for (const o of all) {
      if (o.deleted || target.has(o.date)) continue;
      if (editable(o)) { await this.occurrences.remove(o.id); sum.removed += 1; } else sum.kept += 1;
    }
    this.changed({ type: 'occurrences', scheduleId });
    return sum;
  }

  get(id) { return this.schedules.get(id); }

  /** list({ category, search }) */
  list({ category, search } = {}) {
    const q = search?.trim().toLowerCase();
    return this.schedules.list({
      orderBy: 'startTime',
      predicate: (s) => (!category || category === 'All' || s.category === category)
        && (!q || [s.title, s.location, s.description].some((t) => t?.toLowerCase().includes(q))),
    });
  }

  /** Deleting a schedule also deletes its occurrences (history is kept as soft-deleted records). */
  async remove(id) {
    const removed = await this.schedules.remove(id);
    const occ = await this.occurrences.list({ where: { scheduleId: id } });
    await Promise.all(occ.map((o) => this.occurrences.remove(o.id)));
    this.changed({ type: 'remove', scheduleId: id });
    return removed;
  }

  /** Deletes ALL schedules, occurrences, and cancels all pending reminders. */
  async removeAll() {
    const [allSchedules, allOccurrences] = await Promise.all([
      this.schedules.list(),
      this.occurrences.list(),
    ]);
    await Promise.all([
      ...allOccurrences.map((o) => this.occurrences.remove(o.id)),
      ...allSchedules.map((s) => this.schedules.remove(s.id)),
    ]);
    this.changed({ type: 'clear' });
    return { schedules: allSchedules.length, occurrences: allOccurrences.length };
  }

  /** Safe to call repeatedly for the same schedule + date (deterministic id, no duplicates). */
  async addOccurrence(scheduleId, date) {
    const schedule = await this.schedules.require(scheduleId);
    const occurrence = await this.occurrences.getOrCreate(createOccurrence(schedule, date));
    this.changed({ type: 'occurrence', scheduleId, date });
    return occurrence;
  }

  /** listOccurrences({ date } | { from, to }, scheduleId) */
  async listOccurrences({ date, from, to, scheduleId } = {}) {
    const rows = await this.occurrences.list({
      where: scheduleId ? { scheduleId } : undefined,
      predicate: (o) => (date ? o.date === date : (!from || o.date >= from) && (!to || o.date <= to)),
    });
    return rows.sort(byDateTime);
  }

  async listHistory({ from, to, category, limit } = {}) {
    const [schedules, rows] = await Promise.all([this.schedules.list(), this.listOccurrences({ from, to })]);
    const byId = new Map(schedules.map((s) => [s.id, s]));
    const history = rows
      .filter((o) => (o.status === OCCURRENCE_STATUS.DONE || o.status === OCCURRENCE_STATUS.SKIPPED) && byId.has(o.scheduleId))
      .map((o) => ({ ...o, title: byId.get(o.scheduleId).title, category: byId.get(o.scheduleId).category }))
      .filter((o) => !category || category === 'All' || o.category === category)
      .sort((a, b) => byDateTime(b, a));
    return limit ? history.slice(0, limit) : history;
  }

  setOccurrenceStatus(id, status) {
    if (!Object.values(OCCURRENCE_STATUS).includes(status)) throw new AppError(ERROR_CODE.INVALID, 'Unknown status.', { status });
    return Promise.resolve(this.occurrences.update(id, { status, completedAt: status === OCCURRENCE_STATUS.DONE ? nowIso() : null }))
      .then((occurrence) => { this.changed({ type: 'status', occurrenceId: id, status }); return occurrence; });
  }
}