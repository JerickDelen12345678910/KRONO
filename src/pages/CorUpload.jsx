import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useServices } from '../hooks/useServices';
import { toLocalDate } from '../models/common.js';
import { handleError } from '../lib/errors';
import { focusDate } from '../lib/scheduleForm.js';
import {
  COR_STEPS, SAMPLE_COR, corRange, createLabel, dateLabel, daysLabel, detailLine, formatSize, initialSelection,
  invalidSummary, needsReview, prepareCreate, reviewSummary, sampleSubjects, subjectTitle, timeRange, toggleSelection, validateCorFile,
} from '../lib/cor.js';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Icon } from '../components/ui/Icon';
import { NoteBanner } from '../components/ui/NoteBanner';
import { Pill } from '../components/ui/Pill';
import { Stepper } from '../components/ui/Stepper';

// UI only: nothing is uploaded or read here (real OCR is Phase 8). The Review step shows sample classes.
export function CorUpload() {
  const navigate = useNavigate();
  const { schedule } = useServices();
  const fileInput = useRef(null);
  const [subjects] = useState(sampleSubjects);
  const [today] = useState(() => toLocalDate());
  const [step, setStep] = useState(0);
  const [file, setFile] = useState(null);          // { name, size } only: the file itself is never kept
  const [fileError, setFileError] = useState('');
  const [picked, setPicked] = useState(() => initialSelection(subjects));
  const [created, setCreated] = useState([]);      // subject ids already saved (a retry never duplicates them)
  const [focus, setFocus] = useState(null);        // earliest date to show in the Scheduler afterwards
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const range = corRange(today);
  const summary = reviewSummary(subjects);
  const chosen = subjects.filter((s) => picked.includes(s.id));
  const remaining = chosen.filter((s) => !created.includes(s.id)).length;

  const onFile = (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    const check = validateCorFile(f);
    if (!check.valid) {
      setFile(null);
      setFileError(check.error);
      return;
    }
    setFileError('');
    setFile({ name: f.name, size: f.size });
  };

  const chooseSample = () => {
    setFileError('');
    setFile({ name: SAMPLE_COR.fileName, size: SAMPLE_COR.fileSize });
  };

  // Saves one schedule per ticked class, only through the service (it generates the weekly occurrences).
  const create = async () => {
    if (busy) return;
    const plan = prepareCreate(subjects, picked, range, { skipIds: created });
    if (plan.invalid.length > 0) {
      setError(invalidSummary(plan.invalid));
      return;
    }
    setBusy(true);
    setError('');
    const made = [...created];
    let first = focus;
    try {
      for (const item of plan.items) {
        const saved = await schedule.create(item.input);
        made.push(item.id);
        const d = saved?.repeat ? focusDate(saved, today) : null;
        if (d && (!first || d < first)) first = d;
      }
      setCreated(made);
      setFocus(first);
      setDone(true);
    } catch (e) {
      setCreated(made);
      setFocus(first);
      setError(handleError(e, 'cor-create'));
    } finally {
      setBusy(false);
    }
  };

  const privacy = (
    <NoteBanner variant="info">Your COR may contain personal details. It will stay private to your account, and you will be able to delete it at any time.</NoteBanner>
  );

  const fileCard = file && (
    <Card header="Your file">
      <div className="file-item">
        <span className="cor-file-ico"><Icon name="up" size={18} aria-hidden="true" /></span>
        <div>
          <b>{file.name}</b>
          <small>{`${formatSize(file.size)} · nothing is uploaded yet`}</small>
        </div>
      </div>
    </Card>
  );

  const uploadCard = (
    <Card variant="pri" header={<>Upload your COR <span>JPG, PNG or PDF</span></>}>
      <p className="empty-hint">Nothing is uploaded or read yet: reading the text (OCR) arrives in a later phase. For now, the next steps use sample classes so you can try the flow.</p>
      <input ref={fileInput} type="file" accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf" hidden onChange={onFile} />
      {fileError && <NoteBanner className="mb-3">{fileError}</NoteBanner>}
      <div className="cor-actions">
        <Button variant="secondary" leftIcon="up" onClick={() => fileInput.current?.click()}>Choose file</Button>
        <Button variant="secondary" onClick={chooseSample}>Use sample COR</Button>
      </div>
      <div className="cor-actions">
        <Button variant="secondary" leftIcon="left" onClick={() => navigate('/scheduler')}>Back to Scheduler</Button>
        <Button disabled={!file} onClick={() => setStep(1)}>Continue</Button>
      </div>
    </Card>
  );

  const reviewCard = (
    <Card variant="pri" header={<>Review extracted classes <span>{SAMPLE_COR.period}</span></>}>
      <p className="empty-hint">These are sample classes. Tick the ones to create; classes that need review start unticked.</p>
      <div className="chips">
        <Pill variant="ok">{`${summary.ready} ready`}</Pill>
        {summary.needsReview > 0 && <Pill variant="warn">{`${summary.needsReview} needs review`}</Pill>}
      </div>
      <div className="cor-list">
        {subjects.map((s) => {
          const low = needsReview(s);
          return (
            <label key={s.id} className={`cor-row${low ? ' warn' : ''}`}>
              <input type="checkbox" checked={picked.includes(s.id)} onChange={() => setPicked((p) => toggleSelection(p, s.id))} aria-label={`Include ${subjectTitle(s)}`} />
              <span className="cor-main">
                <b>{subjectTitle(s)}</b>
                <small>{`${daysLabel(s.days)} · ${timeRange(s)}`}</small>
                <small>{detailLine(s)}</small>
                {low && s.reviewNote && <small className="cor-note">{s.reviewNote}</small>}
              </span>
              {low ? <Pill variant="warn">Needs review</Pill> : <Pill variant="ok">Ready</Pill>}
            </label>
          );
        })}
      </div>
      <div className="cor-actions">
        <Button variant="secondary" leftIcon="left" onClick={() => setStep(0)}>Back</Button>
        <Button disabled={picked.length === 0} onClick={() => { setError(''); setStep(2); }}>{`Continue with ${picked.length}`}</Button>
      </div>
    </Card>
  );

  const createCard = (
    <Card variant="pri" header={<>Create class schedules <span>{SAMPLE_COR.period}</span></>}>
      <p className="empty-hint">{`Each class repeats weekly on its days, from ${dateLabel(range.startDate)} to ${dateLabel(range.endDate)}. Reminders use your default settings.`}</p>
      <div className="cor-list">
        {chosen.map((s) => (
          <div key={s.id} className="cor-row plain">
            <span className="cor-main">
              <b>{subjectTitle(s)}</b>
              <small>{`${daysLabel(s.days)} · ${timeRange(s)}`}</small>
              <small>{detailLine(s)}</small>
            </span>
            {created.includes(s.id) && <Pill variant="ok">Created</Pill>}
          </div>
        ))}
      </div>
      {error && <NoteBanner className="mb-3">{error}</NoteBanner>}
      <div className="cor-actions">
        <Button variant="secondary" leftIcon="left" disabled={busy} onClick={() => setStep(1)}>Back</Button>
        <Button disabled={busy || remaining === 0} onClick={create}>{busy ? 'Creating…' : createLabel(remaining)}</Button>
      </div>
    </Card>
  );

  const doneCard = (
    <Card variant="pri" header={<>Class schedules created <span>{SAMPLE_COR.period}</span></>}>
      <div className="chips">
        <Pill variant="ok">{`${created.length} ${created.length === 1 ? 'schedule' : 'schedules'} created`}</Pill>
      </div>
      <p className="empty-hint mt-3">Your classes now appear in the Scheduler on their weekly days.</p>
      <Button fullWidth leftIcon="check" onClick={() => navigate(`/scheduler?date=${focus ?? today}`)}>Open Scheduler</Button>
    </Card>
  );

  const stepCard = done ? doneCard : [uploadCard, reviewCard, createCard][step];

  return (
    <div className="stack">
      <Stepper steps={COR_STEPS} currentStep={done ? 2 : step} />
      <div className="cols">
        <div className="stack">
          {fileCard}
          {privacy}
        </div>
        <div className="stack">{stepCard}</div>
      </div>
    </div>
  );
}   