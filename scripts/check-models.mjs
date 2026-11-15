// Dependency-free self-check for src/models. Run: node scripts/check-models.mjs
import assert from 'node:assert/strict';
import * as M from '../src/models/index.js';

let n = 0;
const ok = (c, msg) => { assert.ok(c, msg); n += 1; };

// base record + helpers
const a = M.createBase(), b = M.createBase();
ok(a.id !== b.id && a.version === 1 && a.deleted === false && a.syncStatus === 'local', 'base record');
const t = M.touch({ ...a, syncStatus: 'synced' }, { x: 1 });
ok(t.version === 2 && t.syncStatus === 'pending' && t.x === 1, 'touch bumps version and queues sync');
ok(M.markDeleted(a).deleted === true && M.markDeleted(a).deletedAt, 'soft delete marker');
ok(M.isDate('2026-11-12') && !M.isDate('2026-02-31') && !M.isDate('11/12/2026'), 'isDate');
ok(M.isTime('08:00') && M.isTime('23:59') && !M.isTime('24:00') && !M.isTime('8:00'), 'isTime');

// schedule: one-time, repeating, invalid
const one = M.createSchedule({ title: 'Capstone meeting', category: 'Projects', date: '2026-11-12', startTime: '15:00', endTime: '16:00' });
ok(M.validateSchedule(one).valid, 'valid one-time schedule');
ok(one.color === 'slate' && one.reminder.offsetMinutes === 15, 'defaults');
const rep = M.createSchedule({ title: 'Data Structures', category: 'School', startTime: '08:00', endTime: '09:30',
  repeat: { type: 'selectedDays', daysOfWeek: [1, 4], startDate: '2026-08-10', endDate: '2026-12-12' } });
ok(M.validateSchedule(rep).valid, 'valid repeating schedule');
const bad = M.validateSchedule(M.createSchedule({ title: ' ', category: 'Nope', startTime: '10:00', endTime: '09:00', repeat: { type: 'selectedDays', startDate: '2026-12-01', endDate: '2026-11-01' } }));
ok(!bad.valid && bad.errors.title && bad.errors.category && bad.errors.endTime && bad.errors.repeatEnd && bad.errors.daysOfWeek, 'invalid schedule reports every problem');
const occ = M.createOccurrence(rep, '2026-08-13');
ok(occ.id === `${rep.id}_2026-08-13` && occ.status === 'scheduled' && occ.scheduleId === rep.id, 'deterministic occurrence id');

// academic
ok(M.validateSubject(M.createSubject({ name: 'Databases', days: [3], startTime: '13:00', endTime: '16:00' })).valid, 'subject');
ok(!M.validateAcademicPeriod(M.createAcademicPeriod({ name: 'S1', startDate: '2026-08-10', endDate: '2026-01-01' })).valid, 'period end before start');

// fitness
const w = M.createWorkout({ name: 'Upper body', items: [M.createWorkoutItem({ name: 'Push-ups', reps: 12 }), M.createWorkoutItem({ name: 'Plank', reps: null, durationSec: 45 })] });
ok(M.validateWorkout(w).valid && !M.validateWorkout({ ...w, items: [] }).valid, 'workout');
const s = M.createWorkoutSession(w);
ok(s.entries.length === 2 && s.status === 'in_progress' && s.workoutId === w.id, 'session from workout');

// place, user, activity
ok(M.validateDestination(M.createDestination({ name: 'Makati', latitude: 14.55, longitude: 121.02 })).valid, 'destination');
ok(!M.validateDestination(M.createDestination({ name: 'X', latitude: 200, longitude: 0 })).valid, 'bad latitude');
ok(M.validateUserProfile(M.createUserProfile({ displayName: 'Alex', userType: 'Student' })).valid, 'profile');
const act = M.createActivity({ title: 'Data Structures', refs: { scheduleId: rep.id } });
ok(M.validateActivity(act).valid && act.refs.workoutId === null && act.refs.scheduleId === rep.id, 'activity refs');

console.log(`PACE 1 models OK (${n} checks)`);
