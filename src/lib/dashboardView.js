// src/lib/dashboardView.js
// Phase 11 PACE 1 — pure view logic of the Home dashboard (no React, no storage): the four KPI cards, "Next up", the Today list,
// the Start workout target and the Sync card. pages/Dashboard.jsx only renders what this returns;
// scripts/check-dashboard-view.mjs tests it.
//
// Honesty rules (same as src/lib/fitnessView.js): nothing is invented. No data yet -> placeholders, never fake zeros; sync is never
// called "Synced" unless nothing is waiting; status is always a word, never only a colour.
//
// Input shapes: activities are what ActivityService returns (src/models/activity.js `createActivity`: type, category, title, subtitle,
// startsAt/endsAt 'YYYY-MM-DDTHH:mm', status, refs); `planned` is WorkoutService.today() (occurrenceId, startTime, endTime, status, workout).
import { ACTIVITY_STATUS, ACTIVITY_TYPE, OCCURRENCE_STATUS } from '../models/constants.js';
import { addDays, toLocalDate, toLocalDateTime } from '../models/common.js';
import { durationLabel } from './fitness.js';
import { plannedMinutes } from './fitnessView.js';
import { dateOf, timeOf, to12h } from './timeline.js';

const PLACEHOLDER = '–';
const CLASS_CATEGORY = 'School';
const OPEN_ACTIVITY = [ACTIVITY_STATUS.SCHEDULED, ACTIVITY_STATUS.IN_PROGRESS];
const CLOSED_PLAN = [OCCURRENCE_STATUS.DONE, OCCURRENCE_STATUS.SKIPPED, OCCURRENCE_STATUS.CANCELLED];

// ---- time texts ----
const toDate = (dateTime) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(String(dateTime ?? ''));
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5])) : null;
};
const minutesUntil = (startsAt, now) => {
  const d = toDate(startsAt);
  return d ? Math.ceil((d.getTime() - now.getTime()) / 60000) : null;
};
/** 25 -> '25 min', 90 -> '1 h 30 min', 120 -> '2 h'. */
const shortSpan = (mins) => {
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
};

/** 'in 25 minutes' · 'in 2 h 5 min' · 'tomorrow at 8:00 AM' · 'Friday at 8:00 AM' · 'now'. */
export function untilLabel(startsAt, now) {
  const mins = minutesUntil(startsAt, now);
  if (mins == null) return '';
  if (mins <= 0) return 'now';
  if (mins < 60) return `in ${mins} ${mins === 1 ? 'minute' : 'minutes'}`;
  const day = dateOf(startsAt);
  const today = toLocalDate(now);
  if (day === today) return `in ${shortSpan(mins)}`;
  const time = to12h(timeOf(startsAt));
  if (day === addDays(today, 1)) return `tomorrow at ${time}`;
  const [y, m, d] = day.split('-').map(Number);
  return `${new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'long' })} at ${time}`;
}

/** 'just now' · '2 min ago' · '3 h ago' · 'Nov 12'; '' when the value is not a date. Accepts an ISO string or a number of ms. */
export function agoLabel(value, nowMs = Date.now()) {
  const t = new Date(value).getTime();
  if (value == null || Number.isNaN(t)) return '';
  const secs = Math.max(0, Math.round((nowMs - t) / 1000));
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins} min ago`;
  if (mins < 24 * 60) return `${Math.floor(mins / 60)} h ago`;
  return new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ---- activities ----
const isClass = (a) => a.type === ACTIVITY_TYPE.SCHEDULE && a.category === CLASS_CATEGORY
  && a.status !== ACTIVITY_STATUS.CANCELLED && a.status !== ACTIVITY_STATUS.SKIPPED;
const byStart = (a, b) => (a.startsAt ?? '').localeCompare(b.startsAt ?? '');
const rangeOf = (a) => (a.endsAt ? `${to12h(timeOf(a.startsAt))}–${to12h(timeOf(a.endsAt))}` : to12h(timeOf(a.startsAt)));

/** Which screen "Open" goes to for an activity. */
export function routeFor(a) {
  if (a.type === ACTIVITY_TYPE.WORKOUT || a.category === 'Exercise') return '/fitness';
  if (a.type === ACTIVITY_TYPE.TRIP || a.category === 'Travel') return '/map';
  return '/scheduler';
}

/**
 * The "Next up" card for the first open activity that has not started yet, or null.
 * `upcoming` is ActivityService.listUpcoming(); it is filtered again against `now` because the screen's clock moves on between reads.
 */
export function nextUp(upcoming, now) {
  const nowKey = toLocalDateTime(now);
  const a = (upcoming ?? []).filter((x) => OPEN_ACTIVITY.includes(x.status) && x.startsAt && x.startsAt >= nowKey).sort(byStart)[0];
  if (!a) return null;
  return {
    key: a.id ?? `${a.type}-${a.startsAt}`,
    title: a.title || 'Untitled',
    when: untilLabel(a.startsAt, now),
    meta: [rangeOf(a), a.subtitle].filter(Boolean).join(' · '),
    route: routeFor(a),
  };
}

// ---- KPI row ----
function classesCard(today, now) {
  const classes = (today ?? []).filter(isClass).sort(byStart);
  const nowKey = toLocalDateTime(now);
  const waiting = classes.filter((c) => c.status !== ACTIVITY_STATUS.DONE);
  let subtitle = 'No classes today';
  if (classes.length > 0) {
    const running = waiting.find((c) => c.startsAt <= nowKey && (c.endsAt ?? c.startsAt) > nowKey);
    const next = waiting.find((c) => c.startsAt > nowKey);
    if (running) subtitle = 'In progress';
    else if (next) subtitle = `Next in ${shortSpan(minutesUntil(next.startsAt, now))}`;
    else subtitle = 'Done for today';
  }
  return { key: 'classes', variant: 'pri', label: 'Classes today', value: String(classes.length), subtitle };
}

function workoutCard(planned) {
  const list = [...(planned ?? [])].sort((a, b) => (a.startTime ?? '').localeCompare(b.startTime ?? ''));
  const open = list.filter((p) => !CLOSED_PLAN.includes(p.status));
  const base = { key: 'workout', variant: 'fit', label: 'Workout' };
  if (open.length > 0) {
    const p = open[0];
    const minutes = plannedMinutes(p.startTime, p.endTime);
    const parts = [p.startTime ? to12h(p.startTime) : null, p.workout?.name || 'Workout'];
    if (open.length > 1) parts.push(`+${open.length - 1} more`);
    return { ...base, value: minutes != null ? durationLabel(minutes * 60) : 'Planned', subtitle: parts.filter(Boolean).join(' · ') };
  }
  const done = list.find((p) => p.status === OCCURRENCE_STATUS.DONE);
  if (done) return { ...base, value: 'Done', subtitle: done.workout?.name || 'Workout' };
  return { ...base, value: PLACEHOLDER, subtitle: 'No workout planned' };
}

/**
 * The four KPI cards. `data` = { today, planned, places, reminders } where places / reminders are COUNTS (null = not read yet).
 * The third card is "Saved places" until Map PACE 3 can say when to leave for a trip ("Leave for ...").
 */
export function kpiCards(data, now) {
  if (!data?.loaded) {
    return [
      { key: 'classes', variant: 'pri', label: 'Classes today' },
      { key: 'workout', variant: 'fit', label: 'Workout' },
      { key: 'places', variant: 'map', label: 'Saved places' },
      { key: 'reminders', variant: 'prj', label: 'Reminders set' },
    ].map((c) => ({ ...c, value: PLACEHOLDER, subtitle: '' }));
  }
  const places = data.places;
  const reminders = data.reminders;
  return [
    classesCard(data.today, now),
    workoutCard(data.planned),
    {
      key: 'places', variant: 'map', label: 'Saved places', value: places == null ? PLACEHOLDER : String(places),
      subtitle: places > 0 ? 'Available offline' : 'Find places on the Map',
    },
    {
      key: 'reminders', variant: 'prj', label: 'Reminders set', value: reminders == null ? PLACEHOLDER : String(reminders),
      subtitle: reminders > 0 ? 'Scheduled on this device' : 'None scheduled',
    },
  ];
}

// ---- Today list ----
function rowStyle(a) {
  if (a.type === ACTIVITY_TYPE.WORKOUT || a.category === 'Exercise') return { bar: 'fit', category: { variant: 'fit', label: 'Exercise' } };
  if (a.category === 'Projects') return { bar: 'prj', category: { variant: 'prj', label: 'Project' } };
  if (a.category === 'Travel') return { bar: 'map', category: { variant: 'map', label: 'Travel' } };
  if (a.category === CLASS_CATEGORY || !a.category) return { bar: 'pri', category: null };
  return { bar: 'pri', category: { variant: 'primary', label: a.category } };
}

const STATUS_PILL = Object.freeze({
  [ACTIVITY_STATUS.DONE]: { variant: 'ok', label: 'Done' },
  [ACTIVITY_STATUS.SKIPPED]: { variant: 'primary', label: 'Skipped' },
  [ACTIVITY_STATUS.IN_PROGRESS]: { variant: 'primary', label: 'In progress' },
});

/**
 * A finished or running workout session replaces the planned occurrence of the schedule it came from (matched by `refs.scheduleId`),
 * so one workout is one row, not a "scheduled" row plus a "done" row.
 */
export function mergePlanned(items) {
  const covered = new Set(
    items.filter((a) => a.type === ACTIVITY_TYPE.WORKOUT && a.refs?.scheduleId && [ACTIVITY_STATUS.DONE, ACTIVITY_STATUS.IN_PROGRESS].includes(a.status))
      .map((a) => a.refs.scheduleId),
  );
  return items.filter((a) => !(a.type === ACTIVITY_TYPE.SCHEDULE && a.refs?.scheduleId && covered.has(a.refs.scheduleId)));
}

/** { header: '4 items', rows: [{ key, time, bar, title, subtitle, pills: [{ variant, label }] }] } for today's activities. */
export function todayRows(activities) {
  const visible = mergePlanned((activities ?? []).filter((a) => a.status !== ACTIVITY_STATUS.CANCELLED && a.startsAt)).sort(byStart);
  const rows = visible.map((a, i) => {
    const style = rowStyle(a);
    const status = STATUS_PILL[a.status] ?? null;
    return {
      key: a.id ?? `${a.type}-${a.startsAt}-${i}`,
      time: to12h(timeOf(a.startsAt)),
      bar: style.bar,
      title: a.title || 'Untitled',
      subtitle: a.subtitle || (a.endsAt ? `until ${to12h(timeOf(a.endsAt))}` : ''),
      pills: [style.category, status].filter(Boolean),
    };
  });
  return { header: `${rows.length} ${rows.length === 1 ? 'item' : 'items'}`, rows };
}

// ---- quick action: Start workout ----
/**
 * Where "Start workout" goes: the one workout planned today that is not finished -> { workoutId, name }; none or several -> null
 * (the screen then opens Fitness, where the person chooses).
 */
export function startTarget(planned) {
  const open = (planned ?? []).filter((p) => p.workout?.id && !CLOSED_PLAN.includes(p.status));
  const ids = new Set(open.map((p) => p.workout.id));
  return ids.size === 1 ? { workoutId: open[0].workout.id, name: open[0].workout.name || 'Workout' } : null;
}

// ---- Sync card ----
const changes = (n) => `${n} ${n === 1 ? 'change' : 'changes'}`;

/** The Sync card from SyncService.getStatus() ({ running, pending, ok, lastSyncedAt, lastError }) and whether the device is online. */
export function syncCard(status = {}, online = true, nowMs = Date.now()) {
  const { running = false, pending = null, lastSyncedAt = null, lastError = null } = status;
  if (running) {
    return { pill: { variant: 'primary', label: 'Syncing' }, title: 'Syncing your changes', subtitle: pending > 0 ? `${changes(pending)} to send` : 'One moment' };
  }
  if (pending === null) {
    return { pill: { variant: 'primary', label: 'Checking' }, title: 'Checking your changes', subtitle: 'Saved on this device' };
  }
  if (pending > 0) {
    if (!online) {
      return { pill: { variant: 'warn', label: 'Offline' }, title: 'Working offline', subtitle: `${changes(pending)} will sync when you’re back online` };
    }
    return {
      pill: { variant: 'warn', label: 'Waiting' }, title: `${changes(pending)} waiting to sync`,
      subtitle: lastError ? 'The last attempt failed. It will retry.' : 'They will sync automatically',
    };
  }
  if (!online) {
    return { pill: { variant: 'warn', label: 'Offline' }, title: 'All changes saved', subtitle: 'Saved on this device. Sync resumes when you’re online.' };
  }
  const ago = agoLabel(lastSyncedAt, nowMs);
  return { pill: { variant: 'ok', label: 'Synced' }, title: 'All changes saved', subtitle: ago ? `Last synced ${ago}` : 'Saved on this device' };
}