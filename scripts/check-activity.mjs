// Dependency-free self-check for errors + activity mappers + ActivityService. Run: node scripts/check-activity.mjs
import assert from 'node:assert/strict';
import { AppError, ERROR_CODE, handleError, setErrorLogger, toAppError, toUserMessage } from '../src/lib/errors.js';
import { createRepositories } from '../src/repositories/index.js';
import { createServices } from '../src/services/index.js';
import {
  activityFromDestination, activityFromOccurrence, activityFromSession, createDestination,
  createWorkout, createWorkoutItem, toLocalDateTime, addDays, validateActivity,
} from '../src/models/index.js';

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n += 1; };

// ---- errors ----
ok(toUserMessage(new AppError(ERROR_CODE.VALIDATION, 'x', { errors: { title: 'Title is required.' } })) === 'Title is required.', 'validation shows first field message');
ok(toUserMessage(new AppError(ERROR_CODE.OFFLINE, 'x')) === 'This needs an internet connection.', 'offline message');
ok(toUserMessage(new Error('secret technical stack')) === 'Something went wrong. Please try again.', 'unknown hides technical text');
ok(toAppError({ code: 'auth/popup-blocked' }).code === 'auth' && toAppError({ code: 'unavailable' }).code === 'network', 'firebase errors normalized');
ok(toAppError(new Error('boom')).code === 'unknown' && toAppError(new Error('boom')).details.cause.message === 'boom', 'cause kept');
const seen = [];
setErrorLogger((e, ctx) => seen.push([e.code, ctx]));
ok(handleError(new AppError(ERROR_CODE.NOT_FOUND, 'x'), 'test') === 'We could not find that item. It may have been deleted.' && seen[0][0] === 'not_found' && seen[0][1] === 'test', 'handleError logs and returns message');
setErrorLogger(null);

// ---- date helpers ----
ok(addDays('2026-11-30', 1) === '2026-12-01' && addDays('2026-03-01', -1) === '2026-02-28', 'addDays crosses month boundaries');
ok(toLocalDateTime(new Date(2026, 10, 12, 8, 5)) === '2026-11-12T08:05', 'toLocalDateTime');

// ---- mappers + service ----
const repos = createRepositories({ userId: 'alex' });
const svc = createServices(repos, { today: () => '2026-11-12' });
const ds = await svc.schedule.create({ title: 'Data Structures', category: 'School', location: 'Room 304', startTime: '08:00', endTime: '09:30', date: '2026-11-12' });
const gym = await svc.schedule.create({ title: 'Gym', category: 'Exercise', startTime: '12:30', endTime: '13:15', date: '2026-11-12' });
const cap = await svc.schedule.create({ title: 'Capstone', category: 'Projects', startTime: '15:00', endTime: '16:00', date: '2026-11-12' });
const o1 = await svc.schedule.addOccurrence(ds.id, '2026-11-12');
await svc.schedule.addOccurrence(gym.id, '2026-11-12');
await svc.schedule.addOccurrence(cap.id, '2026-11-12');
await svc.schedule.addOccurrence(ds.id, '2026-11-16');

const a = activityFromOccurrence(ds, o1);
ok(a.id === activityFromOccurrence(ds, o1).id && a.startsAt === '2026-11-12T08:00' && a.refs.scheduleId === ds.id && a.refs.occurrenceId === o1.id && validateActivity(a).valid, 'occurrence -> activity (stable id, refs, valid)');
const trip = activityFromDestination(createDestination({ name: 'Makati', latitude: 14.55, longitude: 121.02 }), { startsAt: '2026-11-12T17:30' });
ok(trip.module === 'map' && trip.type === 'trip' && trip.category === 'Travel' && validateActivity(trip).valid, 'destination -> trip activity');

const today = await svc.activity.listToday({ today: '2026-11-12' });
ok(today.length === 3 && today.map((x) => x.title).join() === 'Data Structures,Gym,Capstone', 'today list sorted by start time');
ok((await svc.activity.list({ from: '2026-11-01', to: '2026-11-30' })).length === 4, 'range list');
ok((await svc.activity.listToday({ today: '2026-11-12', category: 'Exercise' })).length === 1, 'filter by category');
ok((await svc.activity.listToday({ today: '2026-11-12', module: 'fitness' })).length === 0, 'filter by module');

await svc.schedule.setOccurrenceStatus(o1.id, 'done');
const now = new Date(2026, 10, 12, 10, 0);
const up = await svc.activity.listUpcoming({ now, days: 7 });
ok(up.map((x) => x.title).join() === 'Gym,Capstone,Data Structures' && up[2].startsAt === '2026-11-16T08:00', 'upcoming skips done + past, soonest first');
ok((await svc.activity.listUpcoming({ now, days: 7, limit: 1 })).length === 1, 'upcoming limit');
ok((await svc.activity.listUpcoming({ now, days: 2 })).every((x) => x.startsAt < '2026-11-15'), 'upcoming respects days window');

// workout session appears as a fitness activity
const w = await svc.workout.create(createWorkout({ name: 'Upper body', items: [createWorkoutItem({ name: 'Push-ups', reps: 12 })] }));
const sess = await svc.workout.startSession(w.id);
const sa = activityFromSession(sess);
ok(sa.module === 'fitness' && sa.status === 'in_progress' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(sa.startsAt), 'session -> activity');
await svc.workout.finishSession(sess.id, { activeSeconds: 600 });
const fit = await svc.activity.list({ module: 'fitness' });
ok(fit.length === 1 && fit[0].status === 'done' && fit[0].refs.workoutId === w.id, 'finished session listed, status done');

// deleted schedule disappears from activity
await svc.schedule.remove(gym.id);
ok((await svc.activity.listToday({ today: '2026-11-12' })).every((x) => x.title !== 'Gym'), 'deleted schedule not shown');

console.log(`PACE 3 errors + activity OK (${n} checks)`);
