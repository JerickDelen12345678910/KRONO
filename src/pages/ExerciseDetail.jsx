import { Fragment, useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useServices } from '../hooks/useServices';
import { backSearch, exerciseDetail } from '../lib/exerciseView.js';
import { itemsWithExercise } from '../lib/workoutForm.js';
import { handleError } from '../lib/errors';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { FormField } from '../components/ui/FormField';
import { NoteBanner } from '../components/ui/NoteBanner';
import { Pill } from '../components/ui/Pill';

const NEW_WORKOUT = 'new';

export function ExerciseDetail() {
  const { id } = useParams();
  const { workout } = useServices();
  const navigate = useNavigate();
  const location = useLocation();
  const exercise = workout.getExercise(id);
  const view = exercise ? exerciseDetail(exercise) : null;
  const back = () => navigate(`/fitness/exercises${backSearch(location.state)}`);
  const [workouts, setWorkouts] = useState([]);
  const [target, setTarget] = useState(NEW_WORKOUT);
  const [busy, setBusy] = useState(false);
  const [addError, setAddError] = useState('');

  useEffect(() => {
    let alive = true;
    workout.list().then((list) => { if (alive) setWorkouts(list); }).catch((e) => handleError(e, 'exercise-detail'));
    return () => { alive = false; };
  }, [workout]);

  const addToWorkout = async () => {
    if (!exercise) return;
    const existing = workouts.find((w) => w.id === target);
    if (!existing) { navigate(`/fitness/workouts/new?exercise=${encodeURIComponent(exercise.id)}`); return; }
    setBusy(true);
    setAddError('');
    try {
      await workout.update(existing.id, { items: itemsWithExercise(existing, exercise) }, { expectedVersion: existing.version });
      navigate(`/fitness/workouts/${existing.id}`);
    } catch (e) {
      setAddError(handleError(e, 'exercise-detail'));
      setBusy(false);
    }
  };

  return (
    <div className="krono-fade-in">
      <div className="mb-3">
        <Button variant="ghost" size="sm" leftIcon="left" onClick={back}>Exercises</Button>
      </div>

      {!view ? (
        <Card variant="fit" header="Not found">
          <Button variant="secondary" size="sm" onClick={back}>Back</Button>
        </Card>
      ) : (
        <section aria-labelledby="exdetail-heading">
          <h3 id="exdetail-heading" className="section-divider">Exercise</h3>
          <div className="cols">
            <div className="stack">
              <Card variant="fit" aria-labelledby="exercise-title" header={<><b id="exercise-title">{view.name}</b><Pill variant="fit">{view.category}</Pill></>}>
                <p className="exercise-desc">{view.description}</p>
                <dl className="exercise-facts">
                  {view.facts.map((f) => (
                    <Fragment key={f.label}>
                      <dt>{f.label}</dt>
                      <dd>{f.value}</dd>
                    </Fragment>
                  ))}
                </dl>
              </Card>
              <Card variant="fit" header={<>Steps <span>{view.stepsLabel}</span></>}>
                <ol className="exercise-steps">
                  {view.steps.map((step, i) => <li key={`${i}-${step}`}>{step}</li>)}
                </ol>
              </Card>
            </div>
            <div className="stack">
              <Card variant="fit" header="Add to workout">
                {addError && <NoteBanner className="mb-3">{addError}</NoteBanner>}
                <div className="form-grid">
                  <FormField label="Routine">
                    <select value={target} onChange={(e) => setTarget(e.target.value)}>
                      <option value={NEW_WORKOUT}>New workout</option>
                      {workouts.map((w) => <option key={w.id} value={w.id}>{w.name || 'Workout'}</option>)}
                    </select>
                  </FormField>
                  <Button variant="fit" fullWidth disabled={busy} onClick={addToWorkout}>{busy ? 'Adding…' : 'Add to workout'}</Button>
                </div>
              </Card>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}