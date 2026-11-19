import { Fragment } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useServices } from '../hooks/useServices';
import { FITNESS_DISCLAIMER, RECOVERY_REMINDERS } from '../lib/exerciseLibrary.js';
import { backSearch, exerciseDetail } from '../lib/exerciseView.js';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Pill } from '../components/ui/Pill';

// One built-in exercise: what it is, how to do it, and general warm-up/recovery reminders. General information only.
export function ExerciseDetail() {
  const { id } = useParams();
  const { workout } = useServices();
  const navigate = useNavigate();
  const location = useLocation();
  const exercise = workout.getExercise(id);
  const view = exercise ? exerciseDetail(exercise) : null;
  const back = () => navigate(`/fitness/exercises${backSearch(location.state)}`);

  return (
    <div>
      <div className="mb-3">
        <Button variant="ghost" size="sm" leftIcon="left" onClick={back}>Exercise library</Button>
      </div>

      {!view ? (
        <Card variant="fit" header="Exercise not found">
          <p className="empty-hint">This exercise is not in the library.</p>
          <Button variant="secondary" size="sm" onClick={back}>Back to the library</Button>
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
              <Card variant="fit" header={<>How to do it <span>{view.stepsLabel}</span></>}>
                <ol className="exercise-steps">
                  {view.steps.map((step, i) => <li key={`${i}-${step}`}>{step}</li>)}
                </ol>
              </Card>
            </div>
            <div className="stack">
              <Card header="Warm-up and recovery">
                <ul className="exercise-steps">
                  {RECOVERY_REMINDERS.map((tip) => <li key={tip}>{tip}</li>)}
                </ul>
              </Card>
              <small className="fit-note">{FITNESS_DISCLAIMER}</small>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}