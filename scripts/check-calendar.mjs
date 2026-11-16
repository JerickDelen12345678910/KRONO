// Dependency-free self-check for calendar helpers (Day/Month/Year). Run: node scripts/check-calendar.mjs
import assert from 'node:assert/strict';
import { dayCounts, monthGrid, pickDayInMonth, shiftMonth, shiftView, shiftYear, viewRange, viewTitle, yearMonths } from '../src/lib/calendar.js';

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n += 1; };
const a = (date, category) => ({ startsAt: `${date}T08:00`, category });

// shifting
ok(shiftMonth('2026-01-31', 1) === '2026-02-28' && shiftMonth('2026-03-31', -1) === '2026-02-28', 'month shift clamps the day');
ok(shiftMonth('2026-12-15', 1) === '2027-01-15' && shiftMonth('2026-01-15', -1) === '2025-12-15', 'month shift crosses the year');
ok(shiftYear('2024-02-29', 1) === '2025-02-28' && shiftYear('2026-11-12', -1) === '2025-11-12', 'year shift');
ok(shiftView('day', '2026-11-30', 1) === '2026-12-01' && shiftView('week', '2026-11-12', -1) === '2026-11-05' && shiftView('month', '2026-11-12', 1) === '2026-12-12' && shiftView('year', '2026-11-12', 1) === '2027-11-12', 'shiftView');

// month grid (November 2026: starts Sunday, 30 days -> 5 rows; Feb 2026 starts Sunday, 28 days -> 4 rows; Aug 2026 starts Saturday -> 6 rows)
const nov = monthGrid('2026-11-12');
ok(nov.weeks === 5 && nov.cells.length === 35 && nov.cells[0].date === '2026-11-01' && nov.cells[34].date === '2026-12-05', 'Nov 2026 grid');
ok(nov.cells.filter((c) => c.inMonth).length === 30 && nov.cells[30].inMonth === false && nov.cells[0].inMonth === true, 'in-month flags');
ok(monthGrid('2026-02-10').weeks === 4 && monthGrid('2026-08-10').weeks === 6, 'rows needed: 4 or 6');
ok(monthGrid('2026-08-10').cells[0].date === '2026-07-26' && monthGrid('2026-08-10').cells[0].inMonth === false, 'leading days from previous month');

// ranges
ok(JSON.stringify(viewRange('day', '2026-11-12')) === '{"from":"2026-11-12","to":"2026-11-12"}', 'day range');
ok(viewRange('week', '2026-11-12').from === '2026-11-08' && viewRange('week', '2026-11-12').to === '2026-11-14', 'week range');
ok(viewRange('month', '2026-11-12').to === '2026-12-05' && viewRange('year', '2026-11-12').from === '2026-01-01' && viewRange('year', '2026-11-12').to === '2026-12-31', 'month and year ranges');

// year + titles
const months = yearMonths('2026-11-12');
ok(months.length === 12 && months[0].label === 'January' && months[11].key === '2026-12' && months[10].cells.length === 35, 'year has 12 months with grids');
ok(viewTitle('year', '2026-11-12') === '2026' && viewTitle('month', '2026-11-12') === 'November 2026' && viewTitle('day', '2026-11-12') === 'November 2026', 'titles');
ok(pickDayInMonth('2026-11-01', '2026-11-16') === '2026-11-16' && pickDayInMonth('2026-12-01', '2026-11-16') === '2026-12-01', 'opening a month from the year view');

// counts
const c = dayCounts([a('2026-11-12', 'School'), a('2026-11-12', 'Exercise'), a('2026-11-12', 'School'), a('2026-11-12', 'Travel'), a('2026-11-13', 'Projects')]);
ok(c.get('2026-11-12').count === 4 && c.get('2026-11-12').colors.length === 3 && c.get('2026-11-13').count === 1 && !c.has('2026-11-14'), 'day counts, max 3 dots');
ok(c.get('2026-11-12').colors[0] === 'primary' && c.get('2026-11-12').colors[1] === 'slate', 'dot colours follow category');

console.log(`PACE 4 calendar views OK (${n} checks)`);
