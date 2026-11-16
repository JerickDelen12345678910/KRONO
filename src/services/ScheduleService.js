import { OCCURRENCE_STATUS } from '../models/constants.js';
import { nowIso } from '../models/common.js';
import { createOccurrence } from '../models/schedule.js';
import { AppError, ERROR_CODE } from '../lib/errors.js';

const byDateTime = (a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`);

export class ScheduleService {
  constructor({ schedules, occurrences }) { this.schedules = schedules; this.occurrences = occurrences; }

  create(input) { return this.schedules.create(input); }
  update(id, changes, opts) { return this.schedules.update(id, changes, opts); }
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

  setOccurrenceStatus(id, status) {
    if (!Object.values(OCCURRENCE_STATUS).includes(status)) throw new AppError(ERROR_CODE.INVALID, 'Unknown status.', { status });
    return this.occurrences.update(id, { status, completedAt: status === OCCURRENCE_STATUS.DONE ? nowIso() : null });
  }
}
