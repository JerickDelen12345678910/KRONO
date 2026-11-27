// src/lib/workoutForm.js
// Phase 9 PACE 3b — pure logic for the workout builder (no React, no storage): drafts, editing the exercise list,
// validation, conversion to what WorkoutService saves, and the texts of the picker / "My workouts" rows.
// The screens (WorkoutForm.jsx, MyWorkouts.jsx, ExerciseDetail.jsx) only render what this returns.
//
// A draft keeps every number as the TEXT the user typed (so a half-typed value is never rewritten under their
// fingers); draftToInput() turns it into numbers, and a value that is not a whole number becomes null, which
// validateWorkout() (src/models/workout.js) and itemErrors() below both reject.
//
// PACE 3c: a workout can be planned on the calendar by linking it to ONE of the user's schedules (`workout.scheduleId`,
// the link src/lib/fitness.js `plannedWorkouts` reads). One schedule plans one workout, so linking a schedule that
// already plans another workout asks first, and replaces it (see competingWorkouts / rivalsToUnlink).
import { WEEKDAY_NAMES, itemFromExercise, setsLabel } from './fitness.js';
import { createWorkout, createWorkoutItem, validateWorkout } from '../models/workout.js';

export const LIMITS = Object.freeze({ sets: [1, 50], reps: [1, 1000], seconds: [1, 7200], rest: [0, 3600] });   // sets/rest match validateWorkout
export const PICKER_LIMIT = 8;

const text = (v, fallback) => String(v ?? fallback);
/** A whole, non-negative number typed as text -> number; anything else (blank, "3.5", "-2", "abc") -> null. */
const toInt = (v) => { const s = String(v ?? '').trim(); return /^\d+$/.test(s) ? Number(s) : null; };
const inRange = (n, [min, max]) => n != null && n >= min && n <= max;
const rangeMessage = ([min, max]) => `Enter a whole number from ${min} to ${max}.`;

// ---- drafts ----
function draftItem(item, key) {
  return {
    key,                                                  // stable id for React lists, never saved
    exerciseId: item.exerciseId ?? null,
    name: item.name ?? '',
    sets: text(item.sets, 3),
    mode: item.reps == null && item.durationSec != null ? 'time' : 'reps',   // 'reps' | 'time' (seconds)
    reps: text(item.reps, 10),
    durationSec: text(item.durationSec, 30),
    restSec: text(item.restSec, 60),
  };
}

/** A new workout; with `exercise` it starts with that library exercise (the "Add to workout" action). */
export function emptyDraft({ exercise = null } = {}) {
  const base = { name: '', category: exercise?.category ?? 'Strength', notes: '', scheduleId: '', items: [], nextKey: 1 };
  return exercise ? addExercise(base, exercise) : base;
}

/** True when the workout points at a schedule that is not in `schedules` any more (deleted). */
export const isLinkLost = (w, schedules) => Boolean(w.scheduleId) && !schedules.some((s) => s.id === w.scheduleId);

/**
 * `schedules` (the user's current schedules) is optional: when given, a link to a schedule that no longer exists is dropped from
 * the draft ('' = not planned), so saving cleans it up instead of keeping a dead link.
 */
export function draftFromWorkout(w, schedules = null) {
  const items = (w.items ?? []).map((item, i) => draftItem(item, `i${i + 1}`));
  const scheduleId = w.scheduleId && !(schedules && isLinkLost(w, schedules)) ? w.scheduleId : '';
  return { name: w.name ?? '', category: w.category, notes: w.notes ?? '', scheduleId, items, nextKey: items.length + 1 };
}

// ---- editing the exercise list (each returns a NEW draft; an impossible move returns the same one) ----
export function addExercise(draft, exercise) {
  const item = draftItem(itemFromExercise(exercise), `i${draft.nextKey}`);
  return { ...draft, items: [...draft.items, item], nextKey: draft.nextKey + 1 };
}
export const updateItem = (draft, key, changes) => ({ ...draft, items: draft.items.map((i) => (i.key === key ? { ...i, ...changes } : i)) });
export const removeItem = (draft, key) => ({ ...draft, items: draft.items.filter((i) => i.key !== key) });
/** Move an exercise up (delta -1) or down (+1). */
export function moveItem(draft, key, delta) {
  const from = draft.items.findIndex((i) => i.key === key);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= draft.items.length) return draft;
  const items = [...draft.items];
  [items[from], items[to]] = [items[to], items[from]];
  return { ...draft, items };
}

// ---- saving ----
/** What WorkoutService.update takes: name, category, notes, the calendar link (`scheduleId`, null = not planned) and the items. */
export function draftToInput(draft) {
  return {
    name: draft.name.trim(),
    category: draft.category,
    notes: draft.notes.trim(),
    scheduleId: draft.scheduleId || null,
    items: draft.items.map((i) => createWorkoutItem({
      exerciseId: i.exerciseId, name: i.name,
      sets: toInt(i.sets),
      reps: i.mode === 'reps' ? toInt(i.reps) : null,
      durationSec: i.mode === 'time' ? toInt(i.durationSec) : null,
      restSec: toInt(i.restSec),
    })),
  };
}

/** A whole new record for WorkoutService.create (defaults filled in, so it works whatever the repository's factory does). */
export const draftToNewWorkout = (draft) => createWorkout(draftToInput(draft));

/** Messages for one exercise row: { sets?, amount?, restSec? } (empty object = fine). */
export function itemErrors(item) {
  const e = {};
  if (!inRange(toInt(item.sets), LIMITS.sets)) e.sets = rangeMessage(LIMITS.sets);
  if (item.mode === 'time') {
    if (!inRange(toInt(item.durationSec), LIMITS.seconds)) e.amount = rangeMessage(LIMITS.seconds);
  } else if (!inRange(toInt(item.reps), LIMITS.reps)) e.amount = rangeMessage(LIMITS.reps);
  if (!inRange(toInt(item.restSec), LIMITS.rest)) e.restSec = rangeMessage(LIMITS.rest);
  return e;
}

/** { valid, errors: { name?, category?, items? }, itemErrors: { [item.key]: {...} } } */
export function validateDraft(draft) {
  const errors = { ...validateWorkout(draftToInput(draft)).errors };
  const perItem = {};
  for (const item of draft.items) {
    const e = itemErrors(item);
    if (Object.keys(e).length > 0) perItem[item.key] = e;
  }
  if (Object.keys(perItem).length > 0) errors.items = 'Fix the highlighted exercises.';
  return { valid: Object.keys(errors).length === 0, errors, itemErrors: perItem };
}

/** The items of an existing workout plus one more library exercise (for "Add to workout" on the exercise detail). */
export const itemsWithExercise = (workout, exercise) => [...(workout.items ?? []).map((i) => ({ ...i })), itemFromExercise(exercise)];

// ---- the calendar link (PACE 3c) ----
const DAY_ABBR = WEEKDAY_NAMES.map((n) => n.slice(0, 3));
const shortDate = (date) => {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

/** When a schedule happens, short: "Mon, Wed" · "Every day" · "Every 3 days" · "Every 2 weeks · Tue" · "Nov 19" (one time). */
export function scheduleWhen(s) {
  const r = s.repeat;
  if (!r || r.type === 'none') return s.date ? shortDate(s.date) : '';
  if (r.type === 'daily') return r.interval > 1 ? `Every ${r.interval} days` : 'Every day';
  if (r.type === 'custom') return `Every ${r.interval} days`;
  const days = [...(r.daysOfWeek ?? [])].sort((a, b) => a - b).map((d) => DAY_ABBR[d]).filter(Boolean).join(', ') || 'Weekly';
  return r.interval > 1 ? `Every ${r.interval} weeks · ${days}` : days;
}

/** "Gym · Mon, Wed · 12:30 PM". `to12h` (lib/timeline.js) is passed in so this file stays free of the UI helpers. */
export const scheduleLabel = (s, to12h = (t) => t) => [s.title || 'Untitled schedule', scheduleWhen(s), s.startTime ? to12h(s.startTime) : ''].filter(Boolean).join(' · ');

/** The options of the "Schedule" select: '' = not planned, then one per schedule. */
export const scheduleOptions = (schedules, to12h) => [
  { value: '', label: 'Not planned on the calendar' },
  ...schedules.map((s) => ({ value: s.id, label: scheduleLabel(s, to12h) })),
];

/**
 * The OTHER workouts that `plannedWorkouts` already plans on this schedule: those whose `scheduleId` is it, or (only when no workout
 * claims it, exactly like plannedWorkouts) the one the schedule's own `linkedWorkoutId` names. `currentId` = the workout being saved.
 */
export function competingWorkouts({ scheduleId, workouts, schedules, currentId = null }) {
  if (!scheduleId) return [];
  const claimed = workouts.filter((w) => w.scheduleId === scheduleId);
  if (claimed.length > 0) return claimed.filter((w) => w.id !== currentId);
  const linked = schedules.find((s) => s.id === scheduleId)?.linkedWorkoutId;
  return linked && linked !== currentId ? workouts.filter((w) => w.id === linked) : [];
}

/** Of the rivals, the ones to unlink (set scheduleId to null). A rival that only the schedule's linkedWorkoutId names is overridden by ours: workout.scheduleId wins. */
export const rivalsToUnlink = (rivals, scheduleId) => rivals.filter((w) => w.scheduleId === scheduleId);

/** The confirmation before a new workout takes over a schedule. */
export function replaceMessage(rivals) {
  const one = rivals.length === 1;
  const names = rivals.map((w) => `“${w.name || 'Untitled workout'}”`).join(' and ');
  return `${names} ${one ? 'is' : 'are'} already planned on this schedule, and a schedule plans one workout. Replace ${one ? 'it' : 'them'} with this workout? ${one ? 'It' : 'They'} will stay in My workouts but leave the calendar.`;
}

// ---- texts ----
export const exerciseCountLabel = (n) => `${n} ${n === 1 ? 'exercise' : 'exercises'}`;

/** One picker row for a library exercise: "3×10" | name | "Strength · Beginner". */
export const pickerRow = (exercise) => ({
  id: exercise.id, amount: setsLabel(itemFromExercise(exercise)), title: exercise.name, subtitle: `${exercise.category} · ${exercise.difficulty}`,
});

/** The first `limit` library exercises as picker rows, and how many more there are. */
export function pickerResults(exercises, limit = PICKER_LIMIT) {
  return { rows: exercises.slice(0, limit).map(pickerRow), more: Math.max(0, exercises.length - limit) };
}

/** True when a workout has at least one exercise and can be started directly from My workouts. */
export const canStartWorkout = (w) => Array.isArray(w?.items) && w.items.length > 0;

/** One "My workouts" row: "4 ex" | name | "Strength · Scheduled". With `schedules`, a link to a deleted schedule does not count as Scheduled. */
export function workoutRow(w, schedules = null) {
  const n = w.items?.length ?? 0;
  const scheduled = Boolean(w.scheduleId) && !(schedules && isLinkLost(w, schedules));
  return {
    id: w.id, title: w.name || 'Untitled workout', amount: `${n} ex`,
    subtitle: [w.category, scheduled ? 'Scheduled' : null].filter(Boolean).join(' · '),
  };
}

/** The confirmation text before deleting a workout. */
export function deleteMessage(workout) {
  return `Delete “${workout?.name || 'this workout'}”? Your finished sessions stay in your history.${workout?.scheduleId ? ' Its schedule stays in your calendar.' : ''} This cannot be undone.`;
}