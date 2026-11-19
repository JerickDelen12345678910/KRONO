// Phase 9 PACE 3b — checks for src/lib/workoutForm.js (pure; runs in plain Node, against the REAL exercise library).
import assert from 'node:assert/strict';
import { EXERCISE_LIBRARY, getExerciseById } from '../src/lib/exerciseLibrary.js';
import { createWorkout, createWorkoutItem, validateWorkout } from '../src/models/workout.js';
import {
  LIMITS, PICKER_LIMIT, addExercise, deleteMessage, draftFromWorkout, draftToInput, draftToNewWorkout, emptyDraft, exerciseCountLabel,
  itemErrors, itemsWithExercise, moveItem, pickerResults, pickerRow, removeItem, updateItem, validateDraft, workoutRow,
} from '../src/lib/workoutForm.js';

let n = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); n += 1; };
const eq = (a, b, msg) => { assert.deepEqual(a, b, msg); n += 1; };

const reps = EXERCISE_LIBRARY.find((e) => e.suggestedReps != null);
const hold = EXERCISE_LIBRARY.find((e) => e.suggestedReps == null && e.suggestedDurationSec != null && e.suggestedDurationSec < 300);
const long = EXERCISE_LIBRARY.find((e) => e.suggestedReps == null && e.suggestedDurationSec >= 300);
ok(reps && hold, 'the library has a reps exercise and a timed exercise');

// ---- emptyDraft ----
let d = emptyDraft();
eq(d, { name: '', category: 'Strength', notes: '', items: [], nextKey: 1 }, 'empty draft');
d = emptyDraft({ exercise: reps });
eq(d.items.length, 1, 'a draft started from an exercise has it');
eq(d.category, reps.category, 'and takes its category');
eq(d.items[0].exerciseId, reps.id, 'item points at the exercise');
eq(d.items[0].mode, 'reps', 'a reps exercise is measured in reps');
eq(d.items[0].reps, String(reps.suggestedReps), 'suggested reps');
eq(emptyDraft({ exercise: null }).items.length, 0, 'null exercise = empty');

// ---- addExercise / keys / timed items ----
d = addExercise(emptyDraft(), hold);
eq(d.items[0].mode, 'time', 'a timed exercise is measured in seconds');
eq(d.items[0].durationSec, String(hold.suggestedDurationSec), 'suggested duration');
if (long) { const l = addExercise(emptyDraft(), long); eq(l.items[0].sets, '1', 'a long timed exercise is one set'); eq(l.items[0].restSec, '0', 'with no rest'); }
d = addExercise(addExercise(emptyDraft(), reps), reps);
eq(d.items.length, 2, 'the same exercise can be added twice');
ok(d.items[0].key !== d.items[1].key, 'with different keys');
const before = JSON.stringify(emptyDraft());
addExercise(emptyDraft(), reps);
eq(JSON.stringify(emptyDraft()), before, 'drafts are never mutated');

// ---- update / remove / move ----
d = emptyDraft();
for (const e of EXERCISE_LIBRARY.slice(0, 3)) d = addExercise(d, e);
const [a, b, c] = d.items.map((i) => i.key);
eq(updateItem(d, b, { sets: '5' }).items.map((i) => i.sets), [d.items[0].sets, '5', d.items[2].sets], 'updateItem changes one item');
eq(removeItem(d, b).items.map((i) => i.key), [a, c], 'removeItem');
eq(moveItem(d, b, -1).items.map((i) => i.key), [b, a, c], 'move up');
eq(moveItem(d, b, 1).items.map((i) => i.key), [a, c, b], 'move down');
ok(moveItem(d, a, -1) === d, 'first item cannot move up (same draft)');
ok(moveItem(d, c, 1) === d, 'last item cannot move down (same draft)');
ok(moveItem(d, 'nope', 1) === d, 'unknown key is ignored');
const keysAfter = addExercise(removeItem(d, c), reps).items.map((i) => i.key);
eq(new Set(keysAfter).size, keysAfter.length, 'keys stay unique after remove + add');

// ---- draftToInput ----
d = emptyDraft({ exercise: reps });
d = { ...d, name: '  Leg day  ', notes: '  slow  ' };
let input = draftToInput(d);
eq([input.name, input.notes, input.category], ['Leg day', 'slow', reps.category], 'trimmed text');
eq(input.items[0].reps, reps.suggestedReps, 'reps is a number');
eq(input.items[0].durationSec, null, 'a reps item has no duration');
ok(!('scheduleId' in input), 'scheduleId is never sent');
input = draftToInput(updateItem(d, d.items[0].key, { mode: 'time', durationSec: '40' }));
eq([input.items[0].reps, input.items[0].durationSec], [null, 40], 'switching to seconds sends the duration only');
input = draftToInput(updateItem(d, d.items[0].key, { sets: '3.5', restSec: '-1', reps: 'abc' }));
eq([input.items[0].sets, input.items[0].restSec, input.items[0].reps], [null, null, null], 'non-whole numbers become null');

// ---- validation ----
let v = validateDraft(emptyDraft());
ok(!v.valid, 'empty draft is invalid');
eq(Object.keys(v.errors).sort(), ['items', 'name'], 'needs a name and an exercise');
eq(v.errors.items, 'Add at least one exercise.', 'asks for an exercise');
d = { ...emptyDraft({ exercise: reps }), name: 'Leg day' };
v = validateDraft(d);
ok(v.valid, 'a named draft with an exercise is valid');
eq(v.itemErrors, {}, 'no item errors');
ok(validateWorkout(draftToInput(d)).valid, 'and the real model agrees');
ok(!validateDraft({ ...d, name: '   ' }).valid, 'a blank name is invalid');
const k = d.items[0].key;
for (const [changes, field] of [
  [{ sets: '0' }, 'sets'], [{ sets: '51' }, 'sets'], [{ sets: '' }, 'sets'], [{ sets: '2.5' }, 'sets'],
  [{ reps: '0' }, 'amount'], [{ reps: '1001' }, 'amount'], [{ reps: '' }, 'amount'],
  [{ restSec: '-5' }, 'restSec'], [{ restSec: '3601' }, 'restSec'], [{ restSec: '' }, 'restSec'],
]) {
  v = validateDraft(updateItem(d, k, changes));
  ok(!v.valid && v.itemErrors[k]?.[field], `invalid ${JSON.stringify(changes)} -> ${field}`);
  eq(v.errors.items, 'Fix the highlighted exercises.', 'summary message');
}
v = validateDraft(updateItem(d, k, { mode: 'time', durationSec: '0' }));
ok(v.itemErrors[k]?.amount, 'zero seconds is invalid');
ok(validateDraft(updateItem(d, k, { mode: 'time', durationSec: '7200' })).valid, '7200 s is the limit');
ok(validateDraft(updateItem(d, k, { restSec: '0' })).valid, 'no rest is fine');
ok(validateDraft(updateItem(d, k, { mode: 'time', reps: '' })).valid, 'the hidden field is ignored');
eq(itemErrors({ sets: '3', mode: 'reps', reps: '10', restSec: '60' }), {}, 'itemErrors ok');
ok(LIMITS.sets[1] === 50 && LIMITS.rest[1] === 3600, 'limits match validateWorkout');

// ---- the whole library builds valid items ----
for (const ex of EXERCISE_LIBRARY) {
  const dr = { ...addExercise(emptyDraft(), ex), name: 'x' };
  ok(validateDraft(dr).valid, `${ex.id} -> a valid item`);
}

// ---- draftFromWorkout round trip (also a workout whose items are not tied to the library, like the demo samples) ----
const sample = createWorkout({
  id: 'sample-upper-body', name: 'Upper body', category: 'Strength', notes: 'n', scheduleId: 'sample-gym',
  items: [createWorkoutItem({ name: 'Push-up', sets: 3, reps: 12, restSec: 60 }), createWorkoutItem({ name: 'Plank', sets: 2, reps: null, durationSec: 45, restSec: 30 })],
});
const back = draftFromWorkout(sample);
eq(back.items.map((i) => [i.name, i.mode, i.exerciseId]), [['Push-up', 'reps', null], ['Plank', 'time', null]], 'items load with their mode');
eq(draftToInput(back).items, sample.items, 'load -> save gives the same items');
ok(validateDraft(back).valid, 'a loaded workout is valid');
eq(back.nextKey, 3, 'next key follows the loaded items');
eq(new Set(addExercise(back, reps).items.map((i) => i.key)).size, 3, 'new key does not clash');
eq(draftFromWorkout({ name: 'Old', category: 'Core' }).items, [], 'a record without items does not crash');

// ---- new record ----
const rec = draftToNewWorkout({ ...emptyDraft({ exercise: reps }), name: 'Leg day' });
ok(rec.id && rec.version === 1 && rec.scheduleId === null && validateWorkout(rec).valid, 'a whole, valid new record');

// ---- add to an existing workout ----
const more = itemsWithExercise(sample, reps);
eq(more.length, 3, 'one item appended');
eq(more[2].exerciseId, reps.id, 'it is the exercise');
more[0].sets = 99;
eq(sample.items[0].sets, 3, 'the original workout is not mutated');
eq(itemsWithExercise({}, reps).length, 1, 'a workout without items');

// ---- texts ----
eq(exerciseCountLabel(1), '1 exercise', 'singular');
eq(exerciseCountLabel(4), '4 exercises', 'plural');
eq(workoutRow(sample), { id: 'sample-upper-body', title: 'Upper body', amount: '2 ex', subtitle: 'Strength · Scheduled' }, 'row of a scheduled workout');
eq(workoutRow(createWorkout({ id: 'w', name: '', category: 'Core' })), { id: 'w', title: 'Untitled workout', amount: '0 ex', subtitle: 'Core' }, 'row of an unscheduled, unnamed workout');
const pr = pickerRow(reps);
eq([pr.id, pr.title, pr.subtitle], [reps.id, reps.name, `${reps.category} · ${reps.difficulty}`], 'picker row');
ok(/^\d+×/.test(pr.amount), 'picker amount like 3×10');
const all = pickerResults(EXERCISE_LIBRARY);
eq(all.rows.length, PICKER_LIMIT, 'picker shows at most the limit');
eq(all.more, EXERCISE_LIBRARY.length - PICKER_LIMIT, 'and counts the rest');
eq(pickerResults(EXERCISE_LIBRARY.slice(0, 3)), { rows: EXERCISE_LIBRARY.slice(0, 3).map(pickerRow), more: 0 }, 'a short list shows all');
eq(pickerResults([]), { rows: [], more: 0 }, 'empty list');
ok(deleteMessage(sample).includes('sessions stay in your history'), 'delete message promises the history stays');
ok(deleteMessage(sample).includes('schedule stays'), 'and the schedule when linked');
ok(!deleteMessage({ name: 'X' }).includes('schedule stays'), 'not when unlinked');
ok(getExerciseById(reps.id)?.id === reps.id, 'library lookup works');

console.log(`Phase 9 PACE 3b workout form OK (${n} checks)`);