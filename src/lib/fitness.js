// src/lib/fitness.js
// Phase 9 PACE 1 — pure Fitness logic (no UI, no storage): labels, week/month ranges, progress series, streaks,
// weekly stats and "which workouts are planned when". The Fitness screens only render what these return.
//
// Rules this file follows (see AGENTS.md "Fitness"):
// - A session's day is its LOCAL date (the user's clock), never the UTC date in `startedAt`.
// - Weeks run Monday..Sunday (design preview: "Week of November 9" is a Monday).
// - The weekly GOAL is the number of workouts the user has PLANNED that week: occurrences of schedules linked to a
//   workout. With nothing planned there is no goal (null) — a number is never invented.
import { addDays, toLocalDate } from '../models/common.js';
import { createWorkoutItem } from '../models/workout.js';
import { OCCURRENCE_STATUS, SESSION_STATUS } from '../models/constants.js';

export const WEEKDAY_NAMES = Object.freeze(['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']);

const p2 = (n) => String(n).padStart(2, '0');
const parseDate = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };

// ---- labels ----
/** 45 min · 3h 40m · 1h · 0 min. Rounded to the minute; anything above zero shows at least 1 min. */
export function durationLabel(seconds) {
  const sec = Math.max(0, Number(seconds) || 0);
  let minutes = Math.round(sec / 60);
  if (sec > 0 && minutes === 0) minutes = 1;
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

const holdLabel = (sec) => (sec < 120 ? `${sec}s` : `${Math.round(sec / 60)} min`);

/** "3×12" for reps, "3×45s" for a timed hold, "1×10 min" for a long one — the Today's workout row. */
export function setsLabel(item) {
  const sets = item?.sets ?? 1;
  if (item?.reps != null) return `${sets}×${item.reps}`;
  if (item?.durationSec != null) return `${sets}×${holdLabel(item.durationSec)}`;
  return `${sets}×`;
}

/** "Rest 60 s" · "Rest 2 min" · "No rest". */
export function restLabel(seconds) {
  const sec = Number(seconds) || 0;
  if (sec <= 0) return 'No rest';
  return sec < 120 ? `Rest ${sec} s` : `Rest ${Math.round(sec / 60)} min`;
}

// ---- building a workout from the library ----
const REST_BY_CATEGORY = Object.freeze({ Cardio: 30, Strength: 60, Core: 45, Flexibility: 15, Mobility: 15, Recovery: 15 });

/** A workout item for an exercise: 3 sets (1 for a long timed exercise), its suggested reps or duration, a category-based rest. */
export function itemFromExercise(exercise, overrides = {}) {
  const reps = exercise.suggestedReps ?? null;
  const durationSec = exercise.suggestedDurationSec ?? null;
  const long = reps == null && durationSec != null && durationSec >= 300;
  return createWorkoutItem({
    exerciseId: exercise.id, name: exercise.name,
    sets: long ? 1 : 3,
    reps: reps ?? (durationSec == null ? 10 : null),
    durationSec,
    restSec: long ? 0 : (REST_BY_CATEGORY[exercise.category] ?? 60),
    ...overrides,
  });
}

// ---- dates ----
export const weekdayName = (date) => WEEKDAY_NAMES[parseDate(date).getDay()];
/** Monday of the week containing `date` ('YYYY-MM-DD'). */
export const weekStart = (date) => addDays(date, -((parseDate(date).getDay() + 6) % 7));
export const weekEnd = (date) => addDays(weekStart(date), 6);
/** First and last day of the month containing `date`. */
export function monthRange(date) {
  const [y, m] = date.split('-').map(Number);
  return { from: `${y}-${p2(m)}-01`, to: toLocalDate(new Date(y, m, 0)) };
}
/** Every date from `from` to `to`, inclusive ([] when from is after to). */
export function datesBetween(from, to) {
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

// ---- sessions ----
/** The LOCAL 'YYYY-MM-DD' a session started on, or null when startedAt is missing or invalid. */
export function sessionDate(session) {
  const t = new Date(session?.startedAt);
  return Number.isNaN(t.getTime()) ? null : toLocalDate(t);
}

const completed = (sessions) => (sessions ?? []).filter((s) => s?.status === SESSION_STATUS.COMPLETED);
const seconds = (s) => Math.max(0, Number(s.activeSeconds) || 0);

/** One point per day from `from` to `to`: { date, seconds, minutes, workouts } — completed sessions only. The data for a line chart. */
export function dailySeries(sessions, from, to) {
  const byDay = new Map();
  for (const s of completed(sessions)) {
    const date = sessionDate(s);
    if (!date || date < from || date > to) continue;
    const cur = byDay.get(date) ?? { seconds: 0, workouts: 0 };
    cur.seconds += seconds(s);
    cur.workouts += 1;
    byDay.set(date, cur);
  }
  return datesBetween(from, to).map((date) => {
    const v = byDay.get(date) ?? { seconds: 0, workouts: 0 };
    return { date, seconds: v.seconds, minutes: Math.round(v.seconds / 60), workouts: v.workouts };
  });
}

/** One point per week for the `weeks` weeks ending with the week of `endDate`: { weekStart, seconds, minutes, workouts }. A monthly trend line. */
export function weeklySeries(sessions, endDate, weeks = 6) {
  const lastStart = weekStart(endDate);
  const out = [];
  for (let i = weeks - 1; i >= 0; i -= 1) {
    const start = addDays(lastStart, -7 * i);
    const days = dailySeries(sessions, start, addDays(start, 6));
    const secs = days.reduce((t, d) => t + d.seconds, 0);
    out.push({ weekStart: start, seconds: secs, minutes: Math.round(secs / 60), workouts: days.reduce((t, d) => t + d.workouts, 0) });
  }
  return out;
}

/**
 * Day streak: `current` counts back from today (or from yesterday while today has no workout yet, so the streak
 * is not lost before the day is over); `best` is the longest run of consecutive days in all of history.
 */
export function streaks(sessions, today) {
  const days = new Set();
  for (const s of completed(sessions)) {
    const d = sessionDate(s);
    if (d && d <= today) days.add(d);
  }
  let current = 0;
  for (let d = days.has(today) ? today : addDays(today, -1); days.has(d); d = addDays(d, -1)) current += 1;
  let best = 0;
  let run = 0;
  let prev = null;
  for (const d of [...days].sort()) {
    run = prev && addDays(prev, 1) === d ? run + 1 : 1;
    if (run > best) best = run;
    prev = d;
  }
  return { current, best };
}

/**
 * The Fitness KPI row for the week containing `today`.
 * `planned` = how many workouts are planned that week (the goal); null goal when nothing is planned.
 * changePct compares active time with the previous week (null when last week had none).
 */
export function weeklyStats({ sessions, planned = 0, today }) {
  const start = weekStart(today);
  const end = addDays(start, 6);
  const days = dailySeries(sessions, start, end);
  const previous = dailySeries(sessions, addDays(start, -7), addDays(start, -1));
  const sum = (rows, key) => rows.reduce((t, r) => t + r[key], 0);
  const activeSeconds = sum(days, 'seconds');
  const previousActiveSeconds = sum(previous, 'seconds');
  const workouts = sum(days, 'workouts');
  const top = days.reduce((b, r) => (r.seconds > 0 && (!b || r.seconds > b.seconds) ? r : b), null);
  const { current, best } = streaks(sessions, today);
  return {
    weekStart: start,
    weekEnd: end,
    workouts,
    goal: planned > 0 ? planned : null,
    goalReached: planned > 0 && workouts >= planned,
    activeSeconds,
    previousActiveSeconds,
    changePct: previousActiveSeconds > 0 ? Math.round(((activeSeconds - previousActiveSeconds) / previousActiveSeconds) * 100) : null,
    streak: current,
    bestStreak: best,
    isPersonalBest: current > 0 && current >= best,
    bestDay: top ? { date: top.date, weekday: weekdayName(top.date), seconds: top.seconds } : null,
    days,
  };
}

// ---- the user's workout program: workouts planned on the calendar ----
/**
 * Joins workouts to the schedule occurrences that plan them. A workout is planned by a schedule when
 * `workout.scheduleId` is that schedule, or (if the workout has no scheduleId match) when the schedule's
 * `linkedWorkoutId` is the workout. Cancelled occurrences, and occurrences of schedules that no longer exist,
 * are left out. Sorted by date then start time.
 */
export function plannedWorkouts({ workouts = [], schedules = [], occurrences = [] }) {
  const workoutById = new Map(workouts.map((w) => [w.id, w]));
  const scheduleIds = new Set(schedules.map((s) => s.id));
  const bySchedule = new Map();
  for (const w of workouts) if (w.scheduleId) bySchedule.set(w.scheduleId, w);
  for (const s of schedules) {
    if (s.linkedWorkoutId && !bySchedule.has(s.id) && workoutById.has(s.linkedWorkoutId)) bySchedule.set(s.id, workoutById.get(s.linkedWorkoutId));
  }
  return occurrences
    .filter((o) => o.status !== OCCURRENCE_STATUS.CANCELLED && scheduleIds.has(o.scheduleId) && bySchedule.has(o.scheduleId))
    .map((o) => ({
      occurrenceId: o.id, scheduleId: o.scheduleId, date: o.date, startTime: o.startTime, endTime: o.endTime,
      status: o.status, workout: bySchedule.get(o.scheduleId),
    }))
    .sort((a, b) => `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`));
}