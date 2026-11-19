// scripts/check-fitness.mjs — Phase 9 PACE 1: the exercise library, the pure Fitness logic (src/lib/fitness.js) and the
// new WorkoutService methods. Run via `npm run check` (scripts/check-all.mjs imports every check-*.mjs file).
// WorkoutService is tested against tiny in-memory stand-ins for the repositories (only `list`), so these checks cover
// OUR logic and never depend on repository internals; the real repositories are exercised by the Fitness screens (PACE 2).
import assert from 'node:assert/strict';
import { DIFFICULTY, EXERCISE_CATEGORIES, OCCURRENCE_STATUS, SESSION_STATUS } from '../src/models/constants.js';
import { addDays } from '../src/models/common.js';
import { createWorkout, createWorkoutItem, createWorkoutSession, validateExercise, validateWorkout } from '../src/models/workout.js';
import { createOccurrence, createSchedule } from '../src/models/schedule.js';
import {
  EXERCISE_LIBRARY, FITNESS_DISCLAIMER, RECOVERY_REMINDERS, getExerciseById, listExercises,
} from '../src/lib/exerciseLibrary.js';
import {
  dailySeries, datesBetween, durationLabel, itemFromExercise, monthRange, plannedWorkouts, restLabel, sessionDate, setsLabel,
  streaks, weekEnd, weekStart, weekdayName, weeklySeries, weeklyStats,
} from '../src/lib/fitness.js';
import { WorkoutService } from '../src/services/WorkoutService.js';

let n = 0;
const eq = (a, b, m) => { assert.equal(a, b, m); n++; };
const deepEq = (a, b, m) => { assert.deepEqual(a, b, m); n++; };
const isOk = (c, m) => { assert.ok(c, m); n++; };

// ================= exercise library =================
eq(EXERCISE_LIBRARY.length, 30, 'the library has 30 exercises');
deepEq(EXERCISE_CATEGORIES.map((c) => EXERCISE_LIBRARY.filter((e) => e.category === c).length), [5, 5, 5, 5, 5, 5], 'five exercises in each of the six categories');
eq(new Set(EXERCISE_LIBRARY.map((e) => e.id)).size, 30, 'every exercise has its own id');
eq(new Set(EXERCISE_LIBRARY.map((e) => e.name)).size, 30, 'every exercise has its own name');
for (const e of EXERCISE_LIBRARY) {
  isOk(validateExercise(e).valid, `${e.id} passes validateExercise`);
  isOk(/^ex-[a-z0-9-]+$/.test(e.id), `${e.id} has a stable readable id`);
  isOk(DIFFICULTY.includes(e.difficulty), `${e.id} has a known difficulty`);
  isOk(e.description.length >= 20, `${e.id} has a description`);
  isOk(e.instructions.length >= 3 && e.instructions.every((s) => s.trim().length > 0), `${e.id} has at least 3 step-by-step instructions`);
  isOk(e.targetMuscles.length >= 1, `${e.id} names its target muscles`);
  isOk((e.suggestedReps == null) !== (e.suggestedDurationSec == null), `${e.id} suggests reps OR a duration, not both and not neither`);
  eq(e.mediaUrl, null, `${e.id} has no illustration yet`);
}
isOk(Object.isFrozen(EXERCISE_LIBRARY) && Object.isFrozen(EXERCISE_LIBRARY[0]) && Object.isFrozen(EXERCISE_LIBRARY[0].instructions), 'the library is deeply frozen: no screen can change it by accident');
eq(getExerciseById('ex-push-up').name, 'Push-ups', 'getExerciseById finds an exercise');
eq(getExerciseById('nope'), null, 'an unknown id gives null');
eq(listExercises().length, 30, 'listExercises with no filter returns everything');
deepEq(listExercises({ category: 'Core' }).map((e) => e.id), ['ex-plank', 'ex-dead-bug', 'ex-bird-dog', 'ex-bicycle-crunch', 'ex-russian-twist'], 'filters by category');
isOk(listExercises({ difficulty: 'Advanced' }).every((e) => e.difficulty === 'Advanced') && listExercises({ difficulty: 'Advanced' }).length >= 1, 'filters by difficulty');
deepEq(listExercises({ query: 'PLANK' }).map((e) => e.id), ['ex-plank'], 'the search is case-insensitive');
isOk(listExercises({ query: 'hamstrings' }).length >= 2, 'the search also matches target muscles');
deepEq(listExercises({ category: 'Core', query: 'zzz' }), [], 'no match gives an empty list');
eq(FITNESS_DISCLAIMER, 'General exercise information only. It is not a personal medical assessment.', 'the disclaimer is the design preview text');
isOk(RECOVERY_REMINDERS.length === 3 && RECOVERY_REMINDERS.every((r) => r.length > 20), 'rest and recovery reminders exist');
isOk(!/cure|treat|diagnos|prevent disease|lose \d+/i.test(JSON.stringify(EXERCISE_LIBRARY)), 'the library makes no medical or numeric health claims');

// ================= labels =================
eq(durationLabel(0), '0 min', '0 seconds');
eq(durationLabel(30), '1 min', 'anything above zero shows at least 1 min');
eq(durationLabel(45 * 60), '45 min', '45 minutes');
eq(durationLabel(220 * 60), '3h 40m', '3 hours 40 minutes (the design preview value)');
eq(durationLabel(3600), '1h', 'a whole hour has no minutes part');
eq(durationLabel(-5), '0 min', 'a negative or invalid value is 0');
eq(durationLabel('x'), '0 min', 'junk is 0');
eq(setsLabel({ sets: 3, reps: 12 }), '3×12', 'reps label (design preview)');
eq(setsLabel({ sets: 3, reps: null, durationSec: 45 }), '3×45s', 'timed label (design preview)');
eq(setsLabel({ sets: 1, reps: null, durationSec: 600 }), '1×10 min', 'a long hold shows minutes');
eq(restLabel(60), 'Rest 60 s', 'rest in seconds (design preview)');
eq(restLabel(45), 'Rest 45 s', 'rest 45 s');
eq(restLabel(120), 'Rest 2 min', 'rest in minutes');
eq(restLabel(0), 'No rest', 'no rest');

// ================= building a workout from the library =================
const pushUp = itemFromExercise(getExerciseById('ex-push-up'));
deepEq([pushUp.exerciseId, pushUp.name, pushUp.sets, pushUp.reps, pushUp.durationSec, pushUp.restSec], ['ex-push-up', 'Push-ups', 3, 10, null, 60], 'a rep exercise becomes 3 sets of its suggested reps with 60 s rest');
const plankItem = itemFromExercise(getExerciseById('ex-plank'));
deepEq([plankItem.sets, plankItem.reps, plankItem.durationSec, plankItem.restSec], [3, null, 30, 45], 'a timed exercise keeps its duration and a core rest');
const walkItem = itemFromExercise(getExerciseById('ex-brisk-walk'));
deepEq([walkItem.sets, walkItem.durationSec, walkItem.restSec], [1, 600, 0], 'a long timed exercise is one set with no rest');
eq(itemFromExercise(getExerciseById('ex-push-up'), { sets: 5 }).sets, 5, 'overrides win');
isOk(EXERCISE_LIBRARY.every((e) => validateWorkout({ name: 'W', category: e.category, items: [itemFromExercise(e)] }).valid), 'a workout built from ANY library exercise passes validateWorkout');

// ================= dates =================
eq(weekStart('2026-11-12'), '2026-11-09', 'Thursday -> that week\'s Monday');
eq(weekStart('2026-11-09'), '2026-11-09', 'Monday is its own week start');
eq(weekStart('2026-11-15'), '2026-11-09', 'Sunday belongs to the week that started the Monday before');
eq(weekStart('2026-11-16'), '2026-11-16', 'the next Monday starts a new week');
eq(weekEnd('2026-11-12'), '2026-11-15', 'week end is Sunday');
eq(weekStart('2026-01-01'), '2025-12-29', 'weeks cross the year boundary');
deepEq(monthRange('2026-11-19'), { from: '2026-11-01', to: '2026-11-30' }, 'month range (30 days)');
deepEq(monthRange('2028-02-10'), { from: '2028-02-01', to: '2028-02-29' }, 'month range in a leap year');
deepEq(datesBetween('2026-11-28', '2026-12-02'), ['2026-11-28', '2026-11-29', '2026-11-30', '2026-12-01', '2026-12-02'], 'datesBetween crosses a month end');
deepEq(datesBetween('2026-11-02', '2026-11-01'), [], 'datesBetween is empty when from is after to');
eq(weekdayName('2026-11-14'), 'Saturday', 'weekdayName');

// ================= sessions =================
// Local timestamps built from local parts: these checks give the same answer in every time zone.
const at = (date, h = 9, min = 0) => {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d, h, min).toISOString();
};
const done = (date, minutes, h = 9) => ({ id: `s-${date}-${h}`, status: SESSION_STATUS.COMPLETED, startedAt: at(date, h), activeSeconds: minutes * 60 });
eq(sessionDate({ startedAt: at('2026-11-16', 6, 30) }), '2026-11-16', 'a 6:30 AM workout belongs to ITS local day (the UTC date can be the day before in the Philippines)');
eq(sessionDate({ startedAt: at('2026-11-16', 23, 45) }), '2026-11-16', 'and a late-night one too');
eq(sessionDate({ startedAt: 'garbage' }), null, 'an invalid startedAt gives null');
eq(sessionDate({}), null, 'a missing startedAt gives null');
eq(sessionDate(null), null, 'a missing session gives null');

// ---- daily / weekly series ----
const sessions = [
  done('2026-11-09', 40), done('2026-11-10', 45), done('2026-11-12', 45), done('2026-11-14', 50),
  { ...done('2026-11-13', 99), status: SESSION_STATUS.IN_PROGRESS },   // not finished: never counted
  { ...done('2026-11-11', 20), status: SESSION_STATUS.PAUSED },
  done('2026-11-02', 30), done('2026-11-04', 60), done('2026-11-06', 90),   // previous week: 180 min
];
const week = dailySeries(sessions, '2026-11-09', '2026-11-15');
eq(week.length, 7, 'a week series has 7 points');
deepEq(week.map((d) => d.minutes), [40, 45, 0, 45, 0, 50, 0], 'minutes per day; unfinished sessions are ignored');
deepEq(week.map((d) => d.workouts), [1, 1, 0, 1, 0, 1, 0], 'workouts per day');
eq(week[0].seconds, 2400, 'seconds are kept exactly');
eq(dailySeries([done('2026-11-09', 20), done('2026-11-09', 25, 18)], '2026-11-09', '2026-11-09')[0].minutes, 45, 'two sessions on one day add up');
eq(dailySeries([], '2026-11-09', '2026-11-09')[0].minutes, 0, 'no sessions: zero, not missing');
eq(dailySeries([{ status: SESSION_STATUS.COMPLETED, startedAt: 'bad', activeSeconds: 600 }], '2026-11-09', '2026-11-09')[0].minutes, 0, 'a session with a bad date is skipped');
deepEq(weeklySeries(sessions, '2026-11-12', 2).map((w) => [w.weekStart, w.minutes, w.workouts]), [['2026-11-02', 180, 3], ['2026-11-09', 180, 4]], 'weekly trend: the last N weeks ending with this one');
eq(weeklySeries(sessions, '2026-11-12', 6).length, 6, 'a 6-week trend has 6 points');

// ---- streaks ----
deepEq(streaks([done('2026-11-11', 10), done('2026-11-12', 10), done('2026-11-13', 10), done('2026-11-14', 10)], '2026-11-15'), { current: 4, best: 4 }, 'a streak stays alive until today is over (no workout yet today)');
deepEq(streaks([done('2026-11-11', 10), done('2026-11-12', 10), done('2026-11-13', 10), done('2026-11-14', 10), done('2026-11-15', 10)], '2026-11-15'), { current: 5, best: 5 }, 'today counts once there is a workout');
deepEq(streaks([done('2026-11-10', 10), done('2026-11-11', 10)], '2026-11-15'), { current: 0, best: 2 }, 'a gap of a full day breaks the current streak but keeps the best');
deepEq(streaks([done('2026-10-01', 10), done('2026-10-02', 10), done('2026-10-03', 10), done('2026-10-04', 10), done('2026-10-05', 10), done('2026-10-06', 10), done('2026-11-14', 10), done('2026-11-15', 10)], '2026-11-15'), { current: 2, best: 6 }, 'best looks at all history');
deepEq(streaks([done('2026-11-15', 10), done('2026-11-15', 20, 18)], '2026-11-15'), { current: 1, best: 1 }, 'two workouts on one day are one day of streak');
deepEq(streaks([done('2026-11-30', 10)], '2026-11-15'), { current: 0, best: 0 }, 'a session dated in the future is ignored');
deepEq(streaks([], '2026-11-15'), { current: 0, best: 0 }, 'no history: no streak');
deepEq(streaks([done('2026-11-30', 10), done('2026-12-01', 10)], '2026-12-01'), { current: 2, best: 2 }, 'a streak crosses a month end');

// ---- weekly stats (the KPI row) ----
const stats = weeklyStats({ sessions: [...sessions, done('2026-11-15', 5, 7)], planned: 5, today: '2026-11-15' });
eq(stats.weekStart, '2026-11-09', 'stats: week start');
eq(stats.weekEnd, '2026-11-15', 'stats: week end');
eq(stats.workouts, 5, 'stats: completed workouts this week (only finished sessions)');
eq(stats.goal, 5, 'stats: the goal is the number of PLANNED workouts');
eq(stats.goalReached, true, 'stats: goal reached when workouts >= planned');
eq(stats.activeSeconds, (40 + 45 + 45 + 50 + 5) * 60, 'stats: active time');
eq(stats.previousActiveSeconds, 180 * 60, 'stats: last week active time');
eq(stats.changePct, 3, 'stats: percent change vs last week (185 vs 180 min)');
deepEq(stats.bestDay, { date: '2026-11-14', weekday: 'Saturday', seconds: 3000 }, 'stats: best day with its weekday');
eq(stats.streak, 2, 'stats: current streak (Nov 14 and Nov 15 both have a workout)');
eq(stats.bestStreak, 2, 'stats: best streak (Nov 9-10 and Nov 14-15 are 2 each)');
eq(stats.isPersonalBest, true, 'stats: a streak of 2 equals the best streak of 2, so it is a personal best');
eq(stats.days.length, 7, 'stats carries the 7 daily points for the chart');
const noGoal = weeklyStats({ sessions, planned: 0, today: '2026-11-12' });
eq(noGoal.goal, null, 'stats: with nothing planned there is NO goal (never invented)');
eq(noGoal.goalReached, false, 'stats: no goal means not reached');
eq(weeklyStats({ sessions: [done('2026-11-10', 30)], planned: 2, today: '2026-11-12' }).goalReached, false, 'stats: 1 of 2 planned is not reached');
eq(weeklyStats({ sessions: [done('2026-11-10', 30)], planned: 2, today: '2026-11-12' }).changePct, null, 'stats: no previous week means no percentage');
eq(weeklyStats({ sessions: [], planned: 0, today: '2026-11-12' }).bestDay, null, 'stats: no workouts means no best day');
eq(weeklyStats({ sessions: [done('2026-11-14', 60), done('2026-11-10', 60)], planned: 0, today: '2026-11-15' }).bestDay.date, '2026-11-10', 'stats: a tie picks the earlier day');
eq(weeklyStats({ sessions: [done('2026-11-14', 50), done('2026-11-15', 30)], planned: 0, today: '2026-11-15' }).isPersonalBest, true, 'stats: a streak equal to the best is a personal best');
eq(weeklyStats({ sessions: [done('2026-11-10', 30), done('2026-11-04', 20)], planned: 0, today: '2026-11-12' }).changePct, 50, 'stats: +50% vs last week');

// ================= planned workouts (the user's program) =================
const sched = (id, o = {}) => ({ ...createSchedule({ title: 'S', category: 'Exercise', startTime: '18:00', endTime: '19:00', ...o }), id });
const wk = (id, o = {}) => ({ ...createWorkout({ name: id, category: 'Strength', items: [createWorkoutItem({ exerciseId: 'ex-push-up', name: 'Push-ups' })], ...o }), id });
const occ = (schedule, date, o = {}) => createOccurrence(schedule, date, o);
const sA = sched('sa');
const sB = sched('sb', { startTime: '07:00', endTime: '08:00', linkedWorkoutId: 'w-b' });
const sC = sched('sc');
const sGone = sched('sgone');
const wA = wk('w-a', { scheduleId: 'sa' });
const wB = wk('w-b');                     // linked from the SCHEDULE side only
const wFree = wk('w-free');               // never planned
const occs = [
  occ(sA, '2026-11-12'), occ(sA, '2026-11-14', { startTime: '06:00' }), occ(sA, '2026-11-16', { status: OCCURRENCE_STATUS.CANCELLED }),
  occ(sB, '2026-11-12'), occ(sC, '2026-11-12'), occ(sGone, '2026-11-12'), occ(sA, '2026-11-13', { status: OCCURRENCE_STATUS.DONE }),
];
const plan = plannedWorkouts({ workouts: [wA, wB, wFree], schedules: [sA, sB, sC], occurrences: occs });
deepEq(plan.map((p) => `${p.date} ${p.startTime} ${p.workout.name}`), ['2026-11-12 07:00 w-b', '2026-11-12 18:00 w-a', '2026-11-13 18:00 w-a', '2026-11-14 06:00 w-a'], 'planned workouts: linked from either side, sorted by date then time');
isOk(!plan.some((p) => p.workout.name === 'w-free'), 'a workout that no schedule plans is not planned');
isOk(!plan.some((p) => p.scheduleId === 'sc'), 'a schedule not linked to any workout plans nothing');
isOk(!plan.some((p) => p.scheduleId === 'sgone'), 'an occurrence whose schedule no longer exists is dropped');
isOk(!plan.some((p) => p.date === '2026-11-16'), 'cancelled occurrences are not planned');
eq(plan.find((p) => p.date === '2026-11-13').status, OCCURRENCE_STATUS.DONE, 'a done occurrence stays in the plan with its status');
deepEq(plannedWorkouts({}), [], 'nothing given, nothing planned');
const wBoth = wk('w-both', { scheduleId: 'sb' });
eq(plannedWorkouts({ workouts: [wB, wBoth], schedules: [sB], occurrences: [occ(sB, '2026-11-12')] })[0].workout.id, 'w-both', 'workout.scheduleId wins over schedule.linkedWorkoutId');

// ================= WorkoutService =================
const memRepo = (rows) => ({
  list: async ({ where, predicate } = {}) => rows.filter((r) => (!where || Object.entries(where).every(([k, v]) => r[k] === v)) && (!predicate || predicate(r))),
});
const completedSession = (workout, date, minutes, h = 9, o = {}) => createWorkoutSession(workout, { startedAt: at(date, h), endedAt: at(date, h + 1), status: SESSION_STATUS.COMPLETED, activeSeconds: minutes * 60, ...o });
const history = [
  completedSession(wA, '2026-11-09', 40), completedSession(wA, '2026-11-10', 45), completedSession(wA, '2026-11-12', 45, 6),
  completedSession(wA, '2026-11-02', 30), completedSession(wA, '2026-11-04', 60),
  createWorkoutSession(wA, { startedAt: at('2026-11-12', 15), status: SESSION_STATUS.IN_PROGRESS }),
];
const service = new WorkoutService({
  workouts: memRepo([wA, wB, wFree]), exerciseHistory: memRepo(history), schedules: memRepo([sA, sB, sC]), occurrences: memRepo(occs),
});

eq(service.exerciseCount(), 30, 'service: library size');
eq(service.getExercise('ex-plank').name, 'Plank', 'service: getExercise');
deepEq(service.listExercises({ category: 'Recovery' }).length, 5, 'service: listExercises');

const hist = await service.listHistory();
eq(hist.length, 5, 'service: history holds finished sessions only');
isOk(hist.every((s, i) => i === 0 || hist[i - 1].startedAt >= s.startedAt), 'service: history is newest first');
deepEq((await service.listHistory({ from: '2026-11-12', to: '2026-11-12' })).map((s) => sessionDate(s)), ['2026-11-12'], 'service: a 6:00 AM session is found under ITS local date (it used to land on the day before in UTC+8)');
eq((await service.listHistory({ from: '2026-11-09', to: '2026-11-10' })).length, 2, 'service: date range is inclusive on both ends');
eq((await service.listHistory({ from: '2026-11-13' })).length, 0, 'service: nothing after the last session');

deepEq((await service.today({ today: '2026-11-12' })).map((p) => p.workout.name), ['w-b', 'w-a'], 'service: today\'s workouts, in time order');
deepEq((await service.today({ today: '2026-11-11' })), [], 'service: nothing planned today');
deepEq((await service.upcoming({ today: '2026-11-12', days: 2 })).map((p) => p.date), ['2026-11-13', '2026-11-14'], 'service: upcoming starts tomorrow and stops after `days`');
deepEq((await service.upcoming({ today: '2026-11-12', days: 1 })).map((p) => p.date), ['2026-11-13'], 'service: upcoming respects a short window');
isOk(!(await service.upcoming({ today: '2026-11-12', days: 7 })).some((p) => p.date === '2026-11-12'), 'service: upcoming never includes today');
eq((await service.plan({ from: '2026-11-12', to: '2026-11-14' })).length, 4, 'service: plan over a range');

const summary = await service.summary({ today: '2026-11-12' });
eq(summary.workouts, 3, 'service summary: finished workouts this week');
eq(summary.goal, 4, 'service summary: goal = planned workouts this week (Nov 9-15: 12 w-b, 12 w-a, 13 w-a, 14 w-a)');
eq(summary.goalReached, false, 'service summary: 3 of 4 is not reached yet');
eq(summary.activeSeconds, 130 * 60, 'service summary: active time');
eq(summary.changePct, 44, 'service summary: 130 min vs 90 min last week is +44%');
eq(summary.streak, 1, 'service summary: streak (Nov 12 only; Nov 11 was a rest day)');
eq(summary.bestStreak, 2, 'service summary: best streak (Nov 9-10)');
deepEq([summary.bestDay.date, summary.bestDay.weekday], ['2026-11-10', 'Tuesday'], 'service summary: best day (a tie at 45 min picks the earlier day)');
eq(summary.planned.length, 4, 'service summary: carries the planned workouts for the week');
const lastWeekdayWeek = await service.summary({ today: '2026-11-08' });
eq(lastWeekdayWeek.goal, null, 'service summary: a week with nothing planned has no goal');
eq(lastWeekdayWeek.workouts, 2, 'service summary: but its finished workouts still count');

const empty = new WorkoutService({ workouts: memRepo([]), exerciseHistory: memRepo([]), schedules: memRepo([]), occurrences: memRepo([]) });
const emptySummary = await empty.summary({ today: '2026-11-12' });
deepEq([emptySummary.workouts, emptySummary.goal, emptySummary.activeSeconds, emptySummary.changePct, emptySummary.bestDay, emptySummary.streak], [0, null, 0, null, null, 0], 'service: a brand-new user gets an empty, honest summary');
deepEq(await empty.today({ today: '2026-11-12' }), [], 'service: a brand-new user has nothing planned today');

const weekProgress = await service.progress({ today: '2026-11-12', range: 'week' });
deepEq([weekProgress.range, weekProgress.from, weekProgress.to, weekProgress.points.length], ['week', '2026-11-09', '2026-11-15', 7], 'service progress: week = Monday..Sunday');
deepEq(weekProgress.points.map((p) => p.minutes), [40, 45, 0, 45, 0, 0, 0], 'service progress: minutes per day');
const monthProgress = await service.progress({ today: '2026-11-12', range: 'month' });
deepEq([monthProgress.from, monthProgress.to, monthProgress.points.length], ['2026-11-01', '2026-11-30', 30], 'service progress: month = the whole calendar month');
eq(monthProgress.points.reduce((t, p) => t + p.minutes, 0), 220, 'service progress: month total (130 + 90)');
eq((await service.progress({ today: '2026-11-12' })).range, 'week', 'service progress: week is the default');

console.log(`check-fitness OK (${n} checks)`);