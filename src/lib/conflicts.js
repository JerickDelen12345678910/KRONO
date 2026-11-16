// Conflict warning for the schedule form. Pure (no React, no storage). A conflict is only ever a WARNING: saving is never blocked.
import { ACTIVITY_STATUS } from '../models/constants.js';
import { isTime } from '../models/common.js';
import { occurrenceDates } from './recurrence.js';
import { dateOf, timeOf, to12h, toMinutes } from './timeline.js';

export const MAX_SHOWN = 3;   // how many conflicts the banner lists before "and N more"
const IGNORED = new Set([ACTIVITY_STATUS.CANCELLED, ACTIVITY_STATUS.SKIPPED]);   // done items still occupied that time
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Every date the draft would occupy; [] while the draft is incomplete (bad times, missing date, empty range). */
function draftDates(input) {
  if (!isTime(input.startTime) || !isTime(input.endTime) || input.endTime <= input.startTime) return [];
  return occurrenceDates(input);
}

/** First..last date the draft covers (what the form must load existing items for), or null when there is nothing to check. */
export function conflictRange(input) {
  const dates = draftDates(input);
  return dates.length ? { from: dates[0], to: dates[dates.length - 1] } : null;
}

/**
 * Existing activities that overlap the draft on any of its dates.
 *  - `input` is what draftToInput() returns; `existing` comes from activity.list({ from, to })
 *  - cancelled / skipped items and items without an end time are ignored
 *  - `ignoreScheduleId` skips the schedule being edited, so it never conflicts with itself
 * Returns [{ date, startTime, endTime, title, activityId }] sorted by date then time.
 */
export function findConflicts(input, existing, { ignoreScheduleId = null } = {}) {
  const dates = new Set(draftDates(input));
  if (dates.size === 0) return [];
  const start = toMinutes(input.startTime);
  const end = toMinutes(input.endTime);
  const out = [];
  for (const a of existing) {
    if (IGNORED.has(a.status) || !a.startsAt || !a.endsAt) continue;
    if (ignoreScheduleId && a.refs?.scheduleId === ignoreScheduleId) continue;
    const date = dateOf(a.startsAt);
    if (!dates.has(date)) continue;
    const aStart = toMinutes(timeOf(a.startsAt));
    const aEnd = dateOf(a.endsAt) > date ? 24 * 60 : toMinutes(timeOf(a.endsAt));   // runs past midnight -> until end of day
    if (start < aEnd && aStart < end) out.push({ date, startTime: timeOf(a.startsAt), endTime: timeOf(a.endsAt), title: a.title, activityId: a.id });
  }
  return out.sort((x, y) => `${x.date}${x.startTime}`.localeCompare(`${y.date}${y.startTime}`));
}

/** 'YYYY-MM-DD' -> 'Nov 12' (fixed English, no locale surprises). */
export const conflictDate = (d) => `${MONTHS[Number(d.slice(5, 7)) - 1]} ${Number(d.slice(8, 10))}`;

/** Banner text: up to `limit` conflicts (title, date, time), then "and N more". Empty string when there are none. */
export function conflictMessage(conflicts, limit = MAX_SHOWN) {
  if (conflicts.length === 0) return '';
  const shown = conflicts.slice(0, limit).map((c) => `${c.title} (${conflictDate(c.date)}, ${to12h(c.startTime)}–${to12h(c.endTime)})`);
  const rest = conflicts.length - shown.length;
  return `This overlaps with ${shown.join('; ')}${rest > 0 ? ` and ${rest} more` : ''}. You can still save.`;
}