// Dependency-free self-check for the conflict warning + done/skipped/undo + history. Run: node scripts/check-conflicts.mjs
import assert from 'node:assert/strict';
import { MAX_SHOWN, conflictDate, conflictMessage, conflictRange, findConflicts } from '../src/lib/conflicts.js';
import { draftToInput, emptyDraft } from '../src/lib/scheduleForm.js';
import { createRepeatRule } from '../src/models/schedule.js';
import { createRepositories } from '../src/repositories/index.js';
import { createServices } from '../src/services/index.js';

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); n += 1; };

const act = (id, date, s, e, o = {}) => ({ id, title: id, status: 'scheduled', startsAt: `${date}T${s}`, endsAt: `${date}T${e}`, refs: { scheduleId: `sched_${id}` }, ...o });
const draft = (o = {}) => draftToInput({ ...emptyDraft({ date: '2026-11-12' }), title: 'New', startTime: '08:30', endTime: '09:30', ...o });
const weekly = (o = {}) => ({ ...createRepeatRule(), type: 'selectedDays', interval: 1, daysOfWeek: [4], startDate: '2026-11-05', endDate: '2026-11-26', ...o }); // Thursdays: 5, 12, 19, 26

// ---- pure: overlap rules ----
const A = act('A', '2026-11-12', '08:00', '09:00');
const hit = findConflicts(draft(), [A]);
eq(hit, [{ date: '2026-11-12', startTime: '08:00', endTime: '09:00', title: 'A', activityId: 'A' }], 'overlap found with date, time, title');
eq(findConflicts(draft(), [act('B', '2026-11-12', '09:30', '10:00'), act('C', '2026-11-12', '07:00', '08:30')]), [], 'touching edges do not conflict');
eq(findConflicts(draft(), [act('D', '2026-11-13', '08:00', '09:00')]), [], 'other date is no conflict');
eq(findConflicts(draft(), [act('E', '2026-11-12', '08:45', '09:00')]).length, 1, 'item inside the draft conflicts');
eq(findConflicts(draft(), [act('F', '2026-11-12', '08:00', '10:00')]).length, 1, 'item around the draft conflicts');

// ---- pure: which statuses count ----
eq(findConflicts(draft(), [{ ...A, status: 'skipped' }, { ...A, id: 'A2', status: 'cancelled' }]), [], 'skipped and cancelled are ignored');
eq(findConflicts(draft(), [{ ...A, status: 'done' }]).length, 1, 'done still occupied that time');
eq(findConflicts(draft(), [{ ...A, endsAt: null }]), [], 'items without an end time are ignored');
eq(findConflicts(draft(), [A], { ignoreScheduleId: 'sched_A' }), [], 'the schedule being edited never conflicts with itself');
eq(findConflicts(draft(), [A], { ignoreScheduleId: 'other' }).length, 1, 'other schedules still conflict while editing');
eq(findConflicts(draft({ startTime: '23:30', endTime: '23:45' }), [act('N', '2026-11-12', '23:00', '23:59', { endsAt: '2026-11-13T01:00' })]).length, 1, 'item that runs past midnight');

// ---- pure: incomplete drafts never warn (and never throw) ----
eq(findConflicts(draft({ endTime: '' }), [A]), [], 'missing end time');
eq(findConflicts(draft({ startTime: '09:00', endTime: '08:00' }), [A]), [], 'end before start');
eq(findConflicts(draft({ date: '' }), [A]), [], 'one-time without a date');
ok(conflictRange(draft({ date: '' })) === null && conflictRange(draft({ endTime: '07:00' })) === null, 'no range for an incomplete draft');
eq(conflictRange(draft()), { from: '2026-11-12', to: '2026-11-12' }, 'one-time range = its date');

// ---- pure: repeating drafts ----
const rep = draft({ repeat: weekly() });
eq(conflictRange(rep), { from: '2026-11-05', to: '2026-11-26' }, 'repeating range = first..last occurrence');
eq(findConflicts(rep, [act('G', '2026-11-19', '08:00', '09:00'), act('H', '2026-11-18', '08:00', '09:00')]).map((c) => c.date), ['2026-11-19'], 'only dates the rule really hits');
eq(findConflicts(rep, [act('I', '2026-11-26', '08:30', '09:30'), act('J', '2026-11-05', '08:30', '09:30')]).map((c) => c.date), ['2026-11-05', '2026-11-26'], 'sorted by date');

// ---- pure: message ----
eq(conflictDate('2026-11-05'), 'Nov 5', 'short date');
const one = conflictMessage(hit);
ok(one.includes('A') && one.includes('Nov 12') && one.includes('8:00 AM–9:00 AM') && one.endsWith('You can still save.'), 'one conflict message');
const five = Array.from({ length: 5 }, (_, i) => ({ date: `2026-11-0${i + 1}`, startTime: '08:00', endTime: '09:00', title: `T${i + 1}` }));
const msg = conflictMessage(five);
ok(MAX_SHOWN === 3 && msg.includes('T3') && !msg.includes('T4') && msg.includes('and 2 more') && msg.endsWith('You can still save.'), 'lists up to 3, then "and N more"');
ok(conflictMessage([]) === '', 'no conflicts -> no message');

// ---- service: real activity list, status, undo, history ----
const svc = createServices(createRepositories({ userId: 'alex' }), { today: () => '2026-11-12' }); // a Thursday
const rule = (extra = {}) => ({ type: 'selectedDays', interval: 1, daysOfWeek: [1, 4], startDate: '2026-11-02', endDate: '2026-11-30', ...extra });
const cls = await svc.schedule.create({ title: 'Class', category: 'School', startTime: '08:00', endTime: '09:30', repeat: rule() });
const occ = async (date) => (await svc.schedule.listOccurrences({ scheduleId: cls.id })).find((o) => o.date === date);
const live = () => svc.activity.list({ from: '2026-11-01', to: '2026-11-30' });

const oneTime = draft({ date: '2026-11-12' }); // 08:30-09:30 overlaps Class 08:00-09:30
eq((await live()).length, 9, 'activity.list returns the class occurrences');
eq(findConflicts(oneTime, await live()).map((c) => c.title), ['Class'], 'new item conflicts with an existing schedule');
eq(findConflicts(oneTime, await live(), { ignoreScheduleId: cls.id }), [], 'editing that schedule ignores its own occurrences');
eq(findConflicts(draft({ date: '2026-11-12', startTime: '10:00', endTime: '11:00' }), await live()), [], 'free slot has no conflict');

// ---- service: Done / Skipped / Undo ----
const thu = await occ('2026-11-12');
const done = await svc.schedule.setOccurrenceStatus(thu.id, 'done');
ok(done.status === 'done' && typeof done.completedAt === 'string' && done.version > thu.version, 'done sets status + completedAt');
const skipped = await svc.schedule.setOccurrenceStatus(thu.id, 'skipped');
ok(skipped.status === 'skipped' && skipped.completedAt === null, 'skipped clears completedAt');
eq(findConflicts(oneTime, await live()), [], 'a skipped occurrence stops conflicting');
const undone = await svc.schedule.setOccurrenceStatus(thu.id, 'scheduled');
ok(undone.status === 'scheduled' && undone.completedAt === null, 'undo returns to scheduled');
eq(findConflicts(oneTime, await live()).length, 1, 'after undo it conflicts again');
let threw = false;
try { await svc.schedule.setOccurrenceStatus(thu.id, 'finished'); } catch { threw = true; }
ok(threw, 'unknown status is rejected');
eq((await live()).find((a) => a.refs.occurrenceId === thu.id).status, 'scheduled', 'activity reflects the status');

// ---- service: history ----
eq(await svc.schedule.listHistory(), [], 'nothing done/skipped yet -> empty history');
await svc.schedule.setOccurrenceStatus((await occ('2026-11-02')).id, 'done');
await svc.schedule.setOccurrenceStatus((await occ('2026-11-05')).id, 'done');
await svc.schedule.setOccurrenceStatus((await occ('2026-11-09')).id, 'skipped');
const hist = await svc.schedule.listHistory({ from: '2026-11-01', to: '2026-11-12' });
eq(hist.map((h) => `${h.date}:${h.status}`), ['2026-11-09:skipped', '2026-11-05:done', '2026-11-02:done'], 'done + skipped only, newest first');
ok(hist.every((h) => h.title === 'Class' && h.category === 'School'), 'rows carry the schedule title + category');
eq((await svc.schedule.listHistory({ from: '2026-11-01', to: '2026-11-05' })).length, 2, 'range is respected');
eq((await svc.schedule.listHistory({ limit: 1 })).map((h) => h.date), ['2026-11-09'], 'limit keeps the newest');
eq((await svc.schedule.listHistory({ category: 'Personal' })).length, 0, 'category filter');
eq((await svc.schedule.listHistory({ category: 'All' })).length, 3, '"All" means no filter');
await svc.schedule.remove(cls.id);
eq(await svc.schedule.listHistory(), [], 'deleted schedules leave the history');

console.log(`PACE 5 conflicts + status + history OK (${n} checks)`);
