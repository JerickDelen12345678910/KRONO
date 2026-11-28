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
const ANCHOR_RE = /^(.*?)\s+(\d{1,2})\s+(\d{1,2})\s+(\d{1,2})\s+(\d{1,2})\s+(\d{1,2}:\d{2}\s*(?:AM|PM).*)$/i;
const ROW_SECTION_RE = /^([A-Z]{2,10}\s+\d{1,3}-\d{1,2}(?:-[A-Z]{1,2})?)\b/;
const SINGLE_DAY_RE = /^(?:SUN|MON|TUE|WED|THURS|THU|FRI|SAT|SU|TH|M|T|W|F|S)$/i;
const SLASH_DAYS_RE = /^[A-Za-z]{1,5}(?:\/[A-Za-z]{1,5})+$/;
const isDayLike = (token) => SINGLE_DAY_RE.test(token) || SLASH_DAYS_RE.test(token);

function to24h(hour, minute, meridiem) {
  let h = Number(hour) % 12;
  if (/pm/i.test(meridiem)) h += 12;
  return `${String(h).padStart(2, '0')}:${minute}`;
}

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

const sameDaySet = (a = [], b = []) => a.length === b.length && a.every((v, idx) => v === b[idx]);

/** Merges consecutive sessions (e.g. 07:00-08:00 + 08:00-09:00) for the same subject & day into one clean block */
export function mergeConsecutiveSessions(sessions = []) {
  const sorted = [...sessions].sort((a, b) => {
    const codeCmp = String(a.code || '').localeCompare(String(b.code || ''));
    if (codeCmp !== 0) return codeCmp;
    const dayCmp = String((a.days || []).join(',')).localeCompare(String((b.days || []).join(',')));
    if (dayCmp !== 0) return dayCmp;
    return String(a.startTime || '').localeCompare(String(b.startTime || ''));
  });

  const merged = [];
  for (const item of sorted) {
    const prev = merged[merged.length - 1];
    const sameSubject = prev
      && String(prev.code || '').trim().toUpperCase() === String(item.code || '').trim().toUpperCase()
      && String(prev.name || '').trim().toUpperCase() === String(item.name || '').trim().toUpperCase();
    const sameDays = prev && sameDaySet(prev.days, item.days);
    const isContiguous = prev && prev.endTime && item.startTime && prev.endTime === item.startTime;

    if (sameSubject && sameDays && isContiguous) {
      const rooms = [prev.room, item.room].filter(Boolean);
      const uniqueRooms = [...new Set(rooms)];
      prev.endTime = item.endTime;
      prev.room = uniqueRooms.join(' / ');
      prev.confidence = Math.min(prev.confidence ?? 1, item.confidence ?? 1);
      const notes = [prev.reviewNote, item.reviewNote].filter(Boolean);
      prev.reviewNote = [...new Set(notes)].join('; ');
    } else {
      merged.push({ ...item, days: [...(item.days || [])] });
    }
  }
  return merged;
}

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

  const leftover = rest.replace(TIME_RE, ' ').split(/\s+/).filter(Boolean);
  const dayGroups = [];
  const roomWords = [];
  for (const token of leftover) {
    const core = token.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '');
    if (core === '') continue;
    if (isDayLike(core)) dayGroups.push(core);
    else roomWords.push(token);
  }
  const roomRaw = roomWords.join(' ').replace(/(\w)-\s+(\w)/g, '$1$2');
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

  return { sessions: mergeConsecutiveSessions(sessions) };
}

const SCHOOL_YEAR_RE = /\b(20\d{2})\s*[-–—]\s*(20\d{2})\b/g;
const SEMESTER_PATTERNS = [
  [/\b(?:1st|first)\s+sem(?:ester)?\b/i, '1st Sem'],
  [/\b(?:2nd|second)\s+sem(?:ester)?\b/i, '2nd Sem'],
  [/\bmid-?\s?year\b/i, 'Midyear'],
  [/\bsummer\b/i, 'Summer'],
];

function headerText(text) {
  const header = [];
  for (const line of text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)) {
    const rowStart = /^(\d{1,3})\s+(.*)$/.exec(line);
    if (rowStart && ROW_SECTION_RE.test(rowStart[2])) break;
    if (/^total\b/i.test(line) || /tuition and fees/i.test(line)) break;
    header.push(line);
  }
  return header.join('\n');
}

function parsePeriod(text) {
  const header = headerText(text);
  const years = [...header.matchAll(SCHOOL_YEAR_RE)].find((m) => Number(m[2]) === Number(m[1]) + 1);
  const startYear = years ? Number(years[1]) : null;
  const endYear = years ? Number(years[2]) : null;
  const semester = SEMESTER_PATTERNS.find(([re]) => re.test(header))?.[1] ?? null;
  if (startYear === null && semester === null) return null;
  const label = [semester, startYear === null ? '' : `AY ${startYear}–${endYear}`].filter(Boolean).join(', ');
  return { startYear, endYear, semester, label };
}

export const LAYOUTS = {
  CITY_COLLEGE: {
    id: 'CITY_COLLEGE',
    detect: (text) => SECTION_PATTERN.test(text) && TIME_PATTERN.test(text),
    parseRows: groupRows,
    parseRow,
    parsePeriod,
  },
};

export function detectLayout(text) {
  for (const layout of Object.values(LAYOUTS)) {
    if (layout.detect(text)) return layout.id;
  }
  return null;
}

export function parseCorText(text, { layoutId } = {}) {
  const id = layoutId ?? detectLayout(text);
  const layout = id && LAYOUTS[id];
  if (!layout) return { layout: null, subjects: [], unparsedRows: [], period: null };

  const rawSubjects = [];
  const unparsedRows = [];
  for (const raw of layout.parseRows(text)) {
    const result = layout.parseRow(raw);
    if (result.unparsed) unparsedRows.push(result.unparsed);
    else rawSubjects.push(...result.sessions);
  }
  return {
    layout: id,
    subjects: mergeConsecutiveSessions(rawSubjects),
    unparsedRows,
    period: layout.parsePeriod ? layout.parsePeriod(text) : null,
  };
}
