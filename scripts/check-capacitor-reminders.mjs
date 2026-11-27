// scripts/check-capacitor-reminders.mjs — Phase 13 PACE 1: native Android CapacitorReminderAdapter
// (src/reminders/CapacitorReminderAdapter.js). Runs in plain Node via `npm run check`.
import assert from 'node:assert/strict';
import {
  CHANNEL_ALARM, CHANNEL_NOTIFY, CapacitorReminderAdapter, notificationIdFor,
} from '../src/reminders/CapacitorReminderAdapter.js';
import { PERMISSION, assertReminderAdapter } from '../src/reminders/ReminderAdapter.js';

let n = 0;
const eq = (a, b, m) => { assert.equal(a, b, m); n += 1; };
const deepEq = (a, b, m) => { assert.deepEqual(a, b, m); n += 1; };
const ok = (c, m) => { assert.ok(c, m); n += 1; };

// ================= notificationIdFor =================
const id1 = notificationIdFor('s1_2026-11-23');
const id2 = notificationIdFor('s2_2026-11-23');
eq(id1, notificationIdFor('s1_2026-11-23'), 'same string id always hashes to the same 32-bit int');
ok(Number.isInteger(id1) && id1 >= 1 && id1 <= 2147483646, 'id fits positive signed 32-bit Java int');
ok(id1 !== id2, 'distinct schedule occurrences produce distinct numeric ids');

// ================= mock plugin =================
function createMockPlugin(initialDisplay = 'prompt') {
  const pending = new Map();
  const channels = [];
  let display = initialDisplay;
  return {
    pending,
    channels,
    setDisplay(next) { display = next; },
    async checkPermissions() { return { display }; },
    async requestPermissions() { return { display }; },
    async createChannel(ch) { channels.push(ch); },
    async getPending() { return { notifications: [...pending.values()] }; },
    async schedule({ notifications }) {
      for (const item of notifications) pending.set(item.id, item);
    },
    async cancel({ notifications }) {
      for (const item of notifications) pending.delete(item.id);
    },
  };
}

const FIXED_NOW = new Date(2026, 10, 23, 7, 30, 0).getTime();
const plugin = createMockPlugin('prompt');
const adapter = assertReminderAdapter(new CapacitorReminderAdapter({
  plugin,
  isNative: () => true,
  clock: () => FIXED_NOW,
}));

await adapter.refreshPermission();
eq(adapter.getPermission(), PERMISSION.DEFAULT, 'maps Capacitor prompt to default');

plugin.setDisplay('granted');
eq(await adapter.requestPermission(), PERMISSION.GRANTED, 'requestPermission updates cached state to granted');
eq(adapter.getPermission(), PERMISSION.GRANTED, 'getPermission reflects granted state');

const remA = {
  id: 's1_2026-11-23', occurrenceId: 's1_2026-11-23', scheduleId: 's1',
  title: 'Data Structures', body: 'Starts at 8:00 AM · Room 304',
  date: '2026-11-23', startTime: '08:00', offsetMinutes: 15, fireAt: '2026-11-23T07:45',
  mode: 'both', sound: 'default', snoozeMinutes: 10,
};
const remB = {
  id: 's2_2026-11-23', occurrenceId: 's2_2026-11-23', scheduleId: 's2',
  title: 'Study block', body: 'Starts at 10:00 AM',
  date: '2026-11-23', startTime: '10:00', offsetMinutes: 10, fireAt: '2026-11-23T09:50',
  mode: 'notify', sound: 'default', snoozeMinutes: 10,
};
const pastRem = {
  ...remA, id: 'past_1', fireAt: '2026-11-23T07:00',
};

await adapter.schedule([remA, remB, pastRem]);
eq(plugin.channels.length, 2, 'creates notify and alarm channels once');
deepEq(plugin.channels.map((c) => c.id), [CHANNEL_NOTIFY, CHANNEL_ALARM], 'channel ids match constants');
eq(plugin.pending.size, 2, 'drops past reminders and schedules future ones');

const rawA = plugin.pending.get(notificationIdFor(remA.id));
eq(rawA.channelId, CHANNEL_ALARM, 'mode=both routes to high-importance alarm channel');
eq(rawA.schedule.allowWhileIdle, true, 'sets allowWhileIdle for Doze delivery');
eq(plugin.pending.get(notificationIdFor(remB.id)).channelId, CHANNEL_NOTIFY, 'mode=notify routes to reminder channel');

const listed = await adapter.list();
deepEq(listed, [remA, remB], 'list() round-trips exact planned reminder objects');

// Replacing an existing reminder updates it in place with no duplicates
const updatedA = { ...remA, title: 'Data Structures Lab', fireAt: '2026-11-23T07:50' };
await adapter.schedule([updatedA]);
eq(plugin.pending.size, 2, 're-scheduling same id replaces existing notification');
eq((await adapter.list()).find((r) => r.id === remA.id)?.title, 'Data Structures Lab', 'updated reminder payload preserved');

// Cancel removes only matching IDs
await adapter.cancel([remA.id, 'non-existent-id']);
deepEq((await adapter.list()).map((r) => r.id), [remB.id], 'cancel removes target reminder and ignores unknown ids');

// Dispose stops further scheduling
adapter.dispose();
await adapter.schedule([remA]);
eq((await adapter.list()).length, 1, 'dispose ignores subsequent schedule() calls');

// Non-native environment reports unsupported cleanly
const webFallback = new CapacitorReminderAdapter({ plugin, isNative: () => false });
eq(webFallback.getPermission(), PERMISSION.UNSUPPORTED, 'non-native platform reports unsupported');
deepEq(await webFallback.list(), [], 'non-native list returns empty array');

console.log(`Phase 13 PACE 1 Capacitor reminders OK (${n} checks)`);