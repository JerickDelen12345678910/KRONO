import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useServices } from '../hooks/useServices';
import { useRemoteChanges } from '../hooks/useRemoteChanges';
import { useSyncStatus } from '../hooks/useSyncStatus';
import { toLocalDate, toLocalDateTime } from '../models/common.js';
import { chartModel } from '../lib/fitnessView.js';
import { coordsOf } from '../lib/mapView.js';
import { fetchRoutes } from '../lib/routeSearch.js';
import { kpiCards, leaveForCard, nextUp, startTarget, syncCard, todayRows, upcomingTravel } from '../lib/dashboardView.js';
import {
  buildNowWidgetModel, clearPostGymRecovery, getNativeWidgetState, syncNativeScheduleWidget,
} from '../lib/scheduleWidgetBridge.js';
import { handleError } from '../lib/errors';
import { KPICard } from '../components/ui/KPICard';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { NoteBanner } from '../components/ui/NoteBanner';
import { Pill } from '../components/ui/Pill';
import { LineChartWidget } from '../components/ui/LineChart';
import { Icon } from '../components/ui/Icon';
import { Row } from '../components/ui/Row';

const REMOTE_COLLECTIONS = ['schedules', 'occurrences', 'workouts', 'exerciseHistory', 'destinations'];
const UPCOMING_DAYS = 7;
const UPCOMING_LIMIT = 5;
const EMPTY = { loaded: false, error: '', today: [], upcoming: [], planned: [], progress: null, schedules: [], favorites: [], scheduledReminders: [], places: null, reminders: null };

export function Dashboard() {
  const { activity, workout, place, reminders, schedule } = useServices();
  const { online } = useAuth();
  const syncStatus = useSyncStatus();
  const navigate = useNavigate();
  const [now, setNow] = useState(() => new Date());
  const [data, setData] = useState(EMPTY);
  const [tripRoute, setTripRoute] = useState(null);
  const [reload, setReload] = useState(0);
  const [starting, setStarting] = useState(false);
  const [snoozing, setSnoozing] = useState(false);
  const [snoozeNote, setSnoozeNote] = useState('');
  const [startError, setStartError] = useState('');
  const [widgetState, setWidgetState] = useState({ pendingPostGymRecovery: false, workoutLabel: '' });
  const [addingRecovery, setAddingRecovery] = useState(false);
  useRemoteChanges(REMOTE_COLLECTIONS, () => setReload((n) => n + 1));

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  const today = toLocalDate(now);
  const minute = toLocalDateTime(now);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [todayItems, upcoming, planned, progress, schedules, favorites, scheduled, wState] = await Promise.all([
          activity.listToday({ today }),
          activity.listUpcoming({ now: new Date(), days: UPCOMING_DAYS, limit: UPCOMING_LIMIT }),
          workout.today({ today }),
          workout.progress({ today, range: 'week' }),
          schedule.list(),
          place.listFavorites(),
          reminders.listScheduled(),
          getNativeWidgetState(),
        ]);
        if (alive) {
          setData({
            loaded: true, error: '', today: todayItems, upcoming, planned, progress,
            schedules, favorites, scheduledReminders: scheduled, places: favorites.length, reminders: scheduled.length,
          });
          setWidgetState(wState);
        }
      } catch (e) {
        if (alive) setData((d) => ({ ...d, error: handleError(e, 'dashboard') }));
      }
    })();
    return () => { alive = false; };
  }, [activity, workout, place, reminders, schedule, today, minute, reload]);

  const trip = useMemo(
    () => upcomingTravel(data.upcoming, data.schedules, data.favorites, now),
    [data.upcoming, data.schedules, data.favorites, now],
  );

  useEffect(() => {
    setTripRoute(null);
    const destCoords = coordsOf(trip?.destination);
    if (!destCoords || !online || !('geolocation' in navigator)) return undefined;
    let alive = true;
    const controller = new AbortController();
    (async () => {
      try {
        if (!navigator.permissions?.query) return;
        const perm = await navigator.permissions.query({ name: 'geolocation' });
        if (perm.state !== 'granted') return;
        const pos = await new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 });
        });
        const routes = await fetchRoutes(
          { origin: { latitude: pos.coords.latitude, longitude: pos.coords.longitude }, destination: destCoords, mode: 'driving' },
          { signal: controller.signal },
        );
        if (alive && routes[0]) setTripRoute(routes[0]);
      } catch {
        // Optional live estimate
      }
    })();
    return () => { alive = false; controller.abort(); };
  }, [trip, online]);

  const kpis = useMemo(() => kpiCards(data, now), [data, now]);
  const next = useMemo(() => nextUp(data.upcoming, now), [data.upcoming, now]);
  const nextReminder = useMemo(
    () => (next?.occurrenceId ? data.scheduledReminders.find((r) => r.id === next.occurrenceId) ?? null : null),
    [next, data.scheduledReminders],
  );
  const leaveCard = useMemo(() => leaveForCard(trip, tripRoute, online), [trip, tripRoute, online]);
  const list = useMemo(() => todayRows(data.today), [data.today]);
  const nowWidget = useMemo(() => buildNowWidgetModel(data.today, now), [data.today, now]);
  const chart = data.progress ? chartModel(data.progress) : null;
  const sync = syncCard(syncStatus, online, now.getTime());

  useEffect(() => {
    if (data.loaded) syncNativeScheduleWidget(schedule, today, leaveCard);
  }, [data.loaded, data.today, schedule, today, leaveCard]);

  async function handleAddRecoveryBlock() {
    if (addingRecovery) return;
    setAddingRecovery(true);
    try {
      const start = new Date();
      const end = new Date(start.getTime() + 30 * 60000);
      const pad = (n) => String(n).padStart(2, '0');
      await schedule.create({
        title: 'Post-Gym Recovery & Meal',
        category: 'personal',
        date: today,
        startTime: `${pad(start.getHours())}:${pad(start.getMinutes())}`,
        endTime: `${pad(end.getHours())}:${pad(end.getMinutes())}`,
        repeat: 'none',
      });
      await clearPostGymRecovery();
      setWidgetState((s) => ({ ...s, pendingPostGymRecovery: false }));
      setReload((n) => n + 1);
    } catch (e) {
      setStartError(handleError(e, 'dashboard'));
    } finally {
      setAddingRecovery(false);
    }
  }

  async function handleDismissRecovery() {
    await clearPostGymRecovery();
    setWidgetState((s) => ({ ...s, pendingPostGymRecovery: false }));
  }

  async function snoozeNextReminder() {
    if (!nextReminder || snoozing) return;
    setSnoozing(true);
    setSnoozeNote('');
    try {
      const mins = reminders.getSettings().snoozeMinutes;
      const updated = await reminders.snooze(nextReminder.id, mins);
      if (updated) setSnoozeNote(`Snoozed +${mins}m`);
      setReload((n) => n + 1);
    } catch (e) {
      setStartError(handleError(e, 'dashboard'));
    } finally {
      setSnoozing(false);
    }
  }

  async function startWorkout() {
    const target = startTarget(data.planned);
    if (!target) { navigate('/fitness'); return; }
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
  const snoozeMins = reminders.getSettings().snoozeMinutes;

  return (
    <div className="krono-fade-in">
      {banner && <NoteBanner className="mb-3">{banner}</NoteBanner>}

      {widgetState.pendingPostGymRecovery && (
        <Card variant="fit" header={<>Post-Gym Recovery <Pill variant="ok">30m</Pill></>}>
          <p className="empty-hint mb-2">
            Add a 30-minute recovery &amp; meal block after <b>{widgetState.workoutLabel || 'your workout'}</b>?
          </p>
          <div className="status-actions">
            <Button size="sm" variant="fit" loading={addingRecovery} onClick={handleAddRecoveryBlock}>+ Add 30m Recovery</Button>
            <Button size="sm" variant="ghost" disabled={addingRecovery} onClick={handleDismissRecovery}>Dismiss</Button>
          </div>
        </Card>
      )}

      {/* Overview KPIs */}
      <section aria-labelledby="overview-heading">
        <h3 id="overview-heading" className="section-divider">Overview</h3>
        <div className="kpi-grid krono-kpi-highlight">
          {kpis.map((k) => <KPICard key={k.key} variant={k.variant} label={k.label} value={k.value} subtitle={k.subtitle} />)}
        </div>
      </section>

      <section aria-labelledby="today-heading">
        <h3 id="today-heading" className="section-divider">Today</h3>
        <div className="cols">
          <div className="stack">
            {/* Live Current & Next Card */}
            <Card
              variant="pri"
              header={(
                <>
                  {nowWidget.active ? 'Happening now' : 'Right now'}
                  <Pill variant={nowWidget.active ? 'ok' : 'pri'}>
                    {nowWidget.active ? nowWidget.active.remainingText : 'Free'}
                  </Pill>
                </>
              )}
            >
              {nowWidget.active ? (
                <div>
                  <b>{nowWidget.active.title}</b>
                  <small className="row-subtitle d-block mt-1">
                    {nowWidget.active.timeRange}{nowWidget.active.subtitle ? ` · ${nowWidget.active.subtitle}` : ''}
                  </small>
                  <div
                    role="progressbar"
                    aria-valuenow={nowWidget.active.percent}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    style={{
                      height: '6px',
                      borderRadius: '999px',
                      background: 'var(--pri-s)',
                      overflow: 'hidden',
                      marginTop: '10px',
                    }}
                  >
                    <div
                      style={{
                        width: `${nowWidget.active.percent}%`,
                        height: '100%',
                        background: 'var(--pri)',
                        transition: 'width 0.4s ease',
                      }}
                    />
                  </div>
                  {nowWidget.next && (
                    <small className="row-subtitle d-block mt-2">
                      Next: <b>{nowWidget.next.title}</b> ({nowWidget.next.timeRange})
                    </small>
                  )}
                </div>
              ) : (
                <div>
                  <b>No active schedule</b>
                  <small className="row-subtitle d-block mt-1">
                    {nowWidget.next
                      ? `Next: ${nowWidget.next.title} · ${nowWidget.next.timeRange}`
                      : 'Open schedule today'}
                  </small>
                </div>
              )}
            </Card>

            {/* Next Up Card (Unified Dark/Light Surface) */}
            <div className="next-card">
              <div className="next-card-top">
                <span className="next-card-kicker">{next ? `Next up · ${next.when}` : 'Next up'}</span>
                {next && <Pill variant="pri">Upcoming</Pill>}
              </div>
              <h3>{next ? next.title : data.loaded ? 'All clear' : 'Loading…'}</h3>
              {next && <p className="next-card-meta">{snoozeNote || next.meta}</p>}
              <div className="next-card-actions">
                {next ? (
                  <>
                    <Button fullWidth={!nextReminder} leftIcon="cal" onClick={() => navigate(next.route)}>Open</Button>
                    {nextReminder && (
                      <Button variant="secondary" disabled={snoozing} onClick={snoozeNextReminder}>
                        {snoozing ? 'Snoozing…' : `+${snoozeMins}m`}
                      </Button>
                    )}
                  </>
                ) : (
                  <Button fullWidth leftIcon="plus" disabled={!data.loaded} onClick={() => navigate('/scheduler/new')}>New schedule</Button>
                )}
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
          </div>

          {/* Right Column */}
          <div className="stack">
            {/* Today's Schedule */}
            <Card variant="pri">
              <h3 className="ui-card-header">Today&apos;s timeline <span>{data.loaded ? list.header : ''}</span></h3>
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

            {/* Leave for … Card */}
            {leaveCard && (
              <Card variant="map" header={<>{leaveCard.heading} <Pill variant={leaveCard.pill.variant}>{leaveCard.pill.label}</Pill></>}>
                <div className="file-item">
                  <span className="icon-btn" style={{ background: 'var(--map-s)', color: 'var(--map)' }}>
                    <Icon name="nav" />
                  </span>
                  <div style={{ flex: 1 }}>
                    <b>{leaveCard.title}</b>
                    <small style={{ color: 'var(--mu)' }}>{leaveCard.subtitle}</small>
                  </div>
                  <Button variant="map" size="sm" onClick={() => navigate(leaveCard.mapRoute)}>Route</Button>
                </div>
              </Card>
            )}

            <Card variant="fit">
              <h3 className="ui-card-header">Exercise this week <span>min</span></h3>
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
                </div>
              </div>
            </Card>
          </div>
        </div>
      </section>
    </div>
  );
}