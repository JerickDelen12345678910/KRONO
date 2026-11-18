// src/lib/corParser.js
// Phase 8 PACE 1 — pure COR text-parsing core. No OCR engine, no UI: this module turns raw
// extracted/OCR text (what Tesseract.js will hand back once a later PACE wires it in) into
// candidate subjects shaped exactly like the rows src/lib/cor.js's sampleSubjects() produces —
// { id, code, name, days, startTime, endTime, room, professor, confidence, reviewNote } — so a
// later PACE can feed a real engine's output straight into the existing Review step with no
// changes to cor.js or CorUpload.jsx.
//
// Only one COR layout is implemented: CITY_COLLEGE, built against a real sample. Supporting
// another school (MinSU, Divine, Luna, ...) means adding another entry to LAYOUTS with its own
// detect/parseRows/parseRow — nothing here needs to change for that.
//
// This layout's COR never prints an instructor name or a descriptive subject title (only a
// course code), so `professor` and `name` are always '' for CITY_COLLEGE; `code` carries the
// course code exactly as printed. A course that meets at two different times (e.g. a lecture
// and a lab slot) comes back as two separate session candidates sharing the same `code`, rather
// than forced into one — the existing schedule model is one time-block per subject, so this is
// the accurate fit with no changes needed elsewhere.

const DAY_INDEX = {
  SU: 0, SUN: 0,
  M: 1, MON: 1,
  T: 2, TUE: 2,
  W: 3, WED: 3,
  TH: 4, THU: 4, THURS: 4,
  F: 5, FRI: 5,
  S: 6, SAT: 6,
};

const SECTION_PATTERN = /[A-Z]{2,10}\s+\d{1,3}-\d{1,2}(?:-[A-Z]{1,2})?\b/;
const TIME_PATTERN = /\d{1,2}:\d{2}\s*(?:AM|PM)\s*-\s*\d{1,2}:\d{2}\s*(?:AM|PM)/i;
const TIME_RE = /(\d{1,2}):(\d{2})\s*(AM|PM)\s*-\s*(\d{1,2}):(\d{2})\s*(AM|PM)/gi;
// Course text, then exactly 4 single/double-digit columns (Lec, Lab, Tuition Units, Cred Units),
// then the first time range. Non-greedy so a course code that itself ends in digits (e.g.
// "PATHFIT 4", "DM 103") is kept whole: the regex only stops growing once a valid 4-number +
// time-range tail is found, which self-corrects past any shorter but wrong split.
const ANCHOR_RE = /^(.*?)\s+(\d{1,2})\s+(\d{1,2})\s+(\d{1,2})\s+(\d{1,2})\s+(\d{1,2}:\d{2}\s*(?:AM|PM).*)$/i;
const ROW_SECTION_RE = /^([A-Z]{2,10}\s+\d{1,3}-\d{1,2}(?:-[A-Z]{1,2})?)\b/;

function to24h(hour, minute, meridiem) {
  let h = Number(hour) % 12;
  if (/pm/i.test(meridiem)) h += 12;
  return `${String(h).padStart(2, '0')}:${minute}`;
}

/** One weekly day-group, e.g. "TH/T" or "W/M/F" or a lone "T". Unknown tokens are counted, not guessed. */
function parseDayGroup(token) {
  const parts = token.split('/').map((t) => t.trim().toUpperCase()).filter(Boolean);
  const days = [];
  let unknown = 0;
  for (const p of parts) {
    if (p in DAY_INDEX) days.push(DAY_INDEX[p]);
    else unknown += 1;
  }
  return { days: [...new Set(days)].sort((a, b) => a - b), unknown };
}

/**
 * Splits a room's raw trailing text into one room per session. "iLAB iLAB" (an exact repeat)
 * splits evenly, one per session; anything else (including a single "COM LAB 1" for two
 * sessions, or nothing at all) is treated as one room shared by every session of the row.
 */
function splitRoom(raw, sessionCount) {
  const text = raw.trim();
  if (!text) return Array(sessionCount).fill('');
  if (sessionCount > 1) {
    const words = text.split(/\s+/);
    if (words.length % sessionCount === 0) {
      const chunk = words.length / sessionCount;
      const groups = Array.from({ length: sessionCount }, (_, i) => words.slice(i * chunk, (i + 1) * chunk).join(' '));
      if (groups.every((g) => g === groups[0])) return groups;
    }
  }
  return Array(sessionCount).fill(text);
}

/**
 * Joins OCR-wrapped lines into one text block per table row (times/days/rooms often land on
 * their own line), and stops entirely once the fee/signature block starts — those lines are
 * never treated as part of the schedule.
 */
function groupRows(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const rows = [];
  let current = null;
  let sectionCode = null;
  for (const line of lines) {
    if (/^total\b/i.test(line) || /tuition and fees/i.test(line) || /\bphp\s*[\d,]+\.\d{2}/i.test(line)) break;
    const rowStart = /^(\d{1,3})\s+(.*)$/.exec(line);
    const section = rowStart && ROW_SECTION_RE.exec(rowStart[2]);
    if (rowStart && section && (!sectionCode || section[1] === sectionCode)) {
      if (current) rows.push(current);
      sectionCode = sectionCode || section[1];
      current = { n: rowStart[1], text: rowStart[2].slice(section[1].length).trim() };
    } else if (current) {
      current.text += ` ${line}`;
    }
  }
  if (current) rows.push(current);
  return rows;
}

/** One table row's joined text -> its session candidates, or `{ unparsed }` if it never matches the table pattern. */
function parseRow(raw) {
  const anchor = ANCHOR_RE.exec(raw.text);
  if (!anchor) return { unparsed: { row: raw.n, text: raw.text } };

  const code = anchor[1].trim();
  const rest = anchor[6];
  const timeMatches = [...rest.matchAll(TIME_RE)];
  if (timeMatches.length === 0) return { unparsed: { row: raw.n, text: raw.text } };

  const times = timeMatches.map((m) => {
    const startTime = to24h(m[1], m[2], m[3]);
    const endTime = to24h(m[4], m[5], m[6]);
    return { startTime, endTime, valid: endTime > startTime };
  });

  const last = timeMatches[timeMatches.length - 1];
  const tail = rest.slice(last.index + last[0].length).trim();
  const tailTokens = tail.split(/\s+/).filter(Boolean);
  const dayGroups = tailTokens.slice(0, times.length);
  const roomRaw = tailTokens.slice(times.length).join(' ');
  const rooms = splitRoom(roomRaw, times.length);

  const sessions = times.map((t, i) => {
    const parsedDays = parseDayGroup(dayGroups[i] ?? '');
    const issues = [];
    let confidence = 1;
    if (!t.valid) { confidence = Math.min(confidence, 0.3); issues.push('Check time'); }
    if (parsedDays.unknown > 0 || parsedDays.days.length === 0) { confidence = Math.min(confidence, 0.4); issues.push('Check days'); }
    if (dayGroups.length !== times.length) { confidence = Math.min(confidence, 0.6); issues.push('Check days'); }
    return {
      id: `cor-row${raw.n}-s${i + 1}`,
      code,
      name: '',
      days: parsedDays.days,
      startTime: t.startTime,
      endTime: t.endTime,
      room: rooms[i] ?? '',
      professor: '',
      confidence,
      reviewNote: issues.length ? [...new Set(issues)].join('; ') : '',
    };
  });

  return { sessions };
}

export const LAYOUTS = {
  CITY_COLLEGE: {
    id: 'CITY_COLLEGE',
    detect: (text) => SECTION_PATTERN.test(text) && TIME_PATTERN.test(text),
    parseRows: groupRows,
    parseRow,
  },
};

export function detectLayout(text) {
  for (const layout of Object.values(LAYOUTS)) {
    if (layout.detect(text)) return layout.id;
  }
  return null;
}

/**
 * Entry point: raw extracted/OCR text -> candidate subjects (one per weekly time-block) plus any
 * table rows that didn't match the layout's pattern at all, for the Review step to surface as-is
 * rather than guess at.
 */
export function parseCorText(text, { layoutId } = {}) {
  const id = layoutId ?? detectLayout(text);
  const layout = id && LAYOUTS[id];
  if (!layout) return { layout: null, subjects: [], unparsedRows: [] };

  const subjects = [];
  const unparsedRows = [];
  for (const raw of layout.parseRows(text)) {
    const result = layout.parseRow(raw);
    if (result.unparsed) unparsedRows.push(result.unparsed);
    else subjects.push(...result.sessions);
  }
  return { layout: id, subjects, unparsedRows };
}