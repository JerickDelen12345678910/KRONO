// Dependency-free self-check for ReminderService + reminder adapters + the ScheduleService onChange hook (Phase 5 PACE 2).
// Run: node scripts/check-reminders-service.mjs   (also part of `npm run check`)
import assert from 'node:assert/strict';
import { createRepositories } from '../src/repositories/index.js';
import { createServices } from '../src/services/index.js';
import { ScheduleService } from '../src/services/ScheduleService.js';
import { ReminderService } from '../src/services/ReminderService.js';
import { MemoryReminderAdapter } from '../src/reminders/MemoryReminderAdapter.js';
import { BrowserNotificationAdapter } from '../src/reminders/BrowserNotificationAdapter.js';
import { PERMISSION, assertReminderAdapter } from '../src/reminders/ReminderAdapter.js';
import { createDefaultReminderAdapter } from '../src/reminders/index.js';

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); n += 1; };
const throwsSync = (fn) => { try { fn(); } catch (e) { return e; } return null; };
const tick = () => new Promise((r) => setTimeout(r, 0));
const ids = (list) => list.map((r) => r.id);
const rem = (id, fireAt, o = {}) => ({ id, title: 'Class', body: 'Starts at 8:00 AM', fireAt, ...o });

// ============ 1. adapter contract + memory adapter ============
ok(throwsSync(() => assertReminderAdapter({})) instanceof TypeError, 'an adapter without list/schedule/cancel is rejected');
ok(throwsSync(() => assertReminderAdapter(null)) instanceof TypeError, 'null is rejected');
const mem = new MemoryReminderAdapter();
ok(assertReminderAdapter(mem) === mem, 'the memory adapter satisfies the contract');
await mem.schedule([rem('a', '2026-11-16T07:45'), rem('b', '2026-11-16T07:00')]);
eq(ids(await mem.list()), ['b', 'a'], 'list is sorted by fire time');
await mem.schedule([rem('a', '2026-11-16T08:15', { title: 'Moved' })]);
const afterReplace = await mem.list();
eq([afterReplace.length, afterReplace.find((r) => r.id === 'a').fireAt], [2, '2026-11-16T08:15'], 'same id replaces, never duplicates');
(await mem.list())[0].title = 'tampered';
eq((await mem.list())[0].title, 'Class', 'list returns copies');
await mem.cancel(['a', 'nope']);
eq(ids(await mem.list()), ['b'], 'cancel removes known ids and ignores unknown ones');
eq(mem.calls.map((c) => c.type), ['schedule', 'schedule', 'cancel'], 'every call is recorded');
mem.dispose();
await mem.schedule([rem('c', '2026-11-16T09:00')]);
eq(await mem.list(), [], 'a disposed adapter ignores schedule()');
ok(createDefaultReminderAdapter() instanceof MemoryReminderAdapter, 'in Node (no Notification API) the default adapter is the memory one');

// ============ 2. browser notification adapter (fakes: permission, timers, clock) ============
const T0 = new Date(2026, 10, 16, 7, 0).getTime();   // Mon 2026-11-16 07:00 local
function browserKit({ permission = 'default', answer = 'granted', supported = true, throws = false } = {}) {
  const state = { permission, asked: 0, shown: [] };
  class FakeNotification {
    constructor(title, opts) { if (throws) throw new Error('Illegal constructor'); state.shown.push({ title, ...opts }); }
    static get permission() { return state.permission; }
    static requestPermission(cb) { state.asked += 1; state.permission = answer; cb?.(answer); return Promise.resolve(answer); }
  }
  const timers = new Map();
  let nextTimer = 0;
  const clock = { ms: T0 };
  const adapter = new BrowserNotificationAdapter({
    notification: supported ? FakeNotification : null,
    setTimer: (fn, ms) => { nextTimer += 1; timers.set(nextTimer, { fn, ms }); return nextTimer; },
    clearTimer: (id) => { timers.delete(id); },
    clock: () => clock.ms,
  });
  const runNext = () => { const [id, t] = timers.entries().next().value; timers.delete(id); t.fn(); };
  return { adapter, state, timers, clock, runNext };
}

{
  const k = browserKit({ supported: false });
  eq([k.adapter.isSupported(), k.adapter.getPermission(), await k.adapter.requestPermission()], [false, 'unsupported', 'unsupported'], 'no Notification API -> unsupported');
  await k.adapter.schedule([rem('x', '2026-11-16T07:45')]);
  k.clock.ms = new Date(2026, 10, 16, 7, 45).getTime(); k.runNext();
  eq([k.state.shown, await k.adapter.list()], [[], []], 'unsupported: reaching the time shows nothing and does not throw');
}
{
  const k = browserKit();
  eq(k.adapter.getPermission(), 'default', 'permission starts as default');
  eq([await k.adapter.requestPermission(), k.state.asked], ['granted', 1], 'requestPermission asks the browser once');
  eq([await k.adapter.requestPermission(), k.state.asked], ['granted', 1], 'an answered permission is not asked again');
  const denied = browserKit({ answer: 'denied' });
  eq(await denied.adapter.requestPermission(), 'denied', 'a denied answer is returned');
  const old = browserKit();
  old.adapter.Notification.requestPermission = (cb) => { cb('granted'); };   // old Safari: callback, returns nothing
  eq(await old.adapter.requestPermission(), 'granted', 'callback-style requestPermission works');
}
{
  const k = browserKit({ permission: 'granted' });
  await k.adapter.schedule([rem('r1', '2026-11-16T07:45'), rem('r2', '2026-11-16T08:30')]);
  eq([(await k.adapter.list()).length, k.timers.size, [...k.timers.values()][0].ms], [2, 2, 45 * 60 * 1000], 'one timer per reminder, waiting exactly until the fire time');
  await k.adapter.schedule([rem('r1', '2026-11-16T08:15')]);
  eq([(await k.adapter.list()).length, k.timers.size], [2, 2], 'same id replaces: the old timer is cleared, no duplicate');
  await k.adapter.cancel(['r1', 'nope']);
  eq([ids(await k.adapter.list()), k.timers.size], [['r2'], 1], 'cancel clears the timer');
  k.clock.ms = new Date(2026, 10, 16, 8, 30).getTime(); k.runNext();
  eq(k.state.shown, [{ title: 'Class', body: 'Starts at 8:00 AM', tag: 'r2' }], 'at the fire time ONE notification is shown');
  eq([await k.adapter.list(), k.timers.size], [[], 0], 'a fired reminder is forgotten');
  await k.adapter.schedule([rem('past', '2026-11-16T08:30'), rem('older', '2026-11-16T06:00')]);
  eq([await k.adapter.list(), k.timers.size], [[], 0], 'reminders that are already due are dropped (missed)');
  await k.adapter.schedule([rem('r9', '2026-11-16T09:00')]);
  k.adapter.dispose();
  eq([await k.adapter.list(), k.timers.size], [[], 0], 'dispose clears every timer');
  await k.adapter.schedule([rem('r10', '2026-11-16T10:00')]);
  eq(k.timers.size, 0, 'after dispose nothing is scheduled');
}
{
  const k = browserKit({ permission: 'denied' });
  await k.adapter.schedule([rem('d1', '2026-11-16T07:45')]);
  k.clock.ms = new Date(2026, 10, 16, 7, 45).getTime(); k.runNext();
  eq([k.state.shown, await k.adapter.list()], [[], []], 'permission denied: nothing is shown');
  const t = browserKit({ permission: 'granted', throws: true });
  await t.adapter.schedule([rem('t1', '2026-11-16T07:45')]);
  t.clock.ms = new Date(2026, 10, 16, 7, 45).getTime(); t.runNext();
  eq(await t.adapter.list(), [], 'a browser that refuses `new Notification` does not break anything');
}
{
  const k = browserKit({ permission: 'granted' });
  await k.adapter.schedule([rem('far', '2026-12-31T08:00')]);
  const at = new Date(2026, 11, 31, 8, 0).getTime();
  eq([...k.timers.values()][0].ms, 2 ** 31 - 1, 'a very long wait is capped at the setTimeout limit');
  k.clock.ms += 2 ** 31 - 1; k.runNext();
  eq([k.state.shown.length, k.timers.size, (await k.adapter.list()).length], [0, 1, 1], 'it waits again instead of firing early');
  k.clock.ms = at; k.runNext();
  eq(k.state.shown.length, 1, 'and fires at the real time');
}

// ============ 3. ScheduleService onChange hook ============
const input = {
  title: 'Class', category: 'School', startTime: '08:00', endTime: '09:30', location: 'Room 304',
  repeat: { type: 'selectedDays', interval: 1, daysOfWeek: [1, 4], startDate: '2026-11-16', endDate: '2027-03-22' },
};
const today = () => '2026-11-16';
{
  const repos = createRepositories({ userId: 'hook' });
  const seen = [];
  const s = new ScheduleService(repos, { today, onChange: (c) => seen.push(c.type) });
  const c = await s.create(input);
  eq(seen, ['occurrences'], 'create notifies once, after the occurrences exist');
  await s.update(c.id, { startTime: '09:00', endTime: '10:30' });
  const occs = await s.listOccurrences({ scheduleId: c.id });
  await s.setOccurrenceStatus(occs[0].id, 'done');
  await s.addOccurrence(c.id, '2026-11-17');
  await s.remove(c.id);
  eq(seen, ['occurrences', 'occurrences', 'status', 'occurrence', 'remove'], 'update, status change, addOccurrence and remove each notify');
  const e = throwsSync(() => s.setOccurrenceStatus(occs[0].id, 'bogus'));
  ok(e && e.code !== undefined, 'an unknown status still throws synchronously (unchanged behaviour)');
  eq(seen.length, 5, 'a rejected status change notifies nobody');

  const noHook = new ScheduleService(repos, { today });
  ok((await noHook.create(input)).id, 'no hook at all works as before');
  const thrower = new ScheduleService(repos, { today, onChange: () => { throw new Error('hook broke'); } });
  ok((await thrower.create(input)).id, 'a hook that throws never breaks saving');
  const rejecter = new ScheduleService(repos, { today, onChange: async () => { throw new Error('hook rejected'); } });
  ok((await rejecter.create(input)).id, 'a hook that rejects never breaks saving');
  await tick();
}

// ============ 4. ReminderService through the real services ============
ok(throwsSync(() => new ReminderService({ adapter: new MemoryReminderAdapter() })) instanceof TypeError, 'needs a schedule service');
ok(throwsSync(() => new ReminderService({ schedule: {}, adapter: {} })) instanceof TypeError, 'needs a valid adapter');

const clock = { now: '2026-11-16T07:00' };
const make = (repos, extra = {}) => createServices(repos, { today, now: () => clock.now, ...extra });

const repos = createRepositories({ userId: 'reminders-service' });
const adapter = new MemoryReminderAdapter();
let lists = 0;
const realList = adapter.list.bind(adapter);
adapter.list = () => { lists += 1; return realList(); };
const svc = make(repos, { reminderAdapter: adapter });
const rs = svc.reminders;
await rs.whenIdle();
eq([await adapter.list(), adapter.calls], [[], []], 'start-up with nothing saved: nothing scheduled, no adapter calls');
eq(rs.getSettings(), { enabled: true, defaultOffsetMinutes: 15, defaultUseAlarm: true, sound: 'default', snoozeMinutes: 10 }, 'default global settings');

// (b) create -> hook -> reminders, with no manual sync
const cls = await svc.schedule.create(input);
await rs.whenIdle();
const want = ['2026-11-16', '2026-11-19', '2026-11-23', '2026-11-26'].map((d) => `${cls.id}_${d}`);
const L1 = await adapter.list();
eq(ids(L1), want, 'creating a schedule schedules its next 14 days of reminders');
ok(new Set(ids(L1)).size === 4, 'no duplicates');

// idempotent + safe to call often
const calls0 = adapter.calls.length;
const res = await rs.sync();
eq([res.ok, res.scheduled, res.cancelled, res.kept], [true, 0, 0, 4], 'a second sync finds nothing to do');
const l0 = lists;
await Promise.all([rs.sync(), rs.sync(), rs.sync(), rs.sync(), rs.sync()]);
ok(lists - l0 <= 2, 'overlapping syncs are merged into at most one follow-up run');
eq(adapter.calls.length, calls0, 'repeated syncs never call the adapter again');

// (a) restore after restart
const restarted = make(repos, { reminderAdapter: adapter });
await restarted.reminders.whenIdle();
eq(adapter.calls.length, calls0, 'restart with the scheduler still holding its reminders: nothing is re-scheduled');
const adapterB = new MemoryReminderAdapter();
const restartedEmpty = make(repos, { reminderAdapter: adapterB });
await restartedEmpty.reminders.whenIdle();
eq(await adapterB.list(), L1, 'restart with an empty scheduler restores every reminder');

// Mark done / Undo
const monday = (await svc.schedule.listOccurrences({ scheduleId: cls.id })).find((o) => o.date === '2026-11-16');
await svc.schedule.setOccurrenceStatus(monday.id, 'done');
await rs.whenIdle();
eq(ids(await adapter.list()), want.slice(1), 'Mark done cancels just that reminder');
eq(adapter.calls.at(-1), { type: 'cancel', ids: [monday.id] }, 'and only a cancel was sent');
await svc.schedule.setOccurrenceStatus(monday.id, 'skipped');
await rs.whenIdle();
eq(ids(await adapter.list()), want.slice(1), 'Skip keeps it cancelled');
await svc.schedule.setOccurrenceStatus(monday.id, 'scheduled');
await rs.whenIdle();
eq(await adapter.list(), L1, 'Undo brings it back, identical');

// edit the time: replace, never duplicate
const mark = adapter.calls.length;
await svc.schedule.update(cls.id, { startTime: '09:00', endTime: '10:30' });
await rs.whenIdle();
const L3 = await adapter.list();
eq([ids(L3), L3.map((r) => r.fireAt.slice(11))], [want, ['08:45', '08:45', '08:45', '08:45']], 'editing the time replaces the reminders (same ids, new time)');
eq(adapter.calls.slice(mark).map((c) => c.type), ['schedule'], 'the edit sent one schedule call and no cancel');

// reminder off for the schedule: cancel only, nothing deleted
const occCount = (await svc.schedule.listOccurrences({ scheduleId: cls.id })).length;
await svc.schedule.update(cls.id, { reminder: { enabled: false, offsetMinutes: 15, useAlarm: true } });
await rs.whenIdle();
eq(await adapter.list(), [], 'reminder off for the schedule cancels its reminders');
eq([(await svc.schedule.list()).length, (await svc.schedule.listOccurrences({ scheduleId: cls.id })).length], [1, occCount], 'the schedule and its occurrences are untouched');
await svc.schedule.update(cls.id, { reminder: { enabled: true, offsetMinutes: 0, useAlarm: false } });
await rs.whenIdle();
const L4 = await adapter.list();
ok(L4.length === 4 && L4.every((r) => r.mode === 'notify' && r.fireAt.endsWith('T09:00')), 'turned back on: notification only, at start time');

// delete
await svc.schedule.remove(cls.id);
await rs.whenIdle();
eq(await adapter.list(), [], 'deleting the schedule cancels its reminders');

// ---- global settings ----
const repos3 = createRepositories({ userId: 'reminders-settings' });
const adapter3 = new MemoryReminderAdapter();
const changes = [];
const svc3 = make(repos3, { reminderAdapter: adapter3, reminderSettings: { snoozeMinutes: 5 }, onReminderSettingsChange: (s) => changes.push(s) });
const rs3 = svc3.reminders;
eq(rs3.getSettings().snoozeMinutes, 5, 'starting settings are used');
const cls3 = await svc3.schedule.create(input);
await rs3.whenIdle();
const base3 = await adapter3.list();
eq([base3.length, base3[0].snoozeMinutes], [4, 5], 'global snooze reaches the reminders');

const off = await rs3.setSettings({ enabled: false });
eq([off.enabled, await adapter3.list(), (await svc3.schedule.list()).length], [false, [], 1], 'global switch off cancels all reminders but keeps the schedules');
const callsOff = adapter3.calls.length;
await rs3.setSettings({ enabled: false });
eq([changes.length, adapter3.calls.length], [1, callsOff], 'setting the same value again does nothing');
await rs3.setSettings({ enabled: true });
eq(ids(await adapter3.list()), ids(base3), 'switch back on: reminders return');
await rs3.setSettings({ sound: 'gentle', snoozeMinutes: 15 });
const gentle = await adapter3.list();
ok(gentle.length === 4 && gentle.every((r) => r.sound === 'gentle' && r.snoozeMinutes === 15), 'changing sound/snooze refreshes the reminders (still 4, no duplicates)');
eq((await rs3.setSettings({ sound: 'loud', snoozeMinutes: 7, bogus: 1 })).sound, 'gentle', 'invalid values and unknown keys are ignored; the current value stays');
eq(changes.length, 3, 'the change listener only heard the 3 real changes (off, on, sound + snooze)');

// time passes: past reminders drop out, the window rolls forward
clock.now = '2026-11-16T07:46';
await rs3.sync();
eq(ids(await adapter3.list()), ['2026-11-19', '2026-11-23', '2026-11-26', '2026-11-30'].map((d) => `${cls3.id}_${d}`), 'once the fire time has passed Monday is cancelled (missed) and the window now reaches Nov 30');
clock.now = '2026-11-20T07:00';
await rs3.sync();
eq(ids(await adapter3.list()), ['2026-11-23', '2026-11-26', '2026-11-30', '2026-12-03'].map((d) => `${cls3.id}_${d}`), 'the 14-day window rolls forward: new days are added');
clock.now = '2026-11-16T07:00';

// ---- a failing adapter must never break saving ----
class Flaky extends MemoryReminderAdapter {
  constructor() { super(); this.fail = true; }
  async schedule(r) { if (this.fail) throw new Error('boom'); return super.schedule(r); }
}
const flaky = new Flaky();
const svc4 = make(createRepositories({ userId: 'reminders-flaky' }), { reminderAdapter: flaky });
const cls4 = await svc4.schedule.create(input);
await svc4.reminders.whenIdle();
ok(cls4.id && svc4.reminders.lastError instanceof Error, 'saving works even though the adapter fails; the error is kept in lastError');
const bad = await svc4.reminders.sync();
eq([bad.ok, bad.error.message, await flaky.list()], [false, 'boom', []], 'sync reports the failure instead of throwing');
flaky.fail = false;
const good = await svc4.reminders.sync();
eq([good.ok, good.scheduled, svc4.reminders.lastError], [true, 4, null], 'the next sync recovers by itself');

// ---- dispose ----
const adapter5 = new MemoryReminderAdapter();
const svc5 = make(createRepositories({ userId: 'reminders-dispose' }), { reminderAdapter: adapter5 });
await svc5.schedule.create(input);
await svc5.reminders.whenIdle();
ok((await adapter5.list()).length === 4, 'before dispose: 4 reminders');
svc5.reminders.dispose();
const callsDisposed = adapter5.calls.length;
await svc5.schedule.create({ ...input, title: 'Another' });
await svc5.reminders.whenIdle();
eq([adapter5.disposed, await adapter5.list(), adapter5.calls.length], [true, [], callsDisposed], 'after dispose nothing is scheduled any more');
eq(await svc5.reminders.sync(), { ok: true, scheduled: 0, cancelled: 0, kept: 0 }, 'sync after dispose is a no-op');

// ---- permission and the browser adapter through the service ----
eq([rs.getPermission(), await rs.requestPermission()], ['unsupported', 'unsupported'], 'an adapter without permissions reports unsupported');
const kit = browserKit();
const svc6 = make(createRepositories({ userId: 'reminders-browser' }), { reminderAdapter: kit.adapter });
const cls6 = await svc6.schedule.create(input);
await svc6.reminders.whenIdle();
eq([kit.timers.size, kit.state.asked, svc6.reminders.getPermission()], [4, 0, 'default'], 'reminders are timed, but permission is never asked on its own');
eq([await svc6.reminders.requestPermission(), kit.state.asked], ['granted', 1], 'permission is asked only when the UI calls requestPermission()');
const monday6 = (await svc6.schedule.listOccurrences({ scheduleId: cls6.id })).find((o) => o.date === '2026-11-16');
await svc6.schedule.setOccurrenceStatus(monday6.id, 'done');
await svc6.reminders.whenIdle();
eq(kit.timers.size, 3, 'Mark done clears that timer');
ok(PERMISSION.GRANTED === 'granted', 'permission constants');
svc6.reminders.dispose();
eq(kit.timers.size, 0, 'dispose clears every timer (no double notifications after sign-out)');

console.log(`Phase 5 PACE 2 reminder service OK (${n} checks)`);
