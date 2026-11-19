// Phase 9 PACE 3a — checks for src/lib/exerciseView.js, run against the REAL built-in exercise library.
import assert from 'node:assert/strict';
import { DIFFICULTY, EXERCISE_CATEGORIES } from '../src/models/constants.js';
import { EXERCISE_LIBRARY, getExerciseById, listExercises } from '../src/lib/exerciseLibrary.js';
import {
  ALL, CATEGORY_OPTIONS, DEFAULT_FILTERS, DIFFICULTY_OPTIONS, MAX_QUERY_LENGTH, amountLabel, backSearch, emptyResultText, exerciseDetail,
  exerciseRow, filtersFromParams, hasActiveFilters, paramsFromFilters, resultSummary, serviceFilters,
} from '../src/lib/exerciseView.js';

let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks += 1; };
const eq = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks += 1; };
const params = (qs) => new URLSearchParams(qs);

// ---- filter options ----
eq(CATEGORY_OPTIONS.map((o) => o.value), [ALL, ...EXERCISE_CATEGORIES], 'category chips: All + the six categories, in order');
eq(CATEGORY_OPTIONS[0].label, 'All', 'first category chip is "All"');
eq(DIFFICULTY_OPTIONS.map((o) => o.value), [ALL, ...DIFFICULTY], 'difficulty chips: any + the three levels');
eq(DIFFICULTY_OPTIONS[0].label, 'Any level', 'first difficulty chip is "Any level"');
ok(CATEGORY_OPTIONS.every((o) => o.label), 'every chip has a label');

// ---- filters <-> URL ----
eq(filtersFromParams(params('')), DEFAULT_FILTERS, 'no query string = no filters');
eq(filtersFromParams(null), DEFAULT_FILTERS, 'no params object = no filters');
eq(filtersFromParams(params('category=Core&difficulty=Beginner&q=plank')), { category: 'Core', difficulty: 'Beginner', query: 'plank' }, 'all three filters');
eq(filtersFromParams(params('category=Yoga&difficulty=Expert')), DEFAULT_FILTERS, 'unknown category/difficulty fall back to all');
eq(filtersFromParams(params('category=core')).category, ALL, 'category is case-sensitive (a hand-edited URL is not guessed)');
eq(filtersFromParams(params('q=push%20up%20')).query, 'push up ', 'the search text keeps a trailing space while typing');
eq(filtersFromParams(params(`q=${'x'.repeat(200)}`)).query.length, MAX_QUERY_LENGTH, 'the search text is capped');
eq(paramsFromFilters(DEFAULT_FILTERS).toString(), '', 'default filters = empty query string');
eq(paramsFromFilters({ category: 'Core', difficulty: ALL, query: '' }).toString(), 'category=Core', 'only non-default filters are written');
for (const filters of [
  { category: 'Strength', difficulty: 'Advanced', query: 'push' },
  { category: ALL, difficulty: 'Beginner', query: 'a & b = c' },
  { category: 'Recovery', difficulty: ALL, query: 'ü ñ' },
]) eq(filtersFromParams(paramsFromFilters(filters)), filters, `round trip ${JSON.stringify(filters)}`);
eq(serviceFilters(DEFAULT_FILTERS), { category: undefined, difficulty: undefined, query: '' }, '"all" becomes no filter for the service');
eq(serviceFilters({ category: 'Core', difficulty: 'Beginner', query: 'x' }), { category: 'Core', difficulty: 'Beginner', query: 'x' }, 'real filters pass through');
eq([hasActiveFilters(DEFAULT_FILTERS), hasActiveFilters({ ...DEFAULT_FILTERS, query: '   ' }), hasActiveFilters({ ...DEFAULT_FILTERS, category: 'Core' }), hasActiveFilters({ ...DEFAULT_FILTERS, query: 'a' })], [false, false, true, true], 'hasActiveFilters');

// ---- the real library through the filters ----
eq(listExercises(serviceFilters(DEFAULT_FILTERS)).length, 30, 'no filter = all 30 exercises');
for (const category of EXERCISE_CATEGORIES) eq(listExercises(serviceFilters({ ...DEFAULT_FILTERS, category })).length, 5, `5 ${category} exercises`);
ok(listExercises(serviceFilters({ ...DEFAULT_FILTERS, query: 'plank' })).some((e) => /plank/i.test(e.name)), 'search finds a plank');
eq(listExercises(serviceFilters({ ...DEFAULT_FILTERS, query: 'zzzz-no-such' })).length, 0, 'a search with no match is empty');
eq(DIFFICULTY.reduce((n, difficulty) => n + listExercises(serviceFilters({ ...DEFAULT_FILTERS, difficulty })).length, 0), 30, 'the three levels together cover the library');

// ---- labels ----
eq(amountLabel({ suggestedReps: 10 }), '10 reps', 'reps');
eq(amountLabel({ suggestedReps: 1 }), '1 rep', 'one rep');
eq(amountLabel({ suggestedDurationSec: 30 }), '30 s', 'short hold');
eq(amountLabel({ suggestedDurationSec: 119 }), '119 s', 'under two minutes stays in seconds');
eq(amountLabel({ suggestedDurationSec: 120 }), '2 min', 'two minutes');
eq(amountLabel({ suggestedDurationSec: 600 }), '10 min', 'ten minutes');
eq(amountLabel({ suggestedReps: 12, suggestedDurationSec: 30 }), '12 reps', 'reps win when both exist');
eq([amountLabel({}), amountLabel(null), amountLabel({ suggestedReps: 0 }), amountLabel({ suggestedDurationSec: -5 })], ['', '', '', ''], 'nothing valid = no label, never a made-up one');
eq([resultSummary(30, 30), resultSummary(5, 30), resultSummary(1, 30), resultSummary(0, 30), resultSummary(1, 1)], ['30 exercises', '5 of 30 exercises', '1 of 30 exercises', 'No exercises', '1 exercise'], 'result summary');
eq(emptyResultText({ ...DEFAULT_FILTERS, query: '  yoga ' }), 'No exercises match “yoga”.', 'empty text names the search');
eq(emptyResultText({ ...DEFAULT_FILTERS, category: 'Core' }), 'No exercises match these filters.', 'empty text without a search');

// ---- rows and detail, for EVERY real exercise ----
const clean = (text) => !/undefined|null|NaN|\[object/.test(text);
eq(new Set(EXERCISE_LIBRARY.map((e) => e.id)).size, EXERCISE_LIBRARY.length, 'exercise ids are unique (they are the list keys and the URLs)');
for (const exercise of EXERCISE_LIBRARY) {
  const row = exerciseRow(exercise);
  ok(row.id === exercise.id && row.title === exercise.name && row.difficulty === exercise.difficulty, `${exercise.id}: row basics`);
  ok(row.amount && clean(row.amount), `${exercise.id}: row has a clean amount (${row.amount})`);
  ok(row.subtitle.startsWith(exercise.category) && clean(row.subtitle) && row.subtitle.split(' · ').length <= 3, `${exercise.id}: subtitle = category + at most 2 muscles`);
  const detail = exerciseDetail(exercise);
  eq(detail.steps, [...exercise.instructions], `${exercise.id}: every instruction step is shown, in order`);
  ok(detail.steps.length > 0 && detail.description && detail.name, `${exercise.id}: has steps, description and name`);
  eq(detail.facts.map((f) => f.label), ['Difficulty', 'Target muscles', 'Suggested'], `${exercise.id}: three facts`);
  ok(detail.facts.every((f) => f.value && clean(f.value)), `${exercise.id}: facts are clean`);
  ok(Object.isFrozen(exercise) && detail.steps !== exercise.instructions, `${exercise.id}: the view copies, never mutates, the frozen library`);
}
eq(exerciseDetail(getExerciseById('ex-push-up')).facts, [
  { label: 'Difficulty', value: 'Intermediate' }, { label: 'Target muscles', value: 'Chest, Shoulders, Triceps, Core' }, { label: 'Suggested', value: '10 reps' },
], 'push-up detail facts');
eq(exerciseRow(getExerciseById('ex-push-up')), {
  id: 'ex-push-up', amount: '10 reps', title: 'Push-ups', subtitle: 'Strength · Chest · Shoulders', difficulty: 'Intermediate',
}, 'push-up row');
eq(exerciseDetail({ name: 'X', category: 'Core', difficulty: 'Beginner', description: 'd', instructions: ['one'] }).facts, [{ label: 'Difficulty', value: 'Beginner' }], 'missing muscles/amount are left out, not invented');
eq(exerciseDetail({ name: 'X', instructions: ['one'] }).stepsLabel, '1 step', 'one step');
eq(exerciseDetail(getExerciseById('ex-brisk-walk')).stepsLabel, `${getExerciseById('ex-brisk-walk').instructions.length} steps`, 'steps label');

// ---- going back ----
eq([backSearch({ search: '?category=Core' }), backSearch({ search: 'category=Core' }), backSearch({ search: 5 }), backSearch(null), backSearch(undefined)], ['?category=Core', '', '', '', ''], 'only a real query string is used to go back');

console.log(`Phase 9 PACE 3a exercise view OK (${checks} checks)`);