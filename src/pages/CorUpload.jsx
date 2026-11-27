import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useServices } from '../hooks/useServices';
import { toLocalDate } from '../models/common.js';
import { handleError } from '../lib/errors';
import { focusDate } from '../lib/scheduleForm.js';
import {
  COR_STEPS, SAMPLE_COR, corRange, createLabel, daysLabel, detailLine, formatSize, initialSelection,
  invalidSummary, needsReview, prepareCreate, reviewSummary, sampleSubjects, subjectTitle, timeRange, toggleSelection, validateCorFile,
} from '../lib/cor.js';
import { extractCorText, CorOcrError } from '../lib/corOcr.js';
import { parseCorText } from '../lib/corParser.js';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Icon } from '../components/ui/Icon';
import { NoteBanner } from '../components/ui/NoteBanner';
import { Pill } from '../components/ui/Pill';
import { Stepper } from '../components/ui/Stepper';

export function CorUpload() {
  const navigate = useNavigate();
  const { schedule } = useServices();
  const fileInput = useRef(null);
  const requestId = useRef(0);
  const [today] = useState(() => toLocalDate());
  const [step, setStep] = useState(0);
  const [file, setFile] = useState(null);
  const [fileError, setFileError] = useState('');
  const [subjects, setSubjects] = useState([]);
  const [unparsedRows, setUnparsedRows] = useState([]);
  const [source, setSource] = useState(null);
  const [period, setPeriod] = useState(null);
  const [picked, setPicked] = useState([]);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrError, setOcrError] = useState('');
  const [created, setCreated] = useState([]);
  const [focus, setFocus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const range = corRange(today);
  const summary = reviewSummary(subjects);
  const chosen = subjects.filter((s) => picked.includes(s.id));
  const remaining = chosen.filter((s) => !created.includes(s.id)).length;
  const periodLabel = source === 'sample' ? SAMPLE_COR.period : (period?.label ?? null);

  const resetResults = () => {
    setSubjects([]);
    setUnparsedRows([]);
    setPeriod(null);
    setPicked([]);
    setCreated([]);
    setFocus(null);
  };

  const runOcr = async (sourceFile) => {
    const id = ++requestId.current;
    setOcrBusy(true);
    setOcrError('');
    resetResults();
    try {
      const text = await extractCorText(sourceFile);
      if (requestId.current !== id) return;
      const result = parseCorText(text);
      if (result.subjects.length === 0) {
        setOcrError('No classes detected. Try a clearer scan or sample COR.');
        setUnparsedRows(result.unparsedRows);
        return;
      }
      setSubjects(result.subjects);
      setPicked(initialSelection(result.subjects));
      setUnparsedRows(result.unparsedRows);
      setPeriod(result.period);
      setSource('ocr');
    } catch (e) {
      if (requestId.current !== id) return;
      setOcrError(e instanceof CorOcrError ? e.message : handleError(e, 'cor-ocr'));
    } finally {
      if (requestId.current === id) setOcrBusy(false);
    }
  };

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
    runOcr(f);
  };

  const chooseSample = () => {
    requestId.current += 1;
    setFileError('');
    setOcrError('');
    setOcrBusy(false);
    setFile({ name: SAMPLE_COR.fileName, size: SAMPLE_COR.fileSize });
    resetResults();
    const subs = sampleSubjects();
    setSubjects(subs);
    setPicked(initialSelection(subs));
    setSource('sample');
  };

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

  const fileCard = file && (
    <Card header="Selected file">
      <div className="file-item">
        <span className="cor-file-ico"><Icon name="up" size={18} aria-hidden="true" /></span>
        <div>
          <b>{file.name}</b>
          <small>{formatSize(file.size)}</small>
        </div>
      </div>
    </Card>
  );

  const uploadCard = (
    <Card variant="pri" header={<>Upload COR <span>JPG, PNG, PDF</span></>}>
      {ocrBusy && <p className="empty-hint">Reading file…</p>}
      <input ref={fileInput} type="file" accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf" hidden disabled={ocrBusy} onChange={onFile} />
      {fileError && <NoteBanner className="mb-3">{fileError}</NoteBanner>}
      {ocrError && <NoteBanner className="mb-3">{ocrError}</NoteBanner>}
      <div className="cor-actions">
        <Button variant="secondary" leftIcon="up" disabled={ocrBusy} onClick={() => fileInput.current?.click()}>Choose file</Button>
        <Button variant="secondary" disabled={ocrBusy} onClick={chooseSample}>Sample COR</Button>
      </div>
      <div className="cor-actions">
        <Button variant="secondary" leftIcon="left" disabled={ocrBusy} onClick={() => navigate('/scheduler')}>Back</Button>
        <Button disabled={!file || ocrBusy || subjects.length === 0} onClick={() => setStep(1)}>{ocrBusy ? 'Reading…' : 'Continue'}</Button>
      </div>
    </Card>
  );

  const reviewCard = (
    <Card variant="pri" header={<>Extracted classes{periodLabel && <span>{` ${periodLabel}`}</span>}</>}>
      <div className="chips">
        <Pill variant="ok">{`${summary.ready} ready`}</Pill>
        {summary.needsReview > 0 && <Pill variant="warn">{`${summary.needsReview} review`}</Pill>}
      </div>
      <div className="cor-list">
        {subjects.map((s) => {
          const low = needsReview(s);
          return (
            <label key={s.id} className={`cor-row${low ? ' warn' : ''}`}>
              <input type="checkbox" checked={picked.includes(s.id)} onChange={() => setPicked((p) => toggleSelection(p, s.id))} />
              <span className="cor-main">
                <b>{subjectTitle(s)}</b>
                <small>{`${daysLabel(s.days)} · ${timeRange(s)}`}</small>
                <small>{detailLine(s)}</small>
                {low && s.reviewNote && <small className="cor-note">{s.reviewNote}</small>}
              </span>
              {low ? <Pill variant="warn">Review</Pill> : <Pill variant="ok">Ready</Pill>}
            </label>
          );
        })}
      </div>
      {unparsedRows.length > 0 && (
        <div className="cor-list">
          {unparsedRows.map((r) => (
            <div key={`unparsed-${r.row}`} className="cor-row plain warn">
              <span className="cor-main">
                <b>{`Row ${r.row}`}</b>
                <small>{r.text}</small>
              </span>
              <Pill variant="warn">Skipped</Pill>
            </div>
          ))}
        </div>
      )}
      <div className="cor-actions">
        <Button variant="secondary" leftIcon="left" onClick={() => setStep(0)}>Back</Button>
        <Button disabled={picked.length === 0} onClick={() => { setError(''); setStep(2); }}>{`Continue (${picked.length})`}</Button>
      </div>
    </Card>
  );

  const createCard = (
    <Card variant="pri" header={<>Confirm classes{periodLabel && <span>{` ${periodLabel}`}</span>}</>}>
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
    <Card variant="pri" header="Classes added">
      <div className="chips mb-3">
        <Pill variant="ok">{`${created.length} created`}</Pill>
      </div>
      <Button fullWidth leftIcon="check" onClick={() => navigate(`/scheduler?date=${focus ?? today}`)}>Open Scheduler</Button>
    </Card>
  );

  const stepCard = done ? doneCard : [uploadCard, reviewCard, createCard][step];

  return (
    <div className="stack krono-fade-in">
      <Stepper steps={COR_STEPS} currentStep={done ? 2 : step} />
      <div className="cols">
        {fileCard && <div className="stack">{fileCard}</div>}
        <div className="stack">{stepCard}</div>
      </div>
    </div>
  );
}