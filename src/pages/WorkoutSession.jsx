import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useServices } from '../hooks/useServices';
import { OCCURRENCE_STATUS, SESSION_STATUS } from '../models/constants.js';
import { syncNativeScheduleWidget, triggerPostGymRecovery } from '../lib/scheduleWidgetBridge.js';
import {
  activeSessionSeconds, discardMessage, entryViews, finalizeEntries, finishMessage, formatClock, logSet, progressText,
  restForLoggedSet, sessionProgress, skipEntry, tickRestTimer, undoSet, unskipEntry,
} from '../lib/session.js';
import { handleError } from '../lib/errors';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { NoteBanner } from '../components/ui/NoteBanner';
import { Pill } from '../components/ui/Pill';
import { Row } from '../components/ui/Row';

export function WorkoutSession() {
  const { id } = useParams();
  const { workout, schedule } = useServices();
  const navigate = useNavigate();
  const [load, setLoad] = useState({ id: null, status: 'loading', session: null, error: '' });
  const [entries, setEntries] = useState([]);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [restTimer, setRestTimer] = useState(null);
  const [saveError, setSaveError] = useState('');
  const [busy, setBusy] = useState(false);
  const [pausing, setPausing] = useState(false);
  const entriesRef = useRef([]);
  const sessionRef = useRef(null);
  const saveQueue = useRef(Promise.resolve());

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const session = await workout.getSession(id);
        if (!alive) return;
        entriesRef.current = session.entries ?? [];
        sessionRef.current = session;
        setEntries(entriesRef.current);
        setNowMs(Date.now());
        setLoad({ id, status: session.status === SESSION_STATUS.COMPLETED ? 'closed' : 'ready', session, error: '' });
      } catch (e) {
        if (alive) setLoad({ id, status: 'missing', session: null, error: handleError(e, 'fitness') });
      }
    })();
    return () => { alive = false; };
  }, [workout, id]);

  const sessionStatus = load.session?.status;
  useEffect(() => {
    if (load.status !== 'ready' || sessionStatus !== SESSION_STATUS.IN_PROGRESS) return undefined;
    const timer = setInterval(() => {
      setNowMs(Date.now());
      setRestTimer((t) => tickRestTimer(t, 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [load.status, sessionStatus]);

  const views = useMemo(() => entryViews(entries), [entries]);
  const progress = useMemo(() => sessionProgress(entries), [entries]);
  const isPaused = sessionStatus === SESSION_STATUS.PAUSED;
  const activeSec = activeSessionSeconds(load.session, nowMs);
  const goBack = () => navigate('/fitness');

  function apply(change, index = -1) {
    if (isPaused) return;
    const prev = entriesRef.current;
    const next = change(prev);
    if (next === prev) return;
    entriesRef.current = next;
    setEntries(next);
    if (index >= 0) {
      if ((next[index]?.sets?.length ?? 0) > (prev[index]?.sets?.length ?? 0)) {
        setRestTimer(restForLoggedSet(prev, next, index));
      } else if ((next[index]?.sets?.length ?? 0) < (prev[index]?.sets?.length ?? 0)) {
        setRestTimer(null);
      }
    }
    setSaveError('');
    saveQueue.current = saveQueue.current
      .then(() => workout.saveSessionEntries(id, next))
      .catch((e) => setSaveError(handleError(e, 'fitness')));
  }

  function togglePause() {
    if (pausing || busy || !sessionRef.current) return;
    const targetPaused = sessionRef.current.status !== SESSION_STATUS.PAUSED;
    setPausing(true);
    setSaveError('');
    saveQueue.current = saveQueue.current
      .then(() => (targetPaused ? workout.pauseSession(id) : workout.resumeSession(id)))
      .then((updated) => {
        sessionRef.current = updated;
        setNowMs(Date.now());
        setLoad((l) => ({ ...l, session: updated }));
      })
      .catch((e) => setSaveError(handleError(e, 'fitness')))
      .finally(() => setPausing(false));
  }

  async function finish() {
    const message = finishMessage(entriesRef.current);
    if (message && !window.confirm(message)) return;
    setBusy(true);
    try {
      await saveQueue.current;
      const finalActive = activeSessionSeconds(sessionRef.current, Date.now());
      const finished = await workout.finishSession(id, {
        entries: finalizeEntries(entriesRef.current),
        activeSeconds: finalActive,
      });
      const occurrenceId = await workout.resolveSessionOccurrence(finished);
      if (occurrenceId && schedule) {
        try {
          await schedule.setOccurrenceStatus(occurrenceId, OCCURRENCE_STATUS.DONE);
        } catch {
          // Non-blocking
        }
      }
      triggerPostGymRecovery(load.session?.workoutName || 'Workout');
      if (schedule) await syncNativeScheduleWidget(schedule);
      navigate('/');
    } catch (e) {
      setSaveError(handleError(e, 'fitness'));
      setBusy(false);
    }
  }

  async function discard() {
    if (!window.confirm(discardMessage(load.session.workoutName))) return;
    setBusy(true);
    try {
      await saveQueue.current;
      await workout.discardSession(id);
      navigate('/fitness');
    } catch (e) {
      setSaveError(handleError(e, 'fitness'));
      setBusy(false);
    }
  }

  if (load.id !== id) return <p className="empty-hint" role="status">Loading…</p>;

  if (load.status === 'missing' || load.status === 'closed') {
    return (
      <div>
        {load.error && <NoteBanner className="mb-3">{load.error}</NoteBanner>}
        <Card variant="fit" header={load.status === 'closed' ? 'Already finished' : 'Not found'}>
          <Button variant="secondary" leftIcon="left" onClick={goBack}>Fitness</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="krono-fade-in">
      {saveError && <NoteBanner className="mb-3">{saveError}</NoteBanner>}
      <div className="mb-3">
        <Button variant="ghost" size="sm" leftIcon="left" onClick={goBack}>Fitness</Button>
      </div>

      <div className="cols">
        <div className="stack">
          <Card
            variant="fit"
            header={<>{load.session.workoutName || 'Workout'} <Pill variant={isPaused ? 'warn' : 'fit'}>{isPaused ? 'Paused' : 'Active'}</Pill></>}
          >
            <p className="workout-meta" role="status">{`${formatClock(activeSec)} · ${progressText(progress)}`}</p>
            {restTimer && (
              <div className="workout-rows" role="status" aria-live="polite">
                <Row
                  time={formatClock(restTimer.remainingSec)}
                  barColor="fit"
                  title={`Rest · ${restTimer.exerciseName}`}
                  subtitle={`${restTimer.durationSec}s`}
                />
              </div>
            )}
            <div className="status-actions">
              <Button variant="secondary" size="sm" leftIcon={isPaused ? 'play' : 'pause'} loading={pausing} disabled={busy} onClick={togglePause}>
                {isPaused ? 'Resume' : 'Pause'}
              </Button>
              {restTimer && (
                <Button variant="ghost" size="sm" disabled={busy} onClick={() => setRestTimer(null)}>Skip rest</Button>
              )}
            </div>
          </Card>

          {views.map((v) => (
            <Card key={v.key} variant="fit" header={<>{v.title} <Pill variant="fit">{v.badge}</Pill></>}>
              {v.target && <p className="workout-meta">{v.target}</p>}
              {v.skipped
                ? <p className="empty-hint">Skipped</p>
                : (
                  <div className="workout-rows">
                    {v.rows.map((r) => <Row key={r.key} time={r.set} barColor="fit" title={r.amount} subtitle={r.state} />)}
                  </div>
                )}
              <div className="status-actions">
                {v.canLog && (
                  <Button variant="fit" leftIcon="check" disabled={busy || isPaused} onClick={() => apply((e) => logSet(e, v.index), v.index)}>{v.logLabel}</Button>
                )}
                {v.canUndo && (
                  <Button variant="secondary" size="sm" leftIcon="undo" disabled={busy || isPaused} onClick={() => apply((e) => undoSet(e, v.index), v.index)}>Undo</Button>
                )}
                {v.canSkip && (
                  <Button variant="ghost" size="sm" disabled={busy || isPaused} onClick={() => apply((e) => skipEntry(e, v.index), v.index)}>Skip</Button>
                )}
                {v.canUnskip && (
                  <Button variant="secondary" size="sm" leftIcon="undo" disabled={busy || isPaused} onClick={() => apply((e) => unskipEntry(e, v.index), v.index)}>Undo skip</Button>
                )}
              </div>
            </Card>
          ))}
        </div>

        <div className="stack">
          <Card variant="fit" header="Session">
            <div className="status-actions">
              <Button variant="fit" fullWidth leftIcon="check" loading={busy} disabled={!progress.canFinish} onClick={finish}>Finish workout</Button>
              <Button variant="secondary" fullWidth disabled={busy} onClick={discard}>Discard</Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}