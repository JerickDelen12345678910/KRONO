// src/lib/headerView.js
// Phase 11 PACE 2 — pure view logic for the shared header search and notifications bell (no React, no storage):
// searches locally across schedules, exercises, workouts, and saved places, and formats upcoming scheduled
// reminders with routes and snooze metadata. Tested by scripts/check-header-view.mjs.
import { addDays, toLocalDate, toLocalDateTime } from '../models/common.js';
import { EXERCISE_LIBRARY } from './exerciseLibrary.js';
import { untilLabel } from './dashboardView.js';
import { mapRouteLink } from './mapView.js';
import { focusDate } from './scheduleForm.js';
import { dateOf, timeOf, to12h } from './timeline.js';

const DEFAULT_GROUP_LIMIT = 4;
const DEFAULT_REMINDER_LIMIT = 15;

const matchesQuery = (q, fields) => fields.some((f) => String(f ?? '').toLowerCase().includes(q));

function scheduleRoute(s, date = null) {
  if (s?.category === 'Travel') {
    return mapRouteLink({ destinationId: s.destinationId ?? null, arriveBy: s.startTime });
  }
  if (s?.category === 'Exercise') return '/fitness';
  const targetDate = date || focusDate(s);
  return targetDate ? `/scheduler?date=${targetDate}` : '/scheduler';
}

/**
 * Searches locally across schedules, exercises, optional workouts, and saved places.
 * Returns `{ query, total, groups: [{ key, label, variant, items: [{ key, id, group, title, subtitle, route }] }] }`.
 */
export function searchAll({
  query, schedules = [], exercises = EXERCISE_LIBRARY, workouts = [], places = [], limitPerGroup = DEFAULT_GROUP_LIMIT,
} = {}) {
  const q = String(query ?? '').trim().toLowerCase();
  if (!q) return { query: '', total: 0, groups: [] };

  const schedMatches = (schedules ?? [])
    .filter((s) => !s?.deleted && matchesQuery(q, [s.title, s.category, s.location, s.description]))
    .map((s) => ({
      key: `schedule:${s.id}`,
      id: s.id,
      group: 'schedules',
      title: s.title || 'Untitled',
      subtitle: [s.category, s.startTime ? to12h(s.startTime) : '', s.location].filter(Boolean).join(' · '),
      route: scheduleRoute(s),
    }));

  const exerciseMatches = (exercises ?? [])
    .filter((e) => matchesQuery(q, [e.name, e.category, e.difficulty, e.description, ...(e.targetMuscles ?? [])]))
    .map((e) => ({
      key: `exercise:${e.id}`,
      id: e.id,
      group: 'exercises',
      title: e.name,
      subtitle: [e.category, e.difficulty, (e.targetMuscles ?? []).slice(0, 2).join(', ')].filter(Boolean).join(' · '),
      route: '/fitness',
    }));

  const workoutMatches = (workouts ?? [])
    .filter((w) => !w?.deleted && matchesQuery(q, [w.name, w.notes, w.category]))
    .map((w) => ({
      key: `workout:${w.id}`,
      id: w.id,
      group: 'workouts',
      title: w.name || 'Workout',
      subtitle: 'Saved workout',
      route: '/fitness',
    }));

  const placeMatches = (places ?? [])
    .filter((p) => !p?.deleted && matchesQuery(q, [p.name, p.address]))
    .map((p) => ({
      key: `place:${p.id}`,
      id: p.id,
      group: 'places',
      title: p.name || 'Saved place',
      subtitle: p.address || 'Saved place',
      route: mapRouteLink({ destinationId: p.id }),
    }));

  const rawGroups = [
    { key: 'schedules', label: 'Schedules', variant: 'pri', all: schedMatches },
    { key: 'exercises', label: 'Exercises', variant: 'fit', all: exerciseMatches },
    { key: 'workouts', label: 'Workouts', variant: 'fit', all: workoutMatches },
    { key: 'places', label: 'Saved places', variant: 'map', all: placeMatches },
  ].filter((g) => g.all.length > 0);

  const total = rawGroups.reduce((sum, g) => sum + g.all.length, 0);
  const groups = rawGroups.map(({ key, label, variant, all }) => ({
    key,
    label,
    variant,
    items: all.slice(0, limitPerGroup),
  }));

  return { query: q, total, groups };
}

function dayLabel(dateTime, now) {
  const day = dateOf(dateTime);
  const today = toLocalDate(now);
  if (day === today) return 'Today';
  if (day === addDays(today, 1)) return 'Tomorrow';
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Formats currently scheduled reminders for the Header Notifications bell popover.
 * Returns `{ count, items: [{ id, scheduleId, title, when, fireTimeText, subtitle, modeLabel, snoozeMinutes, route }] }`.
 */
export function reminderNotifications({
  scheduled = [], schedules = [], now = new Date(), snoozeMinutes = 10, limit = DEFAULT_REMINDER_LIMIT,
} = {}) {
  const nowKey = toLocalDateTime(now);
  const byScheduleId = new Map((schedules ?? []).filter((s) => !s?.deleted).map((s) => [s.id, s]));

  const upcoming = (scheduled ?? [])
    .filter((r) => r && typeof r.fireAt === 'string' && r.fireAt >= nowKey)
    .sort((a, b) => a.fireAt.localeCompare(b.fireAt) || String(a.id ?? '').localeCompare(String(b.id ?? '')));

  const items = upcoming.slice(0, limit).map((r) => {
    const sched = r.scheduleId ? byScheduleId.get(r.scheduleId) ?? null : null;
    const route = sched
      ? scheduleRoute(sched, r.date)
      : (r.date ? `/scheduler?date=${r.date}` : '/scheduler');
    return {
      id: r.id,
      scheduleId: r.scheduleId ?? null,
      title: r.title || sched?.title || 'Reminder',
      when: untilLabel(r.fireAt, now),
      fireTimeText: `${dayLabel(r.fireAt, now)} · ${to12h(timeOf(r.fireAt))}`,
      subtitle: r.body || (r.startTime ? `Starts at ${to12h(r.startTime)}` : ''),
      modeLabel: r.mode === 'both' ? 'Notify + alarm' : 'Notify',
      snoozeMinutes: r.snoozeMinutes ?? snoozeMinutes,
      route,
    };
  });

  return { count: upcoming.length, items };
}