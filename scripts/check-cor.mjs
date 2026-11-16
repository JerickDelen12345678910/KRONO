// Checks for the COR stepper helpers (src/lib/cor.js). Run: node scripts/check-cor.mjs   (or: npm run check)
import assert from 'node:assert/strict';
import { CATEGORIES } from '../src/models/constants.js';
import { validateSubject } from '../src/models/academic.js';
import { validateSchedule } from '../src/models/schedule.js';
import {
  COR_CATEGORY, COR_STEPS, LOW_CONFIDENCE, MAX_FILE_BYTES, corRange, createLabel, dateLabel, daysLabel, detailLine, formatSize,
  initialSelection, invalidSummary, needsReview, prepareCreate, reviewSummary, sampleSubjects, subjectTitle, subjectToInput,
  timeRange, toggleSelection, validateCorFile,
} from '../src/lib/cor.js';

let n = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); n += 1; };
const eq = (a, b, msg) => { assert.deepEqual(a, b, msg); n += 1; };

const TODAY = '2026-11-16';
const range = corRange(TODAY);

// --- setup assumptions ---
ok(CATEGORIES.includes(COR_CATEGORY), `category "${COR_CATEGORY}" must exist in CATEGORIES (src/models/constants.js)`);
eq(COR_STEPS, ['Upload', 'Review', 'Create'], 'three steps');

// --- sample rows ---
const subjects = sampleSubjects();
eq(subjects.length, 5, '5 sample subjects');
eq(new Set(subjects.map((s) => s.id)).size, 5, 'unique ids');
ok(subjects.every((s) => validateSubject(s).valid), 'every sample row is a valid subject');
ok(sampleSubjects() !== sampleSubjects(), 'a fresh copy each call');
eq(subjects.filter(needsReview).map((s) => s.code), ['CS 230'], 'exactly one low-confidence row');
ok(subjects.find((s) => s.code === 'CS 230').confidence < LOW_CONFIDENCE, 'it is below the threshold');
ok(!needsReview({ confidence: LOW_CONFIDENCE }), 'the threshold itself is ready');

// --- selection ---
const start = initialSelection(subjects);
eq(start.length, 4, 'low-confidence row starts unticked');
ok(!start.includes('cor-sample-4'), 'CS 230 not ticked');
const added = toggleSelection(start, 'cor-sample-4');
ok(added.includes('cor-sample-4') && added.length === 5, 'toggle adds');
ok(!toggleSelection(added, 'cor-sample-4').includes('cor-sample-4'), 'toggle removes');
eq(start.length, 4, 'toggle does not mutate');
eq(reviewSummary(subjects), { total: 5, needsReview: 1, ready: 4 }, 'summary');

// --- text ---
eq(daysLabel([4, 1]), 'Mon, Thu', 'days sorted and named');
eq(daysLabel([]), '', 'no days');
ok(/^8:00.*–9:30/.test(timeRange(subjects[0])), 'time range');
eq(subjectTitle(subjects[0]), 'CS 201 · Data Structures', 'title');
eq(subjectTitle({ code: '', name: 'Databases' }), 'Databases', 'title without code');
eq(detailLine(subjects[0]), 'Room 304 · Prof. Reyes', 'detail');
eq(detailLine({ room: '', professor: '' }), '', 'empty detail');
eq(createLabel(1), 'Create 1 schedule', 'singular');
eq(createLabel(4), 'Create 4 schedules', 'plural');
ok(dateLabel('2027-03-22').includes('2027'), 'date label has the year');
eq(formatSize(500), '500 B', 'bytes');
eq(formatSize(1536), '1.5 KB', 'KB');
eq(formatSize(1258291), '1.2 MB', 'MB');
eq(formatSize(-1), '', 'invalid size');

// --- file picker validation (name and size only) ---
for (const name of ['COR.pdf', 'scan.JPG', 'scan.jpeg', 'photo.PNG', 'my.cor.pdf']) ok(validateCorFile({ name, size: 1000 }).valid, `${name} accepted`);
for (const name of ['notes.docx', 'archive.zip', 'noext', 'pdf', '']) ok(!validateCorFile({ name, size: 1000 }).valid, `"${name}" rejected`);
ok(!validateCorFile({ name: 'a.pdf', size: 0 }).valid, 'empty file rejected');
ok(!validateCorFile({ name: 'a.pdf', size: MAX_FILE_BYTES + 1 }).valid, 'too big rejected');
ok(validateCorFile({ name: 'a.pdf', size: MAX_FILE_BYTES }).valid, 'exactly the limit is fine');
ok(!validateCorFile(null).valid, 'no file rejected');

// --- period ---
eq(range, { startDate: '2026-11-16', endDate: '2027-03-22' }, '18 weeks from today');

// --- conversion to the service input ---
const input = subjectToInput(subjects[0], range);
eq(input.title, 'CS 201 · Data Structures', 'input title');
eq(input.category, COR_CATEGORY, 'input category');
eq(input.location, 'Room 304', 'input location');
eq(input.description, 'Prof. Reyes', 'input description');
eq(input.date, null, 'repeating schedule has no single date');
eq(input.repeat.type, 'selectedDays', 'weekly selectedDays rule');
eq(input.repeat.daysOfWeek, [1, 4], 'days');
eq([input.repeat.startDate, input.repeat.endDate], [range.startDate, range.endDate], 'repeat range');
eq(input.isSample, false, 'real data, not sample');
ok(validateSchedule(input).valid, 'input passes the schedule validator');
const unsorted = subjectToInput({ ...subjects[0], days: [4, 1] }, range);
eq(unsorted.repeat.daysOfWeek, [1, 4], 'days are sorted in the input');
eq(subjects[0].days, [1, 4], 'subject not mutated');

// --- prepareCreate ---
const plan = prepareCreate(subjects, start, range);
eq(plan.items.map((i) => i.id), ['cor-sample-1', 'cor-sample-2', 'cor-sample-3', 'cor-sample-5'], 'list order, unticked row left out');
eq(plan.invalid, [], 'nothing invalid');
eq(prepareCreate(subjects, [...start].reverse(), range).items.map((i) => i.id), plan.items.map((i) => i.id), 'tick order does not matter');
eq(prepareCreate(subjects, ['unknown'], range).items, [], 'unknown ids ignored');
eq(prepareCreate(subjects, start, range, { skipIds: ['cor-sample-1', 'cor-sample-2'] }).items.map((i) => i.id), ['cor-sample-3', 'cor-sample-5'], 'already created rows are skipped on retry');
const bad = [{ ...subjects[0], endTime: '07:00' }, { ...subjects[1], days: [] }];
const badPlan = prepareCreate(bad, [bad[0].id, bad[1].id], range);
eq(badPlan.items, [], 'invalid rows are not created');
eq(badPlan.invalid.map((i) => i.id), [bad[0].id, bad[1].id], 'both reported');
ok(badPlan.invalid[0].message.length > 0, 'with a reason');
ok(invalidSummary(badPlan.invalid).includes('CS 201') && invalidSummary(badPlan.invalid).includes('+1 more') && invalidSummary(badPlan.invalid).includes('Nothing was created'), 'summary names the first, the count and says nothing was created');
eq(invalidSummary([]), '', 'no summary when valid');

// --- end to end through the real services (the only way the page writes) ---
let real = null;
try {
  const { createRepositories } = await import('../src/repositories/index.js');
  const { createServices } = await import('../src/services/index.js');
  if (typeof createRepositories === 'function' && typeof createServices === 'function') real = { createRepositories, createServices };
  else console.log('check-cor: SKIPPED the services part (createRepositories/createServices are not exported where expected)');
} catch (e) {
  if (e.code !== 'ERR_MODULE_NOT_FOUND') throw e;
  console.log(`check-cor: SKIPPED the services part (${e.message})`);
}
if (real) {
  const services = real.createServices(real.createRepositories({ userId: 'check-cor' }), { today: () => TODAY });
  for (const item of plan.items) await services.schedule.create(item.input);
  const titles = new Set(plan.items.map((i) => i.input.title));
  const defs = (await services.schedule.list()).filter((d) => titles.has(d.title));
  eq(defs.length, plan.items.length, 'one schedule per ticked class');
  ok(defs.every((d) => d.isSample === false && d.category === COR_CATEGORY && d.repeat.type === 'selectedDays'), 'saved as real, weekly, School');
  const list = await services.activity.list({ from: TODAY, to: range.endDate });
  ok(list.some((a) => String(a.title).startsWith('CS 201')), 'occurrences were generated for the new classes');
}

console.log(`check-cor OK (${n} checks)`);
