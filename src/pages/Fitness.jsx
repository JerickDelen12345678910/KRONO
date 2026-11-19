import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useServices } from '../hooks/useServices';
import { useRemoteChanges } from '../hooks/useRemoteChanges';
import { EXERCISE_CATEGORIES } from '../models/constants.js';
import { toLocalDate } from '../models/common.js';
import { FITNESS_DISCLAIMER } from '../lib/exerciseLibrary.js';
import { chartModel, defaultCategory, forCategory, kpiCards, plannedOn, workoutBlock } from '../lib/fitnessView.js';
import { to12h } from '../lib/timeline.js';
import { handleError } from '../lib/errors';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { FilterChips } from '../components/ui/FilterChips';
import { KPICard } from '../components/ui/KPICard';
import { LineChartWidget } from '../components/ui/LineChart';
import { NoteBanner } from '../components/ui/NoteBanner';
import { Pill } from '../components/ui/Pill';
import { Row } from '../components/ui/Row';

const CATEGORY_OPTIONS = EXERCISE_CATEGORIES.map((c) => ({ value: c, label: c }));
const shortDate = (d) => new Date(`${d}T00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
// What this screen shows is built from these collections: re-read when another device's changes arrive.
const REMOTE_COLLECTIONS = ['workouts', 'exerciseHistory', 'schedules', 'occurrences'];

export function Fitness() {
  const { workout } = useServices();
  const navigate = useNavigate();
  const [today, setToday] = useState(() => toLocalDate());
  const [category, setCategory] = useState(null);   // null = the category of today's first workout
  const [data, setData] = useState({ summary: null, upcoming: [], progress: null, loading: true, error: '' });
  const [reload, setReload] = useState(0);
  const [starting, setStarting] = useState(null);   // workout id whose session is being opened
  const [startError, setStartError] = useState('');
  useRemoteChanges(REMOTE_COLLECTIONS, () => setReload((n) => n + 1));

  useEffect(() => {
    const t = setInterval(() => setToday(toLocalDate()), 60000);   // follows midnight; same value = no re-render
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [summary, upcoming, progress] = await Promise.all([
          workout.summary({ today }),
          workout.upcoming({ today, days: 14 }),
          workout.progress({ today, range: 'week' }),
        ]);
        if (alive) setData({ summary, upcoming, progress, loading: false, error: '' });
      } catch (e) {
        if (alive) setData((d) => ({ ...d, loading: false, error: handleError(e, 'fitness') }));
      }
    })();
    return () => { alive = false; };
  }, [workout, today, reload]);

  const todayPlan = useMemo(() => plannedOn(data.summary?.planned, today), [data.summary, today]);
  const activeCategory = category ?? defaultCategory(todayPlan);
  const blocks = forCategory(todayPlan, activeCategory).map((p) => ({ workoutId: p.workout?.id ?? null, ...workoutBlock(p, to12h) }));
  const kpis = kpiCards(data.summary);
  const chart = data.progress ? chartModel(data.progress) : null;
  const next = data.upcoming[0] ?? null;

  // Phase 9 PACE 4a: continue the workout's open session, or start a new one, then open the session screen.
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

  let emptyText = `No ${activeCategory} workout planned today.`;
  if (todayPlan.length === 0) {
    emptyText = next
      ? `No workout planned today. Next: ${shortDate(next.date)} · ${to12h(next.startTime)} · ${next.workout?.name || 'Workout'}.`
      : 'No workout planned today.';
  }

  return (
    <div>
      {(startError || data.error) && <NoteBanner className="mb-3">{startError || data.error}</NoteBanner>}

      <section aria-labelledby="fit-week-heading">
        <h3 id="fit-week-heading" className="section-divider">This week</h3>
        <div className="kpi-grid">
          {kpis.map((k) => <KPICard key={k.key} variant={k.variant} label={k.label} value={k.value} subtitle={k.subtitle} />)}
        </div>
      </section>

      <section aria-labelledby="fit-plan-heading">
        <h3 id="fit-plan-heading" className="section-divider">Plan and trends</h3>
        <div className="cols">
          <div className="stack">
            <Card variant="fit" header={<>Today’s workout {activeCategory && <Pill variant="fit">{activeCategory}</Pill>}</>}>
              {!data.loading && blocks.length === 0 && <p className="empty-hint">{emptyText}</p>}
              {blocks.map((b) => (
                <div key={b.key} className="workout-block">
                  <b className="workout-name">{b.name}</b>
                  <p className="workout-meta">{b.meta}</p>
                  <div className="workout-rows">
                    {b.rows.map((r) => <Row key={r.key} time={r.sets} barColor="fit" title={r.name} subtitle={r.rest} />)}
                  </div>
                  {b.more > 0 && <p className="workout-meta">{`+${b.more} more ${b.more === 1 ? 'exercise' : 'exercises'}`}</p>}
                  <div className="workout-actions">
                    <Button variant="fit" fullWidth leftIcon="play" loading={starting === b.workoutId} disabled={!b.workoutId || starting !== null} onClick={() => startWorkout(b.workoutId)}>Start workout</Button>
                  </div>
                </div>
              ))}
            </Card>
            <FilterChips options={CATEGORY_OPTIONS} value={activeCategory} onChange={setCategory} label="Workout category" />
            <Button variant="secondary" fullWidth rightIcon="right" onClick={() => navigate('/fitness/workouts')}>My workouts</Button>
            <Button variant="secondary" fullWidth rightIcon="right" onClick={() => navigate('/fitness/exercises')}>Browse exercises</Button>
          </div>

          <div className="stack">
            <Card variant="fit" header={<>Weekly exercise time <span>minutes</span></>}>
              {chart && (
                <div role="img" aria-label={chart.description}>
                  <LineChartWidget data={chart.data} labels={chart.labels} color="var(--pri)" />
                </div>
              )}
            </Card>
            <small className="fit-note">{FITNESS_DISCLAIMER}</small>
          </div>
        </div>
      </section>
    </div>
  );
}