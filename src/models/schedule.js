import {
  CATEGORIES, CATEGORY_COLOR, OCCURRENCE_STATUS, PRIORITY, REPEAT_TYPE, SCHEDULE_COLORS,
} from './constants.js';
import { createBase, isDate, isInt, isNonEmpty, isTime, result } from './common.js';

export const createRepeatRule = (o = {}) => ({
  type: REPEAT_TYPE.NONE, interval: 1, daysOfWeek: [], startDate: null, endDate: null, ...o, // daysOfWeek: 0=Sun..6=Sat
});
export const createReminder = (o = {}) => ({ enabled: true, offsetMinutes: 15, useAlarm: true, ...o });

/**
 * Schedule DEFINITION. One-time items use `date`; repeating items use repeat.startDate/endDate.
 * Dated occurrences (completion/history) live in createOccurrence.
 */
export function createSchedule(o = {}) {
  const category = o.category ?? 'Personal';
  return {
    ...createBase(), title: '', category, description: '', date: null, startTime: '', endTime: '', location: '',
    color: CATEGORY_COLOR[category], priority: null, academicPeriodId: null, subjectId: null, linkedWorkoutId: null,
    destinationId: null,
    ...o, reminder: createReminder(o.reminder), repeat: createRepeatRule(o.repeat),
  };
}

/** One dated instance of a schedule. The id is deterministic, so a retried create can never duplicate it. */
export function createOccurrence(schedule, date, o = {}) {
  return {
    ...createBase(), id: `${schedule.id}_${date}`, scheduleId: schedule.id, date,
    startTime: schedule.startTime, endTime: schedule.endTime,
    status: OCCURRENCE_STATUS.SCHEDULED, completedAt: null, note: '', ...o,
  };
}

export function validateSchedule(s) {
  const e = {};
  if (!isNonEmpty(s.title)) e.title = 'Title is required.';
  else if (s.title.length > 120) e.title = 'Keep the title under 120 characters.';
  if (!CATEGORIES.includes(s.category)) e.category = 'Choose a category.';
  if (!isTime(s.startTime)) e.startTime = 'Use a time like 08:00.';
  if (!isTime(s.endTime)) e.endTime = 'Use a time like 09:30.';
  else if (isTime(s.startTime) && s.endTime <= s.startTime) e.endTime = 'End time must be after the start time.';
  if (s.priority != null && !PRIORITY.includes(s.priority)) e.priority = 'Invalid priority.';
  if (!SCHEDULE_COLORS.includes(s.color)) e.color = 'Invalid color.';
  if (s.destinationId != null && typeof s.destinationId !== 'string') e.destinationId = 'Invalid destination.';

  const r = s.repeat ?? {};
  if (r.type === REPEAT_TYPE.NONE) {
    if (!isDate(s.date)) e.date = 'Pick a date.';
  } else {
    if (!Object.values(REPEAT_TYPE).includes(r.type)) e.repeat = 'Invalid repeat type.';
    if (!isDate(r.startDate)) e.repeatStart = 'Pick a start date.';
    if (!isDate(r.endDate)) e.repeatEnd = 'Pick an end date.';
    else if (isDate(r.startDate) && r.endDate < r.startDate) e.repeatEnd = 'End date must be on or after the start date.';
    if (!isInt(r.interval, 1, 365)) e.interval = 'Interval must be 1 or more.';
    if (r.type === REPEAT_TYPE.SELECTED_DAYS && (!Array.isArray(r.daysOfWeek) || r.daysOfWeek.length === 0 || r.daysOfWeek.some((d) => !isInt(d, 0, 6)))) {
      e.daysOfWeek = 'Pick at least one day.';
    }
  }
  if (s.reminder?.enabled && !isInt(s.reminder.offsetMinutes, 0, 10080)) e.reminder = 'Reminder time is not valid.';
  return result(e);
}

export function validateOccurrence(o) {
  const e = {};
  if (!isNonEmpty(o.scheduleId)) e.scheduleId = 'Missing schedule.';
  if (!isDate(o.date)) e.date = 'Pick a date.';
  if (!Object.values(OCCURRENCE_STATUS).includes(o.status)) e.status = 'Invalid status.';
  return result(e);
}