// Turn real records into the common Activity shape used by the dashboard. Activities are derived, never saved.
// Ids are deterministic, so the same record always maps to the same activity.
import { ACTIVITY_STATUS, ACTIVITY_TYPE, MODULE, SESSION_STATUS } from './constants.js';
import { toLocalDateTime } from './common.js';
import { createActivity } from './activity.js';

export function activityFromOccurrence(schedule, occurrence) {
  return createActivity({
    id: `activity_schedule_${occurrence.id}`, type: ACTIVITY_TYPE.SCHEDULE, module: MODULE.SCHEDULER,
    title: schedule.title, subtitle: schedule.location, category: schedule.category,
    startsAt: `${occurrence.date}T${occurrence.startTime}`, endsAt: `${occurrence.date}T${occurrence.endTime}`,
    status: occurrence.status, isSample: Boolean(schedule.isSample || occurrence.isSample),
    refs: { scheduleId: schedule.id, occurrenceId: occurrence.id },
  });
}

export function activityFromSession(session) {
  const done = session.status === SESSION_STATUS.COMPLETED;
  return createActivity({
    id: `activity_workout_${session.id}`, type: ACTIVITY_TYPE.WORKOUT, module: MODULE.FITNESS,
    title: session.workoutName, subtitle: '', category: 'Exercise',
    startsAt: toLocalDateTime(new Date(session.startedAt)), endsAt: session.endedAt ? toLocalDateTime(new Date(session.endedAt)) : null,
    status: done ? ACTIVITY_STATUS.DONE : ACTIVITY_STATUS.IN_PROGRESS, isSample: Boolean(session.isSample),
    refs: { workoutId: session.workoutId, sessionId: session.id, scheduleId: session.scheduleId, occurrenceId: session.occurrenceId },
  });
}

/** A planned trip to a saved place. `startsAt` / `endsAt` are local 'YYYY-MM-DDTHH:mm'. */
export function activityFromDestination(destination, { startsAt, endsAt = null, scheduleId = null } = {}) {
  return createActivity({
    id: `activity_trip_${destination.id}_${startsAt}`, type: ACTIVITY_TYPE.TRIP, module: MODULE.MAP,
    title: destination.name, subtitle: destination.address, category: 'Travel', startsAt, endsAt,
    status: ACTIVITY_STATUS.SCHEDULED, isSample: Boolean(destination.isSample),
    refs: { destinationId: destination.id, scheduleId },
  });
}
