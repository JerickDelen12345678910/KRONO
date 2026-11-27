// scripts/check-fitness-view.mjs — Phase 9 PACE 2 + 5: the pure view logic behind the Fitness screen (src/lib/fitnessView.js).
// Run via `npm run check` (scripts/check-all.mjs imports every check-*.mjs file). The populated cases use the exact
// numbers shown in docs/design-preview.html (4 of 5 workouts, 3h 40m, +22%, streak 5, best day 50 min Saturday).
import assert from 'node:assert/strict';
import { ENTRY_STATUS, OCCURRENCE_STATUS, SESSION_STATUS } from '../src/models/constants.js';
import { createWorkoutItem } from '../src/models/workout.js';
import {
  HISTORY_LIMIT, PREVIEW_ROWS, chartModel, defaultCategory, forCategory, historyRows, kpiCards, plannedMinutes, plannedOn, workoutBlock,
} from '../src/lib/fitnessView.js';

let n = 0;
const eq = (a, b, m) => { assert.equal(a, b, m); n++; };
const deepEq = (a, b, m) => { assert.deepEqual(a, b, m); n++; };
const isOk = (c, m) => { assert.ok(c, m); n++; };

// ================= plannedMinutes =================
eq(plannedMinutes('12:30', '13:15'), 45, 'minutes between two times');
eq(plannedMinutes('23:00', '23:59'), 59, 'late evening');
eq(plannedMinutes('9:00', '10:30'), 90, 'a single-digit hour is accepted');
eq(plannedMinutes('08:00', '08:00'), null, 'an empty range has no duration');
eq(plannedMinutes('10:00', '09:00'), null, 'an end before the start has no duration');
eq(plannedMinutes('bad', '09:00'), null, 'an invalid start has no duration');
eq(plannedMinutes(undefined, '09:00'), null, 'a missing start has no duration');

// ================= KPI row =================
const design = {
  workouts: 4, goal: 5, activeSeconds: (3 * 60 + 40) * 60, changePct: 22, streak: 5, bestStreak: 5, isPersonalBest: true,
  bestDay: { date: '2026-11-14', weekday: 'Saturday', seconds: 50 * 60 },
};
const cards = kpiCards(design);
eq(cards.length, 4, 'four KPI cards');
deepEq(cards.map((c) => c.label), ['Workouts', 'Active time', 'Day streak', 'Best day'], 'labels follow the design preview');
deepEq(cards.map((c) => c.variant), ['fit', 'fit', 'map', 'fit'], 'variants follow the design preview');
deepEq(cards.map((c) => c.value), ['4', '3h 40m', '5', '50 min'], 'values match the design preview');
deepEq(cards.map((c) => c.subtitle), ['Goal: 5', '+22% vs last week', 'Personal best', 'Saturday'], 'subtitles match the design preview');
deepEq(cards.map((c) => c.key), ['workouts', 'activeTime', 'streak', 'bestDay'], 'each card has a stable key');

const brandNew = { workouts: 0, goal: null, activeSeconds: 0, changePct: null, streak: 0, bestStreak: 0, isPersonalBest: false, bestDay: null };
const empty = kpiCards(brandNew);
deepEq(empty.map((c) => c.value), ['0', '0 min', '0', '–'], 'a brand-new user: honest zeros and a dash');
deepEq(empty.map((c) => c.subtitle), ['Nothing planned this week', 'Nothing logged last week', 'No streak yet', 'No workouts yet'], 'a brand-new user: no invented goal, percentage or best day');

eq(kpiCards({ ...design, changePct: -12 })[1].subtitle, '-12% vs last week', 'a drop shows a minus sign');
eq(kpiCards({ ...design, changePct: 0 })[1].subtitle, '0% vs last week', 'no change shows 0%, without a plus');
eq(kpiCards({ ...design, streak: 3, bestStreak: 7, isPersonalBest: false })[2].subtitle, 'Best: 7', 'a streak below the best shows the best');
eq(kpiCards({ ...design, streak: 0, bestStreak: 4, isPersonalBest: false })[2].subtitle, 'Best: 4', 'a broken streak still shows the best');
eq(kpiCards({ ...design, goal: null })[0].subtitle, 'Nothing planned this week', 'no planned workouts means no goal text, even with workouts done');

const loading = kpiCards(null);
deepEq(loading.map((c) => c.value), ['–', '–', '–', '–'], 'while loading every value is a dash, not a fake zero');
deepEq(loading.map((c) => c.subtitle), ['', '', '', ''], 'while loading there are no subtitles');
deepEq(loading.map((c) => c.label), ['Workouts', 'Active time', 'Day streak', 'Best day'], 'while loading the labels are already there');

// ================= chart =================
const points = ['09', '10', '11', '12', '13', '14', '15'].map((d, i) => ({ date: `2026-11-${d}`, minutes: [40, 45, 0, 45, 0, 50, 0][i] }));
const chart = chartModel({ range: 'week', points });
deepEq(chart.labels, ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], 'chart labels run Monday to Sunday');
deepEq(chart.data, [40, 45, 0, 45, 0, 50, 0].map((value) => ({ value })), 'chart data is the minutes per day');
eq(chart.totalMinutes, 180, 'chart totalMinutes sums the range');
eq(chart.description, 'Exercise minutes per day this week: Mon 40, Tue 45, Wed 0, Thu 45, Fri 0, Sat 50, Sun 0.', 'the chart has a text description for screen readers');
deepEq([chartModel(null).labels, chartModel(null).data, chartModel(null).description], [[], [], 'No exercise data yet.'], 'no progress yet: an empty chart model');
eq(chartModel({ points: [] }).description, 'No exercise data yet.', 'no points: the same empty description');

const monthPoints = [
  { date: '2026-11-01', minutes: 0 },
  { date: '2026-11-02', minutes: 30 },
  { date: '2026-11-30', minutes: 45 },
];
const monthChart = chartModel({ range: 'month', points: monthPoints });
deepEq(monthChart.labels, ['1', '2', '30'], 'month chart uses day numbers as labels');
eq(monthChart.totalMinutes, 75, 'month chart sums totalMinutes');
eq(monthChart.description, 'Exercise minutes per day this month: Nov 1 0, Nov 2 30, Nov 30 45.', 'month chart screen-reader description names month and day');

// ================= today's workout =================
const plan = [
  { occurrenceId: 'o1', date: '2026-11-12', startTime: '12:30', endTime: '13:15', status: OCCURRENCE_STATUS.SCHEDULED, workout: { name: 'Upper body', category: 'Strength', items: [] } },
  { occurrenceId: 'o2', date: '2026-11-12', startTime: '18:00', endTime: '18:30', status: OCCURRENCE_STATUS.SCHEDULED, workout: { name: 'Easy run', category: 'Cardio', items: [] } },
  { occurrenceId: 'o3', date: '2026-11-13', startTime: '07:00', endTime: '07:30', status: OCCURRENCE_STATUS.SCHEDULED, workout: { name: 'Core', category: 'Core', items: [] } },
];
const todayPlan = plannedOn(plan, '2026-11-12');
deepEq(todayPlan.map((p) => p.occurrenceId), ['o1', 'o2'], 'plannedOn keeps only that day');
deepEq(plannedOn(undefined, '2026-11-12'), [], 'plannedOn: nothing given, nothing planned');
deepEq(plannedOn(plan, '2026-11-20'), [], 'plannedOn: a day with nothing planned');
eq(defaultCategory(todayPlan), 'Strength', 'the active chip starts as the first workout\'s category');
eq(defaultCategory([]), null, 'no workout today: no active chip');
deepEq(forCategory(todayPlan, 'Cardio').map((p) => p.occurrenceId), ['o2'], 'a chip shows only that category');
deepEq(forCategory(todayPlan, null).map((p) => p.occurrenceId), ['o1', 'o2'], 'no chip chosen shows every workout of the day');
deepEq(forCategory(todayPlan, 'Core'), [], 'a category with no workout today shows nothing');

const upper = [
  createWorkoutItem({ exerciseId: 'ex-push-up', name: 'Push-ups', sets: 3, reps: 12, durationSec: null, restSec: 60 }),
  createWorkoutItem({ name: 'Dumbbell rows', sets: 3, reps: 10, durationSec: null, restSec: 60 }),
  createWorkoutItem({ exerciseId: 'ex-plank', name: 'Plank', sets: 3, reps: null, durationSec: 45, restSec: 45 }),
  createWorkoutItem({ name: 'Shoulder press', sets: 3, reps: 10, durationSec: null, restSec: 60 }),
  createWorkoutItem({ name: 'Bicep curls', sets: 3, reps: 12, durationSec: null, restSec: 60 }),
];
const planned = { occurrenceId: 'o1', date: '2026-11-12', startTime: '12:30', endTime: '13:15', status: OCCURRENCE_STATUS.SCHEDULED, workout: { name: 'Upper body', category: 'Strength', items: upper } };
const block = workoutBlock(planned, (t) => `@${t}`);
eq(PREVIEW_ROWS, 3, 'three rows are previewed, as in the design');
eq(block.key, 'o1', 'the block is keyed by its occurrence');
eq(block.name, 'Upper body', 'block name');
eq(block.category, 'Strength', 'block category');
eq(block.meta, '5 exercises · about 45 min · @12:30', 'meta line: count, planned duration, formatted time');
deepEq(block.rows.map((r) => [r.sets, r.name, r.rest]), [['3×12', 'Push-ups', 'Rest 60 s'], ['3×10', 'Dumbbell rows', 'Rest 60 s'], ['3×45s', 'Plank', 'Rest 45 s']], 'first three rows match the design preview');
eq(block.more, 2, 'two exercises are not shown');
eq(new Set(block.rows.map((r) => r.key)).size, 3, 'row keys are unique');
eq(workoutBlock(planned).meta, '5 exercises · about 45 min · 12:30', 'without a formatter the time is shown as stored');
eq(workoutBlock({ ...planned, status: OCCURRENCE_STATUS.DONE }).meta, '5 exercises · about 45 min · 12:30 · Done', 'a done workout says Done in words');
eq(workoutBlock({ ...planned, status: OCCURRENCE_STATUS.SKIPPED }).meta, '5 exercises · about 45 min · 12:30 · Skipped', 'a skipped workout says Skipped in words');
eq(workoutBlock({ ...planned, endTime: '12:30' }).meta, '5 exercises · 12:30', 'no valid duration: the "about" part is left out');

const single = workoutBlock({ ...planned, workout: { ...planned.workout, items: [upper[0]] } });
eq(single.meta, '1 exercise · about 45 min · 12:30', 'one exercise is singular');
eq(single.more, 0, 'nothing hidden when there are few exercises');
const none = workoutBlock({ ...planned, workout: { ...planned.workout, items: [] } });
deepEq([none.rows, none.more, none.meta], [[], 0, '0 exercises · about 45 min · 12:30'], 'a workout with no exercises still renders');
eq(workoutBlock({ ...planned, workout: { category: 'Core', items: [] } }).name, 'Workout', 'a workout without a name gets a neutral title');
eq(workoutBlock({ ...planned, workout: { ...planned.workout, items: [createWorkoutItem({ exerciseId: 'ex-plank', name: '', durationSec: 45, reps: null })] } }).rows[0].name, 'Plank', 'an item without a name falls back to the library name');
eq(workoutBlock({ ...planned, workout: { ...planned.workout, items: [createWorkoutItem({ name: '' })] } }).rows[0].name, 'Exercise', 'an unknown, unnamed item gets a neutral label');
isOk(Object.keys(workoutBlock(planned)).sort().join() === 'category,key,meta,more,name,rows', 'the block has exactly the fields the screen renders');

// ================= recent workouts (PACE 5) =================
const localIso = (y, m, d, h = 9) => new Date(y, m - 1, d, h, 0).toISOString();
const histSessions = [
  {
    id: 'h1', workoutName: 'Upper body', category: 'Strength', status: SESSION_STATUS.COMPLETED,
    startedAt: localIso(2026, 11, 18, 8), activeSeconds: 45 * 60,
    entries: [
      { status: ENTRY_STATUS.COMPLETED, sets: [{ reps: 12 }, { reps: 12 }, { reps: 12 }] },
      { status: ENTRY_STATUS.COMPLETED, sets: [{ durationSec: 45 }, { durationSec: 45 }] },
      { status: ENTRY_STATUS.SKIPPED, sets: [] },
    ],
  },
  {
    id: 'h2', workoutName: 'Evening stretch', category: 'Mobility', status: SESSION_STATUS.COMPLETED,
    startedAt: localIso(2026, 11, 19, 18), activeSeconds: 15 * 60,
    entries: [{ status: ENTRY_STATUS.COMPLETED, sets: [{ durationSec: 60 }] }],
  },
  {
    id: 'h3', workoutName: 'Abandoned', category: 'Cardio', status: SESSION_STATUS.IN_PROGRESS,
    startedAt: localIso(2026, 11, 20, 7), activeSeconds: 600, entries: [],
  },
];
const recent = historyRows(histSessions);
eq(recent.length, 2, 'historyRows keeps only completed sessions');
deepEq(recent.map((r) => r.id), ['h2', 'h1'], 'historyRows sorts newest first');
deepEq(recent[0], { id: 'h2', title: 'Evening stretch', duration: '15 min', subtitle: 'Thu, Nov 19 · Mobility · 1 set · 1 exercise' }, 'singular set and exercise labels');
deepEq(recent[1], { id: 'h1', title: 'Upper body', duration: '45 min', subtitle: 'Wed, Nov 18 · Strength · 5 sets · 2 exercises' }, 'plural sets and exercises count only logged entries');
eq(historyRows(Array.from({ length: 12 }, (_, i) => ({ ...histSessions[0], id: `s${i}` }))).length, HISTORY_LIMIT, 'historyRows defaults to HISTORY_LIMIT (10)');
eq(historyRows(Array.from({ length: 12 }, (_, i) => ({ ...histSessions[0], id: `s${i}` })), null).length, 12, 'null limit returns all completed sessions');
deepEq(historyRows([{ id: 'h-min', status: SESSION_STATUS.COMPLETED, startedAt: 'bad', activeSeconds: 0, entries: [] }])[0], { id: 'h-min', title: 'Workout', duration: '0 min', subtitle: '' }, 'minimal session falls back cleanly');

console.log(`check-fitness-view OK (${n} checks)`);