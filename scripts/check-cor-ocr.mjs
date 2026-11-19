// scripts/check-cor-ocr.mjs — Phase 8 PACE 2: the pure, Node-testable pieces of the COR OCR layer,
// which live in src/lib/corOcrCore.js (file-kind detection, the error type). src/lib/corOcr.js itself
// is browser-only (Vite `?url` import, canvas, Worker) and must never be imported here.
// PACE 2b adds the line-rebuilding code (itemsToLines) and runs the real COR PDF's text positions through it. Everything else needs a real browser (canvas,
// Image, a PDF/Tesseract engine) and is verified by hand instead — see docs/PROGRESS.md.
import assert from 'node:assert/strict';
import { corFileKind, CorOcrError, OCR_ERROR, itemsToLines, textFromItems } from '../src/lib/corOcrCore.js';
import { parseCorText } from '../src/lib/corParser.js';

let n = 0;
const eq = (a, b, m) => { assert.equal(a, b, m); n++; };
const isOk = (c, m) => { assert.ok(c, m); n++; };
const deepEq = (a, b, m) => { assert.deepEqual(a, b, m); n++; };

eq(corFileKind({ name: 'cor.jpg' }), 'image', 'recognizes .jpg as an image');
eq(corFileKind({ name: 'cor.JPEG' }), 'image', 'extension check is case-insensitive');
eq(corFileKind({ name: 'cor.png' }), 'image', 'recognizes .png as an image');
eq(corFileKind({ name: 'cor.pdf' }), 'pdf', 'recognizes .pdf as a pdf');
eq(corFileKind({ name: 'cor.gif' }), null, 'an unsupported extension (not reachable via validateCorFile) is reported, not guessed');
eq(corFileKind({ name: 'cor' }), null, 'a file with no extension is reported, not guessed');
eq(corFileKind({}), null, 'a missing name never throws');

const err = new CorOcrError(OCR_ERROR.ENGINE_FAILED, 'The text could not be read from that file.');
eq(err.name, 'CorOcrError', 'carries its own error name');
eq(err.code, OCR_ERROR.ENGINE_FAILED, 'carries the error code separately from the message');
isOk(err instanceof Error, 'is a real Error, so existing catch/handleError paths work unchanged');

// ---- Phase 8 PACE 2b: rebuilding visual lines from a PDF's positioned text ----
// COR_ITEMS are the text pieces of the real City College COR PDF as [str, x, y, width, height] (y grows upward,
// the student's name redacted; the list stops at the first fee line). A PDF keeps a table in drawing order,
// column by column, so these are only useful once the lines are rebuilt from their coordinates.
const COR_ITEMS = [
  ["Page", 5.0, 780.7, 23.4, 10.0], ["1", 31.1, 780.7, 5.6, 10.0], ["XXXXX,", 36.3, 750.3, 33.0, 9.0], ["XXXXXX", 71.8, 750.3, 33.0, 9.0],
  ["XXXXX", 107.3, 750.3, 32.5, 9.0], ["2026-2027", 532.7, 750.3, 43.0, 9.0], ["BSIS", 36.3, 737.2, 21.0, 9.0], ["24", 59.8, 737.2, 10.0, 9.0],
  ["-", 72.3, 737.2, 3.0, 9.0], ["2", 77.8, 737.2, 5.0, 9.0], ["Tuition", 337.7, 713.7, 30.0, 9.0], ["Cred", 373.2, 713.7, 20.5, 9.0],
  ["#", 36.3, 708.6, 5.0, 9.0], ["Section", 53.4, 708.6, 32.5, 9.0], ["Code(s)", 88.4, 708.6, 33.5, 9.0], ["Course(s)", 139.0, 708.6, 42.0, 9.0],
  ["Lec", 286.8, 708.6, 15.5, 9.0], ["Lab", 315.1, 708.6, 16.0, 9.0], ["Time", 437.0, 708.6, 21.0, 9.0], ["Day(s)", 497.5, 708.6, 27.5, 9.0],
  ["Room", 539.1, 708.6, 25.5, 9.0], ["Units", 342.7, 703.6, 22.5, 9.0], ["Units", 373.4, 703.6, 22.5, 9.0], ["1", 36.3, 684.3, 5.0, 9.0],
  ["BSIS", 53.4, 684.3, 20.5, 9.0], ["24-2-A", 76.4, 684.3, 27.0, 9.0], ["IS_104", 139.0, 684.3, 28.5, 9.0], ["2", 292.1, 684.3, 5.0, 9.0],
  ["3", 320.6, 684.3, 5.0, 9.0], ["3", 349.2, 684.3, 5.0, 9.0], ["3", 377.7, 684.3, 5.0, 9.0], ["07:00", 396.0, 684.3, 22.5, 9.0],
  ["AM", 421.0, 684.3, 13.5, 9.0], ["-", 437.0, 684.3, 3.0, 9.0], ["08:30", 442.5, 684.3, 22.5, 9.0], ["AM", 467.5, 684.3, 13.5, 9.0],
  ["TH/T", 495.1, 684.3, 20.0, 9.0], ["COM", 525.1, 684.3, 21.0, 9.0], ["LAB", 548.6, 684.3, 17.0, 9.0], ["1", 568.2, 684.3, 5.0, 9.0],
  ["02:00", 396.0, 674.2, 22.5, 9.0], ["PM", 421.0, 674.2, 13.5, 9.0], ["-", 437.0, 674.2, 3.0, 9.0], ["03:00", 442.5, 674.2, 22.5, 9.0],
  ["PM", 467.5, 674.2, 13.5, 9.0], ["W/M", 497.1, 674.2, 18.5, 9.0], ["2", 36.3, 661.1, 5.0, 9.0], ["BSIS", 53.4, 661.1, 20.5, 9.0],
  ["24-2-A", 76.4, 661.1, 27.0, 9.0], ["IS", 139.0, 661.1, 8.5, 9.0], ["Elec_1", 150.1, 661.1, 27.5, 9.0], ["2", 292.1, 661.1, 5.0, 9.0],
  ["3", 320.6, 661.1, 5.0, 9.0], ["3", 349.2, 661.1, 5.0, 9.0], ["3", 377.7, 661.1, 5.0, 9.0], ["08:30", 396.0, 661.1, 22.5, 9.0],
  ["AM", 421.0, 661.1, 13.5, 9.0], ["-", 437.0, 661.1, 3.0, 9.0], ["10:00", 442.5, 661.1, 22.5, 9.0], ["AM", 467.5, 661.1, 13.5, 9.0],
  ["T/TH", 495.1, 661.1, 20.0, 9.0], ["COM", 525.1, 661.1, 21.0, 9.0], ["LAB", 548.6, 661.1, 17.0, 9.0], ["1", 568.2, 661.1, 5.0, 9.0],
  ["02:30", 396.0, 651.0, 22.5, 9.0], ["PM", 421.0, 651.0, 13.5, 9.0], ["-", 437.0, 651.0, 3.0, 9.0], ["03:30", 442.5, 651.0, 22.5, 9.0],
  ["PM", 467.5, 651.0, 13.5, 9.0], ["T/TH", 496.3, 651.0, 20.0, 9.0], ["3", 36.3, 638.0, 5.0, 9.0], ["BSIS", 53.4, 638.0, 20.5, 9.0],
  ["24-2-A", 76.4, 638.0, 27.0, 9.0], ["PATHFIT", 139.0, 638.0, 37.5, 9.0], ["4", 179.1, 638.0, 5.0, 9.0], ["2", 292.1, 638.0, 5.0, 9.0],
  ["0", 320.6, 638.0, 5.0, 9.0], ["2", 349.2, 638.0, 5.0, 9.0], ["2", 377.7, 638.0, 5.0, 9.0], ["10:00", 396.0, 638.0, 22.5, 9.0],
  ["AM", 421.0, 638.0, 13.5, 9.0], ["-", 437.0, 638.0, 3.0, 9.0], ["12:00", 442.5, 638.0, 22.5, 9.0], ["PM", 467.5, 638.0, 13.5, 9.0],
  ["T", 503.6, 638.0, 5.5, 9.0], ["KALAP-", 533.1, 638.0, 32.0, 9.0], ["GYM", 538.9, 627.9, 20.5, 9.0], ["4", 36.3, 614.8, 5.0, 9.0],
  ["BSIS", 53.4, 614.8, 20.5, 9.0], ["24-2-A", 76.4, 614.8, 27.0, 9.0], ["DM", 139.0, 614.8, 14.0, 9.0], ["103", 155.5, 614.8, 15.0, 9.0],
  ["3", 292.1, 614.8, 5.0, 9.0], ["0", 320.6, 614.8, 5.0, 9.0], ["3", 349.2, 614.8, 5.0, 9.0], ["3", 377.7, 614.8, 5.0, 9.0],
  ["01:00", 396.0, 614.8, 22.5, 9.0], ["PM", 421.0, 614.8, 13.5, 9.0], ["-", 437.0, 614.8, 3.0, 9.0], ["02:00", 442.5, 614.8, 22.5, 9.0],
  ["PM", 467.5, 614.8, 13.5, 9.0], ["T/TH", 496.3, 614.8, 20.0, 9.0], ["5", 36.3, 601.7, 5.0, 9.0], ["BSIS", 53.4, 601.7, 20.5, 9.0],
  ["24-2-A", 76.4, 601.7, 27.0, 9.0], ["DM", 139.0, 601.7, 14.0, 9.0], ["102", 155.5, 601.7, 15.0, 9.0], ["3", 292.1, 601.7, 5.0, 9.0],
  ["0", 320.6, 601.7, 5.0, 9.0], ["3", 349.2, 601.7, 5.0, 9.0], ["3", 377.7, 601.7, 5.0, 9.0], ["05:30", 396.0, 601.7, 22.5, 9.0],
  ["PM", 421.0, 601.7, 13.5, 9.0], ["-", 437.0, 601.7, 3.0, 9.0], ["07:00", 442.5, 601.7, 22.5, 9.0], ["PM", 467.5, 601.7, 13.5, 9.0],
  ["TH/T", 496.3, 601.7, 20.0, 9.0], ["6", 36.3, 588.7, 5.0, 9.0], ["BSIS", 53.4, 588.7, 20.5, 9.0], ["24-2-A", 76.4, 588.7, 27.0, 9.0],
  ["GE_3", 139.0, 588.7, 23.0, 9.0], ["3", 292.1, 588.7, 5.0, 9.0], ["0", 320.6, 588.7, 5.0, 9.0], ["3", 349.2, 588.7, 5.0, 9.0],
  ["3", 377.7, 588.7, 5.0, 9.0], ["07:00", 396.0, 588.7, 22.5, 9.0], ["PM", 421.0, 588.7, 13.5, 9.0], ["-", 437.0, 588.7, 3.0, 9.0],
  ["08:30", 442.5, 588.7, 22.5, 9.0], ["PM", 467.5, 588.7, 13.5, 9.0], ["TH/T", 496.3, 588.7, 20.0, 9.0], ["7", 36.3, 575.6, 5.0, 9.0],
  ["BSIS", 53.4, 575.6, 20.5, 9.0], ["24-2-A", 76.4, 575.6, 27.0, 9.0], ["DB", 139.0, 575.6, 12.5, 9.0], ["102", 154.1, 575.6, 15.0, 9.0],
  ["2", 292.1, 575.6, 5.0, 9.0], ["3", 320.6, 575.6, 5.0, 9.0], ["3", 349.2, 575.6, 5.0, 9.0], ["3", 377.7, 575.6, 5.0, 9.0],
  ["07:00", 396.0, 575.6, 22.5, 9.0], ["AM", 421.0, 575.6, 13.5, 9.0], ["-", 437.0, 575.6, 3.0, 9.0], ["08:00", 442.5, 575.6, 22.5, 9.0],
  ["AM", 467.5, 575.6, 13.5, 9.0], ["W/M", 495.8, 575.6, 18.5, 9.0], ["COM", 523.9, 575.6, 21.0, 9.0], ["LAB", 547.4, 575.6, 17.0, 9.0],
  ["1", 566.9, 575.6, 5.0, 9.0], ["08:00", 396.0, 565.5, 22.5, 9.0], ["AM", 421.0, 565.5, 13.5, 9.0], ["-", 437.0, 565.5, 3.0, 9.0],
  ["09:00", 442.5, 565.5, 22.5, 9.0], ["AM", 467.5, 565.5, 13.5, 9.0], ["W/M/F", 491.8, 565.5, 26.5, 9.0], ["COM", 525.1, 565.5, 21.0, 9.0],
  ["LAB", 548.6, 565.5, 17.0, 9.0], ["1", 568.2, 565.5, 5.0, 9.0], ["8", 36.3, 552.4, 5.0, 9.0], ["BSIS", 53.4, 552.4, 20.5, 9.0],
  ["24-2-A", 76.4, 552.4, 27.0, 9.0], ["CC", 139.0, 552.4, 13.0, 9.0], ["104", 154.5, 552.4, 15.0, 9.0], ["2", 292.1, 552.4, 5.0, 9.0],
  ["3", 320.6, 552.4, 5.0, 9.0], ["3", 349.2, 552.4, 5.0, 9.0], ["3", 377.7, 552.4, 5.0, 9.0], ["09:00", 396.0, 552.4, 22.5, 9.0],
  ["AM", 421.0, 552.4, 13.5, 9.0], ["-", 437.0, 552.4, 3.0, 9.0], ["10:00", 442.5, 552.4, 22.5, 9.0], ["AM", 467.5, 552.4, 13.5, 9.0],
  ["W/M/F", 491.8, 552.4, 26.5, 9.0], ["iLAB", 528.9, 552.4, 19.0, 9.0], ["iLAB", 550.4, 552.4, 19.0, 9.0], ["10:00", 396.0, 542.4, 22.5, 9.0],
  ["AM", 421.0, 542.4, 13.5, 9.0], ["-", 437.0, 542.4, 3.0, 9.0], ["11:00", 442.5, 542.4, 22.5, 9.0], ["AM", 467.5, 542.4, 13.5, 9.0],
  ["M/W", 497.1, 542.4, 18.5, 9.0], ["9", 36.3, 529.3, 5.0, 9.0], ["BSIS", 53.4, 529.3, 20.5, 9.0], ["24-2-A", 76.4, 529.3, 27.0, 9.0],
  ["GE", 139.0, 529.3, 13.0, 9.0], ["Elec3", 154.6, 529.3, 22.5, 9.0], ["3", 292.1, 529.3, 5.0, 9.0], ["0", 320.6, 529.3, 5.0, 9.0],
  ["3", 349.2, 529.3, 5.0, 9.0], ["3", 377.7, 529.3, 5.0, 9.0], ["04:00", 396.0, 529.3, 22.5, 9.0], ["PM", 421.0, 529.3, 13.5, 9.0],
  ["-", 437.0, 529.3, 3.0, 9.0], ["05:00", 442.5, 529.3, 22.5, 9.0], ["PM", 467.5, 529.3, 13.5, 9.0], ["W/M/F", 491.8, 529.3, 26.5, 9.0],
  ["Total", 36.3, 510.5, 21.5, 9.0], ["(26)", 343.7, 510.2, 16.0, 9.0], ["TUITION", 36.3, 479.3, 36.0, 9.0], ["FEE", 74.8, 479.3, 17.5, 9.0],
  ["Php", 239.1, 479.3, 17.0, 9.0], ["2,860.00", 258.6, 479.3, 35.0, 9.0], ["TOTAL", 309.8, 479.3, 30.0, 9.0], ["TUITION", 342.2, 479.3, 36.0, 9.0],
  ["AND", 380.8, 479.3, 19.5, 9.0], ["FEES", 402.7, 479.3, 23.5, 9.0], ["Php", 512.6, 479.3, 17.0, 9.0], ["5,740.00", 532.1, 479.3, 35.0, 9.0],
].map(([str, x, y, width, height]) => ({ str, x, y, width, height }));

const shuffle = (list) => {
  let seed = 12345;
  return [...list].map((v) => ({ v, k: (seed = (seed * 1103515245 + 12345) % 2147483648) })).sort((a, b) => a.k - b.k).map((o) => o.v);
};

const lines = itemsToLines(COR_ITEMS);
eq(lines.some((l) => l.startsWith('1 BSIS 24-2-A IS_104 2 3 3 3 07:00 AM - 08:30 AM TH/T')), true, 'row 1 comes back as one visual line: section, course, units, first time, its days');
eq(lines.includes('02:00 PM - 03:00 PM W/M'), true, 'the second meeting of a course is its own line, with ITS days beside it');
eq(lines.includes('02:30 PM - 03:30 PM T/TH'), true, 'row 2 second meeting keeps its own days too');
isOk(lines.indexOf('Total (26)') > lines.findIndex((l) => l.startsWith('9 BSIS')), 'lines run top to bottom');
eq(textFromItems(shuffle(COR_ITEMS)), textFromItems(COR_ITEMS), 'the result never depends on the order the PDF stored its text in');

const fromPdf = parseCorText(textFromItems(COR_ITEMS));
eq(fromPdf.layout, 'CITY_COLLEGE', 'the rebuilt text is recognized as the City College layout');
eq(fromPdf.unparsedRows.length, 0, 'every table row of the real PDF is read');
eq(fromPdf.period.label, 'AY 2026–2027', 'the school year is read from the rebuilt header');
const D = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
deepEq(
  fromPdf.subjects.map((s) => [s.code, s.days.map((d) => D[d]).join('/'), s.startTime, s.endTime, s.room]),
  [
    ['IS_104', 'Tu/Th', '07:00', '08:30', 'COM LAB 1'], ['IS_104', 'Mo/We', '14:00', '15:00', 'COM LAB 1'],
    ['IS Elec_1', 'Tu/Th', '08:30', '10:00', 'COM LAB 1'], ['IS Elec_1', 'Tu/Th', '14:30', '15:30', 'COM LAB 1'],
    ['PATHFIT 4', 'Tu', '10:00', '12:00', 'KALAPGYM'],
    ['DM 103', 'Tu/Th', '13:00', '14:00', ''], ['DM 102', 'Tu/Th', '17:30', '19:00', ''], ['GE_3', 'Tu/Th', '19:00', '20:30', ''],
    ['DB 102', 'Mo/We', '07:00', '08:00', 'COM LAB 1'], ['DB 102', 'Mo/We/Fr', '08:00', '09:00', 'COM LAB 1'],
    ['CC 104', 'Mo/We/Fr', '09:00', '10:00', 'iLAB'], ['CC 104', 'Mo/We', '10:00', '11:00', 'iLAB'],
    ['GE Elec3', 'Mo/We/Fr', '16:00', '17:00', ''],
  ],
  'the real COR PDF reads as exactly its 13 weekly sessions, each with the right days, times and room',
);
isOk(fromPdf.subjects.every((s) => s.confidence >= 0.7), 'and none of them is flagged for review');
isOk(!/Php|TUITION FEE/.test(JSON.stringify(fromPdf.subjects)), 'fee text never reaches the classes');

deepEq(itemsToLines([]), [], 'no text gives no lines');
deepEq(itemsToLines(undefined), [], 'missing input gives no lines');
deepEq(itemsToLines([{ str: '   ', x: 1, y: 1, width: 3, height: 9 }]), [], 'whitespace-only pieces are dropped');
eq(textFromItems([{ str: 'KALAP', x: 10, y: 100, width: 25, height: 9 }, { str: 'GYM', x: 35, y: 100, width: 15, height: 9 }]), 'KALAPGYM', 'pieces that touch are one word the PDF split');
eq(textFromItems([{ str: 'TH/T', x: 10, y: 100, width: 20, height: 9 }, { str: 'COM', x: 40, y: 100.4, width: 15, height: 9 }]), 'TH/T COM', 'a real gap is a space, and a tiny baseline difference stays on the same line');
eq(textFromItems([{ str: 'low', x: 10, y: 50, width: 12, height: 9 }, { str: 'high', x: 10, y: 80, width: 16, height: 9 }]), 'high\nlow', 'higher on the page (bigger y) comes first');

console.log(`check-cor-ocr OK (${n} checks)`);