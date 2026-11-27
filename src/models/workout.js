import { DIFFICULTY, ENTRY_STATUS, EXERCISE_CATEGORIES, SESSION_STATUS } from './constants.js';
import { createBase, isInt, isNonEmpty, nowIso, result } from './common.js';

/** Exercise library item. */
export const createExercise = (o = {}) => ({
  ...createBase(), name: '', category: 'Strength', description: '', instructions: [], difficulty: 'Beginner',
  targetMuscles: [], suggestedReps: null, suggestedDurationSec: null, mediaUrl: null, ...o,
});

export const createWorkoutItem = (o = {}) => ({ exerciseId: null, name: '', sets: 3, reps: 10, durationSec: null, restSec: 60, ...o });

/** A custom routine (plan). Optionally linked to a schedule so it appears on the calendar. */
export const createWorkout = (o = {}) => ({
  ...createBase(), name: '', category: 'Strength', items: [], scheduleId: null, notes: '', ...o,
});

/** A completed or running session; saved to exerciseHistory. */
export const createWorkoutSession = (workout, o = {}) => ({
  ...createBase(), workoutId: workout.id, workoutName: workout.name, scheduleId: workout.scheduleId ?? null, occurrenceId: null,
  startedAt: nowIso(), endedAt: null, status: SESSION_STATUS.IN_PROGRESS, activeSeconds: 0,
  pausedAt: null, pausedSeconds: 0,
  entries: workout.items.map((i) => ({ exerciseId: i.exerciseId, name: i.name, status: ENTRY_STATUS.PENDING, sets: [] })), // sets: [{ reps, durationSec }]
  ...o,
});

export function validateWorkout(w) {
  const e = {};
  if (!isNonEmpty(w.name)) e.name = 'Workout name is required.';
  if (!EXERCISE_CATEGORIES.includes(w.category)) e.category = 'Choose a category.';
  if (!Array.isArray(w.items) || w.items.length === 0) e.items = 'Add at least one exercise.';
  else if (w.items.some((i) => !isInt(i.sets, 1, 50) || !isInt(i.restSec, 0, 3600) || (i.reps == null && i.durationSec == null))) {
    e.items = 'Each exercise needs sets, rest time, and reps or duration.';
  }
  return result(e);
}

export function validateExercise(x) {
  const e = {};
  if (!isNonEmpty(x.name)) e.name = 'Exercise name is required.';
  if (!EXERCISE_CATEGORIES.includes(x.category)) e.category = 'Choose a category.';
  if (!DIFFICULTY.includes(x.difficulty)) e.difficulty = 'Choose a difficulty.';
  return result(e);
}