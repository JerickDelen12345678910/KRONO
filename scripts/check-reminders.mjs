// Dependency-free self-check for the reminder planning logic (src/lib/reminders.js). Run: node scripts/check-reminders.mjs
import assert from 'node:assert/strict';
import { REMINDER_OFFSETS } from '../src/models/constants.js';
import {
  DEFAULT_REMINDER_SETTINGS, MAX_OFFSET_MINUTES, PLAN_HORIZON_DAYS, PLAN_MAX_REMINDERS, REMINDER_MODE, REMINDER_SOUNDS, SNOOZE_OPTIONS,
  buildReminders, defaultReminder, diffReminders, normalizeReminderSettings, reminderFireAt, reminderMode,
} from '../src/lib/reminders.js';
import { createRepositories } from '../src/repositories/index.js';
import { createServices } from '../src/services/index.js';

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); n += 1; };
const deepFreeze = (o) => { Object.values(o).forEach((v) => { if (v && typeof v === 'object') deepFreeze(v); }); return Object.freeze(o); };

const NOW = '2026-11-16T07:00';   // a Monday
const sch = (o = {}) => ({ id: 's1', title: 'CS 201 · Data Structures', location: 'Room 304', deleted: false, reminder: { enabled: true, offsetMinutes: 15, useAlarm: true }, ...o });
const occ = (date, o = {}) => ({ id: `s1_${date}`, scheduleId: 's1', date, startTime: '08:00', endTime: '09:30', status: 'scheduled', deleted: false, ...o });
const dates = ['2026-11-16', '2026-11-19', '2026-11-23', '2026-11-26', '2026-11-30', '2026-12-03'];
const all = dates.map((d) => occ(d));
const ids = (list) => list.map((r) => r.id);

// ---- constants ----
eq([PLAN_HORIZON_DAYS, PLAN_MAX_REMINDERS, MAX_OFFSET_MINUTES], [14, 60, 10080], 'planning limits');
eq(REMINDER_MODE, { NOTIFY: 'notify', ALARM: 'alarm', BOTH: 'both' }, 'modes');
eq([SNOOZE_OPTIONS.join(), REMINDER_SOUNDS.join()], ['5,10,15', 'default,gentle,bright'], 'snooze options and sound names');

// ---- fire time ----
eq(reminderFireAt('2026-11-16', '08:00', 15), '2026-11-16T07:45', '15 minutes before');
eq(reminderFireAt('2026-11-16', '08:00', 0), '2026-11-16T08:00', 'at start time');
eq(reminderFireAt('2026-11-16', '08:00', 60), '2026-11-16T07:00', '1 hour before');
eq(reminderFireAt('2026-11-16', '08:00', 90), '2026-11-16T06:30', 'custom minutes');
eq(reminderFireAt('2026-11-16', '00:10', 30), '2026-11-15T23:40', 'crosses midnight backwards');
eq(reminderFireAt('2026-12-01', '00:00', 1), '2026-11-30T23:59', 'crosses a month');
eq(reminderFireAt('2026-11-16', '08:00', MAX_OFFSET_MINUTES), '2026-11-09T08:00', 'one week before');
ok(REMINDER_OFFSETS.every((m) => reminderFireAt('2026-11-16', '08:00', m) !== null), 'every preset offset gives a time');
for (const bad of [['2026-02-30', '08:00', 15], ['2026-11-16', '8:00', 15], ['2026-11-16', '08:00', -1], ['2026-11-16', '08:00', 1.5], ['2026-11-16', '08:00', '15'], ['2026-11-16', '08:00', null], ['2026-11-16', '08:00', MAX_OFFSET_MINUTES + 1], [null, '08:00', 15]]) {
  ok(reminderFireAt(...bad) === null, `invalid input -> null: ${JSON.stringify(bad)}`);
}
eq([reminderMode({ useAlarm: true }), reminderMode({ useAlarm: false }), reminderMode(undefined)], ['both', 'notify', 'notify'], 'mode follows useAlarm');

// ---- global settings ----
eq(normalizeReminderSettings(undefined), DEFAULT_REMINDER_SETTINGS, 'undefined -> defaults');
eq(normalizeReminderSettings(null), DEFAULT_REMINDER_SETTINGS, 'null -> defaults');
eq(normalizeReminderSettings({ enabled: 'yes', defaultOffsetMinutes: -5, defaultUseAlarm: 1, sound: 'loud', snoozeMinutes: 7, extra: 1 }), DEFAULT_REMINDER_SETTINGS, 'bad values -> defaults, unknown keys dropped');
eq(normalizeReminderSettings({ enabled: false, defaultOffsetMinutes: 30, defaultUseAlarm: false, sound: 'gentle', snoozeMinutes: 5 }), { enabled: false, defaultOffsetMinutes: 30, defaultUseAlarm: false, sound: 'gentle', snoozeMinutes: 5 }, 'valid values kept');
ok(normalizeReminderSettings(undefined) !== DEFAULT_REMINDER_SETTINGS, 'a new object each time');
eq(defaultReminder(undefined), { enabled: true, offsetMinutes: 15, useAlarm: true }, 'default reminder for a new schedule');
eq(defaultReminder({ defaultOffsetMinutes: 0, defaultUseAlarm: false }), { enabled: true, offsetMinutes: 0, useAlarm: false }, 'defaults follow the settings');

// ---- buildReminders: the window ----
const plan = buildReminders({ schedules: [sch()], occurrences: all, now: NOW });
eq(ids(plan), ['s1_2026-11-16', 's1_2026-11-19', 's1_2026-11-23', 's1_2026-11-26'], 'next 14 days only (Nov 30 at 07:45 is past the window)');
eq(plan[0], {
  id: 's1_2026-11-16', occurrenceId: 's1_2026-11-16', scheduleId: 's1', title: 'CS 201 · Data Structures', body: 'Starts at 8:00 AM · Room 304',
  date: '2026-11-16', startTime: '08:00', offsetMinutes: 15, fireAt: '2026-11-16T07:45', mode: 'both', sound: 'default', snoozeMinutes: 10,
}, 'every field of a planned reminder');
eq(ids(buildReminders({ schedules: [sch()], occurrences: all, now: '2026-11-16T07:44' })).slice(0, 1), ['s1_2026-11-16'], 'one minute before the fire time it is still planned');
ok(!ids(buildReminders({ schedules: [sch()], occurrences: all, now: '2026-11-16T07:45' })).includes('s1_2026-11-16'), 'a reminder whose time is now is already missed');
ok(!ids(buildReminders({ schedules: [sch()], occurrences: all, now: '2026-11-16T09:00' })).includes('s1_2026-11-16'), 'past reminders are left out');
eq(ids(buildReminders({ schedules: [sch({ reminder: { enabled: true, offsetMinutes: 0, useAlarm: true } })], occurrences: [occ('2026-11-30', { startTime: '07:00' })], now: NOW })), ['s1_2026-11-30'], 'the end of the window is included');
eq(ids(buildReminders({ schedules: [sch()], occurrences: all, now: NOW, horizonDays: 4 })), ['s1_2026-11-16', 's1_2026-11-19'], 'custom horizon');
eq(ids(buildReminders({ schedules: [sch()], occurrences: all, now: NOW, max: 2 })), ['s1_2026-11-16', 's1_2026-11-19'], 'max keeps the earliest');
eq(ids(buildReminders({ schedules: [sch()], occurrences: [...all].reverse(), now: NOW })), ids(plan), 'sorted by time whatever the input order');
eq(ids(buildReminders({ schedules: [sch()], occurrences: [all[1], all[1], all[1]], now: NOW })), ['s1_2026-11-19'], 'the same occurrence never gives two reminders');
eq(buildReminders({ schedules: [], occurrences: [] }), [], 'nothing in -> nothing out (default now)');
let threw = false;
try { buildReminders({ schedules: [sch()], occurrences: all, now: 'tomorrow' }); } catch (e) { threw = e instanceof TypeError; }
ok(threw, 'a bad `now` is rejected');

// ---- buildReminders: what is left out ----
for (const status of ['done', 'skipped', 'cancelled']) eq(buildReminders({ schedules: [sch()], occurrences: [occ('2026-11-19', { status })], now: NOW }), [], `${status} occurrences get no reminder`);
eq(buildReminders({ schedules: [sch()], occurrences: [occ('2026-11-19', { deleted: true })], now: NOW }), [], 'deleted occurrence');
eq(buildReminders({ schedules: [sch({ deleted: true })], occurrences: all, now: NOW }), [], 'deleted schedule');
eq(buildReminders({ schedules: [], occurrences: all, now: NOW }), [], 'occurrence without a schedule');
eq(buildReminders({ schedules: [sch({ reminder: { enabled: false, offsetMinutes: 15, useAlarm: true } })], occurrences: all, now: NOW }), [], 'reminder off for this schedule');
eq(buildReminders({ schedules: [sch({ reminder: undefined })], occurrences: all, now: NOW }), [], 'schedule without reminder settings');
eq(buildReminders({ schedules: [sch()], occurrences: all, now: NOW, settings: { enabled: false } }), [], 'global switch off -> no reminders');
eq(buildReminders({ schedules: [sch()], occurrences: [occ('2026-02-30'), occ('2026-11-19', { startTime: '8am' })], now: NOW }), [], 'invalid dates/times are skipped without throwing');

// ---- buildReminders: per-schedule and global settings ----
const quick = buildReminders({ schedules: [sch({ reminder: { enabled: true, offsetMinutes: 0, useAlarm: false } })], occurrences: [occ('2026-11-19')], now: NOW })[0];
eq([quick.fireAt, quick.mode, quick.offsetMinutes], ['2026-11-19T08:00', 'notify', 0], 'per-schedule timing and mode win');
eq(buildReminders({ schedules: [sch()], occurrences: [occ('2026-11-19', { startTime: '09:00' })], now: NOW })[0].fireAt, '2026-11-19T08:45', 'the occurrence start time is used');
const custom = buildReminders({ schedules: [sch({ location: '  ' })], occurrences: [occ('2026-11-19')], now: NOW, settings: { sound: 'gentle', snoozeMinutes: 15 } })[0];
eq([custom.sound, custom.snoozeMinutes, custom.body], ['gentle', 15, 'Starts at 8:00 AM'], 'global sound and snooze apply; blank location is left out of the text');
const frozen = deepFreeze({ schedules: [sch()], occurrences: [...all] });
eq(ids(buildReminders({ ...frozen, now: NOW })), ids(plan), 'inputs are never changed (frozen inputs work)');

// ---- diffReminders ----
eq(diffReminders(undefined, undefined), { schedule: [], cancel: [], keep: [] }, 'no arguments');
const first = diffReminders([], plan);
eq([first.schedule.length, first.cancel, first.keep], [4, [], []], 'first run: schedule everything');
eq(diffReminders(plan, plan), { schedule: [], cancel: [], keep: ids(plan) }, 'same plan: nothing to do');
const withoutOne = buildReminders({ schedules: [sch()], occurrences: [occ('2026-11-16', { status: 'done' }), ...all.slice(1)], now: NOW });
const dropped = diffReminders(plan, withoutOne);
eq([dropped.schedule, dropped.cancel, dropped.keep.length], [[], ['s1_2026-11-16'], 3], 'done occurrence -> only that reminder is cancelled');
const moved = buildReminders({ schedules: [sch()], occurrences: all.map((o) => ({ ...o, startTime: '09:00' })), now: NOW });
const changed = diffReminders(plan, moved);
eq([changed.schedule.length, changed.cancel, changed.keep], [4, [], []], 'new time: replace (same ids), cancel nothing');
eq(ids(changed.schedule), ids(plan), 'replacements reuse the same ids, so no duplicates');
eq(diffReminders(plan, buildReminders({ schedules: [sch()], occurrences: all, now: NOW, settings: { sound: 'bright' } })).schedule.length, 4, 'changing the sound refreshes the reminders');
eq(diffReminders(plan, buildReminders({ schedules: [sch({ title: 'Renamed' })], occurrences: all, now: NOW })).schedule.length, 4, 'renaming refreshes the reminders');
eq(diffReminders(plan, []).cancel, ids(plan), 'everything off -> cancel all');
eq(diffReminders([plan[0]], plan).keep, [plan[0].id], 'a reminder already scheduled is kept, the rest is scheduled');

// ---- end to end through the real services (what the next PACE will use) ----
const svc = createServices(createRepositories({ userId: 'reminders' }), { today: () => '2026-11-16' });
const cls = await svc.schedule.create({
  title: 'Class', category: 'School', startTime: '08:00', endTime: '09:30', location: 'Room 304',
  repeat: { type: 'selectedDays', interval: 1, daysOfWeek: [1, 4], startDate: '2026-11-16', endDate: '2027-03-22' },
});
const replan = async (extra = {}) => buildReminders({
  schedules: await svc.schedule.list(), occurrences: await svc.schedule.listOccurrences({ from: '2026-11-01', to: '2027-04-01' }), now: NOW, ...extra,
});
const occOn = async (date) => (await svc.schedule.listOccurrences({ scheduleId: cls.id })).find((o) => o.date === date);

const p1 = await replan();
eq(ids(p1), ['2026-11-16', '2026-11-19', '2026-11-23', '2026-11-26'].map((d) => `${cls.id}_${d}`), 'a new weekly class: 4 reminders in the next 14 days');
ok(p1.every((r) => r.mode === 'both' && r.title === 'Class' && r.body === 'Starts at 8:00 AM · Room 304'), 'default reminder: notification + alarm, 15 minutes before');
eq(p1.map((r) => r.fireAt.slice(11)), ['07:45', '07:45', '07:45', '07:45'], '15 minutes before 8:00');

const monday = await occOn('2026-11-16');
await svc.schedule.setOccurrenceStatus(monday.id, 'done');
const p2 = await replan();
eq([diffReminders(p1, p2).cancel, diffReminders(p1, p2).schedule.length], [[monday.id], 0], 'Mark done cancels just that reminder');
await svc.schedule.setOccurrenceStatus(monday.id, 'scheduled');
eq(await replan(), p1, 'Undo brings it back, identical');

await svc.schedule.update(cls.id, { startTime: '09:00', endTime: '10:30' });
const p3 = await replan();
eq(p3.map((r) => r.fireAt.slice(11)), ['08:45', '08:45', '08:45', '08:45'], 'editing the time moves the upcoming reminders');
eq([diffReminders(p1, p3).schedule.length, diffReminders(p1, p3).cancel], [4, []], 'the edit replaces reminders, never duplicates them');

const occCount = (await svc.schedule.listOccurrences({ scheduleId: cls.id })).length;
eq(await replan({ settings: { enabled: false } }), [], 'global switch off -> no reminders');
await svc.schedule.update(cls.id, { reminder: { enabled: false, offsetMinutes: 15, useAlarm: true } });
eq(await replan(), [], 'reminder off for the schedule -> no reminders');
eq([(await svc.schedule.list()).length, (await svc.schedule.listOccurrences({ scheduleId: cls.id })).length], [1, occCount], 'turning reminders off keeps the schedule and its occurrences');
await svc.schedule.update(cls.id, { reminder: { enabled: true, offsetMinutes: 0, useAlarm: false } });
const p4 = await replan();
ok(p4.length === 4 && p4.every((r) => r.mode === 'notify' && r.fireAt.endsWith('T09:00')), 'turned back on: notify only, at start time');

await svc.schedule.remove(cls.id);
eq(await replan(), [], 'deleting the schedule removes its reminders');

console.log(`Phase 5 PACE 1 reminders OK (${n} checks)`);
