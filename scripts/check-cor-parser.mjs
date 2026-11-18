// scripts/check-cor-parser.mjs — Phase 8 PACE 1: pure COR text-parsing core (no OCR engine, no UI).
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

console.log(`check-cor-parser OK (${n} checks)`);