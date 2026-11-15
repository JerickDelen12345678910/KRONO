import { PERIOD_TYPES, SUBJECT_SOURCE } from './constants.js';
import { createBase, isDate, isNonEmpty, isTime, result } from './common.js';

export function createAcademicPeriod(o = {}) {
  return { ...createBase(), name: '', type: 'semester', startDate: null, endDate: null, ...o };
}

/** A class/subject, typed in manually or extracted from a COR (confidence 0-1 drives the "needs review" flag). */
export function createSubject(o = {}) {
  return {
    ...createBase(), code: '', name: '', days: [], startTime: '', endTime: '', room: '', professor: '',
    academicPeriodId: null, source: SUBJECT_SOURCE.MANUAL, confidence: 1, reviewed: true, ...o,
  };
}

export function validateAcademicPeriod(p) {
  const e = {};
  if (!isNonEmpty(p.name)) e.name = 'Name is required.';
  if (!PERIOD_TYPES.includes(p.type)) e.type = 'Invalid period type.';
  if (!isDate(p.startDate)) e.startDate = 'Start date is required.';
  if (!isDate(p.endDate)) e.endDate = 'End date is required.';
  else if (isDate(p.startDate) && p.endDate < p.startDate) e.endDate = 'End date must be on or after the start date.';
  return result(e);
}

export function validateSubject(s) {
  const e = {};
  if (!isNonEmpty(s.name)) e.name = 'Subject name is required.';
  if (!Array.isArray(s.days) || s.days.length === 0 || s.days.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) e.days = 'Pick at least one day.';
  if (!isTime(s.startTime)) e.startTime = 'Use a time like 08:00.';
  if (!isTime(s.endTime)) e.endTime = 'Use a time like 09:30.';
  else if (isTime(s.startTime) && s.endTime <= s.startTime) e.endTime = 'End time must be after the start time.';
  return result(e);
}
