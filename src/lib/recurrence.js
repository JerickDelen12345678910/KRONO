// Turns a schedule's repeat rule into concrete dates ('YYYY-MM-DD'). Pure, no React, no storage.
//
// RULES (weekday numbers: 0 = Sunday ... 6 = Saturday)
//  none         one date: schedule.date
//  daily        every `interval` days, counted from repeat.startDate
//  custom       same as daily (every `interval` days); kept separate for a future custom UI
//  weekly       every `interval` weeks on repeat.daysOfWeek (if empty: the weekday of startDate)
//  selectedDays same as weekly, but daysOfWeek is required (validated by validateSchedule)
//  Weeks are counted from the Sunday of the week that contains repeat.startDate.
import { addDays } from '../models/common.js';

export const MAX_SPAN_DAYS = 366;   // how far from startDate we generate at once (a rolling window comes later)

const parts = (d) => d.split('-').map(Number);
const weekday = (d) => { const [y, m, day] = parts(d); return new Date(y, m - 1, day).getDay(); };
const daysBetween = (a, b) => { const [ay, am, ad] = parts(a); const [by, bm, bd] = parts(b); return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000); };

/** The overall span we generate for: one-time -> its date; repeating -> startDate .. min(endDate, start + 366 days). */
export function scheduleWindow(schedule) {
  const r = schedule.repeat ?? {};
  if (!r.type || r.type === 'none') return schedule.date ? { from: schedule.date, to: schedule.date } : { from: null, to: null };
  if (!r.startDate || !r.endDate || r.endDate < r.startDate) return { from: null, to: null };
  const cap = addDays(r.startDate, MAX_SPAN_DAYS - 1);
  return { from: r.startDate, to: r.endDate < cap ? r.endDate : cap };
}

/** All occurrence dates of `schedule`, sorted, optionally clipped to { from, to } (inclusive). */
export function occurrenceDates(schedule, { from, to } = {}) {
  const win = scheduleWindow(schedule);
  if (!win.from) return [];
  const lo = from && from > win.from ? from : win.from;
  const hi = to && to < win.to ? to : win.to;
  if (hi < lo) return [];

  const r = schedule.repeat ?? {};
  if (!r.type || r.type === 'none') return [schedule.date];

  const interval = Number.isInteger(r.interval) && r.interval >= 1 ? r.interval : 1;
  const startWeek = addDays(r.startDate, -weekday(r.startDate));
  const days = r.daysOfWeek?.length ? r.daysOfWeek : [weekday(r.startDate)];
  const out = [];
  for (let d = lo; d <= hi; d = addDays(d, 1)) {
    const daily = r.type === 'daily' || r.type === 'custom';
    const hit = daily
      ? daysBetween(r.startDate, d) % interval === 0
      : Math.floor(daysBetween(startWeek, d) / 7) % interval === 0 && days.includes(weekday(d));
    if (hit) out.push(d);
  }
  return out;
}
