import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useServices } from '../hooks/useServices';
import { useRemoteChanges } from '../hooks/useRemoteChanges';
import { canStartWorkout, workoutRow } from '../lib/workoutForm.js';
import { handleError } from '../lib/errors';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Icon } from '../components/ui/Icon';
import { NoteBanner } from '../components/ui/NoteBanner';
import { Row } from '../components/ui/Row';

export function MyWorkouts() {
  const { workout, schedule } = useServices();
  const navigate = useNavigate();
  const [state, setState] = useState({ rows: null, error: '' });
  const [reload, setReload] = useState(0);
  const [starting, setStarting] = useState(null);
  const [startError, setStartError] = useState('');
  useRemoteChanges(['workouts', 'schedules'], () => setReload((n) => n + 1));

  useEffect(() => {
    let alive = true;
    Promise.all([workout.list(), schedule ? schedule.list() : Promise.resolve([])])
      .then(([list, schedules]) => {
        if (!alive) return;
        const rows = list.map((w) => ({ ...workoutRow(w, schedules), canStart: canStartWorkout(w) }));
        setState({ rows, error: '' });
      })
      .catch((err) => { if (alive) setState({ rows: [], error: handleError(err, 'my-workouts') }); });
    return () => { alive = false; };
  }, [workout, schedule, reload]);

  async function startWorkout(workoutId) {
    if (!workoutId || starting) return;
    setStarting(workoutId);
    setStartError('');
    try {
      const session = await workout.openSession(workoutId);
      navigate(`/fitness/session/${session.id}`);
    } catch (e) {
      setStartError(handleError(e, 'fitness'));
      setStarting(null);
    }
  }

  const { rows, error } = state;

  return (
    <div className="krono-fade-in">
      <div className="mb-3">
        <Button variant="ghost" size="sm" leftIcon="left" onClick={() => navigate('/fitness')}>Fitness</Button>
      </div>

      <section aria-labelledby="myworkouts-heading">
        <h3 id="myworkouts-heading" className="section-divider">My workouts</h3>
        <div className="stack">
          {(startError || error) && <NoteBanner>{startError || error}</NoteBanner>}
          <Button fullWidth leftIcon="plus" onClick={() => navigate('/fitness/workouts/new')}>New workout</Button>

          <Card variant="fit" header="Saved routines">
            {rows === null && <p className="empty-hint" role="status">Loading…</p>}
            {rows !== null && rows.length === 0 && <p className="empty-hint">No workouts yet.</p>}
            {rows !== null && rows.length > 0 && (
              <div className="exercise-list">
                {rows.map((r) => (
                  <div key={r.id} className="d-flex align-items-center gap-2">
                    <Link className="exercise-link flex-grow-1 min-w-0" to={`/fitness/workouts/${r.id}`}>
                      <Row time={r.amount} barColor="fit" title={r.title} subtitle={r.subtitle} tag={<span className="exercise-tag"><Icon name="right" size={16} /></span>} />
                    </Link>
                    <Button
                      variant="fit"
                      size="sm"
                      leftIcon="play"
                      loading={starting === r.id}
                      disabled={!r.canStart || starting !== null}
                      onClick={() => startWorkout(r.id)}
                    >
                      Start
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </section>
    </div>
  );
}