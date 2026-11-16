// Pure helpers for the COR stepper (no React). UI only: real OCR is Phase 8, so the sample rows below stand in for parsed text.
import { addDays } from '../models/common.js';
import { validateSchedule } from '../models/schedule.js';
import { draftToInput, emptyDraft, setRepeatType } from './scheduleForm.js';
import { to12h } from './timeline.js';

export const COR_STEPS = ['Upload', 'Review', 'Create'];
export const COR_CATEGORY = 'School';          // class schedules use the School category (project plan)
export const COR_SEMESTER_DAYS = 126;          // default period for a COR: 18 weeks from today
export const LOW_CONFIDENCE = 0.7;             // below this a row is "Needs review"
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
const FILE_TYPES = ['jpg', 'jpeg', 'png', 'pdf'];
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const SAMPLE_COR = { fileName: 'COR_2026_1st_Sem.pdf', fileSize: 1258291, period: '1st Sem, AY 2026–2027' };

const row = (n, code, name, days, startTime, endTime, room, professor, confidence = 0.95, reviewNote = '') => (
  { id: `cor-sample-${n}`, code, name, days, startTime, endTime, room, professor, confidence, reviewNote }
);

/** Sample "parsed" subjects (a fresh copy each call). One row is low-confidence so the Review step shows the warning state. */
export const sampleSubjects = () => [
  row(1, 'CS 201', 'Data Structures', [1, 4], '08:00', '09:30', 'Room 304', 'Reyes'),
  row(2, 'MATH 210', 'Discrete Math', [2, 5], '10:00', '11:30', 'Room 112', 'Santos'),
  row(3, 'ENG 101', 'Technical Writing', [1, 3], '13:00', '14:30', 'Room 205', 'Garcia'),
  row(4, 'CS 230', 'Databases', [3], '15:00', '16:30', 'Lab 2', 'Cruz', 0.55, 'Check time'),
  row(5, 'PE 102', 'Physical Fitness', [5], '15:00', '16:30', 'Gym', 'Dizon'),
];

export const needsReview = (s) => s.confidence < LOW_CONFIDENCE;

/** Rows that need review start unticked; the person ticks them after checking. */
export const initialSelection = (subjects) => subjects.filter((s) => !needsReview(s)).map((s) => s.id);
export const toggleSelection = (ids, id) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);

export function reviewSummary(subjects) {
  const review = subjects.filter(needsReview).length;
  return { total: subjects.length, needsReview: review, ready: subjects.length - review };
}

// ---- text for the screen ----
export const daysLabel = (days) => [...days].sort((a, b) => a - b).map((d) => DAY_NAMES[d]).filter(Boolean).join(', ');
export const timeRange = (s) => `${to12h(s.startTime)}–${to12h(s.endTime)}`;
export const subjectTitle = (s) => [s.code, s.name].filter(Boolean).join(' · ');
export const detailLine = (s) => [s.room, s.professor ? `Prof. ${s.professor}` : ''].filter(Boolean).join(' · ');
export const createLabel = (n) => `Create ${n} ${n === 1 ? 'schedule' : 'schedules'}`;
export const dateLabel = (d) => new Date(`${d}T00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

export function formatSize(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Checks only the name and size of the picked file. Nothing is read or uploaded in this PACE. */
export function validateCorFile(file) {
  const ext = /\.([a-z0-9]+)$/i.exec(String(file?.name ?? ''))?.[1]?.toLowerCase();
  if (!ext || !FILE_TYPES.includes(ext)) return { valid: false, error: 'Choose a JPG, JPEG, PNG or PDF file.' };
  if (!(file.size > 0)) return { valid: false, error: 'That file is empty. Choose another one.' };
  if (file.size > MAX_FILE_BYTES) return { valid: false, error: 'Choose a file under 10 MB.' };
  return { valid: true, error: '' };
}

// ---- creating the schedules ----
export const corRange = (today) => ({ startDate: today, endDate: addDays(today, COR_SEMESTER_DAYS) });

/** One weekly (selectedDays) schedule per subject, in the shape ScheduleService.create expects. */
export function subjectToInput(subject, range) {
  let draft = {
    ...emptyDraft({ date: range.startDate }),
    title: subjectTitle(subject),
    category: COR_CATEGORY,
    description: subject.professor ? `Prof. ${subject.professor}` : '',
    location: subject.room ?? '',
    startTime: subject.startTime,
    endTime: subject.endTime,
  };
  draft = setRepeatType(draft, 'selectedDays');
  draft = {
    ...draft,
    repeat: { ...draft.repeat, startDate: range.startDate, endDate: range.endDate, daysOfWeek: [...subject.days].sort((a, b) => a - b) },
  };
  return { ...draftToInput(draft), isSample: false };
}

/**
 * Which schedules to create: the ticked subjects (in list order) minus `skipIds` (already created on an earlier try).
 * Nothing is created if any ticked subject is invalid: `invalid` says which and why.
 */
export function prepareCreate(subjects, pickedIds, range, { skipIds = [] } = {}) {
  const items = [];
  const invalid = [];
  for (const s of subjects) {
    if (!pickedIds.includes(s.id) || skipIds.includes(s.id)) continue;
    const input = subjectToInput(s, range);
    const { valid, errors } = validateSchedule(input);
    if (valid) items.push({ id: s.id, input });
    else invalid.push({ id: s.id, title: subjectTitle(s), message: Object.values(errors)[0] });
  }
  return { items, invalid };
}

export function invalidSummary(invalid) {
  if (invalid.length === 0) return '';
  const more = invalid.length > 1 ? ` (+${invalid.length - 1} more)` : '';
  return `${invalid[0].title}: ${invalid[0].message}${more} Nothing was created.`;
}