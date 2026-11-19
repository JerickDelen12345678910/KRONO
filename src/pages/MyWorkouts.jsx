import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useServices } from '../hooks/useServices';
import { useRemoteChanges } from '../hooks/useRemoteChanges';
import { FITNESS_DISCLAIMER } from '../lib/exerciseLibrary.js';
import { workoutRow } from '../lib/workoutForm.js';
import { handleError } from '../lib/errors';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Icon } from '../components/ui/Icon';
import { NoteBanner } from '../components/ui/NoteBanner';
import { Row } from '../components/ui/Row';

// The user's own workouts. Each row opens the builder; "New workout" starts an empty one.
export function MyWorkouts() {
  const { workout } = useServices();
  const navigate = useNavigate();
  const [state, setState] = useState({ rows: null, error: '' });   // rows === null while loading
  const [reload, setReload] = useState(0);
  useRemoteChanges(['workouts'], () => setReload((n) => n + 1));

  useEffect(() => {
    let alive = true;
    workout.list()
      .then((list) => { if (alive) setState({ rows: list.map(workoutRow), error: '' }); })
      .catch((err) => { if (alive) setState({ rows: [], error: handleError(err, 'my-workouts') }); });
    return () => { alive = false; };
  }, [workout, reload]);

  const { rows, error } = state;

  return (
    <div>
      <div className="mb-3">
        <Button variant="ghost" size="sm" leftIcon="left" onClick={() => navigate('/fitness')}>Fitness</Button>
      </div>

      <section aria-labelledby="myworkouts-heading">
        <h3 id="myworkouts-heading" className="section-divider">My workouts</h3>
        <div className="stack">
          {error && <NoteBanner>{error}</NoteBanner>}
          <Button fullWidth onClick={() => navigate('/fitness/workouts/new')}>New workout</Button>

          <Card variant="fit" header="Workouts">
            {rows === null && <p className="empty-hint" role="status">Loading…</p>}
            {rows !== null && rows.length === 0 && <p className="empty-hint">No workouts yet. Create one, or start from the exercise library.</p>}
            {rows !== null && rows.length > 0 && (
              <div className="exercise-list">
                {rows.map((r) => (
                  <Link key={r.id} className="exercise-link" to={`/fitness/workouts/${r.id}`}>
                    <Row time={r.amount} barColor="fit" title={r.title} subtitle={r.subtitle} tag={<span className="exercise-tag"><Icon name="right" size={16} /></span>} />
                  </Link>
                ))}
              </div>
            )}
          </Card>
          <small className="fit-note">{FITNESS_DISCLAIMER}</small>
        </div>
      </section>
    </div>
  );
}