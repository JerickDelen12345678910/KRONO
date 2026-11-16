// Dependency-free self-check for repeat rules + occurrence syncing. Run: node scripts/check-recurrence.mjs
import assert from 'node:assert/strict';
import { MAX_SPAN_DAYS, occurrenceDates, scheduleWindow } from '../src/lib/recurrence.js';
import { createRepositories } from '../src/repositories/index.js';
import { createServices } from '../src/services/index.js';
import { createSchedule } from '../src/models/index.js';

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n += 1; };
const mk = (o) => createSchedule({ title: 'T', category: 'School', startTime: '08:00', endTime: '09:00', ...o });
const rule = (type, extra = {}) => ({ type, interval: 1, daysOfWeek: [], startDate: '2026-11-02', endDate: '2026-11-30', ...extra }); // 2026-11-02 is a Monday

// ---- pure rules ----
ok(occurrenceDates(mk({ date: '2026-11-12' })).join() === '2026-11-12', 'one-time');
ok(occurrenceDates(mk({ date: '2026-11-12' }), { from: '2026-11-13' }).length === 0 && occurrenceDates(mk({ date: null })).length === 0, 'one-time clipped / no date');
ok(occurrenceDates(mk({ repeat: rule('daily', { endDate: '2026-11-05' }) })).join() === '2026-11-02,2026-11-03,2026-11-04,2026-11-05', 'daily');
ok(occurrenceDates(mk({ repeat: rule('daily', { startDate: '2026-11-28', endDate: '2026-12-02', interval: 2 }) })).join() === '2026-11-28,2026-11-30,2026-12-02', 'every 2 days across a month end');
ok(occurrenceDates(mk({ repeat: rule('custom', { interval: 10 }) })).join() === '2026-11-02,2026-11-12,2026-11-22', 'custom = every N days');
ok(occurrenceDates(mk({ repeat: rule('weekly') })).join() === '2026-11-02,2026-11-09,2026-11-16,2026-11-23,2026-11-30', 'weekly defaults to the start weekday (Mon)');
ok(occurrenceDates(mk({ repeat: rule('weekly', { interval: 2, daysOfWeek: [1, 4] }) })).join() === '2026-11-02,2026-11-05,2026-11-16,2026-11-19,2026-11-30', 'every 2 weeks on Mon+Thu');
ok(occurrenceDates(mk({ repeat: rule('selectedDays', { daysOfWeek: [1, 4] }) })).length === 9, 'selectedDays Mon+Thu = 9 in November');
ok(occurrenceDates(mk({ repeat: rule('selectedDays', { daysOfWeek: [0] }) })).join() === '2026-11-08,2026-11-15,2026-11-22,2026-11-29', 'Sundays');
ok(occurrenceDates(mk({ repeat: rule('selectedDays', { daysOfWeek: [1, 4] }) }), { from: '2026-11-10', to: '2026-11-16' }).join() === '2026-11-12,2026-11-16', 'clipped to a range');
ok(occurrenceDates(mk({ repeat: rule('daily', { startDate: '2026-12-01', endDate: '2026-11-01' }) })).length === 0, 'end before start -> nothing');
ok(scheduleWindow(mk({ repeat: rule('daily', { startDate: '2026-01-01', endDate: '2030-01-01' }) })).to === '2027-01-01' && MAX_SPAN_DAYS === 366, 'window capped at 366 days (start day included)');

// ---- service sync ----
const svc = createServices(createRepositories({ userId: 'alex' }), { today: () => '2026-11-12' }); // a Thursday
const occ = (id, o = {}) => svc.schedule.occurrences.list({ where: { scheduleId: id }, ...o });
const dates = async (id) => (await occ(id)).map((o) => o.date).sort().join();

const cls = await svc.schedule.create({ title: 'Class', category: 'School', startTime: '08:00', endTime: '09:30', repeat: rule('selectedDays', { daysOfWeek: [1, 4] }) });
ok((await occ(cls.id)).length === 9, 'create generates occurrences');
ok((await svc.schedule.syncOccurrences(cls.id)).created === 0 && (await occ(cls.id)).length === 9, 'sync is idempotent');

// history: one past occurrence done, one upcoming done
const past = (await occ(cls.id)).find((o) => o.date === '2026-11-09');
const fut = (await occ(cls.id)).find((o) => o.date === '2026-11-19');
await svc.schedule.setOccurrenceStatus(past.id, 'done');
await svc.schedule.setOccurrenceStatus(fut.id, 'done');

// edit time: only upcoming scheduled ones change
await svc.schedule.update(cls.id, { startTime: '09:00', endTime: '10:30' });
const after = await occ(cls.id);
ok(after.find((o) => o.date === '2026-11-16').startTime === '09:00' && after.find((o) => o.date === '2026-11-05').startTime === '08:00' && after.find((o) => o.date === '2026-11-19').startTime === '08:00', 'time edit applies to upcoming only; past and done keep old time');

// edit days Mon+Thu -> Tue only
const sum = await svc.schedule.update(cls.id, { repeat: rule('selectedDays', { daysOfWeek: [2] }) }).then(() => svc.schedule.syncOccurrences(cls.id));
const d = await dates(cls.id);
ok(d.includes('2026-11-09') && d.includes('2026-11-19'), 'past done and upcoming done are never removed');
ok(!d.includes('2026-11-16') && !d.includes('2026-11-23') && !d.includes('2026-11-26'), 'upcoming Mon/Thu occurrences removed');
ok(d.includes('2026-11-17') && d.includes('2026-11-24') && sum.created === 0, 'new Tuesday occurrences added');
ok(d.includes('2026-11-05') && d.includes('2026-11-02'), 'past scheduled history kept');

// change back -> removed occurrences are restored (same deterministic id)
await svc.schedule.update(cls.id, { repeat: rule('selectedDays', { daysOfWeek: [1, 4] }) });
const d2 = await dates(cls.id);
ok(d2.includes('2026-11-16') && d2.includes('2026-11-26') && !d2.includes('2026-11-17'), 'removed dates come back (restored), Tuesday ones go');
const ids = (await occ(cls.id, { includeDeleted: true })).map((o) => o.id);
ok(new Set(ids).size === ids.length, 'no duplicate ids after restore');

// shorten end date
await svc.schedule.update(cls.id, { repeat: rule('selectedDays', { daysOfWeek: [1, 4], endDate: '2026-11-20' }) });
ok((await dates(cls.id)).split(',').every((x) => x <= '2026-11-20' || x === '2026-11-19'), 'shorter end date removes later occurrences');

// one-time: moving the date moves the occurrence (even from the past)
const once = await svc.schedule.create({ title: 'Meeting', category: 'Projects', date: '2026-11-03', startTime: '15:00', endTime: '16:00' });
ok(await dates(once.id) === '2026-11-03', 'one-time creates one occurrence');
await svc.schedule.update(once.id, { date: '2026-11-20' });
ok(await dates(once.id) === '2026-11-20', 'one-time date change moves the occurrence');
await svc.schedule.setOccurrenceStatus((await occ(once.id))[0].id, 'done');
await svc.schedule.update(once.id, { date: '2026-11-25' });
ok((await dates(once.id)).split(',').length === 2, 'a done one-time occurrence stays as history');

// sample flag + delete
const sample = await svc.schedule.create({ title: 'Sample', category: 'School', isSample: true, date: '2026-11-20', startTime: '10:00', endTime: '11:00' });
ok((await occ(sample.id))[0].isSample === true, 'occurrences inherit the sample flag');
await svc.schedule.remove(cls.id);
ok((await occ(cls.id)).length === 0, 'deleting a schedule removes its occurrences');

console.log(`PACE 2 recurrence + sync OK (${n} checks)`);
