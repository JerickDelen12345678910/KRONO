import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useServices } from '../hooks/useServices';
import { useRemoteChanges } from '../hooks/useRemoteChanges';
import { useSyncStatus } from '../hooks/useSyncStatus';
import { toLocalDate, toLocalDateTime } from '../models/common.js';
import { chartModel } from '../lib/fitnessView.js';
import { kpiCards, nextUp, startTarget, syncCard, todayRows } from '../lib/dashboardView.js';
import { handleError } from '../lib/errors';
import { KPICard } from '../components/ui/KPICard';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { NoteBanner } from '../components/ui/NoteBanner';
import { Pill } from '../components/ui/Pill';
import { LineChartWidget } from '../components/ui/LineChart';
import { Icon } from '../components/ui/Icon';
import { Row } from '../components/ui/Row';

// What the Home screen shows is built from these collections: re-read when another device's changes arrive.
const REMOTE_COLLECTIONS = ['schedules', 'occurrences', 'workouts', 'exerciseHistory', 'destinations'];
const UPCOMING_DAYS = 7;
const UPCOMING_LIMIT = 5;
const EMPTY = { loaded: false, error: '', today: [], upcoming: [], planned: [], progress: null, places: null, reminders: null };

/**
 * Phase 11 PACE 1: the Home dashboard with live data. Every number and text comes from src/lib/dashboardView.js (tested by
 * scripts/check-dashboard-view.mjs) and the services; this screen only renders them and wires the quick actions.
 */
export function Dashboard() {
  const { activity, workout, place, reminders } = useServices();
  const { online } = useAuth();
  const syncStatus = useSyncStatus();
  const navigate = useNavigate();
  const [now, setNow] = useState(() => new Date());
  const [data, setData] = useState(EMPTY);
  const [reload, setReload] = useState(0);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState('');
  useRemoteChanges(REMOTE_COLLECTIONS, () => setReload((n) => n + 1));

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);   // keeps "in 25 minutes", the date and the sync age current
    return () => clearInterval(t);
  }, []);

  const today = toLocalDate(now);
  const minute = toLocalDateTime(now);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [todayItems, upcoming, planned, progress, favorites, scheduled] = await Promise.all([
          activity.listToday({ today }),
          activity.listUpcoming({ now: new Date(), days: UPCOMING_DAYS, limit: UPCOMING_LIMIT }),
          workout.today({ today }),
          workout.progress({ today, range: 'week' }),
          place.listFavorites(),
          reminders.listScheduled(),
        ]);
        if (alive) setData({ loaded: true, error: '', today: todayItems, upcoming, planned, progress, places: favorites.length, reminders: scheduled.length });
      } catch (e) {
        if (alive) setData((d) => ({ ...d, error: handleError(e, 'dashboard') }));   // keeps older data if there is any; never claims "loaded"
      }
    })();
    return () => { alive = false; };
  }, [activity, workout, place, reminders, today, minute, reload]);

  const kpis = useMemo(() => kpiCards(data, now), [data, now]);
  const next = useMemo(() => nextUp(data.upcoming, now), [data.upcoming, now]);
  const list = useMemo(() => todayRows(data.today), [data.today]);
  const chart = data.progress ? chartModel(data.progress) : null;
  const sync = syncCard(syncStatus, online, now.getTime());

  async function startWorkout() {
    const target = startTarget(data.planned);
    if (!target) { navigate('/fitness'); return; }   // none or several planned today: choose on the Fitness screen
    setStarting(true);
    setStartError('');
    try {
      const session = await workout.openSession(target.workoutId);
      navigate(`/fitness/session/${session.id}`);
    } catch (e) {
      setStartError(handleError(e, 'dashboard'));
      setStarting(false);
    }
  }

  const banner = startError || data.error;

  return (
    <div>
      {banner && <NoteBanner className="mb-3">{banner}</NoteBanner>}

      {/* KPI Row */}
      <section aria-labelledby="overview-heading">
        <h3 id="overview-heading" className="section-divider">Overview</h3>
        <div className="kpi-grid">
          {kpis.map((k) => <KPICard key={k.key} variant={k.variant} label={k.label} value={k.value} subtitle={k.subtitle} />)}
        </div>
      </section>

      {/* Today & Progress */}
      <section aria-labelledby="today-heading">
        <h3 id="today-heading" className="section-divider">Today and progress</h3>
        <div className="cols">
          {/* Left Column */}
          <div className="stack">
            {/* Next Up Card */}
            <div className="next-card">
              <small>{next ? `Next up · ${next.when}` : 'Next up'}</small>
              <h3>{next ? next.title : data.loaded ? 'Nothing coming up' : data.error ? 'Couldn’t load your day' : 'Checking your day…'}</h3>
              <small>{next ? next.meta : data.loaded ? `Your schedule is clear for the next ${UPCOMING_DAYS} days.` : ''}</small>
              <div style={{ display: 'flex', gap: '8px' }}>
                {next
                  ? <Button fullWidth leftIcon="cal" onClick={() => navigate(next.route)}>Open</Button>
                  : <Button fullWidth leftIcon="plus" disabled={!data.loaded} onClick={() => navigate('/scheduler/new')}>New schedule</Button>}
              </div>
            </div>

            {/* Quick Actions */}
            <div className="qa-grid">
              <button className="qa-btn" onClick={() => navigate('/scheduler/new')}>
                <span className="icon-wrapper" style={{ background: 'var(--pri-s)', color: 'var(--pri)' }}>
                  <Icon name="plus" className="icon-xl" />
                </span>
                New schedule
              </button>
              <button className="qa-btn" disabled={starting} onClick={startWorkout}>
                <span className="icon-wrapper" style={{ background: 'var(--fit-s)', color: 'var(--fit)' }}>
                  <Icon name="play" className="icon-xl" />
                </span>
                Start workout
              </button>
              <button className="qa-btn" onClick={() => navigate('/map')}>
                <span className="icon-wrapper" style={{ background: 'var(--map-s)', color: 'var(--map)' }}>
                  <Icon name="pin" className="icon-xl" />
                </span>
                Open map
              </button>
            </div>

            {/* Today's Schedule */}
            <Card variant="pri">
              <h3 className="ui-card-header">Today <span>{data.loaded ? list.header : ''}</span></h3>
              {data.loaded && list.rows.length === 0 && <p className="empty-hint">Nothing planned today.</p>}
              <div className="today-rows">
                {list.rows.map((r) => (
                  <Row
                    key={r.key} time={r.time} barColor={r.bar} title={r.title} subtitle={r.subtitle}
                    tag={r.pills.length > 0 ? <>{r.pills.map((p) => <Pill key={p.label} variant={p.variant}>{p.label}</Pill>)}</> : undefined}
                  />
                ))}
              </div>
            </Card>
          </div>

          {/* Right Column */}
          <div className="stack">
            <Card variant="fit">
              <h3 className="ui-card-header">Exercise this week <span>minutes</span></h3>
              {chart && (
                <div role="img" aria-label={chart.description}>
                  <LineChartWidget data={chart.data} labels={chart.labels} color="var(--pri)" />
                </div>
              )}
            </Card>
            <Card>
              <h3 className="ui-card-header">Sync <Pill variant={sync.pill.variant}>{sync.pill.label}</Pill></h3>
              <div className="file-item">
                <span className="icon-btn" style={{ background: 'var(--pri-s)', color: 'var(--pri)' }}>
                  <Icon name="cloud" />
                </span>
                <div>
                  <b>{sync.title}</b>
                  <small style={{ color: 'var(--mu)' }}>{sync.subtitle}</small>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </section>
    </div>
  );
}