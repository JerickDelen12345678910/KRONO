import { addDays } from '../models/common.js';
import { validateSchedule } from '../models/schedule.js';
import { draftToInput, emptyDraft, setRepeatType } from './scheduleForm.js';
import { to12h } from './timeline.js';
import { normalizeAlarmSound } from '../reminders/alarmAudio.js';

export const COR_STEPS = ['Upload', 'Review', 'Create'];
export const COR_CATEGORY = 'School';
export const COR_SEMESTER_DAYS = 126;
export const LOW_CONFIDENCE = 0.7;
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
const FILE_TYPES = ['jpg', 'jpeg', 'png', 'pdf'];
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const SAMPLE_COR = { fileName: 'COR_2026_1st_Sem.pdf', fileSize: 1258291, period: '1st Sem, AY 2026–2027' };

const row = (n, code, name, days, startTime, endTime, room, professor, confidence = 0.95, reviewNote = '') => (
  { id: `cor-sample-${n}`, code, name, days, startTime, endTime, room, professor, confidence, reviewNote, alarmSound: 'chrono_chime' }
);

export const sampleSubjects = () => [
  row(1, 'CS 201', 'Data Structures and Algorithms', [1, 4], '08:00', '09:30', 'Room 304', 'Reyes'),
  row(2, 'MATH 210', 'Discrete Mathematics', [2, 5], '10:00', '11:30', 'Room 112', 'Santos'),
  row(3, 'ENG 101', 'Technical Writing', [1, 3], '13:00', '14:30', 'Room 205', 'Garcia'),
  row(4, 'CS 230', 'Database Management Systems', [3], '15:00', '16:30', 'Lab 2', 'Cruz', 0.55, 'Check time'),
  row(5, 'PE 102', 'Physical Fitness & Wellness', [5], '15:00', '16:30', 'Gym', 'Dizon'),
];

export const needsReview = (s) => s.confidence < LOW_CONFIDENCE;
export const initialSelection = (subjects) => subjects.filter((s) => !needsReview(s)).map((s) => s.id);
export const toggleSelection = (ids, id) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);

export function reviewSummary(subjects) {
  const review = subjects.filter(needsReview).length;
  return { total: subjects.length, needsReview: review, ready: subjects.length - review };
}

export const daysLabel = (days) => [...days].sort((a, b) => a - b).map((d) => DAY_NAMES[d]).filter(Boolean).join(', ');
export const timeRange = (s) => `${to12h(s.startTime)}–${to12h(s.endTime)}`;
export const subjectTitle = (s) => (s.name && s.name.trim()) || (s.code && s.code.trim()) || 'Class';
export const detailLine = (s) => [s.code, s.room, s.professor ? `Prof. ${s.professor}` : ''].filter(Boolean).join(' · ');
export const createLabel = (n) => `Create ${n} ${n === 1 ? 'schedule' : 'schedules'}`;
export const dateLabel = (d) => new Date(`${d}T00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

export function formatSize(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function validateCorFile(file) {
  const ext = /\.([a-z0-9]+)$/i.exec(String(file?.name ?? ''))?.[1]?.toLowerCase();
  if (!ext || !FILE_TYPES.includes(ext)) return { valid: false, error: 'Choose a JPG, JPEG, PNG or PDF file.' };
  if (!(file.size > 0)) return { valid: false, error: 'That file is empty. Choose another one.' };
  if (file.size > MAX_FILE_BYTES) return { valid: false, error: 'Choose a file under 10 MB.' };
  return { valid: true, error: '' };
}

export const corRange = (today) => ({ startDate: today, endDate: addDays(today, COR_SEMESTER_DAYS) });

export function subjectToInput(subject, range) {
  const descParts = [
    subject.code ? `Course Code: ${subject.code}` : '',
    subject.professor ? `Prof. ${subject.professor}` : '',
  ].filter(Boolean);

  const baseDraft = emptyDraft({ date: range.startDate });
  let draft = {
    ...baseDraft,
    title: subjectTitle(subject),
    category: COR_CATEGORY,
    description: descParts.join(' · '),
    location: subject.room ?? '',
    startTime: subject.startTime,
    endTime: subject.endTime,
    reminder: {
      ...baseDraft.reminder,
      sound: normalizeAlarmSound(subject.alarmSound || 'chrono_chime'),
    },
  };
  draft = setRepeatType(draft, 'selectedDays');
  draft = {
    ...draft,
    repeat: { ...draft.repeat, startDate: range.startDate, endDate: range.endDate, daysOfWeek: [...subject.days].sort((a, b) => a - b) },
  };
  return { ...draftToInput(draft), courseCode: subject.code ?? '', isSample: false };
}

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
