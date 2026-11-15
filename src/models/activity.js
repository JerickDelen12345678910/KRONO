import { ACTIVITY_STATUS, ACTIVITY_TYPE, MODULE } from './constants.js';
import { createBase, isNonEmpty, result } from './common.js';

/**
 * Common activity structure used by the dashboard, filters and cross-module links.
 * `refs` connects related records (e.g. a workout session linked to a schedule occurrence).
 * Mapping real records into activities comes in PACE 3.
 */
export const createActivity = (o = {}) => ({
  ...createBase(), type: ACTIVITY_TYPE.SCHEDULE, module: MODULE.SCHEDULER, title: '', subtitle: '', category: null,
  startsAt: null, endsAt: null, status: ACTIVITY_STATUS.SCHEDULED,
  ...o, refs: { scheduleId: null, occurrenceId: null, workoutId: null, sessionId: null, destinationId: null, ...o.refs },
});

export function validateActivity(a) {
  const e = {};
  if (!isNonEmpty(a.title)) e.title = 'Title is required.';
  if (!Object.values(ACTIVITY_TYPE).includes(a.type)) e.type = 'Invalid activity type.';
  if (!Object.values(MODULE).includes(a.module)) e.module = 'Invalid module.';
  if (!Object.values(ACTIVITY_STATUS).includes(a.status)) e.status = 'Invalid status.';
  return result(e);
}
