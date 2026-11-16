// Pure helpers for the week strip + hourly timeline (no React, easy to test).
import { addDays } from '../models/common.js';

export const DAY_START = 8;   // 8 AM
export const DAY_END = 18;    // 6 PM
export const HOUR_PX = 56;
export const MIN_EVENT_PX = 24;

export const toMinutes = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
export const timeOf = (dateTime) => dateTime.slice(11, 16);   // 'YYYY-MM-DDTHH:mm' -> 'HH:mm'
export const dateOf = (dateTime) => dateTime.slice(0, 10);

/** '15:30' -> '3:30 PM' */
export function to12h(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}
export const formatRange = (a) => `${to12h(timeOf(a.startsAt))}–${to12h(timeOf(a.endsAt))}`;

/** The 7 dates (Sunday first) of the week containing `dateStr`. */
export function weekDates(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const start = addDays(dateStr, -new Date(y, m - 1, d).getDay());
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export function monthLabel(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}
export function weekdayLetter(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return 'SMTWTFS'[new Date(y, m - 1, d).getDay()];
}
export const dayNumber = (dateStr) => Number(dateStr.slice(8, 10));

const active = (a) => a.status !== 'cancelled' && a.status !== 'skipped';
const span = (a) => [toMinutes(timeOf(a.startsAt)), toMinutes(timeOf(a.endsAt))];

/**
 * Position events on the timeline. Overlapping events share the width side by side.
 * Returns { placed: [{ item, top, height, col, cols }], outside: [items fully outside 8AM–6PM] }.
 */
export function layoutEvents(items) {
  const lo = DAY_START * 60, hi = DAY_END * 60;
  const outside = [];
  const visible = [];
  for (const item of items) {
    const [s, e] = span(item);
    if (e <= lo || s >= hi) outside.push(item); else visible.push({ item, s: Math.max(s, lo), e: Math.min(e, hi) });
  }
  visible.sort((a, b) => a.s - b.s || a.e - b.e);

  const placed = [];
  let cluster = [], clusterEnd = -1;
  const flush = () => {
    const colEnds = [];
    for (const ev of cluster) {
      let col = colEnds.findIndex((end) => end <= ev.s);
      if (col === -1) { col = colEnds.length; colEnds.push(ev.e); } else colEnds[col] = ev.e;
      ev.col = col;
    }
    for (const ev of cluster) {
      placed.push({
        item: ev.item, col: ev.col, cols: colEnds.length,
        top: ((ev.s - lo) / 60) * HOUR_PX, height: Math.max(((ev.e - ev.s) / 60) * HOUR_PX, MIN_EVENT_PX),
      });
    }
    cluster = []; clusterEnd = -1;
  };
  for (const ev of visible) {
    if (cluster.length && ev.s >= clusterEnd) flush();
    cluster.push(ev);
    clusterEnd = Math.max(clusterEnd, ev.e);
  }
  if (cluster.length) flush();
  return { placed, outside };
}

/** Pairs of events that overlap in time (cancelled/skipped are ignored). `at` is when the overlap begins. */
export function findOverlaps(items) {
  const list = items.filter(active).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const pairs = [];
  for (let i = 0; i < list.length; i += 1) {
    for (let j = i + 1; j < list.length; j += 1) {
      const [as, ae] = span(list[i]); const [bs, be] = span(list[j]);
      if (bs < ae && as < be) pairs.push({ a: list[i], b: list[j], at: timeOf(list[j].startsAt) });
    }
  }
  return pairs;
}

/** Position (px) of the "now" line, or null when it is outside the visible hours. */
export function nowOffset(now) {
  const mins = now.getHours() * 60 + now.getMinutes();
  return mins < DAY_START * 60 || mins > DAY_END * 60 ? null : ((mins - DAY_START * 60) / 60) * HOUR_PX;
}
