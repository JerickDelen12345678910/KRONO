import { SESSION_STATUS } from '../models/constants.js';
import { addDays, nowIso, toLocalDate } from '../models/common.js';
import { createWorkoutSession } from '../models/workout.js';
import { EXERCISE_LIBRARY, getExerciseById, listExercises } from '../lib/exerciseLibrary.js';
import { dailySeries, monthRange, plannedWorkouts, sessionDate, weekEnd, weekStart, weeklyStats } from '../lib/fitness.js';

export class WorkoutService {
  constructor({ workouts, exerciseHistory, schedules, occurrences }) {
    this.workouts = workouts; this.history = exerciseHistory;
    this.schedules = schedules; this.occurrences = occurrences;   // read-only here: the calendar that plans the user's workouts
  }

  create(input) { return this.workouts.create(input); }
  update(id, changes, opts) { return this.workouts.update(id, changes, opts); }
  remove(id) { return this.workouts.remove(id); }
  list({ category } = {}) { return this.workouts.list({ where: category ? { category } : undefined, orderBy: 'name' }); }

  // ---- built-in exercise library (static data, see src/lib/exerciseLibrary.js) ----
  /** listExercises({ category, difficulty, query }) — all optional. */
  listExercises(filters) { return listExercises(filters); }
  getExercise(id) { return getExerciseById(id); }
  exerciseCount() { return EXERCISE_LIBRARY.length; }

  async startSession(workoutId) {
    const workout = await this.workouts.require(workoutId);
    return this.history.create(createWorkoutSession(workout));
  }

  /** finishSession(id, { entries, activeSeconds }) — saves the finished session to history. */
  finishSession(id, { entries, activeSeconds } = {}) {
    return this.history.update(id, {
      status: SESSION_STATUS.COMPLETED, endedAt: nowIso(),
      ...(entries && { entries }), ...(activeSeconds != null && { activeSeconds }),
    });
  }

  /** Newest first. listHistory({ from, to }) uses 'YYYY-MM-DD' LOCAL dates (the user's clock) on startedAt. */
  async listHistory({ from, to } = {}) {
    const rows = await this.history.list({
      where: { status: SESSION_STATUS.COMPLETED },
      predicate: (s) => {
        const day = sessionDate(s);
        return Boolean(day) && (!from || day >= from) && (!to || day <= to);
      },
    });
    return rows.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }

  // ---- the user's program: workouts planned on the calendar ----
  /** plan({ from, to }) — planned workout sessions (occurrences of schedules linked to a workout), soonest first. */
  async plan({ from, to } = {}) {
    const [workouts, schedules, occurrences] = await Promise.all([
      this.workouts.list(),
      this.schedules.list(),
      this.occurrences.list({ predicate: (o) => (!from || o.date >= from) && (!to || o.date <= to) }),
    ]);
    return plannedWorkouts({ workouts, schedules, occurrences });
  }

  /** Today's planned workouts. `today` is injectable for tests. */
  today({ today = toLocalDate() } = {}) { return this.plan({ from: today, to: today }); }

  /** Planned workouts from tomorrow through `days` days ahead. */
  upcoming({ today = toLocalDate(), days = 7 } = {}) { return this.plan({ from: addDays(today, 1), to: addDays(today, days) }); }

  /** The Fitness KPI row (see weeklyStats) plus this week's planned workouts. */
  async summary({ today = toLocalDate() } = {}) {
    const [sessions, planned] = await Promise.all([
      this.listHistory(),
      this.plan({ from: weekStart(today), to: weekEnd(today) }),
    ]);
    return { ...weeklyStats({ sessions, planned: planned.length, today }), planned };
  }

  /** Line-chart data: range 'week' = each day Monday..Sunday, 'month' = each day of the calendar month. */
  async progress({ today = toLocalDate(), range = 'week' } = {}) {
    const { from, to } = range === 'month' ? monthRange(today) : { from: weekStart(today), to: weekEnd(today) };
    const sessions = await this.listHistory();
    return { range, from, to, points: dailySeries(sessions, from, to) };
  }
}