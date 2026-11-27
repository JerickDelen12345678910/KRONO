import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useServices } from '../hooks/useServices';
import { useRemoteChanges } from '../hooks/useRemoteChanges';
import { toLocalDate } from '../models/common.js';
import { buildNowWidgetModel, syncPwaLiveNotification } from '../lib/scheduleWidgetBridge.js';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Pill } from '../components/ui/Pill';

const REMOTE_COLLECTIONS = ['schedules', 'occurrences'];

export function ScheduleWidgetPage() {
  const { activity } = useServices();
  const navigate = useNavigate();
  const [now, setNow] = useState(() => new Date());
  const [items, setItems] = useState([]);
  const [reload, setReload] = useState(0);
  const [pinStatus, setPinStatus] = useState('');

  useRemoteChanges(REMOTE_COLLECTIONS, () => setReload((n) => n + 1));

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(t);
  }, []);

  const today = toLocalDate(now);

  useEffect(() => {
    let alive = true;
    activity.listToday({ today }).then((rows) => {
      if (alive) setItems(rows);
    }).catch(() => {});
    return () => { alive = false; };
  }, [activity, today, reload]);

  const widget = useMemo(() => buildNowWidgetModel(items, now), [items, now]);
  const clockText = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const dateText = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

  async function pinToNotificationBar() {
    const result = await syncPwaLiveNotification(widget, { requestPermission: true });
    if (result === 'granted') {
      setPinStatus('Pinned to notification bar.');
    } else if (result === 'denied') {
      setPinStatus('Allow notifications in Chrome settings first.');
    } else {
      setPinStatus('Notifications not supported in this view.');
    }
  }

  return (
    <div style={{ maxWidth: '480px', margin: '0 auto', padding: '8px' }}>
      <Card
        variant="pri"
        header={(
          <>
            <span>{dateText} · <b>{clockText}</b></span>
            <Pill variant={widget.active ? 'ok' : 'pri'}>
              {widget.active ? 'Happening now' : widget.next ? 'Up next' : 'Free'}
            </Pill>
          </>
        )}
      >
        {widget.active ? (
          <div>
            <h2 style={{ margin: '2px 0', fontSize: '1.25rem' }}>{widget.active.title}</h2>
            <p className="row-subtitle" style={{ marginBottom: '8px' }}>
              {widget.active.timeRange}{widget.active.subtitle ? ` · ${widget.active.subtitle}` : ''} · <b>{widget.active.remainingText}</b>
            </p>
            <div style={{ height: '7px', borderRadius: '999px', background: 'var(--pri-s)', overflow: 'hidden', marginBottom: '8px' }}>
              <div style={{ width: `${widget.active.percent}%`, height: '100%', background: 'var(--pri)', transition: 'width 0.4s ease' }} />
            </div>
            {widget.next && (
              <small className="row-subtitle d-block">
                Up next: <b>{widget.next.title}</b> ({widget.next.timeRange})
              </small>
            )}
          </div>
        ) : widget.next ? (
          <div>
            <h2 style={{ margin: '2px 0', fontSize: '1.25rem' }}>{widget.next.title}</h2>
            <p className="row-subtitle" style={{ marginBottom: 0 }}>
              Starts at <b>{widget.next.timeRange}</b>{widget.next.subtitle ? ` · ${widget.next.subtitle}` : ''}
            </p>
          </div>
        ) : (
          <div>
            <h2 style={{ margin: '2px 0', fontSize: '1.15rem' }}>No schedule right now</h2>
            <p className="row-subtitle" style={{ marginBottom: 0 }}>Your schedule is open for the rest of today.</p>
          </div>
        )}

        <div className="status-actions mt-2">
          <Button size="sm" variant="pri" onClick={pinToNotificationBar}>Pin notification</Button>
          <Button size="sm" variant="secondary" onClick={() => navigate('/')}>Dashboard</Button>
        </div>
        {pinStatus && <small className="fit-note d-block mt-1">{pinStatus}</small>}
      </Card>
    </div>
  );
}