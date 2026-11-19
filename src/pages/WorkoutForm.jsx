import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useServices } from '../hooks/useServices';
import { EXERCISE_CATEGORIES } from '../models/constants.js';
import { FITNESS_DISCLAIMER } from '../lib/exerciseLibrary.js';
import {
  addExercise, deleteMessage, draftFromWorkout, draftToInput, draftToNewWorkout, emptyDraft, exerciseCountLabel, moveItem, pickerResults,
  removeItem, updateItem, validateDraft,
} from '../lib/workoutForm.js';
import { ERROR_CODE, handleError, isAppError } from '../lib/errors';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { FilterChips } from '../components/ui/FilterChips';
import { FormField } from '../components/ui/FormField';
import { NoteBanner } from '../components/ui/NoteBanner';
import { Row } from '../components/ui/Row';

const ALL = 'All';
const CATEGORY_OPTIONS = EXERCISE_CATEGORIES.map((c) => ({ value: c, label: c }));
const PICKER_OPTIONS = [{ value: ALL, label: ALL }, ...CATEGORY_OPTIONS];
const NO_ERRORS = { errors: {}, itemErrors: {} };

// Create or edit one workout: name, category, notes, and the exercises (added from the built-in library, then edited per exercise).
// Saving goes through WorkoutService; the form logic is pure (src/lib/workoutForm.js). Deleting keeps finished sessions in history.
export function WorkoutForm() {
  const { id } = useParams();
  const editing = Boolean(id);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { workout } = useServices();

  // /fitness/workouts/new?exercise=<id> starts with that exercise (the "Add to workout" action on the exercise detail).
  const [draft, setDraft] = useState(() => {
    const exerciseId = params.get('exercise');
    return emptyDraft({ exercise: !editing && exerciseId ? workout.getExercise(exerciseId) || null : null });
  });
  const [saved, setSaved] = useState(null);   // the stored workout being edited: its version (for conflicts) and scheduleId (for the delete text)
  const [loading, setLoading] = useState(editing);
  const [missing, setMissing] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [pickCategory, setPickCategory] = useState(ALL);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!id) return undefined;
    let alive = true;
    workout.list()
      .then((list) => {
        if (!alive) return;
        const w = list.find((x) => x.id === id);
        if (w) { setDraft(draftFromWorkout(w)); setSaved(w); } else setMissing('That workout could not be found. It may have been deleted.');
        setLoading(false);
      })
      .catch((err) => { if (alive) { setMissing(handleError(err, 'workout-form')); setLoading(false); } });
    return () => { alive = false; };
  }, [id, workout]);

  const results = useMemo(() => pickerResults(workout.listExercises({
    ...(pickCategory !== ALL ? { category: pickCategory } : {}),
    ...(query.trim() ? { query: query.trim() } : {}),
  })), [workout, pickCategory, query]);

  // After the first Save attempt, errors update live as the user fixes the fields.
  const { errors, itemErrors } = submitted ? validateDraft(draft) : NO_ERRORS;
  const invalid = (bad) => (bad ? { 'aria-invalid': true } : {});
  const setField = (key) => (e) => setDraft((d) => ({ ...d, [key]: e.target.value }));
  const setItem = (key, field) => (e) => setDraft((d) => updateItem(d, key, { [field]: e.target.value }));

  const add = (exerciseId) => {
    const exercise = workout.getExercise(exerciseId);
    if (!exercise) return;
    setDraft((d) => addExercise(d, exercise));
    setNotice(`Added ${exercise.name}.`);
  };

  const save = async (e) => {
    e.preventDefault();
    setSubmitted(true);
    setFormError('');
    if (!validateDraft(draft).valid) return;
    setBusy(true);
    try {
      if (editing) await workout.update(id, draftToInput(draft), { expectedVersion: saved?.version });
      else await workout.create(draftToNewWorkout(draft));
      navigate('/fitness/workouts');
    } catch (err) {
      if (isAppError(err) && err.code === ERROR_CODE.VALIDATION) setFormError(Object.values(err.details.errors ?? {})[0] ?? 'Some fields need attention.');
      else setFormError(handleError(err, 'workout-form'));
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm(deleteMessage(saved))) return;
    try { await workout.remove(id); navigate('/fitness/workouts'); } catch (err) { setFormError(handleError(err, 'workout-form')); }
  };

  if (loading) return <p className="empty-hint" role="status">Loading…</p>;
  if (missing) {
    return (
      <div className="stack">
        <NoteBanner>{missing}</NoteBanner>
        <Button variant="secondary" onClick={() => navigate('/fitness/workouts')}>Back to My workouts</Button>
      </div>
    );
  }

  const count = draft.items.length;

  return (
    <form className="stack" onSubmit={save} noValidate>
      <h3 className="section-divider">{editing ? 'Edit workout' : 'New workout'}</h3>
      {formError && <NoteBanner>{formError}</NoteBanner>}
      {Object.keys(errors).length > 0 && <NoteBanner>Please fix the highlighted fields.</NoteBanner>}

      <div className="cols">
        <div className="stack">
          <Card variant="fit" header="Details">
            <div className="form-grid">
              <FormField label="Name" error={errors.name}>
                <input value={draft.name} onChange={setField('name')} placeholder="e.g. Upper body" maxLength={80} {...invalid(errors.name)} />
              </FormField>
              <FormField as="div" label="Category" error={errors.category}>
                <FilterChips label="Workout category" options={CATEGORY_OPTIONS} value={draft.category} onChange={(category) => setDraft((d) => ({ ...d, category }))} />
              </FormField>
              <FormField label="Notes (optional)">
                <textarea rows={3} value={draft.notes} onChange={setField('notes')} maxLength={500} />
              </FormField>
            </div>
          </Card>

          <Card variant="fit" header={<>Exercises <span>{exerciseCountLabel(count)}</span></>}>
            {count === 0 && <p className="empty-hint">No exercises yet. Add some from the list.</p>}
            {errors.items && <p className="empty-hint" role="alert">{errors.items}</p>}
            {count > 0 && (
              <ol className="workout-items">
                {draft.items.map((item, index) => {
                  const e = itemErrors[item.key] ?? {};
                  const timed = item.mode === 'time';
                  return (
                    <li key={item.key} className={`workout-item${Object.keys(e).length > 0 ? ' warn' : ''}`}>
                      <div className="workout-item-head">
                        <b>{index + 1}. {item.name}</b>
                        <div className="workout-item-actions">
                          <Button variant="ghost" size="sm" disabled={index === 0} aria-label={`Move ${item.name} up`} onClick={() => setDraft((d) => moveItem(d, item.key, -1))}>Up</Button>
                          <Button variant="ghost" size="sm" disabled={index === count - 1} aria-label={`Move ${item.name} down`} onClick={() => setDraft((d) => moveItem(d, item.key, 1))}>Down</Button>
                          <Button variant="ghost" size="sm" aria-label={`Remove ${item.name}`} onClick={() => setDraft((d) => removeItem(d, item.key))}>Remove</Button>
                        </div>
                      </div>
                      <div className="workout-fields">
                        <FormField label="Sets" error={e.sets}>
                          <input type="number" inputMode="numeric" min="1" max="50" value={item.sets} onChange={setItem(item.key, 'sets')} {...invalid(e.sets)} />
                        </FormField>
                        <FormField label="Measured in">
                          <select value={item.mode} onChange={setItem(item.key, 'mode')}>
                            <option value="reps">Reps</option>
                            <option value="time">Seconds</option>
                          </select>
                        </FormField>
                        <FormField label={timed ? 'Seconds' : 'Reps'} error={e.amount}>
                          <input
                            type="number" inputMode="numeric" min="1" max={timed ? 7200 : 1000}
                            value={timed ? item.durationSec : item.reps} onChange={setItem(item.key, timed ? 'durationSec' : 'reps')} {...invalid(e.amount)}
                          />
                        </FormField>
                        <FormField label="Rest (seconds)" error={e.restSec}>
                          <input type="number" inputMode="numeric" min="0" max="3600" value={item.restSec} onChange={setItem(item.key, 'restSec')} {...invalid(e.restSec)} />
                        </FormField>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </Card>
        </div>

        <div className="stack">
          <Card variant="fit" header="Add exercises">
            <div className="form-grid">
              <FormField label="Search the library">
                <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name or muscle, e.g. plank" maxLength={60} autoComplete="off" />
              </FormField>
              <FilterChips label="Exercise category" options={PICKER_OPTIONS} value={pickCategory} onChange={setPickCategory} />
            </div>
            <div className="workout-picker">
              {results.rows.length === 0 && <p className="empty-hint">No exercises match.</p>}
              {results.rows.map((r) => (
                <Row
                  key={r.id}
                  time={r.amount}
                  barColor="fit"
                  title={r.title}
                  subtitle={r.subtitle}
                  tag={<Button variant="secondary" size="sm" aria-label={`Add ${r.title}`} onClick={() => add(r.id)}>Add</Button>}
                />
              ))}
            </div>
            {results.more > 0 && <p className="fit-note mt-3">{`Showing ${results.rows.length} of ${results.rows.length + results.more}. Search or pick a category to narrow the list.`}</p>}
            <p className="fit-note mt-3" role="status">{notice}</p>
          </Card>
          <small className="fit-note">{FITNESS_DISCLAIMER}</small>
        </div>
      </div>

      <div className="form-actions">
        <Button type="submit" disabled={busy}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Save workout'}</Button>
        <Button variant="secondary" onClick={() => navigate('/fitness/workouts')}>Cancel</Button>
        {editing && <Button variant="secondary" onClick={remove}>Delete</Button>}
      </div>
    </form>
  );
}