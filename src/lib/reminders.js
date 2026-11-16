// Pure reminder planning (no React, no storage, no platform). Phase 5 PACE 1.
// Turns schedules + their dated occurrences + the global reminder settings into the list of reminders that SHOULD exist
// right now, and compares that list with what is already scheduled. A platform adapter (later PACEs) does the real
// scheduling: it only needs to schedule `diff.schedule` and cancel `diff.cancel`.
//
// RULES
//  - one reminder per occurrence; its id IS the occurrence id (`${scheduleId}_${date}`), so a retry or a re-plan can never duplicate it
//  - fires at (occurrence date + start time) minus the schedule's reminder offset, in local time ('YYYY-MM-DDTHH:mm')
//  - only occurrences that are still `scheduled` (not done / skipped / cancelled / deleted), whose schedule exists and has its reminder on
//  - the global switch off -> no reminders at all; the schedules themselves are never touched
//  - only the next `horizonDays` days and at most `max` reminders are planned (a rolling window: Android limits how many can be pending);
//    re-plan on app start / device restart / any change to restore or refresh the window
//  - mode: the schedule's `useAlarm` decides: true -> notification + alarm ("both"), false -> notification only
import { addDays, isDate, isTime, toLocalDateTime } from '../models/common.js';
import { OCCURRENCE_STATUS } from '../models/constants.js';
import { to12h } from './timeline.js';

export const REMINDER_MODE = Object.freeze({ NOTIFY: 'notify', ALARM: 'alarm', BOTH: 'both' });   // ALARM (alarm only) needs a model change: not used yet
export const SNOOZE_OPTIONS = Object.freeze([5, 10, 15]);
export const REMINDER_SOUNDS = Object.freeze(['default', 'gentle', 'bright']);   // names only; real audio, preview and volume are native (later)
export const MAX_OFFSET_MINUTES = 10080;                                          // same limit as validateSchedule
export const PLAN_HORIZON_DAYS = 14;
export const PLAN_MAX_REMINDERS = 60;

export const DEFAULT_REMINDER_SETTINGS = Object.freeze({
  enabled: true, defaultOffsetMinutes: 15, defaultUseAlarm: true, sound: 'default', snoozeMinutes: 10,
});

const NOW_FORMAT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const validOffset = (m) => Number.isInteger(m) && m >= 0 && m <= MAX_OFFSET_MINUTES;

/** Global reminder settings: unknown keys dropped, bad values replaced by the defaults. Always returns a new plain object. */
export function normalizeReminderSettings(raw) {
  const r = raw ?? {};
  const d = DEFAULT_REMINDER_SETTINGS;
  return {
    enabled: typeof r.enabled === 'boolean' ? r.enabled : d.enabled,
    defaultOffsetMinutes: validOffset(r.defaultOffsetMinutes) ? r.defaultOffsetMinutes : d.defaultOffsetMinutes,
    defaultUseAlarm: typeof r.defaultUseAlarm === 'boolean' ? r.defaultUseAlarm : d.defaultUseAlarm,
    sound: REMINDER_SOUNDS.includes(r.sound) ? r.sound : d.sound,
    snoozeMinutes: SNOOZE_OPTIONS.includes(r.snoozeMinutes) ? r.snoozeMinutes : d.snoozeMinutes,
  };
}

/** The reminder a NEW schedule starts with (same shape as createReminder()). */
export function defaultReminder(settings) {
  const s = normalizeReminderSettings(settings);
  return { enabled: true, offsetMinutes: s.defaultOffsetMinutes, useAlarm: s.defaultUseAlarm };
}

export const reminderMode = (reminder) => (reminder?.useAlarm ? REMINDER_MODE.BOTH : REMINDER_MODE.NOTIFY);

/** Local 'YYYY-MM-DDTHH:mm' when the reminder fires, or null when the date, time or offset is not valid. */
export function reminderFireAt(date, startTime, offsetMinutes) {
  if (!isDate(date) || !isTime(startTime) || !validOffset(offsetMinutes)) return null;
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = startTime.split(':').map(Number);
  return toLocalDateTime(new Date(y, m - 1, d, hh, mm - offsetMinutes));
}

const bodyOf = (schedule, occurrence) => {
  const place = typeof schedule.location === 'string' ? schedule.location.trim() : '';
  return [`Starts at ${to12h(occurrence.startTime)}`, place].filter(Boolean).join(' · ');
};

/**
 * The reminders that should be pending now, sorted by fire time (then id).
 * `now` is 'YYYY-MM-DDTHH:mm' (injectable for tests); a reminder whose time is not after `now` is a missed one and is left out.
 * Inputs are never changed.
 */
export function buildReminders({
  schedules = [], occurrences = [], settings, now = toLocalDateTime(), horizonDays = PLAN_HORIZON_DAYS, max = PLAN_MAX_REMINDERS,
} = {}) {
  if (!NOW_FORMAT.test(now)) throw new TypeError('buildReminders: `now` must look like 2026-11-16T07:00');
  const s = normalizeReminderSettings(settings);
  if (!s.enabled) return [];
  const days = Number.isInteger(horizonDays) && horizonDays >= 0 ? horizonDays : PLAN_HORIZON_DAYS;
  const limit = Number.isInteger(max) && max >= 0 ? max : PLAN_MAX_REMINDERS;
  const horizonEnd = `${addDays(now.slice(0, 10), days)}${now.slice(10)}`;
  const byId = new Map(schedules.filter((x) => !x.deleted).map((x) => [x.id, x]));

  const planned = new Map();   // keyed by id: the same occurrence can never produce two reminders
  for (const o of occurrences) {
    if (o.deleted || o.status !== OCCURRENCE_STATUS.SCHEDULED) continue;
    const schedule = byId.get(o.scheduleId);
    if (!schedule?.reminder?.enabled) continue;
    const fireAt = reminderFireAt(o.date, o.startTime, schedule.reminder.offsetMinutes);
    if (!fireAt || fireAt <= now || fireAt > horizonEnd) continue;
    planned.set(o.id, {
      id: o.id, occurrenceId: o.id, scheduleId: schedule.id, title: schedule.title, body: bodyOf(schedule, o),
      date: o.date, startTime: o.startTime, offsetMinutes: schedule.reminder.offsetMinutes, fireAt,
      mode: reminderMode(schedule.reminder), sound: s.sound, snoozeMinutes: s.snoozeMinutes,
    });
  }
  return [...planned.values()].sort((a, b) => a.fireAt.localeCompare(b.fireAt) || a.id.localeCompare(b.id)).slice(0, limit);
}

const SIGNATURE = ['fireAt', 'mode', 'title', 'body', 'sound', 'snoozeMinutes'];
const signature = (r) => SIGNATURE.map((k) => String(r[k])).join('|');

/**
 * Compare what is scheduled (`current`) with what should be (`next`), both lists of planned reminders.
 *  schedule: new or changed reminders (scheduling a reminder with an existing id REPLACES it, so no duplicates)
 *  cancel:   ids that are scheduled but no longer wanted (done, skipped, deleted, reminder turned off, outside the window)
 *  keep:     ids that are already correct (nothing to do)
 */
export function diffReminders(current = [], next = []) {
  const have = new Map(current.map((r) => [r.id, r]));
  const want = new Set(next.map((r) => r.id));
  const schedule = [];
  const keep = [];
  for (const r of next) {
    const old = have.get(r.id);
    if (old && signature(old) === signature(r)) keep.push(r.id);
    else schedule.push(r);
  }
  const cancel = current.filter((r) => !want.has(r.id)).map((r) => r.id);
  return { schedule, cancel, keep };
}