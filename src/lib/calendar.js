// Pure helpers for the Day / Week / Month / Year views (no React). Weeks start on Sunday.
import { addDays, toLocalDate } from '../models/common.js';
import { CATEGORY_COLOR } from '../models/constants.js';
import { dateOf, monthLabel, weekDates } from './timeline.js';

const parts = (d) => d.split('-').map(Number);
const daysIn = (y, m) => new Date(y, m, 0).getDate();   // m is 1-12

/** Move by whole months, keeping the day when possible (Jan 31 + 1 month = Feb 28). */
export function shiftMonth(dateStr, n) {
  const [y, m, d] = parts(dateStr);
  const first = new Date(y, m - 1 + n, 1);
  const day = Math.min(d, daysIn(first.getFullYear(), first.getMonth() + 1));
  return toLocalDate(new Date(first.getFullYear(), first.getMonth(), day));
}
export const shiftYear = (dateStr, n) => shiftMonth(dateStr, n * 12);

/** The month grid: whole weeks (5 or 6 rows) covering the month. cells: { date, day, inMonth }. */
export function monthGrid(dateStr) {
  const [y, m] = parts(dateStr);
  const first = `${y}-${String(m).padStart(2, '0')}-01`;
  const lead = new Date(y, m - 1, 1).getDay();
  const weeks = Math.ceil((lead + daysIn(y, m)) / 7);
  const start = addDays(first, -lead);
  const cells = Array.from({ length: weeks * 7 }, (_, i) => {
    const date = addDays(start, i);
    return { date, day: Number(date.slice(8, 10)), inMonth: date.slice(0, 7) === first.slice(0, 7) };
  });
  return { cells, weeks };
}

/** The 12 months of the year containing `dateStr`, each with its own grid. */
export function yearMonths(dateStr) {
  const y = parts(dateStr)[0];
  return Array.from({ length: 12 }, (_, i) => {
    const date = `${y}-${String(i + 1).padStart(2, '0')}-01`;
    return { key: date.slice(0, 7), date, label: new Date(y, i, 1).toLocaleDateString('en-US', { month: 'long' }), ...monthGrid(date) };
  });
}

/** The date range (inclusive) we must load for a view. */
export function viewRange(view, dateStr) {
  if (view === 'day') return { from: dateStr, to: dateStr };
  if (view === 'week') { const w = weekDates(dateStr); return { from: w[0], to: w[6] }; }
  if (view === 'month') { const { cells } = monthGrid(dateStr); return { from: cells[0].date, to: cells[cells.length - 1].date }; }
  const y = parts(dateStr)[0];
  return { from: `${y}-01-01`, to: `${y}-12-31` };
}

/** Previous / next day, week, month or year. */
export function shiftView(view, dateStr, n) {
  if (view === 'day') return addDays(dateStr, n);
  if (view === 'week') return addDays(dateStr, 7 * n);
  if (view === 'month') return shiftMonth(dateStr, n);
  return shiftYear(dateStr, n);
}

export const viewTitle = (view, dateStr) => (view === 'year' ? dateStr.slice(0, 4) : monthLabel(dateStr));

/** When opening a month from the year view: today if it is in that month, otherwise the 1st. */
export const pickDayInMonth = (monthFirst, today) => (today.slice(0, 7) === monthFirst.slice(0, 7) ? today : monthFirst);

/** Map of date -> { count, colors: first 3 category colours } built from activities. */
export function dayCounts(items) {
  const map = new Map();
  for (const a of items) {
    const date = dateOf(a.startsAt);
    const entry = map.get(date) ?? { count: 0, colors: [] };
    entry.count += 1;
    if (entry.colors.length < 3) entry.colors.push(CATEGORY_COLOR[a.category] ?? 'primary');
    map.set(date, entry);
  }
  return map;
}
