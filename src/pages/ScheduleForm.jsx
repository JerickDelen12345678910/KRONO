import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useServices } from '../hooks/useServices';
import { CATEGORIES, REMINDER_OFFSETS } from '../models/constants.js';
import { isDate } from '../models/common.js';
import { draftFromSchedule, draftToInput, emptyDraft, focusDate, setRepeatType, toggleDay, validateDraft } from '../lib/scheduleForm.js';
import { ERROR_CODE, handleError, isAppError } from '../lib/errors';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { FilterChips } from '../components/ui/FilterChips';
import { FormField } from '../components/ui/FormField';
import { NoteBanner } from '../components/ui/NoteBanner';
import { ToggleSwitch } from '../components/ui/ToggleSwitch';

const CATEGORY_OPTIONS = CATEGORIES.map((c) => ({ value: c, label: c }));
const REPEAT_OPTIONS = [
  ['none', 'Does not repeat'], ['daily', 'Every day'], ['weekly', 'Every week'],
  ['selectedDays', 'Selected days of the week'], ['custom', 'Custom (every N days)'],
];
const WEEKDAYS = [[0, 'S', 'Sunday'], [1, 'M', 'Monday'], [2, 'T', 'Tuesday'], [3, 'W', 'Wednesday'], [4, 'T', 'Thursday'], [5, 'F', 'Friday'], [6, 'S', 'Saturday']];
const unit = (type) => (type === 'daily' || type === 'custom' ? 'days' : 'weeks');
const offsetLabel = (m) => (m === 0 ? 'At start time' : `${m} min before`);

export function ScheduleForm() {
  const { id } = useParams();
  const editing = Boolean(id);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { schedule } = useServices();

  const [draft, setDraft] = useState(() => emptyDraft(isDate(params.get('date')) ? { date: params.get('date') } : {}));
  const [version, setVersion] = useState(null);
  const [loading, setLoading] = useState(editing);
  const [missing, setMissing] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!id) return undefined;
    let alive = true;
    schedule.get(id).then((s) => {
      if (!alive) return;
      if (s) { setDraft(draftFromSchedule(s)); setVersion(s.version); } else setMissing(true);
      setLoading(false);
    });
    return () => { alive = false; };
  }, [id, schedule]);

  const set = (key) => (e) => setDraft((d) => ({ ...d, [key]: e.target.value }));
  const setRepeat = (key) => (e) => setDraft((d) => ({ ...d, repeat: { ...d.repeat, [key]: e.target.value } }));
  const setReminder = (key, value) => setDraft((d) => ({ ...d, reminder: { ...d.reminder, [key]: value } }));
  // After the first Save attempt, errors update live as the user fixes the fields.
  const errors = submitted ? validateDraft(draft).errors : {};
  const invalid = (key) => (errors[key] ? { 'aria-invalid': true } : {});

  const save = async (e) => {
    e.preventDefault();
    setSubmitted(true);
    setFormError('');
    if (!validateDraft(draft).valid) return;
    setBusy(true);
    try {
      const input = draftToInput(draft);
      const saved = editing ? await schedule.update(id, input, { expectedVersion: version }) : await schedule.create(input);
      navigate(`/scheduler?date=${focusDate(saved)}`);
    } catch (err) {
      if (isAppError(err) && err.code === ERROR_CODE.VALIDATION) setFormError(Object.values(err.details.errors ?? {})[0] ?? 'Some fields need attention.');
      else setFormError(handleError(err, 'schedule-form'));
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm('Delete this schedule and all of its items? This cannot be undone.')) return;
    try { await schedule.remove(id); navigate('/scheduler'); } catch (err) { setFormError(handleError(err, 'schedule-form')); }
  };

  if (loading) return <p className="empty-hint" role="status">Loading…</p>;
  if (missing) {
    return (
      <div className="stack">
        <NoteBanner>That schedule could not be found. It may have been deleted.</NoteBanner>
        <Button variant="secondary" onClick={() => navigate('/scheduler')}>Back to Scheduler</Button>
      </div>
    );
  }

  const repeating = draft.repeat.type !== 'none';
  const weekly = draft.repeat.type === 'weekly' || draft.repeat.type === 'selectedDays';
  const offsets = REMINDER_OFFSETS.includes(Number(draft.reminder.offsetMinutes)) ? REMINDER_OFFSETS : [...REMINDER_OFFSETS, Number(draft.reminder.offsetMinutes)].sort((a, b) => a - b);

  return (
    <form className="stack" onSubmit={save} noValidate>
      <h3 className="section-divider">{editing ? 'Edit schedule' : 'New schedule'}</h3>
      {formError && <NoteBanner>{formError}</NoteBanner>}
      {Object.keys(errors).length > 0 && <NoteBanner>Please fix the highlighted fields.</NoteBanner>}

      <div className="cols">
        <div className="stack">
          <Card header="Details">
            <div className="form-grid">
              <FormField label="Title" error={errors.title}>
                <input value={draft.title} onChange={set('title')} placeholder="e.g. Data Structures" maxLength={120} {...invalid('title')} />
              </FormField>
              <FormField as="div" label="Category" error={errors.category}>
                <FilterChips label="Category" options={CATEGORY_OPTIONS} value={draft.category} onChange={(category) => setDraft((d) => ({ ...d, category }))} />
              </FormField>
              {!repeating && (
                <FormField label="Date" error={errors.date}>
                  <input type="date" value={draft.date ?? ''} onChange={set('date')} {...invalid('date')} />
                </FormField>
              )}
              <FormField label="Location (optional)">
                <input value={draft.location} onChange={set('location')} placeholder="e.g. Room 304" />
              </FormField>
              <FormField label="Notes (optional)">
                <textarea rows={3} value={draft.description} onChange={set('description')} />
              </FormField>
            </div>
          </Card>
        </div>

        <div className="stack">
          <Card header="Time">
            <div className="row-2">
              <FormField label="Starts" error={errors.startTime}>
                <input type="time" value={draft.startTime} onChange={set('startTime')} {...invalid('startTime')} />
              </FormField>
              <FormField label="Ends" error={errors.endTime}>
                <input type="time" value={draft.endTime} onChange={set('endTime')} {...invalid('endTime')} />
              </FormField>
            </div>
          </Card>

          <Card header="Repeat">
            <div className="form-grid">
              <FormField label="How often" error={errors.repeat}>
                <select value={draft.repeat.type} onChange={(e) => setDraft((d) => setRepeatType(d, e.target.value))}>
                  {REPEAT_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </FormField>
              {repeating && (
                <>
                  <FormField label={`Every how many ${unit(draft.repeat.type)}?`} error={errors.interval}>
                    <input type="number" min="1" max="365" value={draft.repeat.interval} onChange={setRepeat('interval')} {...invalid('interval')} />
                  </FormField>
                  {weekly && (
                    <FormField as="div" label="On these days" error={errors.daysOfWeek}>
                      <div className="chips">
                        {WEEKDAYS.map(([day, letter, name]) => (
                          <button key={day} type="button" title={name} aria-label={name} aria-pressed={draft.repeat.daysOfWeek.includes(day)}
                            className={`chip${draft.repeat.daysOfWeek.includes(day) ? ' active' : ''}`}
                            onClick={() => setDraft((d) => toggleDay(d, day))}>{letter}</button>
                        ))}
                      </div>
                    </FormField>
                  )}
                  <div className="row-2">
                    <FormField label="From" error={errors.repeatStart}>
                      <input type="date" value={draft.repeat.startDate ?? ''} onChange={setRepeat('startDate')} {...invalid('repeatStart')} />
                    </FormField>
                    <FormField label="Until" error={errors.repeatEnd}>
                      <input type="date" value={draft.repeat.endDate ?? ''} onChange={setRepeat('endDate')} {...invalid('repeatEnd')} />
                    </FormField>
                  </div>
                </>
              )}
            </div>
          </Card>

          <Card header="Reminder">
            <div className="list-row">
              <div className="row-content"><b className="row-title">Remind me</b><small className="row-subtitle">Notification before it starts</small></div>
              <ToggleSwitch checked={draft.reminder.enabled} onChange={(v) => setReminder('enabled', v)} aria-label="Remind me" />
            </div>
            {draft.reminder.enabled && (
              <>
                <div className="list-row">
                  <div className="row-content"><b className="row-title">Also sound an alarm</b><small className="row-subtitle">Android only</small></div>
                  <ToggleSwitch checked={draft.reminder.useAlarm} onChange={(v) => setReminder('useAlarm', v)} aria-label="Also sound an alarm" />
                </div>
                <FormField label="When" error={errors.reminder}>
                  <select value={draft.reminder.offsetMinutes} onChange={(e) => setReminder('offsetMinutes', Number(e.target.value))}>
                    {offsets.map((m) => <option key={m} value={m}>{offsetLabel(m)}</option>)}
                  </select>
                </FormField>
              </>
            )}
          </Card>
        </div>
      </div>

      <div className="form-actions">
        <Button type="submit" disabled={busy}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Save schedule'}</Button>
        <Button variant="secondary" onClick={() => navigate(-1)}>Cancel</Button>
        {editing && <Button variant="secondary" onClick={remove}>Delete</Button>}
      </div>
    </form>
  );
}

