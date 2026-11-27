// scripts/check-session.mjs — Phase 9 PACE 4a–4c: the pure session logic (src/lib/session.js) and the WorkoutService
// session methods (openSession / findOpenSession / listAbandonedSessions / getSession / saveSessionEntries / pauseSession /
// resumeSession / finishSession / discardSession / findTodayOccurrence / resolveSessionOccurrence), the latter against
// tiny in-memory stand-in repositories. Runs in plain Node: it imports no browser-only module.
import { ENTRY_STATUS, OCCURRENCE_STATUS, SESSION_STATUS } from '../src/models/constants.js';
import { createWorkout, createWorkoutItem, createWorkoutSession } from '../src/models/workout.js';
import {
  SESSION_WINDOW_SECONDS, activeSessionSeconds, discardMessage, elapsedSeconds, entryView, entryViews, finalizeEntries,
  finishMessage, formatClock, isAbandonedSession, isOpenSession, logSet, pauseSessionPatch, planEntries, progressText,
  restForLoggedSet, resumeSessionPatch, sessionProgress, skipEntry, tickRestTimer, undoSet, unskipEntry,
} from '../src/lib/session.js';
import { WorkoutService } from '../src/services/WorkoutService.js';
import { ScheduleService } from '../src/services/ScheduleService.js';

let count = 0;
const failures = [];
function check(name, ok) {
  count += 1;
  if (!ok) failures.push(name);
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const { PENDING, COMPLETED, SKIPPED } = ENTRY_STATUS;

const deepFreeze = (o) => {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); Object.values(o).forEach(deepFreeze); }
  return o;
};

// ---- fixtures ----
const workout = createWorkout({
  id: 'w1', name: 'Upper body', category: 'Strength',
  items: [
    createWorkoutItem({ exerciseId: null, name: 'Push-ups', sets: 3, reps: 12, restSec: 60 }),
    createWorkoutItem({ exerciseId: null, name: 'Plank', sets: 2, reps: null, durationSec: 45, restSec: 30 }),
    createWorkoutItem({ exerciseId: null, name: '', sets: 1, reps: 1, restSec: 0 }),
  ],
});

// ---- planEntries ----
const planned = planEntries(workout);
check('planEntries: one entry per item', planned.length === 3);
check('planEntries: pending with no sets', planned.every((e) => e.status === PENDING && Array.isArray(e.sets) && e.sets.length === 0));
check('planEntries: plan snapshot (reps)', same(planned[0].plan, { sets: 3, reps: 12, durationSec: null, restSec: 60 }));
check('planEntries: plan snapshot (seconds)', same(planned[1].plan, { sets: 2, reps: null, durationSec: 45, restSec: 30 }));
check('planEntries: name kept', planned[0].name === 'Push-ups');
check('planEntries: a nameless custom item still gets a name', planned[2].name.length > 0);
check('planEntries: exerciseId null kept', planned[0].exerciseId === null);
check('planEntries: workout without items', same(planEntries({ items: undefined }), []));

// ---- logSet ----
let e;
const logged1 = logSet(deepFreeze(planned), 0);
check('logSet: returns a new array', logged1 !== planned && planned[0].sets.length === 0);
check('logSet: one set logged with the planned reps', same(logged1[0].sets, [{ reps: 12, durationSec: null }]) && logged1[0].status === PENDING);
check('logSet: other entries untouched', logged1[1] === planned[1] && logged1[2] === planned[2]);
e = logSet(logSet(logged1, 0), 0);
check('logSet: the last planned set completes the exercise', e[0].sets.length === 3 && e[0].status === COMPLETED);
check('logSet: no more than planned (same array back)', logSet(e, 0) === e);
check('logSet: seconds are recorded for a timed exercise', same(logSet(planned, 1)[1].sets, [{ reps: null, durationSec: 45 }]));
check('logSet: a bad index changes nothing', logSet(planned, 9) === planned && logSet(planned, -1) === planned);
check('logSet: a one-set exercise completes at once', logSet(planned, 2)[2].status === COMPLETED);

// ---- undoSet ----
const undone = undoSet(e, 0);
check('undoSet: removes the last set', undone[0].sets.length === 2);
check('undoSet: a completed exercise is pending again', undone[0].status === PENDING);
check('undoSet: nothing logged = same array', undoSet(planned, 0) === planned);
check('undoSet: bad index = same array', undoSet(planned, 7) === planned);
check('log then undo restores the entry', same(undoSet(logSet(planned, 0), 0)[0], planned[0]));

// ---- skip / unskip ----
const skipped = skipEntry(planned, 1);
check('skipEntry: status skipped', skipped[1].status === SKIPPED && skipped[1].sets.length === 0);
check('skipEntry: others untouched', skipped[0] === planned[0]);
check('skipEntry: not after a set was logged (no lost work)', skipEntry(logged1, 0) === logged1);
check('skipEntry: not twice', skipEntry(skipped, 1) === skipped);
check('skipEntry: not a completed exercise', skipEntry(e, 0) === e);
check('logSet: a skipped exercise cannot be logged', logSet(skipped, 1) === skipped);
check('unskipEntry: back to pending', unskipEntry(skipped, 1)[1].status === PENDING);
check('unskipEntry: only a skipped one', unskipEntry(planned, 1) === planned);

// ---- progress ----
const p0 = sessionProgress(planned);
check('progress: nothing logged', p0.setsDone === 0 && p0.setsPlanned === 6 && p0.exercisesDone === 0 && p0.exercisesTotal === 3 && !p0.canFinish);
check('progress: notFinished counts pending exercises', p0.notFinished === 3);
const p1 = sessionProgress(logSet(planned, 2));
check('progress: a logged set allows Finish', p1.canFinish && p1.setsDone === 1 && p1.exercisesDone === 1 && p1.notFinished === 2);
const pSkip = sessionProgress(skipEntry(planned, 1));
check('progress: skipped exercises leave the planned totals', pSkip.setsPlanned === 4 && pSkip.exercisesTotal === 2 && pSkip.skipped === 1);
check('progress: skipping alone does not allow Finish', !pSkip.canFinish);
check('progressText: normal', progressText(p0) === '0 of 6 sets · 0 of 3 exercises done');
check('progressText: with a skipped exercise', progressText(pSkip) === '0 of 4 sets · 0 of 2 exercises done · 1 skipped');
check('progressText: everything skipped', progressText(sessionProgress(skipEntry(skipEntry(skipEntry(planned, 0), 1), 2))) === 'Every exercise is skipped.');
check('progressText: empty workout', progressText(sessionProgress([])) === 'No exercises in this workout.');

// ---- rest timer ----
const r0 = restForLoggedSet(planned, logged1, 0);
check('restForLoggedSet: starts with plan restSec after a logged set', same(r0, { exerciseName: 'Push-ups', durationSec: 60, remainingSec: 60 }));
check('restForLoggedSet: starts even after the last set of an exercise if other exercises remain', restForLoggedSet(logSet(logged1, 0), e, 0)?.remainingSec === 60);
check('restForLoggedSet: null when restSec is 0', restForLoggedSet(planned, logSet(planned, 2), 2) === null);
check('restForLoggedSet: null when nothing changed or on undo', restForLoggedSet(planned, planned, 0) === null && restForLoggedSet(logged1, planned, 0) === null);
const almostDone = skipEntry(e, 1); // entry 0 done, entry 1 skipped, entry 2 (1 set) pending
check('restForLoggedSet: null when the very last set of the workout is logged', restForLoggedSet(almostDone, logSet(almostDone, 2), 2) === null);
check('tickRestTimer: counts down by 1s', tickRestTimer(r0, 1)?.remainingSec === 59);
check('tickRestTimer: returns null at 0', tickRestTimer({ exerciseName: 'Push-ups', durationSec: 60, remainingSec: 1 }, 1) === null);
check('tickRestTimer: null stays null', tickRestTimer(null, 1) === null);

// ---- finalize / messages ----
const mid = logSet(logSet(planned, 0), 0);            // Push-ups 2 of 3, others untouched
const fin = finalizeEntries(deepFreeze(mid));
check('finalize: partly done exercise keeps its sets and becomes completed', fin[0].status === COMPLETED && fin[0].sets.length === 2);
check('finalize: untouched exercise becomes skipped', fin[1].status === SKIPPED && fin[1].sets.length === 0);
check('finalize: nothing is pending afterwards', fin.every((x) => x.status !== PENDING));
check('finalize: input not mutated', mid[0].status === PENDING);
check('finalize: skipped and completed stay as they are', finalizeEntries(skipped)[1].status === SKIPPED && finalizeEntries(e)[0].status === COMPLETED);
check('finishMessage: nothing to confirm when all are completed or skipped', finishMessage(finalizeEntries(mid)) === '');
check('finishMessage: names the number (plural)', finishMessage(mid).startsWith('Finish this workout with 3 exercises not completed?'));
check('finishMessage: singular', finishMessage(finalizeEntries(mid).map((x, i) => (i === 2 ? { ...x, status: PENDING } : x))).includes('with 1 exercise not completed?'));
check('discardMessage: names the workout', discardMessage('Upper body').includes('“Upper body”') && discardMessage('').includes('this workout'));

// ---- entryView ----
const v0 = entryView(planned[0], 0);
check('entryView: title is numbered', v0.title === '1. Push-ups');
check('entryView: one row per planned set', v0.rows.length === 3 && v0.rows[0].set === 'Set 1' && v0.rows[0].amount === '12 reps' && v0.rows[0].state === 'To do');
check('entryView: seconds amount', entryView(planned[1], 1).rows[0].amount === '45 s');
check('entryView: a single rep is singular', entryView(planned[2], 2).rows[0].amount === '1 rep');
check('entryView: badge Not started', v0.badge === 'Not started');
check('entryView: target text for a planned entry', typeof v0.target === 'string' && v0.target.length > 0);
check('entryView: log label counts up', v0.logLabel === 'Log set 1 of 3' && entryView(logSet(planned, 0)[0], 0).logLabel === 'Log set 2 of 3');
check('entryView: buttons at the start', v0.canLog && !v0.canUndo && v0.canSkip && !v0.canUnskip);
const vMid = entryView(mid[0], 0);
check('entryView: partly done', vMid.badge === '2 of 3 sets' && vMid.rows.filter((r) => r.state === 'Done').length === 2 && vMid.canLog && vMid.canUndo && !vMid.canSkip);
const vDone = entryView(e[0], 0);
check('entryView: completed', vDone.badge === 'Done' && vDone.completed && !vDone.canLog && vDone.canUndo && vDone.logLabel === 'Log set 3 of 3');
const vSkip = entryView(skipped[1], 1);
check('entryView: skipped has no rows and can be undone', vSkip.badge === 'Skipped' && vSkip.skipped && vSkip.rows.length === 0 && vSkip.canUnskip && !vSkip.canLog && !vSkip.canSkip);
check('entryView: keys are unique', new Set(entryViews(planned).map((v) => v.key)).size === 3);
const bare = { exerciseId: 'ex-x', name: 'Old entry', status: PENDING, sets: [] };   // a session made by startSession: no plan
const vBare = entryView(bare, 0);
check('entryView: an entry without a plan still renders (1 set, no target)', vBare.rows.length === 1 && vBare.target === '' && vBare.canLog);
check('entryView: no plan and no name', entryView({ status: PENDING, sets: [] }, 0).title === '1. Exercise');

// ---- elapsed / active time / pause / open / abandoned ----
const T0 = Date.parse('2026-11-19T08:00:00.000Z');
check('elapsedSeconds: simple', elapsedSeconds('2026-11-19T08:00:00.000Z', T0 + 45 * 60 * 1000) === 2700);
check('elapsedSeconds: capped at the window', elapsedSeconds('2026-11-19T08:00:00.000Z', T0 + 10 * 3600 * 1000) === SESSION_WINDOW_SECONDS);
check('elapsedSeconds: never negative', elapsedSeconds('2026-11-19T08:00:00.000Z', T0 - 5000) === 0);
check('elapsedSeconds: invalid start gives 0', elapsedSeconds('nope', T0) === 0 && elapsedSeconds(undefined, T0) === 0);

check('formatClock: mm:ss and h:mm:ss', formatClock(0) === '00:00' && formatClock(65) === '01:05' && formatClock(3661) === '1:01:01');

const baseSession = createWorkoutSession(workout, { startedAt: '2026-11-19T08:00:00.000Z' });
check('createWorkoutSession: defaults pausedAt null and pausedSeconds 0', baseSession.pausedAt === null && baseSession.pausedSeconds === 0);
check('activeSessionSeconds: running session', activeSessionSeconds(baseSession, T0 + 600 * 1000) === 600);
const pPatch = pauseSessionPatch(baseSession, '2026-11-19T08:10:00.000Z');
check('pauseSessionPatch: sets paused and pausedAt', same(pPatch, { status: SESSION_STATUS.PAUSED, pausedAt: '2026-11-19T08:10:00.000Z' }));
const pausedSession = { ...baseSession, ...pPatch };
check('pauseSessionPatch: already paused returns null', pauseSessionPatch(pausedSession, '2026-11-19T08:12:00.000Z') === null);
check('activeSessionSeconds: frozen while paused', activeSessionSeconds(pausedSession, T0 + 900 * 1000) === 600);
const rPatch = resumeSessionPatch(pausedSession, '2026-11-19T08:15:00.000Z');
check('resumeSessionPatch: restores in_progress and accumulates pausedSeconds', same(rPatch, { status: SESSION_STATUS.IN_PROGRESS, pausedAt: null, pausedSeconds: 300 }));
check('resumeSessionPatch: non-paused returns null', resumeSessionPatch(baseSession, '2026-11-19T08:15:00.000Z') === null);
const resumedSession = { ...pausedSession, ...rPatch };
check('activeSessionSeconds: excludes accumulated pause after resume', activeSessionSeconds(resumedSession, T0 + 1200 * 1000) === 900);
check('activeSessionSeconds: completed session returns stored activeSeconds', activeSessionSeconds({ ...resumedSession, status: SESSION_STATUS.COMPLETED, activeSeconds: 888 }, T0 + 5000 * 1000) === 888);

const open = { workoutId: 'w1', status: SESSION_STATUS.IN_PROGRESS, startedAt: '2026-11-19T08:00:00.000Z', deleted: false };
check('isOpenSession: in progress, recent', isOpenSession(open, 'w1', T0 + 60 * 1000));
check('isOpenSession: paused counts as open', isOpenSession({ ...open, status: SESSION_STATUS.PAUSED }, 'w1', T0 + 60 * 1000));
check('isOpenSession: exactly at the window', isOpenSession(open, 'w1', T0 + SESSION_WINDOW_SECONDS * 1000));
check('isOpenSession: older than the window is abandoned', !isOpenSession(open, 'w1', T0 + SESSION_WINDOW_SECONDS * 1000 + 1));
check('isOpenSession: completed is not open', !isOpenSession({ ...open, status: SESSION_STATUS.COMPLETED }, 'w1', T0 + 1000));
check('isOpenSession: another workout', !isOpenSession(open, 'w2', T0 + 1000));
check('isOpenSession: deleted, invalid start, null', !isOpenSession({ ...open, deleted: true }, 'w1', T0) && !isOpenSession({ ...open, startedAt: 'x' }, 'w1', T0) && !isOpenSession(null, 'w1', T0));

check('isAbandonedSession: false within window', !isAbandonedSession(open, T0 + SESSION_WINDOW_SECONDS * 1000));
check('isAbandonedSession: true past window for in_progress or paused', isAbandonedSession(open, T0 + SESSION_WINDOW_SECONDS * 1000 + 1) && isAbandonedSession({ ...open, status: SESSION_STATUS.PAUSED }, T0 + SESSION_WINDOW_SECONDS * 1000 + 1));
check('isAbandonedSession: false when completed or deleted', !isAbandonedSession({ ...open, status: SESSION_STATUS.COMPLETED }, T0 + 99999999) && !isAbandonedSession({ ...open, deleted: true }, T0 + 99999999));

// ---- WorkoutService session methods (stand-in repositories) ----
function fakeRepo() {
  const rows = new Map();
  let n = 0;
  return {
    rows,
    async create(record) { const r = { version: 1, deleted: false, ...record, id: record.id ?? `r${(n += 1)}` }; rows.set(r.id, r); return r; },
    async get(id) {
      const r = rows.get(id);
      return !r || r.deleted ? null : r;
    },
    async require(id) {
      const r = rows.get(id);
      if (!r || r.deleted) throw new Error(`not found: ${id}`);
      return r;
    },
    async update(id, changes) {
      const r = await this.require(id);
      const next = { ...r, ...changes, version: (r.version ?? 1) + 1 };
      rows.set(id, next);
      return next;
    },
    async remove(id) { const r = await this.require(id); rows.set(id, { ...r, deleted: true }); return true; },
    async list({ where, predicate } = {}) {
      return [...rows.values()].filter((r) => !r.deleted
        && (!where || Object.entries(where).every(([k, v]) => r[k] === v))
        && (!predicate || predicate(r)));
    },
  };
}
async function makeService() {
  const workoutsRepo = fakeRepo();
  const historyRepo = fakeRepo();
  const schedulesRepo = fakeRepo();
  const occurrencesRepo = fakeRepo();
  await workoutsRepo.create(workout);
  return {
    workoutsRepo,
    historyRepo,
    schedulesRepo,
    occurrencesRepo,
    service: new WorkoutService({ workouts: workoutsRepo, exerciseHistory: historyRepo, schedules: schedulesRepo, occurrences: occurrencesRepo }),
    scheduleService: new ScheduleService({ schedules: schedulesRepo, occurrences: occurrencesRepo }),
  };
}

{
  const { service, historyRepo } = await makeService();
  const s1 = await service.openSession('w1');
  check('openSession: creates an in-progress session of the workout', s1.status === SESSION_STATUS.IN_PROGRESS && s1.workoutId === 'w1' && s1.workoutName === 'Upper body');
  check('openSession: entries carry the plan', s1.entries.length === 3 && s1.entries[0].plan.reps === 12 && s1.entries[1].plan.durationSec === 45);
  check('openSession: stored in history', historyRepo.rows.size === 1);
  const again = await service.openSession('w1');
  check('openSession: continues the open session instead of starting another', again.id === s1.id && historyRepo.rows.size === 1);
  check('findOpenSession: finds it', (await service.findOpenSession('w1'))?.id === s1.id);
  check('findOpenSession: none for another workout', (await service.findOpenSession('w2')) === null);

  check('getSession: returns the session', (await service.getSession(s1.id)).id === s1.id);
  let noSession = false;
  try { await service.getSession('nope'); } catch { noSession = true; }
  check('getSession: an unknown id rejects', noSession);

  const saved = await service.saveSessionEntries(s1.id, logSet(s1.entries, 0));
  check('saveSessionEntries: stores the entries and nothing else changes', saved.entries[0].sets.length === 1 && saved.status === SESSION_STATUS.IN_PROGRESS && saved.workoutId === 'w1');
  check('saveSessionEntries: survives a reload', (await service.getSession(s1.id)).entries[0].sets.length === 1);
  check('openSession: continuing returns the saved progress', (await service.openSession('w1')).entries[0].sets.length === 1);

  const paused = await service.pauseSession(s1.id, { now: '2026-11-19T08:10:00.000Z' });
  check('pauseSession: persists paused status and pausedAt', paused.status === SESSION_STATUS.PAUSED && paused.pausedAt === '2026-11-19T08:10:00.000Z');
  check('openSession: finds a paused session too', (await service.openSession('w1', { now: T0 + 15 * 60 * 1000 }))?.id === s1.id);
  const resumed = await service.resumeSession(s1.id, { now: '2026-11-19T08:15:00.000Z' });
  check('resumeSession: restores in_progress and stores pausedSeconds', resumed.status === SESSION_STATUS.IN_PROGRESS && resumed.pausedAt === null && resumed.pausedSeconds === 300);

  const finished = await service.finishSession(s1.id, { entries: finalizeEntries((await service.getSession(s1.id)).entries), activeSeconds: 600 });
  check('finishSession: completed with the entries and active time', finished.status === SESSION_STATUS.COMPLETED && finished.activeSeconds === 600 && finished.pausedAt === null && finished.entries.every((x) => x.status !== PENDING) && Boolean(finished.endedAt));
  check('findOpenSession: a finished session is not open', (await service.findOpenSession('w1')) === null);

  const s2 = await service.openSession('w1');
  check('openSession: after finishing, Start begins a new session', s2.id !== s1.id && historyRepo.rows.size === 2);
  check('openSession: the new session starts with nothing logged', s2.entries.every((x) => x.sets.length === 0));
  check('openSession: and is continued again', (await service.openSession('w1')).id === s2.id);

  await service.discardSession(s2.id);
  check('discardSession: the session is gone', (await historyRepo.list({ predicate: (r) => r.id === s2.id })).length === 0);
  check('discardSession: other sessions untouched', historyRepo.rows.get(s1.id)?.status === SESSION_STATUS.COMPLETED);
  check('discardSession: Start begins a fresh session afterwards', (await service.openSession('w1')).id !== s2.id);
}

// ---- Phase 9 PACE 4c: occurrence linking and marking Done on finish ----
{
  const { service, scheduleService, workoutsRepo, schedulesRepo, occurrencesRepo } = await makeService();
  await schedulesRepo.create({ id: 'sched-gym', title: 'Gym', startTime: '12:30', endTime: '13:15', linkedWorkoutId: null });
  await workoutsRepo.create(createWorkout({ id: 'w-sched', name: 'Scheduled push', category: 'Strength', scheduleId: 'sched-gym', items: workout.items }));
  await occurrencesRepo.create({ id: 'sched-gym_2026-11-23', scheduleId: 'sched-gym', date: '2026-11-23', startTime: '12:30', endTime: '13:15', status: OCCURRENCE_STATUS.SCHEDULED, completedAt: null });

  const nonSchedSession = await service.openSession('w-sched', { today: '2026-11-24' });
  check('openSession: non-scheduled day leaves occurrenceId null', nonSchedSession.occurrenceId === null);
  await service.discardSession(nonSchedSession.id);

  const schedSession = await service.openSession('w-sched', { today: '2026-11-23' });
  check('openSession: links today matching scheduled occurrenceId', schedSession.occurrenceId === 'sched-gym_2026-11-23' && schedSession.scheduleId === 'sched-gym');
  const resolved = await service.resolveSessionOccurrence(schedSession, { today: '2026-11-23' });
  check('resolveSessionOccurrence: returns the scheduled occurrence id', resolved === 'sched-gym_2026-11-23');

  const doneOcc = await scheduleService.setOccurrenceStatus(resolved, OCCURRENCE_STATUS.DONE);
  check('setOccurrenceStatus: marks linked occurrence done with completedAt', doneOcc.status === OCCURRENCE_STATUS.DONE && Boolean(doneOcc.completedAt));
  check('resolveSessionOccurrence: returns null once occurrence is already done', (await service.resolveSessionOccurrence(schedSession, { today: '2026-11-23' })) === null);
}

{
  const { service, historyRepo } = await makeService();
  const first = await service.openSession('w1');
  const later = Date.now() + SESSION_WINDOW_SECONDS * 1000 + 60000;
  check('findOpenSession: an abandoned session (older than the window) is not offered', (await service.findOpenSession('w1', { now: later })) === null);
  const abandoned = await service.listAbandonedSessions({ now: later });
  check('listAbandonedSessions: surfaces the abandoned session for Fitness Resume/Discard', abandoned.length === 1 && abandoned[0].id === first.id);
  const second = await service.openSession('w1', { now: later });
  check('openSession: after the window a new session starts', second.id !== first.id && historyRepo.rows.size === 2);
  check('openSession: the abandoned session is left alone until resumed or discarded', historyRepo.rows.get(first.id)?.status === SESSION_STATUS.IN_PROGRESS);

  let missing = false;
  try { await service.openSession('nope'); } catch { missing = true; }
  check('openSession: an unknown workout rejects and creates nothing', missing && historyRepo.rows.size === 2);
}

if (failures.length > 0) {
  console.error(`Phase 9 PACE 4c session: ${failures.length} of ${count} checks FAILED:`);
  failures.forEach((f) => console.error(`  ✗ ${f}`));
  process.exit(1);
}
console.log(`Phase 9 PACE 4c session OK (${count} checks)`);