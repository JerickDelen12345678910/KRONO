import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useServices } from '../hooks/useServices';
import { SESSION_STATUS } from '../models/constants.js';
import { FITNESS_DISCLAIMER } from '../lib/exerciseLibrary.js';
import {
  discardMessage, elapsedSeconds, entryViews, finalizeEntries, finishMessage, logSet, progressText, sessionProgress,
  skipEntry, undoSet, unskipEntry,
} from '../lib/session.js';
import { handleError } from '../lib/errors';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { NoteBanner } from '../components/ui/NoteBanner';
import { Pill } from '../components/ui/Pill';
import { Row } from '../components/ui/Row';

/**
 * /fitness/session/:id — one workout in progress (Phase 9 PACE 4a). All rules live in src/lib/session.js; this screen renders
 * them. Every logged set is saved at once (saves run one after another, so a quick double tap cannot overwrite itself), so
 * leaving the screen loses nothing: "Start workout" on the dashboard continues the same session.
 */
export function WorkoutSession() {
  const { id } = useParams();
  const { workout } = useServices();
  const navigate = useNavigate();
  const [load, setLoad] = useState({ id: null, status: 'loading', session: null, error: '' });   // status: loading | ready | closed | missing
  const [entries, setEntries] = useState([]);
  const [saveError, setSaveError] = useState('');
  const [busy, setBusy] = useState(false);
  const entriesRef = useRef([]);                     // always the latest entries, even between two quick taps
  const saveQueue = useRef(Promise.resolve());       // saves in order

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const session = await workout.getSession(id);
        if (!alive) return;
        entriesRef.current = session.entries ?? [];
        setEntries(entriesRef.current);
        setLoad({ id, status: session.status === SESSION_STATUS.COMPLETED ? 'closed' : 'ready', session, error: '' });
      } catch (e) {
        if (alive) setLoad({ id, status: 'missing', session: null, error: handleError(e, 'fitness') });
      }
    })();
    return () => { alive = false; };
  }, [workout, id]);

  const views = useMemo(() => entryViews(entries), [entries]);
  const progress = useMemo(() => sessionProgress(entries), [entries]);
  const goBack = () => navigate('/fitness');

  /** Apply one pure change from lib/session.js, show it, and save the new entries. An impossible action changes nothing. */
  function apply(change) {
    const next = change(entriesRef.current);
    if (next === entriesRef.current) return;
    entriesRef.current = next;
    setEntries(next);
    setSaveError('');
    saveQueue.current = saveQueue.current
      .then(() => workout.saveSessionEntries(id, next))
      .catch((e) => setSaveError(handleError(e, 'fitness')));   // the next change saves everything again
  }

  async function finish() {
    const message = finishMessage(entriesRef.current);
    if (message && !window.confirm(message)) return;
    setBusy(true);
    try {
      await saveQueue.current;
      await workout.finishSession(id, {
        entries: finalizeEntries(entriesRef.current),
        activeSeconds: elapsedSeconds(load.session.startedAt),   // an estimate until PACE 4b adds the real counter
      });
      navigate('/fitness');
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

  if (load.id !== id) return <p className="empty-hint" role="status">Loading workout…</p>;

  if (load.status === 'missing' || load.status === 'closed') {
    return (
      <div>
        {load.error && <NoteBanner className="mb-3">{load.error}</NoteBanner>}
        <Card variant="fit" header={load.status === 'closed' ? 'Workout already finished' : 'Workout not found'}>
          <p className="empty-hint">
            {load.status === 'closed'
              ? 'This session is already saved in your history.'
              : 'This workout session could not be opened. It may have been discarded.'}
          </p>
          <Button variant="secondary" leftIcon="left" onClick={goBack}>Fitness</Button>
        </Card>
      </div>
    );
  }

  return (
    <div>
      {saveError && <NoteBanner className="mb-3">{saveError}</NoteBanner>}
      <div className="mb-3">
        <Button variant="ghost" size="sm" leftIcon="left" onClick={goBack}>Fitness</Button>
      </div>

      <div className="cols">
        <div className="stack">
          <Card variant="fit" header={load.session.workoutName || 'Workout'}>
            <p className="workout-meta" role="status">{progressText(progress)}</p>
            <small className="fit-note">Your progress is saved as you go.</small>
          </Card>

          {views.map((v) => (
            <Card key={v.key} variant="fit" header={<>{v.title} <Pill variant="fit">{v.badge}</Pill></>}>
              {v.target && <p className="workout-meta">{v.target}</p>}
              {v.skipped
                ? <p className="empty-hint">Skipped. Undo to bring it back.</p>
                : (
                  <div className="workout-rows">
                    {v.rows.map((r) => <Row key={r.key} time={r.set} barColor="fit" title={r.amount} subtitle={r.state} />)}
                  </div>
                )}
              <div className="status-actions">
                {v.canLog && (
                  <Button variant="fit" leftIcon="check" disabled={busy} onClick={() => apply((e) => logSet(e, v.index))}>{v.logLabel}</Button>
                )}
                {v.canUndo && (
                  <Button variant="secondary" size="sm" leftIcon="undo" disabled={busy} onClick={() => apply((e) => undoSet(e, v.index))}>Undo last set</Button>
                )}
                {v.canSkip && (
                  <Button variant="ghost" size="sm" disabled={busy} onClick={() => apply((e) => skipEntry(e, v.index))}>Skip exercise</Button>
                )}
                {v.canUnskip && (
                  <Button variant="secondary" size="sm" leftIcon="undo" disabled={busy} onClick={() => apply((e) => unskipEntry(e, v.index))}>Undo skip</Button>
                )}
              </div>
            </Card>
          ))}
        </div>

        <div className="stack">
          <Card variant="fit" header="Finish workout">
            <p className="workout-meta">
              {progress.canFinish ? 'Finish saves this session to your history.' : 'Log at least one set to finish.'}
            </p>
            <div className="status-actions">
              <Button variant="fit" fullWidth leftIcon="check" loading={busy} disabled={!progress.canFinish} onClick={finish}>Finish workout</Button>
              <Button variant="secondary" fullWidth disabled={busy} onClick={discard}>Discard workout</Button>
            </div>
          </Card>
          <small className="fit-note">{FITNESS_DISCLAIMER}</small>
        </div>
      </div>
    </div>
  );
}