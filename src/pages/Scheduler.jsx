import { useEffect, useMemo, useState } from 'react';
import { Route, Routes, useNavigate, useSearchParams } from 'react-router-dom';
import { useServices } from '../hooks/useServices';
import { CATEGORIES, CATEGORY_COLOR } from '../models/constants.js';
import { isDate, toLocalDate } from '../models/common.js';
import { dateOf, findOverlaps, formatRange, timeOf, to12h, weekDates } from '../lib/timeline.js';
import { dayCounts, monthGrid, pickDayInMonth, shiftView, viewRange, viewTitle, yearMonths } from '../lib/calendar.js';
import { handleError } from '../lib/errors';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { FilterChips } from '../components/ui/FilterChips';
import { Icon } from '../components/ui/Icon';
import { MonthGrid } from '../components/ui/MonthGrid';
import { NoteBanner } from '../components/ui/NoteBanner';
import { Pill } from '../components/ui/Pill';
import { SegmentedControl } from '../components/ui/SegmentedControl';
import { Timeline } from '../components/ui/Timeline';
import { WeekStrip } from '../components/ui/WeekStrip';
import { YearGrid } from '../components/ui/YearGrid';
import { ScheduleForm } from './ScheduleForm';

const VIEWS = [{ value: 'day', label: 'Day' }, { value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }, { value: 'year', label: 'Year' }];
const FILTERS = [{ value: 'All', label: 'All' }, ...CATEGORIES.map((c) => ({ value: c, label: c }))];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const repeatLabel = (r) => (r.type === 'none' ? 'none' : r.type === 'selectedDays' ? r.daysOfWeek.map((d) => DOW[d]).join(', ') : r.type);
const longDate = (d) => new Date(`${d}T00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
const cap = (s) => `${s[0].toUpperCase()}${s.slice(1)}`;

function SchedulerHome() {
  const navigate = useNavigate();
  const { schedule, activity } = useServices();
  const [params] = useSearchParams();
  const [now, setNow] = useState(() => new Date());
  const [selected, setSelected] = useState(() => (isDate(params.get('date')) ? params.get('date') : toLocalDate()));
  const [view, setView] = useState('week');
  const [category, setCategory] = useState('All');
  const [pickedId, setPickedId] = useState(null);
  const [data, setData] = useState({ items: [], defs: [], loading: true, error: '' });

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(t);
  }, []);

  const today = toLocalDate(now);
  const { from, to } = useMemo(() => viewRange(view, selected), [view, selected]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [items, defs] = await Promise.all([
          activity.list({ from, to, category: category === 'All' ? undefined : category }),
          schedule.list(),
        ]);
        if (alive) setData({ items, defs, loading: false, error: '' });
      } catch (e) {
        if (alive) setData((d) => ({ ...d, loading: false, error: handleError(e, 'scheduler') }));
      }
    })();
    return () => { alive = false; };
  }, [activity, schedule, from, to, category]);

  const dayItems = data.items.filter((a) => dateOf(a.startsAt) === selected);
  const counts = useMemo(() => dayCounts(data.items), [data.items]);
  const overlaps = findOverlaps(dayItems);
  const current = dayItems.find((a) => a.id === pickedId) ?? dayItems[0] ?? null;
  const def = current ? data.defs.find((s) => s.id === current.refs.scheduleId) : null;
  const legend = CATEGORIES.map((c) => [c, data.defs.filter((s) => s.category === c).length]).filter(([, n]) => n > 0);

  const go = (n) => { setSelected((d) => shiftView(view, d, n)); setPickedId(null); };
  const pickDay = (d) => { setSelected(d); setPickedId(null); };

  const dayCard = (
    <Card variant="pri" header={<>{longDate(selected)} <span>{dayItems.length} {dayItems.length === 1 ? 'item' : 'items'}</span></>}>
      {!data.loading && dayItems.length === 0 && <p className="empty-hint">Nothing scheduled for this day.</p>}
      <Timeline items={dayItems} selectedId={current?.id} onSelect={setPickedId} now={selected === today ? now : null} />
    </Card>
  );

  const cocActions = (
    <Button variant="secondary" fullWidth leftIcon="up" onClick={() => navigate('/scheduler/cor')}>Upload COR to build class schedule</Button>
  );

  const reminderCard = current && def && (
    <Card header={<>Reminder <span>{current.title}</span></>}>
      <div className="detail-pills">
        <Pill variant="fit">{def.reminder.enabled ? (def.reminder.useAlarm ? 'Notify + alarm' : 'Notify only') : 'Reminder off'}</Pill>
        {def.reminder.enabled && <Pill variant="fit">{def.reminder.offsetMinutes === 0 ? 'At start time' : `${def.reminder.offsetMinutes} min before`}</Pill>}
        <Pill variant="fit">{`Repeat: ${repeatLabel(def.repeat)}`}</Pill>
      </div>
      <Button variant="secondary" fullWidth leftIcon="edit" className="mt-3" onClick={() => navigate(`/scheduler/edit/${def.id}`)}>Edit schedule</Button>
    </Card>
  );

  const overlapNote = overlaps.length > 0 && (
    <NoteBanner>
      {`${overlaps[0].a.title} and ${overlaps[0].b.title} overlap at ${to12h(overlaps[0].at)}.${overlaps.length > 1 ? ` (+${overlaps.length - 1} more)` : ''} You can still save both.`}
    </NoteBanner>
  );

  const agenda = (
    <Card header={<>{longDate(selected)} <span>{dayItems.length} {dayItems.length === 1 ? 'item' : 'items'}</span></>}>
      {dayItems.length === 0 && <p className="empty-hint">Nothing scheduled for this day.</p>}
      {dayItems.map((a) => (
        <div key={a.id} className="list-row" data-color={CATEGORY_COLOR[a.category] ?? 'primary'}>
          <span className="row-time">{to12h(timeOf(a.startsAt))}</span>
          <div className="row-content"><b className="row-title">{a.title}</b><small className="row-subtitle">{formatRange(a)}{a.subtitle ? ` · ${a.subtitle}` : ''}</small></div>
        </div>
      ))}
      <Button variant="secondary" fullWidth className="mt-3" onClick={() => setView('day')}>Open day</Button>
    </Card>
  );

  return (
    <div className="stack">
      <div className="page-actions">
        <Button leftIcon="plus" onClick={() => navigate(`/scheduler/new?date=${selected}`)}>New schedule</Button>
      </div>
      <h3 className="section-divider">View and filters</h3>
      {legend.length > 0 && (
        <div className="legend" aria-label="Categories">
          {legend.map(([c, n]) => <span key={c} data-color={CATEGORY_COLOR[c]}><i />{c} {n}</span>)}
        </div>
      )}
      <div className="toolbar">
        <SegmentedControl options={VIEWS} value={view} onChange={(v) => { setView(v); setPickedId(null); }} />
        <FilterChips options={FILTERS} value={category} onChange={setCategory} />
      </div>
      {data.error && <NoteBanner>{data.error}</NoteBanner>}

      <h3 className="section-divider">{cap(view)}</h3>
      <div className={view === 'year' ? 'stack' : 'cols'}>
        <div className="stack">
          <div className="cal-head">
            <b>{viewTitle(view, selected)}</b>
            <div className="cal-nav">
              <button type="button" className="cal-btn" aria-label={`Previous ${view}`} onClick={() => go(-1)}><Icon name="left" size={18} /></button>
              <button type="button" className="cal-btn text" onClick={() => pickDay(today)}>Today</button>
              <button type="button" className="cal-btn" aria-label={`Next ${view}`} onClick={() => go(1)}><Icon name="right" size={18} /></button>
            </div>
          </div>
          {view === 'week' && <WeekStrip dates={weekDates(selected)} selected={selected} today={today} busy={new Set(counts.keys())} onSelect={pickDay} />}
          {(view === 'day' || view === 'week') && dayCard}
          {view === 'month' && <MonthGrid cells={monthGrid(selected).cells} selected={selected} today={today} counts={counts} onSelect={(d) => { pickDay(d); setView('day'); }} />}
          {view === 'year' && <YearGrid months={yearMonths(selected)} today={today} counts={counts} onPickMonth={(d) => { pickDay(pickDayInMonth(d, today)); setView('month'); }} />}
        </div>

        {view !== 'year' && (
          <div className="stack">
            {(view === 'day' || view === 'week') && overlapNote}
            {cocActions}
            {(view === 'day' || view === 'week') && reminderCard}
            {view === 'month' && agenda}
          </div>
        )}
      </div>
      {view === 'year' && cocActions}
    </div>
  );
}

function CorPlaceholder() {
  const navigate = useNavigate();
  return (
    <div className="stack">
      <Card header="Upload COR">
        <p className="empty-hint">The COR upload and review steps are built in a later step of Phase 4. Nothing is uploaded yet.</p>
        <Button variant="secondary" leftIcon="left" onClick={() => navigate('/scheduler')}>Back to Scheduler</Button>
      </Card>
    </div>
  );
}

export function Scheduler() {
  return (
    <Routes>
      <Route index element={<SchedulerHome />} />
      <Route path="cor" element={<CorPlaceholder />} />
      <Route path="new" element={<ScheduleForm />} />
      <Route path="edit/:id" element={<ScheduleForm />} />
    </Routes>
  );
}
