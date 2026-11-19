// Phase 9 PACE 2b — checks for the Fitness part of the demo seed (src/services/demoSeed.js).
// Uses the same two imports as ServicesProvider (createRepositories + createMemoryStore) and a fixed "today" (a Thursday).
import assert from 'node:assert/strict';
import { createMemoryStore, createRepositories } from '../src/repositories/index.js';
import { seedDemoData } from '../src/services/demoSeed.js';
import { SampleDataService } from '../src/services/SampleDataService.js';
import { WorkoutService } from '../src/services/WorkoutService.js';
import { SESSION_STATUS } from '../src/models/constants.js';
import { createWorkout, createWorkoutItem, validateWorkout } from '../src/models/workout.js';
import { sessionDate } from '../src/lib/fitness.js';

let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks += 1; };
const eq = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks += 1; };

const TODAY = '2026-11-19'; // Thursday; its week is Mon 2026-11-16 .. Sun 2026-11-22

function setup() {
  const repos = createRepositories({ userId: 'check-user', store: createMemoryStore() });
  const workout = new WorkoutService(repos);
  // seedDemoData only needs these two entries of the services object.
  const services = { schedule: { schedules: repos.schedules, occurrences: repos.occurrences }, workout };
  return { repos, workout, services };
}

const counts = async (repos) => ({
  schedules: (await repos.schedules.list()).length,
  occurrences: (await repos.occurrences.list()).length,
  workouts: (await repos.workouts.list()).length,
  history: (await repos.exerciseHistory.list()).length,
});

// ---- the repositories "Remove sample data" walks must include the Fitness ones ----
{
  const { repos } = setup();
  ok(repos.workouts && repos.exerciseHistory, 'repos expose workouts and exerciseHistory');
}

// ---- seeding ----
const { repos, workout, services } = setup();
const real = await repos.workouts.create(createWorkout({ name: 'My real routine', items: [createWorkoutItem({ name: 'Squats' })] }));
await seedDemoData(services, TODAY);

const workouts = await workout.list();
const sampleWorkouts = workouts.filter((w) => w.isSample);
eq(sampleWorkouts.length, 3, '3 sample workouts');
ok(sampleWorkouts.every((w) => validateWorkout(w).valid), 'every sample workout passes validateWorkout');
ok(sampleWorkouts.every((w) => w.id.startsWith('sample-')), 'sample workout ids are fixed');
const upper = sampleWorkouts.find((w) => w.scheduleId === 'sample-gym');
ok(upper && upper.items.length >= 4, 'one workout is linked to the sample gym schedule and has 4+ exercises (shows "+N more")');
eq(sampleWorkouts.filter((w) => w.scheduleId).length, 1, 'only one workout is linked to a schedule');
ok(workouts.some((w) => w.id === real.id && !w.isSample), 'a real workout is untouched by seeding');

const history = await workout.listHistory();
eq(history.length, 13, '13 sample sessions');
ok(history.every((s) => s.isSample && s.status === SESSION_STATUS.COMPLETED && s.endedAt && s.activeSeconds > 0), 'sessions are completed samples with time');
ok(history.every((s) => sessionDate(s) && sessionDate(s) < TODAY), 'every sample session is before today');
ok(history.every((s) => workouts.some((w) => w.id === s.workoutId)), 'every session points at an existing workout');
ok(history.every((s) => s.entries.length === workouts.find((w) => w.id === s.workoutId).items.length), 'entries match the workout exercises');
eq((await workout.listHistory({ from: TODAY, to: TODAY })).length, 0, 'no session today');
ok(history[0].startedAt > history[1].startedAt, 'history is newest first');

// ---- the Fitness screen's data ----
const today = await workout.today({ today: TODAY });
eq(today.length, 1, 'one workout planned today');
eq([today[0].workout.id, today[0].startTime, today[0].endTime], ['sample-upper-body', '12:30', '13:15'], "today's workout is the upper body workout at 12:30-13:15");

const summary = await workout.summary({ today: TODAY });
eq(summary.planned.length, 4, 'week plan: Mon, Wed, Sat + today');
eq(summary.goal, 4, 'goal = planned workouts');
eq(summary.workouts, 3, '3 workouts so far this week (Mon-Wed)');
eq(summary.activeSeconds, 105 * 60, '105 min active this week');
eq(summary.previousActiveSeconds, 190 * 60, '190 min the week before');
eq(summary.changePct, -45, 'change vs last week');
eq([summary.streak, summary.bestStreak], [3, 3], 'streak 3 counted back from yesterday, best 3');
eq(summary.isPersonalBest, true, 'streak equals best');
eq([summary.bestDay.weekday, summary.bestDay.seconds], ['Wednesday', 45 * 60], 'best day');

const week = await workout.progress({ today: TODAY, range: 'week' });
eq(week.points.length, 7, '7 chart points');
eq(week.points.map((p) => p.minutes), [25, 35, 45, 0, 0, 0, 0], 'Mon..Sun minutes');
const month = await workout.progress({ today: TODAY, range: 'month' });
eq(month.points.length, 30, 'November has 30 chart points');

// ---- re-seeding never duplicates ----
const before = await counts(repos);
await seedDemoData(services, TODAY);
eq(await counts(repos), before, 'seeding twice changes nothing');
eq(before.workouts, 4, '3 samples + 1 real workout');

// ---- "Remove sample data" ----
const removed = await new SampleDataService(repos).removeAll();
eq(removed.workouts, 3, 'removes the 3 sample workouts');
eq(removed.exerciseHistory, 13, 'removes the 13 sample sessions');
eq((await workout.list()).map((w) => w.id), [real.id], 'only the real workout is left');
eq((await workout.listHistory()).length, 0, 'no sample sessions are left');

console.log(`Phase 9 PACE 2b demo seed OK (${checks} checks)`);