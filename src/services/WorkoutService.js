import { OCCURRENCE_STATUS, SESSION_STATUS } from '../models/constants.js';
import { addDays, nowIso, toLocalDate } from '../models/common.js';
import { createWorkoutSession } from '../models/workout.js';
import { EXERCISE_LIBRARY, getExerciseById, listExercises } from '../lib/exerciseLibrary.js';
import { dailySeries, monthRange, plannedWorkouts, sessionDate, weekEnd, weekStart, weeklyStats } from '../lib/fitness.js';
import { isAbandonedSession, isOpenSession, pauseSessionPatch, planEntries, resumeSessionPatch } from '../lib/session.js';

export class WorkoutService {
  constructor({ workouts, exerciseHistory, schedules, occurrences }) {
    this.workouts = workouts; this.history = exerciseHistory;
    this.schedules = schedules; this.occurrences = occurrences;
  }

  create(input) { return this.workouts.create(input); }
  update(id, changes, opts) { return this.workouts.update(id, changes, opts); }
  remove(id) { return this.workouts.remove(id); }
  list({ category } = {}) { return this.workouts.list({ where: category ? { category } : undefined, orderBy: 'name' }); }

  /** Deletes ALL workouts and ALL workout history / sessions. */
  async removeAll() {
    const [allWorkouts, allSessions] = await Promise.all([
      this.workouts.list(),
      this.history.list(),
    ]);
    await Promise.all([
      ...allSessions.map((s) => this.history.remove(s.id)),
      ...allWorkouts.map((w) => this.workouts.remove(w.id)),
    ]);
    return { workouts: allWorkouts.length, sessions: allSessions.length };
  }

  // ---- built-in exercise library (static data, see src/lib/exerciseLibrary.js) ----
  listExercises(filters) { return listExercises(filters); }
  getExercise(id) { return getExerciseById(id); }
  exerciseCount() { return EXERCISE_LIBRARY.length; }

  async startSession(workoutId) {
    const workout = await this.workouts.require(workoutId);
    return this.history.create(createWorkoutSession(workout));
  }

  finishSession(id, { entries, activeSeconds } = {}) {
    return this.history.update(id, {
      status: SESSION_STATUS.COMPLETED, endedAt: nowIso(), pausedAt: null,
      ...(entries && { entries }), ...(activeSeconds != null && { activeSeconds }),
    });
  }

  async findTodayOccurrence(workout, { today = toLocalDate() } = {}) {
    if (!workout || !this.schedules || !this.occurrences) return null;
    let scheduleId = workout.scheduleId ?? null;
    if (scheduleId) {
      const sched = await this.schedules.get(scheduleId);
      if (!sched || sched.deleted) return null;
    } else {
      const [schedules, workouts] = await Promise.all([
        this.schedules.list({ where: { linkedWorkoutId: workout.id } }),
        this.workouts.list(),
      ]);
      const match = schedules.find((s) => !workouts.some((w) => w.id !== workout.id && w.scheduleId === s.id));
      scheduleId = match?.id ?? null;
    }
    if (!scheduleId) return null;
    const occs = await this.occurrences.list({
      where: { scheduleId },
      predicate: (o) => o.date === today && o.status === OCCURRENCE_STATUS.SCHEDULED,
    });
    return occs.sort((a, b) => (a.startTime ?? '').localeCompare(b.startTime ?? ''))[0] ?? null;
  }

  async resolveSessionOccurrence(session, { today = toLocalDate() } = {}) {
    if (!session || !this.occurrences) return null;
    if (session.occurrenceId) {
      const occ = await this.occurrences.get(session.occurrenceId);
      return occ && !occ.deleted && occ.status === OCCURRENCE_STATUS.SCHEDULED ? occ.id : null;
    }
    if (!session.workoutId || !this.workouts) return null;
    const workout = await this.workouts.get(session.workoutId);
    if (!workout || workout.deleted) return null;
    const occ = await this.findTodayOccurrence(workout, { today });
    return occ?.id ?? null;
  }

  async findOpenSession(workoutId, { now = Date.now() } = {}) {
    const rows = await this.history.list({ predicate: (s) => isOpenSession(s, workoutId, now) });
    return rows.sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0] ?? null;
  }

  async listAbandonedSessions({ now = Date.now() } = {}) {
    const rows = await this.history.list({ predicate: (s) => isAbandonedSession(s, now) });
    return rows.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }

  async openSession(workoutId, { now, today = toLocalDate(), occurrenceId = null } = {}) {
    const open = await this.findOpenSession(workoutId, { now });
    if (open) return open;
    const workout = await this.workouts.require(workoutId);
    const occ = occurrenceId ? { id: occurrenceId, scheduleId: workout.scheduleId ?? null } : await this.findTodayOccurrence(workout, { today });
    return this.history.create(createWorkoutSession(workout, {
      scheduleId: workout.scheduleId ?? occ?.scheduleId ?? null,
      occurrenceId: occ?.id ?? null,
      entries: planEntries(workout),
    }));
  }

  getSession(id) { return this.history.require(id); }
  saveSessionEntries(id, entries) { return this.history.update(id, { entries }); }

  async pauseSession(id, { now = nowIso() } = {}) {
    const session = await this.history.require(id);
    const patch = pauseSessionPatch(session, now);
    return patch ? this.history.update(id, patch) : session;
  }

  async resumeSession(id, { now = nowIso() } = {}) {
    const session = await this.history.require(id);
    const patch = resumeSessionPatch(session, now);
    return patch ? this.history.update(id, patch) : session;
  }

  discardSession(id) { return this.history.remove(id); }

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

  async plan({ from, to } = {}) {
    const [workouts, schedules, occurrences] = await Promise.all([
      this.workouts.list(),
      this.schedules.list(),
      this.occurrences.list({ predicate: (o) => (!from || o.date >= from) && (!to || o.date <= to) }),
    ]);
    return plannedWorkouts({ workouts, schedules, occurrences });
  }

  today({ today = toLocalDate() } = {}) { return this.plan({ from: today, to: today }); }
  upcoming({ today = toLocalDate(), days = 7 } = {}) { return this.plan({ from: addDays(today, 1), to: addDays(today, days) }); }

  async summary({ today = toLocalDate() } = {}) {
    const [sessions, planned] = await Promise.all([
      this.listHistory(),
      this.plan({ from: weekStart(today), to: weekEnd(today) }),
    ]);
    return { ...weeklyStats({ sessions, planned: planned.length, today }), planned };
  }

  async progress({ today = toLocalDate(), range = 'week' } = {}) {
    const { from, to } = range === 'month' ? monthRange(today) : { from: weekStart(today), to: weekEnd(today) };
    const sessions = await this.listHistory();
    return { range, from, to, points: dailySeries(sessions, from, to) };
  }
}