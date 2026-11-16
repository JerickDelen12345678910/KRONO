import { SESSION_STATUS } from '../models/constants.js';
import { nowIso } from '../models/common.js';
import { createWorkoutSession } from '../models/workout.js';

export class WorkoutService {
  constructor({ workouts, exerciseHistory }) { this.workouts = workouts; this.history = exerciseHistory; }

  create(input) { return this.workouts.create(input); }
  update(id, changes, opts) { return this.workouts.update(id, changes, opts); }
  remove(id) { return this.workouts.remove(id); }
  list({ category } = {}) { return this.workouts.list({ where: category ? { category } : undefined, orderBy: 'name' }); }

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

  /** Newest first. listHistory({ from, to }) uses ISO date strings (YYYY-MM-DD) on startedAt. */
  async listHistory({ from, to } = {}) {
    const rows = await this.history.list({
      where: { status: SESSION_STATUS.COMPLETED },
      predicate: (s) => (!from || s.startedAt.slice(0, 10) >= from) && (!to || s.startedAt.slice(0, 10) <= to),
    });
    return rows.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }
}
