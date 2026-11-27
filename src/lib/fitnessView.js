// src/lib/fitnessView.js
// Phase 9 PACE 2 + 5 — pure view logic for the Fitness screen (no UI, no storage): the texts of the four KPI cards,
// the weekly/monthly chart model, the "Today's workout" blocks, and the recent workout history rows. src/pages/Fitness.jsx
// only renders what these return; scripts/check-fitness-view.mjs tests them.
//
// Honesty rules (same as src/lib/fitness.js): nothing is invented. No planned workouts -> no goal text; no previous
// week -> no percentage; no workout yet -> no best day. Status is always a word, never colour alone.
import { ENTRY_STATUS, OCCURRENCE_STATUS, SESSION_STATUS } from '../models/constants.js';
import { getExerciseById } from './exerciseLibrary.js';
import { durationLabel, restLabel, sessionDate, setsLabel, weekdayName } from './fitness.js';

/** The design shows the first 3 exercises of a workout; the rest is summarised as "+N more". */
export const PREVIEW_ROWS = 3;
export const HISTORY_LIMIT = 10;
const PLACEHOLDER = '–';
const SHORT_MONTHS = Object.freeze(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']);

const toMinutes = (time) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(time ?? ''));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

const shortMonthDay = (date) => {
  const [, m, d] = String(date ?? '').split('-').map(Number);
  return m >= 1 && m <= 12 && d >= 1 ? `${SHORT_MONTHS[m - 1]} ${d}` : String(date ?? '');
};

const shortHistoryDate = (date) => {
  if (!date) return '';
  const [y, m, d] = date.split('-').map(Number);
  if (!y || !m || !d) return '';
  return `${weekdayName(date).slice(0, 3)}, ${SHORT_MONTHS[m - 1]} ${d}`;
};

/** Minutes between two 'HH:mm' times, or null when either is invalid or the end is not after the start. */
export function plannedMinutes(startTime, endTime) {
  const a = toMinutes(startTime);
  const b = toMinutes(endTime);
  return a != null && b != null && b > a ? b - a : null;
}

// ---- KPI row ("This week") ----
const KPI_SLOTS = Object.freeze([
  { key: 'workouts', variant: 'fit', label: 'Workouts' },
  { key: 'activeTime', variant: 'fit', label: 'Active time' },
  { key: 'streak', variant: 'map', label: 'Day streak' },
  { key: 'bestDay', variant: 'fit', label: 'Best day' },
]);

/** The four KPI cards for a weeklyStats() summary. `null` (still loading) gives placeholders, never fake zeros. */
export function kpiCards(summary) {
  if (!summary) return KPI_SLOTS.map((slot) => ({ ...slot, value: PLACEHOLDER, subtitle: '' }));
  const change = summary.changePct;
  const text = {
    workouts: [
      String(summary.workouts),
      summary.goal != null ? `Goal: ${summary.goal}` : 'Nothing planned this week',
    ],
    activeTime: [
      durationLabel(summary.activeSeconds),
      change == null ? 'Nothing logged last week' : `${change > 0 ? '+' : ''}${change}% vs last week`,
    ],
    streak: [
      String(summary.streak),
      summary.isPersonalBest ? 'Personal best' : summary.bestStreak > 0 ? `Best: ${summary.bestStreak}` : 'No streak yet',
    ],
    bestDay: [
      summary.bestDay ? durationLabel(summary.bestDay.seconds) : PLACEHOLDER,
      summary.bestDay ? summary.bestDay.weekday : 'No workouts yet',
    ],
  };
  return KPI_SLOTS.map((slot) => ({ ...slot, value: text[slot.key][0], subtitle: text[slot.key][1] }));
}

// ---- weekly / monthly chart ----
/** Data for the line chart + the text a screen reader gets (DESIGN_LOCK: aria-labels on charts). */
export function chartModel(progress) {
  const points = progress?.points ?? [];
  const isMonth = progress?.range === 'month';
  const labels = isMonth
    ? points.map((p) => String(Number(p.date.slice(8, 10))))
    : points.map((p) => weekdayName(p.date).slice(0, 3));
  const totalMinutes = points.reduce((t, p) => t + (Number(p.minutes) || 0), 0);
  let description = 'No exercise data yet.';
  if (points.length > 0) {
    description = isMonth
      ? `Exercise minutes per day this month: ${points.map((p) => `${shortMonthDay(p.date)} ${p.minutes}`).join(', ')}.`
      : `Exercise minutes per day this week: ${points.map((p, i) => `${labels[i]} ${p.minutes}`).join(', ')}.`;
  }
  return {
    labels,
    data: points.map((p) => ({ value: p.minutes })),
    totalMinutes,
    description,
  };
}

// ---- Today's workout ----
/** The planned workouts (from WorkoutService.plan/summary) that fall on `date`. */
export const plannedOn = (planned, date) => (planned ?? []).filter((p) => p.date === date);

/** The category chip that is active until the user picks another: the category of the first workout today. */
export const defaultCategory = (todayPlan) => todayPlan[0]?.workout?.category ?? null;

/** Today's workouts in the chosen category (all of them when no category is chosen). */
export const forCategory = (todayPlan, category) => (category ? todayPlan.filter((p) => p.workout?.category === category) : todayPlan);

const STATUS_WORD = Object.freeze({ [OCCURRENCE_STATUS.DONE]: 'Done', [OCCURRENCE_STATUS.SKIPPED]: 'Skipped' });

/**
 * One workout card body: name, "5 exercises · about 45 min · 12:30 PM", the first rows ("3×12" / "Push-ups" / "Rest 60 s")
 * and how many exercises are not shown. The planned time comes from the schedule occurrence, not from guessing.
 * `formatTime` turns 'HH:mm' into the label to show (the screen passes to12h).
 */
export function workoutBlock(planned, formatTime = (t) => t) {
  const items = planned.workout?.items ?? [];
  const minutes = plannedMinutes(planned.startTime, planned.endTime);
  const parts = [`${items.length} ${items.length === 1 ? 'exercise' : 'exercises'}`];
  if (minutes != null) parts.push(`about ${durationLabel(minutes * 60)}`);
  if (planned.startTime) parts.push(formatTime(planned.startTime));
  if (STATUS_WORD[planned.status]) parts.push(STATUS_WORD[planned.status]);
  return {
    key: planned.occurrenceId,
    name: planned.workout?.name || 'Workout',
    category: planned.workout?.category ?? null,
    meta: parts.join(' · '),
    rows: items.slice(0, PREVIEW_ROWS).map((item, i) => ({
      key: `${i}-${item.exerciseId ?? 'custom'}`,
      sets: setsLabel(item),
      name: item.name || getExerciseById(item.exerciseId)?.name || 'Exercise',
      rest: restLabel(item.restSec),
    })),
    more: Math.max(0, items.length - PREVIEW_ROWS),
  };
}

// ---- Recent workouts (completed session history) ----
/** Completed workout sessions formatted for the "Recent workouts" list (newest first). */
export function historyRows(sessions, limit = HISTORY_LIMIT) {
  const done = (sessions ?? [])
    .filter((s) => s?.status === SESSION_STATUS.COMPLETED)
    .sort((a, b) => String(b.startedAt ?? '').localeCompare(String(a.startedAt ?? '')));
  const slice = limit != null ? done.slice(0, limit) : done;
  return slice.map((s) => {
    const entries = Array.isArray(s.entries) ? s.entries : [];
    const setsDone = entries.reduce((sum, e) => sum + (Array.isArray(e?.sets) ? e.sets.length : 0), 0);
    const exercisesDone = entries.filter((e) => e?.status === ENTRY_STATUS.COMPLETED || (Array.isArray(e?.sets) && e.sets.length > 0)).length;
    const datePart = shortHistoryDate(sessionDate(s));
    const setsPart = setsDone > 0 ? `${setsDone} ${setsDone === 1 ? 'set' : 'sets'}` : null;
    const exPart = exercisesDone > 0 ? `${exercisesDone} ${exercisesDone === 1 ? 'exercise' : 'exercises'}` : null;
    return {
      id: s.id,
      title: s.workoutName || 'Workout',
      duration: durationLabel(s.activeSeconds),
      subtitle: [datePart, s.category || null, setsPart, exPart].filter(Boolean).join(' · '),
    };
  });
}