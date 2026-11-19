// scripts/check-session.mjs — Phase 9 PACE 4a: the pure session logic (src/lib/session.js) and the new WorkoutService
// session methods (openSession / findOpenSession / getSession / saveSessionEntries / finishSession / discardSession),
// the latter against tiny in-memory stand-in repositories (the real Repository is covered by its own checks).
// Runs in plain Node: it imports no browser-only module.
import { ENTRY_STATUS, SESSION_STATUS } from '../src/models/constants.js';
import { createWorkout, createWorkoutItem } from '../src/models/workout.js';
import {
  SESSION_WINDOW_SECONDS, discardMessage, elapsedSeconds, entryView, entryViews, finalizeEntries, finishMessage, isOpenSession,
  logSet, planEntries, progressText, sessionProgress, skipEntry, undoSet, unskipEntry,
} from '../src/lib/session.js';
import { WorkoutService } from '../src/services/WorkoutService.js';

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

// ---- elapsed / open ----
const T0 = Date.parse('2026-11-19T08:00:00.000Z');
check('elapsedSeconds: simple', elapsedSeconds('2026-11-19T08:00:00.000Z', T0 + 45 * 60 * 1000) === 2700);
check('elapsedSeconds: capped at the window', elapsedSeconds('2026-11-19T08:00:00.000Z', T0 + 10 * 3600 * 1000) === SESSION_WINDOW_SECONDS);
check('elapsedSeconds: never negative', elapsedSeconds('2026-11-19T08:00:00.000Z', T0 - 5000) === 0);
check('elapsedSeconds: invalid start gives 0', elapsedSeconds('nope', T0) === 0 && elapsedSeconds(undefined, T0) === 0);
const open = { workoutId: 'w1', status: SESSION_STATUS.IN_PROGRESS, startedAt: '2026-11-19T08:00:00.000Z', deleted: false };
check('isOpenSession: in progress, recent', isOpenSession(open, 'w1', T0 + 60 * 1000));
check('isOpenSession: paused counts as open', isOpenSession({ ...open, status: SESSION_STATUS.PAUSED }, 'w1', T0 + 60 * 1000));
check('isOpenSession: exactly at the window', isOpenSession(open, 'w1', T0 + SESSION_WINDOW_SECONDS * 1000));
check('isOpenSession: older than the window is abandoned', !isOpenSession(open, 'w1', T0 + SESSION_WINDOW_SECONDS * 1000 + 1));
check('isOpenSession: completed is not open', !isOpenSession({ ...open, status: SESSION_STATUS.COMPLETED }, 'w1', T0 + 1000));
check('isOpenSession: another workout', !isOpenSession(open, 'w2', T0 + 1000));
check('isOpenSession: deleted, invalid start, null', !isOpenSession({ ...open, deleted: true }, 'w1', T0) && !isOpenSession({ ...open, startedAt: 'x' }, 'w1', T0) && !isOpenSession(null, 'w1', T0));

// ---- WorkoutService session methods (stand-in repositories) ----
function fakeRepo() {
  const rows = new Map();
  let n = 0;
  return {
    rows,
    async create(record) { const r = { ...record, id: record.id ?? `r${(n += 1)}` }; rows.set(r.id, r); return r; },
    async require(id) {
      const r = rows.get(id);
      if (!r || r.deleted) throw new Error(`not found: ${id}`);
      return r;
    },
    async update(id, changes) {
      const r = await this.require(id);
      const next = { ...r, ...changes, version: r.version + 1 };
      rows.set(id, next);
      return next;
    },
    async remove(id) { const r = await this.require(id); rows.set(id, { ...r, deleted: true }); return true; },
    async list({ predicate } = {}) { return [...rows.values()].filter((r) => !r.deleted && (!predicate || predicate(r))); },
  };
}
async function makeService() {
  const workoutsRepo = fakeRepo();
  const historyRepo = fakeRepo();
  await workoutsRepo.create(workout);
  return { historyRepo, service: new WorkoutService({ workouts: workoutsRepo, exerciseHistory: historyRepo, schedules: fakeRepo(), occurrences: fakeRepo() }) };
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

  const finished = await service.finishSession(s1.id, { entries: finalizeEntries((await service.getSession(s1.id)).entries), activeSeconds: 600 });
  check('finishSession: completed with the entries and active time', finished.status === SESSION_STATUS.COMPLETED && finished.activeSeconds === 600 && finished.entries.every((x) => x.status !== PENDING) && Boolean(finished.endedAt));
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

{
  const { service, historyRepo } = await makeService();
  const first = await service.openSession('w1');
  const later = Date.now() + SESSION_WINDOW_SECONDS * 1000 + 60000;
  check('findOpenSession: an abandoned session (older than the window) is not offered', (await service.findOpenSession('w1', { now: later })) === null);
  const second = await service.openSession('w1', { now: later });
  check('openSession: after the window a new session starts', second.id !== first.id && historyRepo.rows.size === 2);
  check('openSession: the abandoned session is left alone, not deleted', historyRepo.rows.get(first.id)?.status === SESSION_STATUS.IN_PROGRESS);

  let missing = false;
  try { await service.openSession('nope'); } catch { missing = true; }
  check('openSession: an unknown workout rejects and creates nothing', missing && historyRepo.rows.size === 2);
}

if (failures.length > 0) {
  console.error(`Phase 9 PACE 4a session: ${failures.length} of ${count} checks FAILED:`);
  failures.forEach((f) => console.error(`  ✗ ${f}`));
  process.exit(1);
}
console.log(`Phase 9 PACE 4a session OK (${count} checks)`);