// Dependency-free self-check for the schedule form logic. Run: node scripts/check-scheduleform.mjs
import assert from 'node:assert/strict';
import { draftFromSchedule, draftToInput, emptyDraft, focusDate, setRepeatType, toggleDay, validateDraft, SEMESTER_DAYS } from '../src/lib/scheduleForm.js';
import { createRepositories } from '../src/repositories/index.js';
import { createServices } from '../src/services/index.js';

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n += 1; };
const D = '2026-11-12'; // a Thursday

// empty draft + validation
let d = emptyDraft({ date: D });
ok(!validateDraft(d).valid && validateDraft(d).errors.title, 'empty title is rejected');
d = { ...d, title: '  Capstone  ' };
ok(validateDraft(d).valid && draftToInput(d).title === 'Capstone' && draftToInput(d).date === D, 'valid one-time draft, title trimmed');
ok(!validateDraft({ ...d, endTime: '07:00' }).valid && validateDraft({ ...d, endTime: '07:00' }).errors.endTime, 'end before start');
ok(validateDraft({ ...d, date: '' }).errors.date, 'one-time needs a date');
ok(draftToInput({ ...d, category: 'School' }).color === 'primary' && draftToInput(d).color === 'slate', 'color follows category');

// repeat switching
let r = setRepeatType(d, 'selectedDays');
ok(r.repeat.startDate === D && r.repeat.endDate === '2027-03-04' && SEMESTER_DAYS === 112 && r.repeat.daysOfWeek.join() === '4', 'selectedDays defaults: start date, 16 weeks, weekday of start (Thu)');
ok(validateDraft(r).valid && draftToInput(r).date === null, 'repeating draft valid, no single date');
r = toggleDay(toggleDay(r, 1), 4);
ok(r.repeat.daysOfWeek.join() === '1' && validateDraft(r).valid, 'toggle days (add Mon, remove Thu)');
ok(validateDraft(toggleDay(r, 1)).errors.daysOfWeek, 'no weekday selected is an error');
ok(validateDraft({ ...r, repeat: { ...r.repeat, interval: '0' } }).errors.interval, 'interval must be 1+');
ok(validateDraft({ ...r, repeat: { ...r.repeat, endDate: '2026-01-01' } }).errors.repeatEnd, 'until before from');
ok(draftToInput({ ...r, repeat: { ...r.repeat, interval: '2' } }).repeat.interval === 2, 'interval typed as text becomes a number');
const daily = setRepeatType(d, 'daily');
ok(daily.repeat.daysOfWeek.length === 0 && validateDraft(daily).valid, 'daily has no weekdays');
const back = setRepeatType(r, 'none');
ok(back.repeat.type === 'none' && back.date === D && back.repeat.startDate === null, 'back to one-time keeps the date');

// reminder
ok(draftToInput({ ...d, reminder: { ...d.reminder, offsetMinutes: '30' } }).reminder.offsetMinutes === 30, 'reminder minutes become a number');
ok(validateDraft({ ...d, reminder: { ...d.reminder, offsetMinutes: -5 } }).errors.reminder, 'bad reminder rejected');

// round trip through the real service
const svc = createServices(createRepositories({ userId: 'alex' }), { today: () => D });
const input = draftToInput({ ...r, title: 'Study', category: 'School', location: 'Library' });
const saved = await svc.schedule.create(input);
const again = draftToInput(draftFromSchedule(saved));
ok(again.title === 'Study' && again.repeat.daysOfWeek.join() === '1' && again.repeat.endDate === input.repeat.endDate && again.reminder.useAlarm === true, 'draft -> service -> draft round trip');
ok((await svc.schedule.occurrences.list({ where: { scheduleId: saved.id } })).length > 10, 'saving through the form generates occurrences');
ok(focusDate(saved, D) === '2026-11-16', 'after saving, focus the next occurrence (Monday)');
ok(focusDate(await svc.schedule.create(draftToInput(d)), D) === D, 'one-time focuses its date');

// editing through the service with a version check
await svc.schedule.update(saved.id, draftToInput({ ...draftFromSchedule(saved), title: 'Study group' }), { expectedVersion: saved.version });
ok((await svc.schedule.get(saved.id)).title === 'Study group', 'edit saves');
let conflict = false;
try { await svc.schedule.update(saved.id, { title: 'X' }, { expectedVersion: saved.version }); } catch (e) { conflict = e.code === 'conflict'; }
ok(conflict, 'stale edit is rejected (conflict)');

console.log(`PACE 3 schedule form logic OK (${n} checks)`);
