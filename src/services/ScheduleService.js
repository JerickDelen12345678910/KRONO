import { OCCURRENCE_STATUS } from '../models/constants.js';
import { nowIso } from '../models/common.js';
import { toLocalDate } from '../models/common.js';
import { createOccurrence } from '../models/schedule.js';
import { occurrenceDates, scheduleWindow } from '../lib/recurrence.js';
import { AppError, ERROR_CODE } from '../lib/errors.js';

const byDateTime = (a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`);

export class ScheduleService {
  /** `today` is injectable so tests (and a future "pretend date") are deterministic. */
  constructor({ schedules, occurrences }, { today = () => toLocalDate() } = {}) {
    this.schedules = schedules; this.occurrences = occurrences; this.today = today;
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

  /**
   * Make the stored occurrences match the schedule's rule. Idempotent, safe to call again.
   *  - missing dates are created; dates that were removed earlier are restored
   *  - scheduled occurrences that no longer match are removed, but only upcoming ones
   *    (one-time schedules move wholly); done / skipped / past ones are never touched
   *  - upcoming matching occurrences get the new start/end time
   * Returns { created, restored, updated, removed, kept }.
   */
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
    return removed;
  }

  /** Safe to call repeatedly for the same schedule + date (deterministic id, no duplicates). */
  async addOccurrence(scheduleId, date) {
    const schedule = await this.schedules.require(scheduleId);
    return this.occurrences.getOrCreate(createOccurrence(schedule, date));
  }

  /** listOccurrences({ date } | { from, to }, scheduleId) */
  async listOccurrences({ date, from, to, scheduleId } = {}) {
    const rows = await this.occurrences.list({
      where: scheduleId ? { scheduleId } : undefined,
      predicate: (o) => (date ? o.date === date : (!from || o.date >= from) && (!to || o.date <= to)),
    });
    return rows.sort(byDateTime);
  }

  /**
   * History = done + skipped occurrences, newest first. listHistory({ from, to, category, limit })
   * Each row is the occurrence plus its schedule's `title` and `category`; deleted schedules are left out.
   */
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
    return this.occurrences.update(id, { status, completedAt: status === OCCURRENCE_STATUS.DONE ? nowIso() : null });
  }
}