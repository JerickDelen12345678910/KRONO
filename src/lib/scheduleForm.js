// Pure helpers for the add/edit schedule form (no React): drafts, repeat defaults, conversion to the service input.
import { addDays, toLocalDate } from '../models/common.js';
import { CATEGORY_COLOR } from '../models/constants.js';
import { createReminder, createRepeatRule, validateSchedule } from '../models/schedule.js';
import { occurrenceDates } from './recurrence.js';

export const SEMESTER_DAYS = 112;   // default length of a repeating schedule: 16 weeks

const weekdayOf = (d) => { const [y, m, day] = d.split('-').map(Number); return new Date(y, m - 1, day).getDay(); };

/** `reminder` defaults to createReminder() for backward compatibility; ScheduleForm.jsx passes defaultReminder(settings) for a NEW schedule. */
export function emptyDraft({ date = toLocalDate(), reminder = createReminder() } = {}) {
  return {
    title: '', category: 'Personal', description: '', location: '', destinationId: null, date,
    startTime: '08:00', endTime: '09:00', repeat: createRepeatRule(), reminder,
  };
}

export function draftFromSchedule(s) {
  return {
    title: s.title, category: s.category, description: s.description ?? '', location: s.location ?? '',
    destinationId: s.destinationId ?? null, date: s.date,
    startTime: s.startTime, endTime: s.endTime,
    repeat: { ...createRepeatRule(), ...s.repeat, daysOfWeek: [...(s.repeat?.daysOfWeek ?? [])] },
    reminder: { ...createReminder(), ...s.reminder },
  };
}

/** Switch the repeat type and fill sensible defaults (start date, 16-week end date, weekday of the start date). */
export function setRepeatType(draft, type) {
  if (type === 'none') {
    return { ...draft, date: draft.date ?? draft.repeat.startDate ?? toLocalDate(), repeat: createRepeatRule() };
  }
  const startDate = draft.repeat.startDate ?? draft.date ?? toLocalDate();
  const weekly = type === 'weekly' || type === 'selectedDays';
  const daysOfWeek = weekly ? (draft.repeat.daysOfWeek.length ? draft.repeat.daysOfWeek : [weekdayOf(startDate)]) : [];
  return { ...draft, repeat: { ...createRepeatRule(), ...draft.repeat, type, startDate, endDate: draft.repeat.endDate ?? addDays(startDate, SEMESTER_DAYS), daysOfWeek } };
}

export function toggleDay(draft, day) {
  const has = draft.repeat.daysOfWeek.includes(day);
  const daysOfWeek = (has ? draft.repeat.daysOfWeek.filter((d) => d !== day) : [...draft.repeat.daysOfWeek, day]).sort((a, b) => a - b);
  return { ...draft, repeat: { ...draft.repeat, daysOfWeek } };
}

/** What we send to ScheduleService.create/update. Repeating schedules have no single `date`. */
export function draftToInput(draft) {
  const repeating = draft.repeat.type !== 'none';
  return {
    title: draft.title.trim(),
    category: draft.category,
    color: CATEGORY_COLOR[draft.category],
    description: draft.description.trim(),
    location: draft.location.trim(),
    destinationId: draft.destinationId || null,
    date: repeating ? null : draft.date || null,
    startTime: draft.startTime,
    endTime: draft.endTime,
    reminder: { ...draft.reminder, offsetMinutes: Number(draft.reminder.offsetMinutes) },
    repeat: repeating
      ? { ...draft.repeat, interval: Number(draft.repeat.interval) || 0, daysOfWeek: [...draft.repeat.daysOfWeek].sort((a, b) => a - b) }
      : createRepeatRule(),
  };
}

export const validateDraft = (draft) => validateSchedule(draftToInput(draft));

/** Which day the Scheduler should show after saving: the date itself, or the next occurrence (else the start). */
export function focusDate(schedule, today = toLocalDate()) {
  if (!schedule.repeat || schedule.repeat.type === 'none') return schedule.date;
  return occurrenceDates(schedule, { from: today })[0] ?? schedule.repeat.startDate;
}