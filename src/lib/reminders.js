import { addDays, isDate, isTime, toLocalDateTime } from '../models/common.js';
import { OCCURRENCE_STATUS } from '../models/constants.js';
import { to12h } from './timeline.js';
import { normalizeAlarmSound } from '../reminders/alarmAudio.js';

export const REMINDER_MODE = Object.freeze({ NOTIFY: 'notify', ALARM: 'alarm', BOTH: 'both' });
export const SNOOZE_OPTIONS = Object.freeze([5, 10, 15]);
export const REMINDER_SOUNDS = Object.freeze([
  'chrono_chime', 'titan_pulse', 'atlas_radar', 'digital_rooster', 'zen_marimba', 'urgent_siren',
  'default', 'gentle', 'bright', 'custom',
]);
export const MAX_OFFSET_MINUTES = 10080;
export const PLAN_HORIZON_DAYS = 14;
export const PLAN_MAX_REMINDERS = 60;

export const DEFAULT_REMINDER_SETTINGS = Object.freeze({
  enabled: true, defaultOffsetMinutes: 15, defaultUseAlarm: true, sound: 'chrono_chime', snoozeMinutes: 10,
});

const NOW_FORMAT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const validOffset = (m) => Number.isInteger(m) && m >= 0 && m <= MAX_OFFSET_MINUTES;

export function normalizeReminderSettings(raw) {
  const r = raw ?? {};
  const d = DEFAULT_REMINDER_SETTINGS;
  return {
    enabled: typeof r.enabled === 'boolean' ? r.enabled : d.enabled,
    defaultOffsetMinutes: validOffset(r.defaultOffsetMinutes) ? r.defaultOffsetMinutes : d.defaultOffsetMinutes,
    defaultUseAlarm: typeof r.defaultUseAlarm === 'boolean' ? r.defaultUseAlarm : d.defaultUseAlarm,
    sound: REMINDER_SOUNDS.includes(r.sound) ? normalizeAlarmSound(r.sound) : d.sound,
    snoozeMinutes: SNOOZE_OPTIONS.includes(r.snoozeMinutes) ? r.snoozeMinutes : d.snoozeMinutes,
  };
}

export function defaultReminder(settings) {
  const s = normalizeReminderSettings(settings);
  return { enabled: true, offsetMinutes: s.defaultOffsetMinutes, useAlarm: s.defaultUseAlarm, sound: s.sound };
}

export const reminderMode = (reminder) => (reminder?.useAlarm ? REMINDER_MODE.BOTH : REMINDER_MODE.NOTIFY);

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

  const planned = new Map();
  for (const o of occurrences) {
    if (o.deleted || o.status !== OCCURRENCE_STATUS.SCHEDULED) continue;
    const schedule = byId.get(o.scheduleId);
    if (!schedule?.reminder?.enabled) continue;
    const fireAt = reminderFireAt(o.date, o.startTime, schedule.reminder.offsetMinutes);
    if (!fireAt || fireAt <= now || fireAt > horizonEnd) continue;
    const chosenSound = normalizeAlarmSound(schedule.reminder.sound || s.sound);
    planned.set(o.id, {
      id: o.id, occurrenceId: o.id, scheduleId: schedule.id, title: schedule.title, body: bodyOf(schedule, o),
      date: o.date, startTime: o.startTime, offsetMinutes: schedule.reminder.offsetMinutes, fireAt,
      mode: reminderMode(schedule.reminder), sound: chosenSound, snoozeMinutes: s.snoozeMinutes,
    });
  }
  return [...planned.values()].sort((a, b) => a.fireAt.localeCompare(b.fireAt) || a.id.localeCompare(b.id)).slice(0, limit);
}

const SIGNATURE = ['fireAt', 'mode', 'title', 'body', 'sound', 'snoozeMinutes'];
const signature = (r) => SIGNATURE.map((k) => String(r[k])).join('|');

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
