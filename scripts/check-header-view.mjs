// scripts/check-header-view.mjs — Phase 11 PACE 2: pure shared header search & notifications bell logic
// (src/lib/headerView.js) and ReminderService.snooze() (src/services/ReminderService.js).
// Runs in plain Node via `npm run check`.
import assert from 'node:assert/strict';
import { reminderNotifications, searchAll } from '../src/lib/headerView.js';
import { ReminderService } from '../src/services/ReminderService.js';
import { OCCURRENCE_STATUS } from '../src/models/constants.js';

let n = 0;
const eq = (a, b, m) => { assert.equal(a, b, m); n += 1; };
const deepEq = (a, b, m) => { assert.deepEqual(a, b, m); n += 1; };
const ok = (c, m) => { assert.ok(c, m); n += 1; };

const NOW = new Date(2026, 10, 23, 7, 30, 0);   // Mon Nov 23, 2026 07:30

// ================= searchAll =================
deepEq(searchAll({ query: '   ' }), { query: '', total: 0, groups: [] }, 'blank query returns empty result');

const schedules = [
  { id: 's1', title: 'Data Structures', category: 'School', location: 'Room 304', description: 'Trees and graphs', date: '2026-11-23', startTime: '08:00', repeat: { type: 'none' } },
  { id: 's2', title: 'Ferry to Batangas', category: 'Travel', location: 'Calapan Pier', destinationId: 'p1', date: '2026-11-24', startTime: '09:30', repeat: { type: 'none' } },
  { id: 's3', title: 'Deleted class', category: 'School', deleted: true, date: '2026-11-23', startTime: '10:00', repeat: { type: 'none' } },
];
const places = [
  { id: 'p1', name: 'Calapan Pier', address: 'San Antonio, Calapan City' },
  { id: 'p2', name: 'City Library', address: 'Gov. Infantado St' },
];
const workouts = [
  { id: 'w1', name: 'Upper Body Push', notes: 'Chest and triceps' },
];

const calapanRes = searchAll({ query: 'calapan', schedules, places, workouts });
eq(calapanRes.total, 2, 'matches across schedules and saved places');
deepEq(calapanRes.groups.map((g) => g.key), ['schedules', 'places'], 'groups results by module');
eq(calapanRes.groups[0].items[0].route, '/map?dest=p1&arrive=09%3A30', 'travel schedule links to Map with destination & arrive time');
eq(calapanRes.groups[1].items[0].route, '/map?dest=p1', 'saved place links to Map with destination');

const schoolRes = searchAll({ query: 'room 304', schedules, places, workouts });
eq(schoolRes.groups[0].items[0].route, '/scheduler?date=2026-11-23', 'school schedule links to Scheduler on its date');

const deletedRes = searchAll({ query: 'deleted', schedules, places, workouts });
eq(deletedRes.total, 0, 'deleted schedules are excluded from search');

const exRes = searchAll({ query: 'push', schedules, places, workouts });
deepEq(exRes.groups.map((g) => g.key), ['exercises', 'workouts'], 'matches built-in exercises and saved workouts');
eq(exRes.groups[0].items[0].route, '/fitness', 'exercise links to Fitness');

const manySchedules = Array.from({ length: 7 }, (_, i) => ({
  id: `bulk-${i}`, title: `Study block ${i}`, category: 'Personal', date: '2026-11-23', startTime: '14:00', repeat: { type: 'none' },
}));
const capped = searchAll({ query: 'study', schedules: manySchedules, limitPerGroup: 4 });
eq(capped.total, 7, 'total counts all matches');
eq(capped.groups[0].items.length, 4, 'group items capped at limitPerGroup');

// ================= reminderNotifications =================
const scheduledReminders = [
  { id: 's1_2026-11-23', scheduleId: 's1', title: 'Data Structures', body: 'Starts at 8:00 AM · Room 304', date: '2026-11-23', startTime: '08:00', fireAt: '2026-11-23T07:45', mode: 'both', snoozeMinutes: 10 },
  { id: 'past_1', scheduleId: 's1', title: 'Past reminder', date: '2026-11-23', startTime: '07:00', fireAt: '2026-11-23T06:45', mode: 'notify' },
  { id: 's2_2026-11-24', scheduleId: 's2', title: 'Ferry to Batangas', body: 'Starts at 9:30 AM · Calapan Pier', date: '2026-11-24', startTime: '09:30', fireAt: '2026-11-24T09:00', mode: 'notify' },
];

const bell = reminderNotifications({ scheduled: scheduledReminders, schedules, now: NOW, snoozeMinutes: 10 });
eq(bell.count, 2, 'filters out past reminders');
eq(bell.items[0].title, 'Data Structures', 'sorts soonest reminder first');
eq(bell.items[0].when, 'in 15 minutes', 'computes relative countdown');
eq(bell.items[0].fireTimeText, 'Today · 7:45 AM', 'formats Today fire time');
eq(bell.items[0].modeLabel, 'Notify + alarm', 'labels both mode as Notify + alarm');
eq(bell.items[0].route, '/scheduler?date=2026-11-23', 'links class reminder to Scheduler date');
eq(bell.items[1].fireTimeText, 'Tomorrow · 9:00 AM', 'formats Tomorrow fire time');
eq(bell.items[1].route, '/map?dest=p1&arrive=09%3A30', 'links Travel reminder to Map destination');

// ================= ReminderService.snooze =================
let clock = '2026-11-23T07:30';
let stored = [];
const mockAdapter = {
  list: async () => structuredClone(stored),
  schedule: async (items) => {
    const map = new Map(stored.map((r) => [r.id, r]));
    for (const item of items) map.set(item.id, structuredClone(item));
    stored = [...map.values()];
  },
  cancel: async (ids) => {
    const drop = new Set(ids);
    stored = stored.filter((r) => !drop.has(r.id));
  },
};
const mockScheduleSvc = {
  list: async () => [{
    id: 's1', title: 'Data Structures', location: 'Room 304',
    reminder: { enabled: true, offsetMinutes: 15, useAlarm: true },
  }],
  listOccurrences: async () => [{
    id: 's1_2026-11-23', scheduleId: 's1', date: '2026-11-23',
    startTime: '08:00', endTime: '09:30', status: OCCURRENCE_STATUS.SCHEDULED,
  }],
};

const reminderSvc = new ReminderService({
  schedule: mockScheduleSvc,
  adapter: mockAdapter,
  now: () => clock,
});
await reminderSvc.sync();
eq(stored.length, 1, 'initial sync schedules reminder');
eq(stored[0].fireAt, '2026-11-23T07:45', 'initial fireAt is 07:45');

const snoozed = await reminderSvc.snooze('s1_2026-11-23', 10);
eq(snoozed?.fireAt, '2026-11-23T07:40', 'snooze shifts fireAt to now + 10 min');
eq(stored[0].fireAt, '2026-11-23T07:40', 'adapter receives updated snoozed fireAt');

await reminderSvc.sync();
eq(stored[0].fireAt, '2026-11-23T07:40', 'subsequent sync preserves active snooze');

eq(await reminderSvc.snooze('missing-id', 10), null, 'snooze returns null for unknown reminder');

clock = '2026-11-23T07:41';
await reminderSvc.sync();
eq(stored[0].fireAt, '2026-11-23T07:45', 'expired snooze clears cleanly on next sync');
ok(reminderSvc.snoozes.size === 0, 'expired snooze entry removed from map');

console.log(`Phase 11 PACE 2 header + notifications OK (${n} checks)`);