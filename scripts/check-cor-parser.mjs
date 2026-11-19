// scripts/check-cor-parser.mjs — Phase 8 PACE 1 + 3: pure COR text-parsing core (no OCR engine, no UI); PACE 3 adds the academic period.
// Run via `npm run check` (scripts/check-all.mjs imports every check-*.mjs file).
import assert from 'node:assert/strict';
import { parseCorText, detectLayout, LAYOUTS } from '../src/lib/corParser.js';
import { LOW_CONFIDENCE } from '../src/lib/cor.js';

let n = 0;
const eq = (a, b, m) => { assert.equal(a, b, m); n++; };
const deepEq = (a, b, m) => { assert.deepEqual(a, b, m); n++; };
const isOk = (c, m) => { assert.ok(c, m); n++; };
const matches = (s, re, m) => { assert.match(s, re, m); n++; };

// The real COR this layout was built from (City College, 2026-2027), exactly as text-extracted —
// wrapped cells, inconsistent spacing and the trailing fee/signature block included on purpose.
const REAL_COR = `DELEN, JERICK BERON 2026-2027
BSIS 24 - 2
# Section Code(s) Course(s) Lec Lab Tuition 
Units
Cred 
Units Time Day(s) Room
1 BSIS 24-2-A IS_104 2 3 3 3 07:00 AM - 08:30 AM 
02:00 PM - 03:00 PM
TH/T 
W/M
COM LAB 1
2 BSIS 24-2-A IS Elec_1 2 3 3 3 08:30 AM - 10:00 AM 
02:30 PM - 03:30 PM
T/TH 
T/TH
COM LAB 1
3 BSIS 24-2-A PATHFIT 4 2 0 2 2 10:00 AM - 12:00 PM T KALAPGYM
4 BSIS 24-2-A DM 103 3 0 3 3 01:00 PM - 02:00 PM T/TH
5 BSIS 24-2-A DM 102 3 0 3 3 05:30 PM - 07:00 PM TH/T
6 BSIS 24-2-A GE_3 3 0 3 3 07:00 PM - 08:30 PM TH/T
7 BSIS 24-2-A DB 102 2 3 3 3 07:00 AM - 08:00 AM 
08:00 AM - 09:00 AM
W/M 
W/M/F 
COM LAB 1 
COM LAB 1
8 BSIS 24-2-A CC 104 2 3 3 3 09:00 AM - 10:00 AM 
10:00 AM - 11:00 AM
W/M/F 
M/W
iLAB iLAB
9 BSIS 24-2-A GE Elec3 3 0 3 3 04:00 PM - 05:00 PM W/M/F 
Total (26)
TOTAL TUITION AND FEES Php 5,740.00
FORWARDED BALANCE Php 0.00
MODE OF PAYMENT Full Payment
PAYMENT
Full Payment Php 0.00
AMOUNT DUE Php 0.00
Grand Total Php 5,740.00
KEITH F. PANAHON
Registrar II
TUITION FEE Php 2,860.00
Academic Tuition Units(26) Php 2,860.00`;

// ---- layout detection ----
eq(detectLayout(REAL_COR), 'CITY_COLLEGE', 'detects the City College layout from its section code + time pattern');
eq(detectLayout('hello world, nothing here'), null, 'returns null for text with no recognized layout');
deepEq(Object.keys(LAYOUTS), ['CITY_COLLEGE'], 'only one layout is registered so far (more are additive, not a rewrite)');

const unrelated = parseCorText('hello world, nothing here');
eq(unrelated.layout, null, 'parseCorText reports no layout for unrecognized text');
deepEq(unrelated.subjects, [], 'and produces no invented subjects');

// ---- the real sample, end to end ----
const result = parseCorText(REAL_COR);
eq(result.layout, 'CITY_COLLEGE', 'parses the real sample as City College');
eq(result.unparsedRows.length, 0, 'all 9 table rows match the row pattern');
eq(result.subjects.length, 13, 'produces one candidate per weekly time-block (multi-session rows split in two)');

const blob = JSON.stringify(result.subjects);
isOk(!/Php|Registrar|TUITION|AMOUNT DUE/i.test(blob), 'the fee and signature block never reaches the candidates');

result.subjects.forEach((s) => {
  eq(s.professor, '', `${s.code}: no instructor column exists in this layout, so professor is never invented`);
  eq(s.name, '', `${s.code}: this layout never prints a descriptive title, so name stays empty (code carries it)`);
});

// Row 1 (IS_104): two sessions, one room shared by both (not duplicated in the source text).
const is104 = result.subjects.filter((s) => s.code === 'IS_104');
eq(is104.length, 2, 'IS_104 keeps its lecture and lab meeting as two separate sessions');
deepEq(is104[0].days, [2, 4], 'IS_104 session 1: Tue, Thu');
eq(is104[0].startTime, '07:00', 'IS_104 session 1 start');
eq(is104[0].endTime, '08:30', 'IS_104 session 1 end');
eq(is104[0].room, 'COM LAB 1', 'IS_104 session 1 room');
deepEq(is104[1].days, [1, 3], 'IS_104 session 2: Mon, Wed');
eq(is104[1].startTime, '14:00', 'IS_104 session 2 start (2:00 PM)');
eq(is104[1].endTime, '15:00', 'IS_104 session 2 end (3:00 PM)');
eq(is104[1].room, 'COM LAB 1', 'IS_104 session 2 room (shared, not duplicated in the source)');
is104.forEach((s) => isOk(s.confidence >= LOW_CONFIDENCE, `${s.id} is a clean read, not flagged for review`));

// Row 3 (PATHFIT 4): the trailing "4" is part of the course code, not mistaken for a unit column.
const pathfit = result.subjects.find((s) => s.code === 'PATHFIT 4');
isOk(Boolean(pathfit), 'PATHFIT 4 is recognized as one course code, including its trailing number');
deepEq(pathfit.days, [2], 'PATHFIT 4: Tue only');
eq(pathfit.startTime, '10:00', 'PATHFIT 4 start');
eq(pathfit.endTime, '12:00', 'PATHFIT 4 end');
eq(pathfit.room, 'KALAPGYM', 'PATHFIT 4 room');

// Rows with no room column at all come back empty, never guessed.
['DM 103', 'DM 102', 'GE_3', 'GE Elec3'].forEach((code) => {
  const s = result.subjects.find((x) => x.code === code);
  isOk(Boolean(s), `${code} was parsed`);
  eq(s.room, '', `${code} has no room in the source, so room stays empty`);
});

// Row 7 (DB 102): room text "COM LAB 1 COM LAB 1" is a genuine duplicate, split one-per-session.
const db102 = result.subjects.filter((s) => s.code === 'DB 102');
eq(db102.length, 2, 'DB 102 keeps its two sessions');
eq(db102[0].room, 'COM LAB 1', 'DB 102 session 1 room');
eq(db102[1].room, 'COM LAB 1', 'DB 102 session 2 room');
deepEq(db102[1].days, [1, 3, 5], 'DB 102 session 2: Mon, Wed, Fri');

// Row 8 (CC 104): "iLAB iLAB" is the same duplicate pattern with a different room name.
const cc104 = result.subjects.filter((s) => s.code === 'CC 104');
eq(cc104.length, 2, 'CC 104 keeps its two sessions');
eq(cc104[0].room, 'iLAB', 'CC 104 session 1 room');
eq(cc104[1].room, 'iLAB', 'CC 104 session 2 room');

// ---- robustness: bad input is flagged or reported, never silently guessed ----
const badDay = parseCorText(
  '1 BSIS 24-2-A XX 100 2 3 3 3 08:00 AM - 09:00 AM ZZ ROOM 1',
  { layoutId: 'CITY_COLLEGE' },
);
eq(badDay.subjects.length, 1, 'an unrecognized day token still produces a row to review');
isOk(badDay.subjects[0].confidence < LOW_CONFIDENCE, 'an unrecognized day token drops confidence below the review line');
matches(badDay.subjects[0].reviewNote, /check days/i, 'and the row says what to check');

const badTime = parseCorText(
  '1 BSIS 24-2-A XX 100 2 3 3 3 09:00 AM - 08:00 AM M ROOM 1',
  { layoutId: 'CITY_COLLEGE' },
);
isOk(badTime.subjects[0].confidence < LOW_CONFIDENCE, 'an end time before the start time drops confidence below the review line');
matches(badTime.subjects[0].reviewNote, /check time/i, 'and the row says what to check');

const garbled = parseCorText('1 BSIS 24-2-A this is not a real row at all', { layoutId: 'CITY_COLLEGE' });
eq(garbled.subjects.length, 0, 'a line that never matches the table pattern creates no invented subject');
eq(garbled.unparsedRows.length, 1, 'it is reported as unparsed instead');
eq(garbled.unparsedRows[0].row, '1', 'with its row number kept for the review step');

// ---- academic period (Phase 8 PACE 3): only what the page header actually prints ----
deepEq(result.period, { startYear: 2026, endYear: 2027, semester: null, label: 'AY 2026–2027' },
  'the real sample prints a school year but no semester: the period carries the year only, never an invented semester');
eq(unrelated.period, null, 'unrecognized text has no period');
eq(badDay.period, null, 'a bare table row with no header has no period');

const ROW_LINE = '1 BSIS 24-2-A GE_3 3 0 3 3 07:00 PM - 08:30 PM TH/T';
const withHeader = (header) => parseCorText(`${header}\n${ROW_LINE}`);
deepEq(withHeader('First Semester, A.Y. 2026 - 2027').period,
  { startYear: 2026, endYear: 2027, semester: '1st Sem', label: '1st Sem, AY 2026–2027' },
  'semester and school year together, with spaced or en-dash separators accepted');
eq(withHeader('SECOND SEMESTER 2026–2027').period.semester, '2nd Sem', 'recognizes second semester');
eq(withHeader('2nd Sem SY 2027-2028').period.label, '2nd Sem, AY 2027–2028', 'recognizes the short "2nd Sem" form');
eq(withHeader('Summer 2026-2027').period.semester, 'Summer', 'recognizes summer');
eq(withHeader('Mid-Year 2026-2027').period.semester, 'Midyear', 'recognizes midyear spelled with a hyphen');
deepEq(withHeader('1st Semester').period, { startYear: null, endYear: null, semester: '1st Sem', label: '1st Sem' },
  'a semester with no printed year is kept as a semester only');
eq(withHeader('Student Name 2026-2028').period, null, 'two years that are not consecutive are not a school year');
eq(withHeader('BSIS 24 - 2').period, null, 'a section code like "24 - 2" is not a school year');
eq(withHeader('Student Name').period, null, 'a header with neither a year nor a semester gives no period');
eq(parseCorText(`Student Name\n${ROW_LINE}\nTOTAL TUITION AND FEES Php 5,740.00\nValid 2025-2026 First Semester`).period, null,
  'a year or semester printed after the table (fee block) is never used');
eq(parseCorText(`Student Name\n${ROW_LINE} 2025-2026 Summer`).period, null,
  'text inside a table row is never used');
eq(withHeader('First Semester 2026-2027').subjects.length, 1, 'reading the period never changes the parsed classes');

// ---- Phase 8 PACE 2b: the same COR read LINE BY LINE (what a reader or an OCR engine sees) ----
// REAL_COR above is the PDF's internal text order: each cell column printed one after the other (times, then
// days, then rooms). A rendered page / OCR reads row by row instead, so a course's second meeting sits on its
// own line with ITS days beside it. Before PACE 2b this order gave wrong days ("IS_104" came back Mon/Wed
// instead of Tue/Thu); both orders must now give the identical result.
const VISUAL_COR = `Page 1
XXXXX, XXXXXX XXXXX 2026-2027
BSIS 24 - 2
Tuition Cred
# Section Code(s) Course(s) Lec Lab Time Day(s) Room
Units Units
1 BSIS 24-2-A IS_104 2 3 3 3 07:00 AM - 08:30 AM TH/T COM LAB 1
02:00 PM - 03:00 PM W/M
2 BSIS 24-2-A IS Elec_1 2 3 3 3 08:30 AM - 10:00 AM T/TH COM LAB 1
02:30 PM - 03:30 PM T/TH
3 BSIS 24-2-A PATHFIT 4 2 0 2 2 10:00 AM - 12:00 PM T KALAP-
GYM
4 BSIS 24-2-A DM 103 3 0 3 3 01:00 PM - 02:00 PM T/TH
5 BSIS 24-2-A DM 102 3 0 3 3 05:30 PM - 07:00 PM TH/T
6 BSIS 24-2-A GE_3 3 0 3 3 07:00 PM - 08:30 PM TH/T
7 BSIS 24-2-A DB 102 2 3 3 3 07:00 AM - 08:00 AM W/M COM LAB 1
08:00 AM - 09:00 AM W/M/F COM LAB 1
8 BSIS 24-2-A CC 104 2 3 3 3 09:00 AM - 10:00 AM W/M/F iLAB iLAB
10:00 AM - 11:00 AM M/W
9 BSIS 24-2-A GE Elec3 3 0 3 3 04:00 PM - 05:00 PM W/M/F
Total (26)`;

const project = (r) => r.subjects.map((s) => [s.id, s.code, s.days, s.startTime, s.endTime, s.room, s.confidence, s.reviewNote]);
const visual = parseCorText(VISUAL_COR);
eq(visual.layout, 'CITY_COLLEGE', 'the line-by-line text is recognized as City College too');
eq(visual.unparsedRows.length, 0, 'every row is read in line-by-line order');
deepEq(project(visual), project(result), 'line-by-line order and the PDF text order give the identical 13 sessions');
deepEq(visual.subjects[0].days, [2, 4], 'IS_104 session 1 stays Tue, Thu in line-by-line order (it used to come back Mon, Wed)');
deepEq(visual.subjects[1].days, [1, 3], 'IS_104 session 2 stays Mon, Wed in line-by-line order (it used to come back with no days)');
eq(visual.subjects.find((s) => s.code === 'PATHFIT 4').room, 'KALAPGYM', 'a room wrapped mid-word onto the next line (KALAP- / GYM) is rejoined');
isOk(visual.subjects.every((s) => s.confidence >= LOW_CONFIDENCE), 'no row of the real COR is flagged for review in either order');
eq(visual.period.label, 'AY 2026–2027', 'the period is read the same way in both orders');

const rowL = (tail) => parseCorText(`1 BSIS 24-2-A XX 100 2 3 3 3 ${tail}`, { layoutId: 'CITY_COLLEGE' }).subjects;
deepEq(rowL('08:00 AM - 09:00 AM T/TH COM LAB 1 01:00 PM - 02:00 PM W/M').map((s) => [s.days, s.room]), [[[2, 4], 'COM LAB 1'], [[1, 3], 'COM LAB 1']], 'line by line: each meeting takes its own day group, and the shared room stays whole');
deepEq(rowL('08:00 AM - 09:00 AM T/TH 01:00 PM - 02:00 PM W/M').map((s) => s.days), [[2, 4], [1, 3]], 'line by line with no room at all');
deepEq(rowL('08:00 AM - 09:00 AM 01:00 PM - 02:00 PM T/TH W/M iLAB iLAB').map((s) => [s.days, s.room]), [[[2, 4], 'iLAB'], [[1, 3], 'iLAB']], 'column by column still reads the same');
const garbledDays = rowL('08:00 AM - 09:00 AM TH/I COM LAB 1');
eq(garbledDays[0].room, 'COM LAB 1', 'a garbled day group ("TH/I") never leaks into the room');
isOk(garbledDays[0].confidence < LOW_CONFIDENCE, 'and the row is flagged for review instead of guessed');
const missingDay = rowL('08:00 AM - 09:00 AM T/TH COM LAB 1 01:00 PM - 02:00 PM');
isOk(missingDay[1].confidence < LOW_CONFIDENCE, 'a meeting whose day group was not read is flagged for review');
matches(missingDay[1].reviewNote, /check days/i, 'and says to check the days');

// ---- Phase 8 PACE 2b: real Tesseract OCR output (the COR rendered at ~300 dpi, name redacted), stray marks and all ----
// Tesseract printed "COMLAB 1", "~~" and "‘T/TH" and a trailing "_" on a day group; none of that may change the schedule.
const OCR_COR_300 = `XXXXX, XXXXXX XXXXX 2026-2027
BSIS 24 - 2
# Section Code(s) Course(s) Lec Lab Ton pred Time Day(s) Room
1 BSIS 24-2-A IS_104 2 3 3 3 07:00 AM- 08:30 AM TH/T COMLAB 1
02:00 PM - 03:00 PM W/M
2 BSIS 24-2-A IS Elec_1 2 3 3 3 08:30 AM- 10:00AM T/TH COMLAB 1
02:30 PM- 03:30 PM ‘T/TH
3 BSIS 24-2-A PATHFIT 4 2 0 2 2 10:00 AM - 12:00 PM T KALAP-
GYM
4 BSIS 24-2-A DM 103 3 0 3 3 01:00 PM-02:00 PM~ T/TH
5 BSIS 24-2-A DM 102 3 0 3 3 05:30 PM-07:00 PM ~~ TH/T
6 BSIS 24-2-A GE_3 3 0 3 3 07:00 PM- 08:30 PM ~~ TH/T
7 BSIS 24-2-A DB 102 2 3 3 3 07:00 AM-08:00 AM W/M COMLAB 1
08:00 AM - 09:00 AM W/M/F COMLAB 1
8 BSIS 24-2-A CC 104 2 3 3 3 09:00 AM- 10:00 AM W/M/F_ iLAB iLAB
10:00 AM - 11:00 AM M/W
9 BSIS 24-2-A GE Elec3 3 0 3 3 04:00 PM- 05:00 PM W/M/F
Total (26)
TUITION FEE Php 2,860.00 TOTAL TUITION AND FEES Php 5,740.00`;
const fromOcr = parseCorText(OCR_COR_300);
eq(fromOcr.layout, 'CITY_COLLEGE', 'real OCR output is recognized as City College');
eq(fromOcr.unparsedRows.length, 0, 'every row of the real OCR output is read');
deepEq(project(fromOcr).map(([, code, days, start, end]) => [code, days, start, end]),
  project(result).map(([, code, days, start, end]) => [code, days, start, end]),
  'real OCR output gives the same 13 classes, days and times as the PDF text, despite the stray marks');
isOk(fromOcr.subjects.every((s) => s.confidence >= LOW_CONFIDENCE), 'and none is flagged: every read was correct');
eq(fromOcr.subjects.find((s) => s.code === 'CC 104' && s.startTime === '09:00').days.join(), '1,3,5', 'a day group with a stray "_" after it (W/M/F_) still counts as Mon, Wed, Fri');
eq(fromOcr.subjects.find((s) => s.code === 'IS Elec_1' && s.startTime === '14:30').days.join(), '2,4', 'a day group with a stray quote before it (‘T/TH) still counts as Tue, Thu');

deepEq(rowL('08:00 AM - 09:00 AM ~~ T/TH').map((s) => [s.days, s.room]), [[[2, 4], '']], 'a lone stray mark is dropped, not read as a room');
deepEq(rowL('08:00 AM - 09:00 AM = T/TH COM LAB 1').map((s) => [s.days, s.room]), [[[2, 4], 'COM LAB 1']], 'a mark in front of the day group does not hide it');
const noSlash = rowL('08:00 AM - 09:00 AM THT COM LAB 1');
isOk(noSlash[0].confidence < LOW_CONFIDENCE, 'a day group OCR mangled beyond recognition (THT) is flagged for review, not guessed');
eq(noSlash[0].days.length, 0, 'and no days are invented for it');

console.log(`check-cor-parser OK (${n} checks)`);