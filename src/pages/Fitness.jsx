import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useServices } from '../hooks/useServices';
import { useRemoteChanges } from '../hooks/useRemoteChanges';
import { EXERCISE_CATEGORIES } from '../models/constants.js';
import { addDays, toLocalDate } from '../models/common.js';
import { durationLabel } from '../lib/fitness.js';
import { HISTORY_LIMIT, chartModel, defaultCategory, forCategory, historyRows, kpiCards, plannedOn, workoutBlock } from '../lib/fitnessView.js';
import { discardMessage } from '../lib/session.js';
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
import { SegmentedControl } from '../components/ui/SegmentedControl';

const CATEGORY_OPTIONS = EXERCISE_CATEGORIES.map((c) => ({ value: c, label: c }));
const RANGE_OPTIONS = [
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
];
const GOAL_OPTIONS = [
  { value: 'maintain', label: 'Maintain' },
  { value: 'bulk', label: 'Bulk' },
  { value: 'cut', label: 'Cut' },
];
const MEALS_OPTIONS = [
  { value: '3', label: '3 meals' },
  { value: '4', label: '4 meals' },
  { value: '5', label: '5 meals' },
];
const shortDate = (d) => new Date(`${d}T00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
const REMOTE_COLLECTIONS = ['workouts', 'exerciseHistory', 'schedules', 'occurrences'];

function startedLabel(iso) {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return 'Started earlier';
  const hh = String(dt.getHours()).padStart(2, '0');
  const mm = String(dt.getMinutes()).padStart(2, '0');
  return `${shortDate(toLocalDate(dt))} · ${to12h(`${hh}:${mm}`)}`;
}

async function extractTextFromProgramFile(file) {
  const lower = (file.name || '').toLowerCase();
  if (file.type === 'application/pdf' || lower.endsWith('.pdf')) {
    const pdfjs = await import('pdfjs-dist');
    const workerSrc = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
    pdfjs.GlobalWorkerOptions.workerSrc = workerSrc.default;
    const buf = await file.arrayBuffer();
    const doc = await pdfjs.getDocument({ data: buf }).promise;
    const pages = [];
    for (let i = 1; i <= Math.min(doc.numPages, 8); i += 1) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      pages.push(content.items.map((it) => it.str).join(' '));
    }
    return pages.join('\n');
  }
  if (file.type.startsWith('image/')) {
    const Tesseract = await import('tesseract.js');
    const res = await Tesseract.recognize(file, 'eng');
    return res?.data?.text || '';
  }
  return await file.text();
}

function splitProgramIntoDays(rawText, library, fallbackTitle) {
  const dayHeaderRegex = /(?:^|\n|\s)(day\s*\d+|monday|tuesday|wednesday|thursday|friday|saturday|sunday|push\s*day|pull\s*day|leg\s*day)\b[:-]?/gi;
  const matches = [...rawText.matchAll(dayHeaderRegex)];
  const sections = [];

  if (matches.length > 0) {
    for (let i = 0; i < matches.length; i += 1) {
      const start = matches[i].index ?? 0;
      const end = i + 1 < matches.length ? (matches[i + 1].index ?? rawText.length) : rawText.length;
      const heading = matches[i][1].trim().replace(/\s+/g, ' ');
      const chunk = rawText.slice(start, end);
      sections.push({ heading: heading[0].toUpperCase() + heading.slice(1), text: chunk });
    }
  } else {
    sections.push({ heading: fallbackTitle, text: rawText });
  }

  return sections.map((sec, idx) => {
    const lower = sec.text.toLowerCase();
    const matched = library.filter((ex) => {
      const name = ex.name.toLowerCase();
      return lower.includes(name) || name.split(/[\s-]+/).some((tok) => tok.length >= 5 && lower.includes(tok));
    }).slice(0, 7);

    const chosen = matched.length > 0 ? matched : library.slice((idx * 3) % Math.max(1, library.length - 4), ((idx * 3) % Math.max(1, library.length - 4)) + 4);
    const setsMatch = sec.text.match(/(\d+)\s*(?:sets?|x)\s*(\d+)/i);
    const sets = setsMatch ? Math.min(10, Math.max(1, Number(setsMatch[1]))) : 3;
    const reps = setsMatch ? Math.min(100, Math.max(1, Number(setsMatch[2]))) : null;

    return {
      dayOffset: idx,
      title: sections.length > 1 ? `${sec.heading} (${fallbackTitle})` : fallbackTitle,
      category: chosen[0]?.category || 'Strength',
      items: chosen.map((ex) => ({
        exerciseId: ex.id,
        name: ex.name,
        sets,
        reps: reps ?? ex.defaultReps ?? 12,
        durationSec: ex.defaultDurationSec ?? 30,
        restSec: 60,
      })),
    };
  });
}

export function Fitness() {
  const { workout, schedule } = useServices();
  const navigate = useNavigate();
  const programInputRef = useRef(null);
  const [today, setToday] = useState(() => toLocalDate());
  const [category, setCategory] = useState(null);
  const [chartRange, setChartRange] = useState('week');
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [data, setData] = useState({ summary: null, upcoming: [], progress: null, abandoned: [], history: [], workouts: [], loading: true, error: '' });
  const [reload, setReload] = useState(0);
  const [starting, setStarting] = useState(null);
  const [discarding, setDiscarding] = useState(null);
  const [deletingAll, setDeletingAll] = useState(false);
  const [startError, setStartError] = useState('');

  const [scanningProgram, setScanningProgram] = useState(false);
  const [scanResultMsg, setScanResultMsg] = useState('');

  const [proteinForm, setProteinForm] = useState({
    weight: '70',
    unit: 'kg',
    bodyFat: '',
    goal: 'bulk',
    training: '4',
    meals: '4',
  });

  useRemoteChanges(REMOTE_COLLECTIONS, () => setReload((n) => n + 1));

  useEffect(() => {
    const t = setInterval(() => setToday(toLocalDate()), 60000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [summary, upcoming, progress, abandoned, history, workouts] = await Promise.all([
          workout.summary({ today }),
          workout.upcoming({ today, days: 14 }),
          workout.progress({ today, range: chartRange }),
          workout.listAbandonedSessions(),
          workout.listHistory(),
          workout.list(),
        ]);
        if (alive) setData({ summary, upcoming, progress, abandoned, history, workouts, loading: false, error: '' });
      } catch (e) {
        if (alive) setData((d) => ({ ...d, loading: false, error: handleError(e, 'fitness') }));
      }
    })();
    return () => { alive = false; };
  }, [workout, today, chartRange, reload]);

  const todayPlan = useMemo(() => plannedOn(data.summary?.planned, today), [data.summary, today]);
  const activeCategory = category ?? defaultCategory(todayPlan);
  const blocks = forCategory(todayPlan, activeCategory).map((p) => ({ workoutId: p.workout?.id ?? null, ...workoutBlock(p, to12h) }));
  const kpis = kpiCards(data.summary);
  const chart = data.progress ? chartModel(data.progress) : null;
  const recentRows = useMemo(
    () => historyRows(data.history, showAllHistory ? null : HISTORY_LIMIT),
    [data.history, showAllHistory],
  );
  const next = data.upcoming[0] ?? null;
  const stale = data.abandoned[0] ?? null;
  const hasAnyFitnessData = data.workouts.length > 0 || data.history.length > 0 || data.abandoned.length > 0;

  const bodyFatStatus = useMemo(() => {
    if (!proteinForm.bodyFat.trim()) return { valid: false, warning: '' };
    const bf = Number(proteinForm.bodyFat);
    if (!Number.isFinite(bf) || bf < 3 || bf > 60) {
      return { valid: false, warning: 'Enter 3–60% (using total body weight for now)' };
    }
    return { valid: true, warning: '' };
  }, [proteinForm.bodyFat]);

  const proteinTargets = useMemo(() => {
    const rawW = Math.max(30, Math.min(550, Number(proteinForm.weight) || 70));
    const weightKg = proteinForm.unit === 'lb' ? rawW * 0.45359237 : rawW;
    const bf = Number(proteinForm.bodyFat);
    const hasValidBf = proteinForm.bodyFat.trim() !== '' && Number.isFinite(bf) && bf >= 3 && bf <= 60;
    const lbmKg = hasValidBf ? weightKg * (1 - bf / 100) : null;
    const freqBonus = Number(proteinForm.training) >= 5 ? 0.1 : 0;

    let minFactor;
    let maxFactor;
    let basisKg = weightKg;
    let basisLabel = `${weightKg.toFixed(1)} kg BW`;

    if (proteinForm.goal === 'bulk') {
      minFactor = 1.6 + freqBonus;
      maxFactor = 2.2;
    } else if (proteinForm.goal === 'cut') {
      if (lbmKg) {
        minFactor = 2.3;
        maxFactor = 2.9 + freqBonus;
        basisKg = lbmKg;
        basisLabel = `${lbmKg.toFixed(1)} kg LBM`;
      } else {
        minFactor = 2.0 + freqBonus;
        maxFactor = 2.5;
      }
    } else {
      minFactor = 1.6;
      maxFactor = 2.0 + freqBonus;
      if (lbmKg && bf > 25) {
        basisKg = lbmKg * 1.15;
        basisLabel = `${lbmKg.toFixed(1)} kg LBM`;
      }
    }

    const minG = Math.round(basisKg * minFactor);
    const maxG = Math.round(basisKg * maxFactor);
    const optimalG = Math.round((minG + maxG) / 2);
    const mealsCount = Math.max(3, Math.min(6, Number(proteinForm.meals) || 4));
    const perMealG = Math.round(optimalG / mealsCount);
    const leucineThresholdG = Math.round(weightKg * 0.4);
    const proteinKcal = optimalG * 4;

    return {
      minG,
      maxG,
      optimalG,
      perMealG,
      leucineThresholdG,
      proteinKcal,
      factorRange: `${minFactor.toFixed(1)}–${maxFactor.toFixed(1)} g/kg`,
      basisLabel,
    };
  }, [proteinForm]);

  async function handleImportProgramFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setScanningProgram(true);
    setScanResultMsg('');
    setStartError('');
    try {
      const rawText = await extractTextFromProgramFile(file);
      const library = workout.listExercises({});
      const baseTitle = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim().slice(0, 40) || 'Program';
      const dayPlans = splitProgramIntoDays(rawText, library, baseTitle).slice(0, 7);

      for (const plan of dayPlans) {
        const createdWorkout = await workout.create({
          name: plan.title.slice(0, 70),
          category: plan.category,
          notes: '',
          items: plan.items,
        });
        if (schedule && createdWorkout?.id) {
          await schedule.create({
            title: plan.title.slice(0, 70),
            category: 'Fitness',
            date: addDays(today, plan.dayOffset),
            startTime: '17:00',
            endTime: '18:00',
            repeat: 'none',
            workoutId: createdWorkout.id,
          }).catch(() => {});
        }
      }
      setScanResultMsg(`Added ${dayPlans.length} day-by-day workout${dayPlans.length > 1 ? 's' : ''}.`);
      setReload((n) => n + 1);
    } catch (err) {
      setStartError(handleError(err, 'fitness'));
    } finally {
      setScanningProgram(false);
    }
  }

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

  async function discardAbandoned(session) {
    if (!session || discarding || !window.confirm(discardMessage(session.workoutName))) return;
    setDiscarding(session.id);
    setStartError('');
    try {
      await workout.discardSession(session.id);
      setReload((n) => n + 1);
    } catch (e) {
      setStartError(handleError(e, 'fitness'));
    } finally {
      setDiscarding(null);
    }
  }

  async function handleDeleteAllFitness() {
    if (deletingAll || starting || discarding) return;
    if (!window.confirm('Delete ALL workouts, sessions, and fitness history?')) return;
    setDeletingAll(true);
    setStartError('');
    try {
      await workout.removeAll();
      setReload((n) => n + 1);
    } catch (e) {
      setStartError(handleError(e, 'fitness'));
    } finally {
      setDeletingAll(false);
    }
  }

  let emptyText = `No ${activeCategory} workout today.`;
  if (todayPlan.length === 0) {
    emptyText = next
      ? `Next: ${shortDate(next.date)} · ${to12h(next.startTime)} · ${next.workout?.name || 'Workout'}`
      : 'No workout scheduled today.';
  }

  return (
    <div className="krono-fade-in">
      {(startError || data.error) && <NoteBanner className="mb-3">{startError || data.error}</NoteBanner>}

      <section aria-labelledby="fit-week-heading">
        <h3 id="fit-week-heading" className="section-divider">Overview</h3>
        <div className="kpi-grid krono-kpi-highlight">
          {kpis.map((k) => <KPICard key={k.key} variant={k.variant} label={k.label} value={k.value} subtitle={k.subtitle} />)}
        </div>
      </section>

      <section aria-labelledby="fit-plan-heading">
        <h3 id="fit-plan-heading" className="section-divider">Workouts &amp; Tools</h3>
        <div className="cols">
          <div className="stack">
            {stale && (
              <Card
                variant="fit"
                header={<>{data.abandoned.length === 1 ? 'Unfinished workout' : `Unfinished (${data.abandoned.length})`} <Pill variant="warn">Paused</Pill></>}
              >
                <div className="workout-block">
                  <b className="workout-name">{stale.workoutName || 'Workout'}</b>
                  <p className="workout-meta">{startedLabel(stale.startedAt)}</p>
                  <div className="status-actions">
                    <Button variant="fit" size="sm" leftIcon="play" disabled={discarding !== null} onClick={() => navigate(`/fitness/session/${stale.id}`)}>Resume</Button>
                    <Button variant="secondary" size="sm" loading={discarding === stale.id} disabled={discarding !== null} onClick={() => discardAbandoned(stale)}>Discard</Button>
                  </div>
                </div>
              </Card>
            )}

            <Card variant="fit" header={<>Today’s workout {activeCategory && <Pill variant="fit">{activeCategory}</Pill>}</>}>
              <div className="mb-3">
                <FilterChips options={CATEGORY_OPTIONS} value={activeCategory} onChange={setCategory} label="Workout category" />
              </div>
              {!data.loading && blocks.length === 0 && <p className="empty-hint mb-0">{emptyText}</p>}
              {blocks.map((b) => (
                <div key={b.key} className="workout-block">
                  <b className="workout-name">{b.name}</b>
                  <p className="workout-meta">{b.meta}</p>
                  <div className="workout-rows">
                    {b.rows.map((r) => <Row key={r.key} time={r.sets} barColor="fit" title={r.name} subtitle={r.rest} />)}
                  </div>
                  {b.more > 0 && <p className="workout-meta">{`+${b.more} more`}</p>}
                  <div className="workout-actions">
                    <Button variant="fit" fullWidth leftIcon="play" loading={starting === b.workoutId} disabled={!b.workoutId || starting !== null} onClick={() => startWorkout(b.workoutId)}>Start workout</Button>
                  </div>
                </div>
              ))}
            </Card>

            <Card variant="fit" header="Routines &amp; Program">
              <div className="form-grid">
                <div className="row-2">
                  <Button variant="secondary" fullWidth rightIcon="right" onClick={() => navigate('/fitness/workouts')}>My workouts</Button>
                  <Button variant="secondary" fullWidth rightIcon="right" onClick={() => navigate('/fitness/exercises')}>Exercises</Button>
                </div>
                <input
                  ref={programInputRef}
                  type="file"
                  accept="application/pdf,image/*,.txt"
                  hidden
                  onChange={handleImportProgramFile}
                />
                <Button
                  variant="secondary"
                  fullWidth
                  leftIcon="up"
                  loading={scanningProgram}
                  onClick={() => programInputRef.current?.click()}
                >
                  {scanningProgram ? 'Scanning program…' : 'Upload PDF / Photo Program'}
                </Button>
                {scanResultMsg && <small className="form-msg" role="status">{scanResultMsg}</small>}
              </div>
            </Card>

            {hasAnyFitnessData && (
              <Button variant="ghost" size="sm" fullWidth leftIcon="trash" loading={deletingAll} disabled={starting !== null || discarding !== null} onClick={handleDeleteAllFitness}>
                Reset all fitness records
              </Button>
            )}
          </div>

          <div className="stack">
            <Card variant="fit" header={<>Protein calculator <Pill variant="ok">{proteinTargets.optimalG}g / day</Pill></>}>
              <div className="form-grid">
                <div className="row-2">
                  <label className="form-field">
                    Weight
                    <div className="krono-input-group">
                      <input
                        type="number"
                        inputMode="decimal"
                        value={proteinForm.weight}
                        onChange={(e) => setProteinForm((f) => ({ ...f, weight: e.target.value }))}
                      />
                      <select
                        aria-label="Weight unit"
                        value={proteinForm.unit}
                        onChange={(e) => setProteinForm((f) => ({ ...f, unit: e.target.value }))}
                      >
                        <option value="kg">kg</option>
                        <option value="lb">lb</option>
                      </select>
                    </div>
                  </label>

                  <label className="form-field">
                    <span>Body fat % <small className="field-hint">(optional)</small></span>
                    <div className="krono-input-group">
                      <input
                        type="text"
                        inputMode="decimal"
                        maxLength={5}
                        placeholder="e.g. 15"
                        aria-label="Body fat percentage (optional)"
                        value={proteinForm.bodyFat}
                        onChange={(e) => {
                          const cleaned = e.target.value
                            .replace(/[^0-9.]/g, '')
                            .replace(/(\..*)\./g, '$1');
                          setProteinForm((f) => ({ ...f, bodyFat: cleaned }));
                        }}
                      />
                      <span className="krono-input-suffix">%</span>
                    </div>
                    {bodyFatStatus.warning && (
                      <small className="field-error">{bodyFatStatus.warning}</small>
                    )}
                  </label>
                </div>

                <div className="row-2">
                  <label className="form-field">
                    Training / wk
                    <select value={proteinForm.training} onChange={(e) => setProteinForm((f) => ({ ...f, training: e.target.value }))}>
                      <option value="3">2–3 days</option>
                      <option value="4">4 days</option>
                      <option value="5">5–6 days</option>
                    </select>
                  </label>

                  <label className="form-field">
                    Meals / day
                    <select value={proteinForm.meals} onChange={(e) => setProteinForm((f) => ({ ...f, meals: e.target.value }))}>
                      {MEALS_OPTIONS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                  </label>
                </div>

                <div className="form-field">
                  <span>Phase</span>
                  <FilterChips
                    options={GOAL_OPTIONS}
                    value={proteinForm.goal}
                    onChange={(goal) => setProteinForm((f) => ({ ...f, goal }))}
                    label="Training phase"
                  />
                </div>

                <div className="krono-macro-grid">
                  <div className="krono-macro-box is-primary">
                    <small>Daily target</small>
                    <b>{proteinTargets.optimalG}g</b>
                    <span>{proteinTargets.factorRange}</span>
                  </div>
                  <div className="krono-macro-box">
                    <small>Per meal</small>
                    <b>{proteinTargets.perMealG}g</b>
                    <span>≥{proteinTargets.leucineThresholdG}g MPS</span>
                  </div>
                  <div className="krono-macro-box">
                    <small>Optimal range</small>
                    <b>{proteinTargets.minG}–{proteinTargets.maxG}g</b>
                    <span>{proteinTargets.basisLabel}</span>
                  </div>
                  <div className="krono-macro-box">
                    <small>Protein kcal</small>
                    <b>{proteinTargets.proteinKcal}</b>
                    <span>4 kcal / g</span>
                  </div>
                </div>
              </div>
            </Card>

            <Card variant="fit" header={<>{chartRange === 'month' ? 'Monthly time' : 'Weekly time'} <span>min</span></>}>
              <div className="toolbar mb-2">
                <small className="fit-note">{chart ? `Total: ${durationLabel(chart.totalMinutes * 60)}` : ''}</small>
                <SegmentedControl options={RANGE_OPTIONS} value={chartRange} onChange={setChartRange} ariaLabel="Chart range" />
              </div>
              {chart && (
                <div role="img" aria-label={chart.description}>
                  <LineChartWidget data={chart.data} labels={chart.labels} color="var(--pri)" />
                </div>
              )}
            </Card>

            <Card variant="fit" header={<>History {data.history.length > 0 && <span>{data.history.length}</span>}</>}>
              {data.loading && <p className="empty-hint" role="status">Loading…</p>}
              {!data.loading && recentRows.length === 0 && (
                <p className="empty-hint mb-0">No completed workouts yet.</p>
              )}
              {recentRows.length > 0 && (
                <div className="workout-rows">
                  {recentRows.map((r) => <Row key={r.id} time={r.duration} barColor="fit" title={r.title} subtitle={r.subtitle} />)}
                </div>
              )}
              {data.history.length > HISTORY_LIMIT && (
                <div className="workout-actions">
                  <Button variant="ghost" size="sm" fullWidth onClick={() => setShowAllHistory((v) => !v)}>
                    {showAllHistory ? 'Show recent' : `Show all (${data.history.length})`}
                  </Button>
                </div>
              )}
            </Card>
          </div>
        </div>
      </section>
    </div>
  );
}