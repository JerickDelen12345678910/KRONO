import { ACTIVITY_STATUS } from '../models/constants.js';
import { addDays, toLocalDate, toLocalDateTime } from '../models/common.js';
import { activityFromOccurrence, activityFromSession } from '../models/activityMappers.js';

const byStart = (a, b) => (a.startsAt ?? '').localeCompare(b.startsAt ?? '');

/** Read-only view for the dashboard: combines schedule occurrences and workout sessions into one timeline. */
export class ActivityService {
  constructor({ schedules, occurrences, exerciseHistory }) {
    this.schedules = schedules; this.occurrences = occurrences; this.history = exerciseHistory;
  }

  /** list({ from, to, module, category, status }) — from/to are 'YYYY-MM-DD' (inclusive). */
  async list({ from, to, module, category, status } = {}) {
    const [schedules, occurrences, sessions] = await Promise.all([
      this.schedules.list(),
      this.occurrences.list({ predicate: (o) => (!from || o.date >= from) && (!to || o.date <= to) }),
      this.history.list(),
    ]);
    const byId = new Map(schedules.map((s) => [s.id, s]));
    const items = [
      ...occurrences.filter((o) => byId.has(o.scheduleId)).map((o) => activityFromOccurrence(byId.get(o.scheduleId), o)),
      ...sessions.map(activityFromSession).filter((a) => (!from || a.startsAt.slice(0, 10) >= from) && (!to || a.startsAt.slice(0, 10) <= to)),
    ];
    return items
      .filter((a) => (!module || a.module === module) && (!category || a.category === category) && (!status || a.status === status))
      .sort(byStart);
  }

  listToday({ today = toLocalDate(), ...filters } = {}) {
    return this.list({ from: today, to: today, ...filters });
  }

  /** Not-yet-done items starting from `now`, within `days` days. Newest data first is NOT used: soonest first. */
  async listUpcoming({ now = new Date(), days = 7, limit, ...filters } = {}) {
    const nowKey = toLocalDateTime(now);
    const rows = (await this.list({ from: toLocalDate(now), to: addDays(toLocalDate(now), days), ...filters }))
      .filter((a) => [ACTIVITY_STATUS.SCHEDULED, ACTIVITY_STATUS.IN_PROGRESS].includes(a.status) && a.startsAt >= nowKey);
    return limit ? rows.slice(0, limit) : rows;
  }
}
