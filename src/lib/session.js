// src/lib/session.js
// Phase 9 PACE 4a + 4b — pure logic of the workout session screen (no React, no storage): the plan snapshot a session
// starts with, logging / undoing / skipping sets, progress, pause / resume, active-time counter, rest timer, what "Finish"
// saves, and the texts of the screen. pages/WorkoutSession.jsx only renders what this returns; scripts/check-session.mjs
// tests it.
//
// A session lives in `exerciseHistory` (src/models/workout.js `createWorkoutSession`). Its `entries` are one per exercise:
//   { exerciseId, name, status: 'pending'|'completed'|'skipped', sets: [{ reps, durationSec }], plan }
// `plan` = { sets, reps, durationSec, restSec } is a SNAPSHOT of the workout item taken when the session starts, so the
// screen keeps working (and the history stays truthful) if the workout is edited or deleted meanwhile. `sets` holds only
// the sets the user logged; a logged set records the planned reps / seconds (there is no per-set editing yet).
//
// Every function returns NEW data; an impossible action returns the SAME array it was given (callers can compare).
import { nowIso } from '../models/common.js';
import { ENTRY_STATUS, SESSION_STATUS } from '../models/constants.js';
import { getExerciseById } from './exerciseLibrary.js';
import { restLabel, setsLabel } from './fitness.js';

const { PENDING, COMPLETED, SKIPPED } = ENTRY_STATUS;
const OPEN_STATUSES = [SESSION_STATUS.IN_PROGRESS, SESSION_STATUS.PAUSED];

/**
 * Maximum active time counted for a single session (3 hours). The same window decides whether an unfinished session is
 * continued automatically by "Start workout" or surfaced as an abandoned session on the Fitness dashboard.
 */
export const SESSION_WINDOW_SECONDS = 3 * 60 * 60;

const toMs = (iso) => {
  const t = Date.parse(iso ?? '');
  return Number.isNaN(t) ? null : t;
};

/** Seconds from `startedAt` to now, between 0 and SESSION_WINDOW_SECONDS (an invalid start gives 0). */
export function elapsedSeconds(startedAt, nowMs = Date.now()) {
  const start = toMs(startedAt);
  if (start == null) return 0;
  return Math.min(SESSION_WINDOW_SECONDS, Math.max(0, Math.round((nowMs - start) / 1000)));
}

/**
 * Active workout seconds excluding explicit pauses (`pausedSeconds` + any current pause from `pausedAt`).
 * Rest timers between sets count as active workout time; only explicit pauses are subtracted.
 */
export function activeSessionSeconds(session, nowMs = Date.now()) {
  if (!session) return 0;
  if (session.status === SESSION_STATUS.COMPLETED && Number.isFinite(session.activeSeconds) && session.activeSeconds >= 0) {
    return Math.min(SESSION_WINDOW_SECONDS, Math.round(session.activeSeconds));
  }
  const start = toMs(session.startedAt);
  if (start == null) return 0;
  const pausedTotal = Math.max(0, Number.isFinite(session.pausedSeconds) ? session.pausedSeconds : 0);
  let endMs = nowMs;
  if (session.status === SESSION_STATUS.PAUSED) {
    const pausedAt = toMs(session.pausedAt);
    if (pausedAt != null) endMs = pausedAt;
  } else if (session.status === SESSION_STATUS.COMPLETED) {
    const endedAt = toMs(session.endedAt);
    if (endedAt != null) endMs = endedAt;
  }
  const raw = Math.round((endMs - start) / 1000 - pausedTotal);
  return Math.min(SESSION_WINDOW_SECONDS, Math.max(0, raw));
}

/** Formats non-negative seconds as MM:SS (or H:MM:SS at 1 hour and above). */
export function formatClock(totalSeconds) {
  const safe = Math.max(0, Math.floor(Number.isFinite(totalSeconds) ? totalSeconds : 0));
  const hours = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(mins)}:${pad(secs)}` : `${pad(mins)}:${pad(secs)}`;
}

/** Returns the patch to pause an in-progress session, or null if the session cannot be paused. */
export function pauseSessionPatch(session, now = nowIso()) {
  if (!session || session.status !== SESSION_STATUS.IN_PROGRESS) return null;
  return { status: SESSION_STATUS.PAUSED, pausedAt: now };
}

/** Returns the patch to resume a paused session (accumulating pausedSeconds), or null if not paused. */
export function resumeSessionPatch(session, now = nowIso()) {
  if (!session || session.status !== SESSION_STATUS.PAUSED) return null;
  const pausedAt = toMs(session.pausedAt);
  const nowMs = toMs(now);
  const extra = pausedAt != null && nowMs != null ? Math.max(0, Math.round((nowMs - pausedAt) / 1000)) : 0;
  const basePaused = Math.max(0, Number.isFinite(session.pausedSeconds) ? Math.round(session.pausedSeconds) : 0);
  return { status: SESSION_STATUS.IN_PROGRESS, pausedAt: null, pausedSeconds: basePaused + extra };
}

/** True when `session` is an unfinished session of `workoutId` that was started within SESSION_WINDOW_SECONDS. */
export function isOpenSession(session, workoutId, nowMs = Date.now()) {
  if (!session || session.deleted || session.workoutId !== workoutId || !OPEN_STATUSES.includes(session.status)) return false;
  const start = toMs(session.startedAt);
  return start != null && nowMs - start <= SESSION_WINDOW_SECONDS * 1000;
}

/** True when `session` is an unfinished session older than SESSION_WINDOW_SECONDS (surfaced on Fitness to Resume or Discard). */
export function isAbandonedSession(session, nowMs = Date.now()) {
  if (!session || session.deleted || !OPEN_STATUSES.includes(session.status)) return false;
  const start = toMs(session.startedAt);
  return start != null && nowMs - start > SESSION_WINDOW_SECONDS * 1000;
}

// ---- the plan snapshot ----
/** The `entries` a new session starts with: one pending entry per workout item, carrying its plan. */
export function planEntries(workout) {
  return (workout.items ?? []).map((item) => ({
    exerciseId: item.exerciseId ?? null,
    name: item.name || getExerciseById(item.exerciseId)?.name || 'Exercise',
    status: PENDING,
    sets: [],
    plan: { sets: item.sets, reps: item.reps ?? null, durationSec: item.durationSec ?? null, restSec: item.restSec ?? null },
  }));
}

const loggedSets = (entry) => entry.sets ?? [];
/** How many sets the entry asks for (an entry without a plan counts what was logged, at least 1). */
const plannedSets = (entry) => (Number.isInteger(entry.plan?.sets) && entry.plan.sets > 0 ? entry.plan.sets : Math.max(1, loggedSets(entry).length));
const setValue = (entry) => ({ reps: entry.plan?.reps ?? null, durationSec: entry.plan?.durationSec ?? null });
const replaceAt = (entries, index, change) => entries.map((e, i) => (i === index ? { ...e, ...change } : e));

// ---- actions ----
/** Log the next set of an exercise; the exercise becomes completed with its last planned set. */
export function logSet(entries, index) {
  const entry = entries[index];
  if (!entry || entry.status === SKIPPED || loggedSets(entry).length >= plannedSets(entry)) return entries;
  const sets = [...loggedSets(entry), setValue(entry)];
  return replaceAt(entries, index, { sets, status: sets.length >= plannedSets(entry) ? COMPLETED : PENDING });
}

/** Take back the last logged set (a completed exercise becomes pending again). */
export function undoSet(entries, index) {
  const entry = entries[index];
  if (!entry || loggedSets(entry).length === 0) return entries;
  return replaceAt(entries, index, { sets: loggedSets(entry).slice(0, -1), status: PENDING });
}

/** Skip an exercise. Only one with no logged sets can be skipped, so skipping never throws away logged work. */
export function skipEntry(entries, index) {
  const entry = entries[index];
  if (!entry || entry.status !== PENDING || loggedSets(entry).length > 0) return entries;
  return replaceAt(entries, index, { status: SKIPPED, sets: [] });
}

export function unskipEntry(entries, index) {
  const entry = entries[index];
  if (!entry || entry.status !== SKIPPED) return entries;
  return replaceAt(entries, index, { status: PENDING });
}

// ---- progress and finishing ----
/** Totals for the header line and the Finish button. Skipped exercises are left out of the planned totals. */
export function sessionProgress(entries) {
  let setsDone = 0; let setsPlanned = 0; let exercisesDone = 0; let skipped = 0; let notFinished = 0;
  for (const e of entries) {
    if (e.status === SKIPPED) { skipped += 1; continue; }
    setsDone += loggedSets(e).length;
    setsPlanned += plannedSets(e);
    if (e.status === COMPLETED) exercisesDone += 1; else notFinished += 1;
  }
  return {
    setsDone, setsPlanned, exercisesDone, skipped, notFinished,
    exercisesTotal: entries.length - skipped,
    canFinish: setsDone > 0,   // a session with no logged set would count as a workout in the weekly numbers: never save one
  };
}

export function progressText(p) {
  if (p.exercisesTotal === 0) return p.skipped > 0 ? 'Every exercise is skipped.' : 'No exercises in this workout.';
  const text = `${p.setsDone} of ${p.setsPlanned} sets · ${p.exercisesDone} of ${p.exercisesTotal} exercises done`;
  return p.skipped > 0 ? `${text} · ${p.skipped} skipped` : text;
}

/**
 * Starts a visual rest timer when a set was just logged, the exercise has `restSec > 0`, and at least one exercise in the
 * workout still remains unfinished. Returns `{ exerciseName, durationSec, remainingSec }` or null.
 */
export function restForLoggedSet(prevEntries, nextEntries, index) {
  const prev = prevEntries?.[index];
  const next = nextEntries?.[index];
  if (!prev || !next || loggedSets(next).length <= loggedSets(prev).length) return null;
  const restSec = next.plan?.restSec;
  if (!Number.isFinite(restSec) || restSec <= 0) return null;
  if (sessionProgress(nextEntries).notFinished === 0) return null;
  const whole = Math.round(restSec);
  return { exerciseName: next.name || 'Exercise', durationSec: whole, remainingSec: whole };
}

/** Advances a rest timer by `deltaSec` seconds; returns null once the countdown reaches 0. */
export function tickRestTimer(timer, deltaSec = 1) {
  if (!timer || deltaSec <= 0) return timer;
  const remainingSec = timer.remainingSec - deltaSec;
  return remainingSec > 0 ? { ...timer, remainingSec } : null;
}

/**
 * What Finish saves: an exercise still pending keeps the sets logged so far and becomes completed, or skipped when it has none.
 * The `sets` array is the truth of what was done; `status` only says whether the exercise was worked on.
 */
export const finalizeEntries = (entries) => entries.map((e) => {
  if (e.status !== PENDING) return e;
  return { ...e, status: loggedSets(e).length > 0 ? COMPLETED : SKIPPED };
});

/** The confirmation before Finish when some exercises are not completed; '' when there is nothing to confirm. */
export function finishMessage(entries) {
  const { notFinished } = sessionProgress(entries);
  if (notFinished === 0) return '';
  return `Finish this workout with ${notFinished} ${notFinished === 1 ? 'exercise' : 'exercises'} not completed? Sets you logged are saved, and exercises with no sets are saved as skipped.`;
}

export const discardMessage = (name) => `Discard “${name || 'this workout'}”? Nothing from this session is saved to your history. This cannot be undone.`;

// ---- view texts ----
const amountLabel = (entry) => {
  const src = entry.plan ?? loggedSets(entry)[0] ?? {};
  if (src.reps != null) return `${src.reps} ${src.reps === 1 ? 'rep' : 'reps'}`;
  if (src.durationSec != null) return `${src.durationSec} s`;
  return '';
};

/** Everything one exercise card shows: texts, one row per planned set, and which buttons apply. */
export function entryView(entry, index) {
  const total = plannedSets(entry);
  const done = loggedSets(entry).length;
  const skipped = entry.status === SKIPPED;
  const completed = entry.status === COMPLETED;
  const amount = amountLabel(entry);
  let badge = 'Not started';
  if (skipped) badge = 'Skipped';
  else if (completed) badge = 'Done';
  else if (done > 0) badge = `${done} of ${total} sets`;
  return {
    key: `${index}-${entry.exerciseId ?? 'custom'}`,
    index,
    title: `${index + 1}. ${entry.name || 'Exercise'}`,
    target: entry.plan ? [setsLabel(entry.plan), restLabel(entry.plan.restSec)].filter(Boolean).join(' · ') : '',
    badge,
    skipped,
    completed,
    rows: skipped ? [] : Array.from({ length: total }, (_, n) => ({
      key: n, set: `Set ${n + 1}`, amount: amount || 'Set', state: n < done ? 'Done' : 'To do',
    })),
    logLabel: `Log set ${Math.min(done + 1, total)} of ${total}`,
    canLog: !skipped && done < total,
    canUndo: done > 0,
    canSkip: entry.status === PENDING && done === 0,
    canUnskip: skipped,
  };
}

export const entryViews = (entries) => entries.map(entryView);