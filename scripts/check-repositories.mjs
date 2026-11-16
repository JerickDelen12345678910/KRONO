// Dependency-free self-check for repositories + services. Run: node scripts/check-repositories.mjs
import assert from 'node:assert/strict';
import { createRepositories, createMemoryStore } from '../src/repositories/index.js';
import { createServices } from '../src/services/index.js';
import { createDestination, createWorkout, createWorkoutItem } from '../src/models/index.js';
import { isAppError } from '../src/lib/errors.js';

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n += 1; };
const fails = async (fn, code, m) => {
  try { await fn(); } catch (e) { ok(isAppError(e) && e.code === code, m); return e; }
  throw new Error(`Expected AppError(${code}): ${m}`);
};

const store = createMemoryStore();
const repos = createRepositories({ userId: 'alex', store });
const svc = createServices(repos);
const base = { title: 'Data Structures', category: 'School', startTime: '08:00', endTime: '09:30', repeat: { type: 'selectedDays', daysOfWeek: [1, 4], startDate: '2026-08-10', endDate: '2026-12-12' } };

// repository basics
const s = await svc.schedule.create(base);
ok(s.version === 1 && s.syncStatus === 'local', 'create');
ok((await repos.schedules.get(s.id)).title === 'Data Structures', 'get');
const v = await fails(() => svc.schedule.create({ ...base, title: ' ' }), 'validation', 'create rejects invalid data');
ok(v.details.errors.title, 'validation errors listed by field');
await fails(() => repos.schedules.create({ ...base, id: s.id }), 'conflict', 'duplicate id rejected');
ok((await repos.schedules.getOrCreate({ ...base, id: s.id })).id === s.id && (await repos.schedules.list()).length === 1, 'getOrCreate is retry-safe');

// update / versions / protection
const u = await svc.schedule.update(s.id, { title: 'DSA', version: 99, id: 'hack' });
ok(u.title === 'DSA' && u.version === 2 && u.id === s.id, 'update bumps version, protects id/version');
await fails(() => svc.schedule.update(s.id, { title: 'X' }, { expectedVersion: 1 }), 'conflict', 'stale version rejected');
await fails(() => svc.schedule.update('missing', {}), 'not_found', 'update missing');
await fails(() => svc.schedule.update(s.id, { endTime: '07:00' }), 'validation', 'update validates result');

// sync bookkeeping
ok((await repos.schedules.listUnsynced()).length === 1, 'unsynced listed');
await repos.schedules.setSyncStatus(s.id, 'synced');
ok((await repos.schedules.listUnsynced()).length === 0 && (await repos.schedules.get(s.id)).version === 2, 'setSyncStatus does not bump version');
ok((await svc.schedule.update(s.id, { location: 'Room 304' })).syncStatus === 'pending', 'editing a synced record queues it again');
await fails(() => repos.schedules.setSyncStatus(s.id, 'bogus'), 'invalid', 'bad sync status');

// list filters
await svc.schedule.create({ title: 'Gym', category: 'Exercise', date: '2026-11-12', startTime: '12:30', endTime: '13:15' });
ok((await svc.schedule.list({ category: 'School' })).length === 1 && (await svc.schedule.list({ search: 'gym' })).length === 1 && (await svc.schedule.list()).length === 2, 'list filters');

// occurrences
const o1 = await svc.schedule.addOccurrence(s.id, '2026-11-12');
const o2 = await svc.schedule.addOccurrence(s.id, '2026-11-12');
ok(o1.id === o2.id && (await svc.schedule.listOccurrences({ date: '2026-11-12' })).length === 1, 'occurrence not duplicated');
await svc.schedule.addOccurrence(s.id, '2026-11-16');
ok((await svc.schedule.listOccurrences({ from: '2026-11-01', to: '2026-11-30' })).length === 2, 'occurrence range');
const done = await svc.schedule.setOccurrenceStatus(o1.id, 'done');
ok(done.status === 'done' && done.completedAt, 'mark done');
ok((await svc.schedule.setOccurrenceStatus(o1.id, 'scheduled')).completedAt === null, 'undo clears completedAt');

// soft delete + cascade
await svc.schedule.remove(s.id);
ok((await repos.schedules.get(s.id)) === null && (await repos.schedules.get(s.id, { includeDeleted: true })).deleted === true, 'soft delete hides record, keeps marker');
ok((await svc.schedule.listOccurrences({ scheduleId: s.id })).length === 0, 'occurrences removed with schedule');
ok((await svc.schedule.remove(s.id)).deleted === true, 'remove twice is safe');
ok((await repos.schedules.listUnsynced()).some((r) => r.id === s.id && r.deleted), 'deletion marker waits to sync');

// account isolation
const other = createRepositories({ userId: 'maria', store });
ok((await other.schedules.list()).length === 0 && (await repos.schedules.list()).length === 1, 'users cannot see each other');
await fails(async () => createRepositories({}), 'invalid', 'userId required');

// workouts
const w = await svc.workout.create(createWorkout({ name: 'Upper body', items: [createWorkoutItem({ name: 'Push-ups', reps: 12 })] }));
const sess = await svc.workout.startSession(w.id);
ok(sess.status === 'in_progress' && (await svc.workout.listHistory()).length === 0, 'session starts, not in history yet');
const fin = await svc.workout.finishSession(sess.id, { activeSeconds: 1800 });
ok(fin.status === 'completed' && fin.endedAt && (await svc.workout.listHistory()).length === 1, 'finished session in history');
await fails(() => svc.workout.create({ name: '' }), 'validation', 'workout validation');

// places
const home = await svc.place.save(createDestination({ name: 'Home', latitude: 14.65, longitude: 121.05 }));
await svc.place.save(createDestination({ name: 'Gym', latitude: 14.63, longitude: 121.07 }));
await svc.place.setFavorite(home.id, true);
ok((await svc.place.listFavorites()).length === 1 && (await svc.place.list({ search: 'gy' })).length === 1, 'places favorites + search');
await fails(() => svc.place.save({ name: 'Bad', latitude: 999, longitude: 0 }), 'validation', 'bad coordinates');

// sample data
await svc.place.save(createDestination({ name: 'Sample Cafe', latitude: 14.5, longitude: 121, isSample: true }));
const removed = await svc.sampleData.removeAll();
ok(removed.destinations === 1 && (await svc.place.list()).length === 2, 'sample removal keeps real records');

console.log(`PACE 2 repositories + services OK (${n} checks)`);
