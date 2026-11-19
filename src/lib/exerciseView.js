// src/lib/exerciseView.js
// Phase 9 PACE 3a — pure view logic for the exercise library and exercise detail screens (no UI, no storage):
// filter options, the filters <-> URL query string, row/detail texts. src/pages/ExerciseLibrary.jsx and
// ExerciseDetail.jsx only render what these return; scripts/check-exercise-view.mjs tests them against the real library.
//
// Filters live in the URL (?category=Core&difficulty=Beginner&q=plank) so "back" from an exercise returns to the same list.
// Nothing is invented: an exercise without reps or duration shows no "Suggested" fact, one without muscles shows no muscles.
import { DIFFICULTY, EXERCISE_CATEGORIES } from '../models/constants.js';

export const ALL = 'all';
export const MAX_QUERY_LENGTH = 60;

export const CATEGORY_OPTIONS = Object.freeze([{ value: ALL, label: 'All' }, ...EXERCISE_CATEGORIES.map((c) => ({ value: c, label: c }))]);
export const DIFFICULTY_OPTIONS = Object.freeze([{ value: ALL, label: 'Any level' }, ...DIFFICULTY.map((d) => ({ value: d, label: d }))]);
export const DEFAULT_FILTERS = Object.freeze({ category: ALL, difficulty: ALL, query: '' });

// ---- filters <-> URL ----
/** Filters from a URLSearchParams. An unknown category/difficulty falls back to "all"; the search text is kept as typed (a trailing space must survive typing). */
export function filtersFromParams(params) {
  const category = params?.get('category');
  const difficulty = params?.get('difficulty');
  return {
    category: EXERCISE_CATEGORIES.includes(category) ? category : ALL,
    difficulty: DIFFICULTY.includes(difficulty) ? difficulty : ALL,
    query: String(params?.get('q') ?? '').slice(0, MAX_QUERY_LENGTH),
  };
}

/** The URLSearchParams for some filters; default values are left out, so no filter = an empty query string. */
export function paramsFromFilters(filters) {
  const params = new URLSearchParams();
  if (filters?.category && filters.category !== ALL) params.set('category', filters.category);
  if (filters?.difficulty && filters.difficulty !== ALL) params.set('difficulty', filters.difficulty);
  if (filters?.query) params.set('q', filters.query.slice(0, MAX_QUERY_LENGTH));
  return params;
}

/** The filters in the shape `WorkoutService.listExercises` takes ("all" = no filter). */
export const serviceFilters = (filters) => ({
  category: filters.category === ALL ? undefined : filters.category,
  difficulty: filters.difficulty === ALL ? undefined : filters.difficulty,
  query: filters.query,
});

export const hasActiveFilters = (filters) => filters.category !== ALL || filters.difficulty !== ALL || filters.query.trim() !== '';

// ---- labels ----
/** "10 reps" · "1 rep" · "30 s" · "10 min" (same seconds/minutes threshold as restLabel). '' when the exercise has neither. */
export function amountLabel(exercise) {
  const reps = exercise?.suggestedReps;
  const seconds = exercise?.suggestedDurationSec;
  if (Number.isFinite(reps) && reps > 0) return reps === 1 ? '1 rep' : `${reps} reps`;
  if (Number.isFinite(seconds) && seconds > 0) {
    const s = Math.round(seconds);
    return s < 120 ? `${s} s` : `${Math.round(s / 60)} min`;
  }
  return '';
}

/** "30 exercises" (nothing filtered) · "5 of 30 exercises" · "No exercises". */
export function resultSummary(count, total) {
  if (count === 0) return 'No exercises';
  if (count === total) return `${total} ${total === 1 ? 'exercise' : 'exercises'}`;
  return `${count} of ${total} exercises`;
}

export function emptyResultText(filters) {
  const query = filters.query.trim();
  return query ? `No exercises match “${query}”.` : 'No exercises match these filters.';
}

// ---- rows and detail ----
/** One library list row: "10 reps" / "Push-ups" / "Strength · Chest · Shoulders" + a difficulty word (never colour alone). */
export const exerciseRow = (exercise) => ({
  id: exercise.id,
  amount: amountLabel(exercise),
  title: exercise.name,
  subtitle: [exercise.category, ...(exercise.targetMuscles ?? []).slice(0, 2)].join(' · '),
  difficulty: exercise.difficulty,
});

/** Everything the detail screen shows for one exercise. */
export function exerciseDetail(exercise) {
  const muscles = exercise.targetMuscles ?? [];
  const amount = amountLabel(exercise);
  const steps = [...(exercise.instructions ?? [])];
  return {
    id: exercise.id,
    name: exercise.name,
    category: exercise.category,
    difficulty: exercise.difficulty,
    description: exercise.description,
    facts: [
      { label: 'Difficulty', value: exercise.difficulty },
      ...(muscles.length > 0 ? [{ label: 'Target muscles', value: muscles.join(', ') }] : []),
      ...(amount ? [{ label: 'Suggested', value: amount }] : []),
    ],
    steps,
    stepsLabel: `${steps.length} ${steps.length === 1 ? 'step' : 'steps'}`,
  };
}

/** The "?…" string to go back to, from router state: only a real query string is accepted, anything else gives ''. */
export const backSearch = (state) => (typeof state?.search === 'string' && state.search.startsWith('?') ? state.search : '');