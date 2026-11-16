// Dependency-free self-check for timeline logic + demo seed. Run: node scripts/check-timeline.mjs
import assert from 'node:assert/strict';
import { findOverlaps, formatRange, layoutEvents, nowOffset, to12h, toMinutes, weekDates, monthLabel, weekdayLetter, HOUR_PX } from '../src/lib/timeline.js';
import { createRepositories } from '../src/repositories/index.js';
import { createServices } from '../src/services/index.js';
import { seedDemoData } from '../src/services/demoSeed.js';

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n += 1; };
const ev = (id, s, e, o = {}) => ({ id, title: id, startsAt: `2026-11-12T${s}`, endsAt: `2026-11-12T${e}`, status: 'scheduled', ...o });

ok(to12h('00:05') === '12:05 AM' && to12h('12:00') === '12:00 PM' && to12h('15:30') === '3:30 PM' && toMinutes('08:30') === 510, 'time formatting');
ok(formatRange(ev('a', '08:00', '09:30')) === '8:00 AM–9:30 AM', 'range');
ok(weekDates('2026-11-12').join() === '2026-11-08,2026-11-09,2026-11-10,2026-11-11,2026-11-12,2026-11-13,2026-11-14', 'week starts Sunday');
ok(weekDates('2026-11-15')[0] === '2026-11-15' && weekDates('2026-11-14')[6] === '2026-11-14', 'week boundaries');
ok(monthLabel('2026-11-12') === 'November 2026' && weekdayLetter('2026-11-12') === 'T', 'labels');

// layout
const a = ev('a', '08:00', '09:30'), cap = ev('cap', '15:00', '16:00'), study = ev('study', '15:30', '16:30'), trip = ev('trip', '17:00', '18:00');
const { placed } = layoutEvents([trip, study, a, cap]);
const by = Object.fromEntries(placed.map((p) => [p.item.id, p]));
ok(by.a.top === 0 && by.a.height === 1.5 * HOUR_PX && by.a.cols === 1, 'single event geometry');
ok(by.cap.cols === 2 && by.study.cols === 2 && by.cap.col !== by.study.col, 'overlapping events share width');
ok(by.trip.cols === 1 && by.trip.top === 9 * HOUR_PX, 'later event is not squeezed');
const clip = layoutEvents([ev('early', '06:00', '09:00'), ev('late', '17:00', '20:00'), ev('night', '19:00', '21:00'), ev('dawn', '05:00', '07:30')]);
ok(clip.placed.length === 2 && clip.outside.map((x) => x.id).join() === 'night,dawn' && clip.placed[0].top === 0, 'clamps to 8AM-6PM, lists outside events');
ok(layoutEvents([ev('tiny', '09:00', '09:05')]).placed[0].height >= 24, 'minimum height');

// overlaps
const ov = findOverlaps([cap, study, a, trip]);
ok(ov.length === 1 && ov[0].a.id === 'cap' && ov[0].b.id === 'study' && ov[0].at === '15:30', 'overlap detected with start time');
ok(findOverlaps([cap, ev('x', '15:30', '16:30', { status: 'cancelled' })]).length === 0, 'cancelled ignored');
ok(findOverlaps([ev('p', '08:00', '09:00'), ev('q', '09:00', '10:00')]).length === 0, 'touching events do not overlap');

// now line
ok(nowOffset(new Date(2026, 10, 12, 8, 0)) === 0 && nowOffset(new Date(2026, 10, 12, 12, 30)) === 4.5 * HOUR_PX && nowOffset(new Date(2026, 10, 12, 7, 59)) === null && nowOffset(new Date(2026, 10, 12, 18, 1)) === null, 'now line');

// demo seed
const svc = createServices(createRepositories({ userId: 'demo' }));
await seedDemoData(svc, '2026-11-12');
await seedDemoData(svc, '2026-11-12'); // idempotent
ok((await svc.schedule.list()).length === 6, 'seed creates 6 schedules, no duplicates');
const day = await svc.activity.listToday({ today: '2026-11-12' });
ok(day.length === 6 && day.every((x) => x.isSample), 'today has all sample items, flagged as sample');
ok(findOverlaps(day).length === 1, 'sample data shows the overlap demo');
const week = await svc.activity.list({ from: '2026-11-08', to: '2026-11-14' });
ok(week.length > 6 && (await svc.activity.list({ from: '2026-11-01', to: '2026-11-07' })).length > 0 && (await svc.activity.list({ from: '2026-11-15', to: '2026-11-21' })).length > 0, 'previous and next weeks have data');
ok((await svc.activity.listToday({ today: '2026-11-12', category: 'Exercise' })).length === 1, 'category filter works on seeded data');
const removed = await svc.sampleData.removeAll();
ok(removed.schedules === 6 && (await svc.schedule.list()).length === 0, 'sample data can be removed');

console.log(`PACE 1 scheduler logic OK (${n} checks)`);
