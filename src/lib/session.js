// src/lib/session.js
// Phase 9 PACE 4a — pure logic of the workout session screen (no React, no storage): the plan snapshot a session
// starts with, logging / undoing / skipping sets, progress, what "Finish" saves, and the texts of the screen.
// pages/WorkoutSession.jsx only renders what this returns; scripts/check-session.mjs tests it.
//
// A session lives in `exerciseHistory` (src/models/workout.js `createWorkoutSession`). Its `entries` are one per exercise:
//   { exerciseId, name, status: 'pending'|'completed'|'skipped', sets: [{ reps, durationSec }], plan }
// `plan` = { sets, reps, durationSec, restSec } is a SNAPSHOT of the workout item taken when the session starts, so the
// screen keeps working (and the history stays truthful) if the workout is edited or deleted meanwhile. `sets` holds only
// the sets the user logged; a logged set records the planned reps / seconds (there is no per-set editing yet).
//
// Every function returns NEW data; an impossible action returns the SAME array it was given (callers can compare).
import { ENTRY_STATUS, SESSION_STATUS } from '../models/constants.js';
import { getExerciseById } from './exerciseLibrary.js';
import { restLabel, setsLabel } from './fitness.js';

const { PENDING, COMPLETED, SKIPPED } = ENTRY_STATUS;
const OPEN_STATUSES = [SESSION_STATUS.IN_PROGRESS, SESSION_STATUS.PAUSED];

/**
 * PACE 4a has no timer yet (PACE 4b adds the real active-time counter), so active time is ESTIMATED as the time since the
 * session started, never more than this. The same limit decides whether an unfinished session can still be continued:
 * an older one is treated as abandoned (left alone, not reused). PACE 4b replaces both with the real counter.
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

/** True when `session` is an unfinished session of `workoutId` that was started within SESSION_WINDOW_SECONDS. */
export function isOpenSession(session, workoutId, nowMs = Date.now()) {
  if (!session || session.deleted || session.workoutId !== workoutId || !OPEN_STATUSES.includes(session.status)) return false;
  const start = toMs(session.startedAt);
  return start != null && nowMs - start <= SESSION_WINDOW_SECONDS * 1000;
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