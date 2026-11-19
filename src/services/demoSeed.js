// Sample data for demo mode (all flagged isSample so "Remove sample data" can delete them safely).
// Deterministic ids -> running it twice never duplicates anything.
import { addDays, toLocalDate } from '../models/common.js';
import { ENTRY_STATUS, SESSION_STATUS } from '../models/constants.js';
import { createOccurrence } from '../models/schedule.js';
import { createWorkout, createWorkoutItem, createWorkoutSession } from '../models/workout.js';

const reminder = { enabled: true, offsetMinutes: 15, useAlarm: true };
const DEFS = [
  { id: 'sample-ds', title: 'Data Structures', category: 'School', location: 'Room 304', startTime: '08:00', endTime: '09:30', days: [1, 4] },
  { id: 'sample-dm', title: 'Discrete Math', category: 'School', location: 'Room 112', startTime: '10:00', endTime: '11:30', days: [2, 5] },
  { id: 'sample-gym', title: 'Upper body workout', category: 'Exercise', location: 'Gym', startTime: '12:30', endTime: '13:15', days: [1, 3, 6] },
  { id: 'sample-cap', title: 'Capstone meeting', category: 'Projects', location: 'Library', startTime: '15:00', endTime: '16:00', days: [4] },
  { id: 'sample-study', title: 'Study group', category: 'School', location: 'Cafe', startTime: '15:30', endTime: '16:30', days: [4] },
  { id: 'sample-trip', title: 'Travel to Makati', category: 'Travel', location: 'Makati', startTime: '17:00', endTime: '18:00', days: [4] },
];

// ---- Fitness (Phase 9 PACE 2b) ----
// item(name, sets, reps, restSec, durationSec): reps OR durationSec is set, never both. exerciseId stays null until the
// exercise library is linked in the workout builder (PACE 3).
const item = (name, sets, reps, restSec, durationSec = null) => createWorkoutItem({ name, sets, reps, durationSec, restSec });

const WORKOUT_DEFS = [
  // Linked to the 'sample-gym' schedule above, so it shows up as "Today's workout" (12:30-13:15) on the Fitness screen.
  {
    id: 'sample-upper-body', name: 'Upper body workout', category: 'Strength', scheduleId: 'sample-gym',
    items: [item('Push-ups', 3, 12, 60), item('Dumbbell rows', 3, 12, 60), item('Shoulder press', 3, 10, 60), item('Plank', 3, null, 45, 45)],
  },
  {
    id: 'sample-morning-cardio', name: 'Morning cardio', category: 'Cardio', scheduleId: null,
    items: [item('Jumping jacks', 3, 30, 30), item('High knees', 3, null, 30, 45), item('Jog in place', 1, null, 0, 600)],
  },
  {
    id: 'sample-core-mobility', name: 'Core and mobility', category: 'Core', scheduleId: null,
    items: [item('Dead bug', 3, 10, 30), item('Side plank', 3, null, 30, 30), item('Hip flexor stretch', 2, null, 15, 45)],
  },
];

// Finished sessions, as "days before today". Never today: today's workout stays planned, and the streak counts back from yesterday.
const SESSION_DEFS = [
  { ago: 1, workout: 'sample-upper-body', minutes: 45, hour: 12 },
  { ago: 2, workout: 'sample-morning-cardio', minutes: 35, hour: 7 },
  { ago: 3, workout: 'sample-core-mobility', minutes: 25, hour: 18 },
  { ago: 5, workout: 'sample-upper-body', minutes: 50, hour: 12 },
  { ago: 6, workout: 'sample-morning-cardio', minutes: 30, hour: 7 },
  { ago: 8, workout: 'sample-upper-body', minutes: 40, hour: 12 },
  { ago: 9, workout: 'sample-core-mobility', minutes: 30, hour: 18 },
  { ago: 10, workout: 'sample-morning-cardio', minutes: 40, hour: 7 },
  { ago: 12, workout: 'sample-upper-body', minutes: 45, hour: 12 },
  { ago: 13, workout: 'sample-morning-cardio', minutes: 35, hour: 7 },
  { ago: 15, workout: 'sample-core-mobility', minutes: 20, hour: 18 },
  { ago: 16, workout: 'sample-upper-body', minutes: 50, hour: 12 },
  { ago: 18, workout: 'sample-morning-cardio', minutes: 30, hour: 7 },
];

/** A completed session on local date `date`. startedAt is built from LOCAL time, so its local date is always `date`. */
function sampleSession(workout, date, minutes, hour) {
  const [y, m, d] = date.split('-').map(Number);
  const start = new Date(y, m - 1, d, hour, 0);
  const activeSeconds = minutes * 60;
  return createWorkoutSession(workout, {
    id: `sample-session_${date}`, isSample: true,
    startedAt: start.toISOString(), endedAt: new Date(start.getTime() + activeSeconds * 1000).toISOString(),
    status: SESSION_STATUS.COMPLETED, activeSeconds,
    entries: workout.items.map((i) => ({
      exerciseId: i.exerciseId, name: i.name, status: ENTRY_STATUS.COMPLETED,
      sets: Array.from({ length: i.sets }, () => ({ reps: i.reps, durationSec: i.durationSec })),
    })),
  });
}

/** Creates sample schedules + occurrences for last week, this week and next week. Today always gets every item. */
export async function seedDemoData(services, today = toLocalDate()) {
  const { schedules, occurrences } = services.schedule;
  const [y, m, d] = today.split('-').map(Number);
  const from = addDays(today, -new Date(y, m - 1, d).getDay() - 7);   // Sunday of last week
  const to = addDays(from, 20);                                        // Saturday of next week
  for (const { days, ...def } of DEFS) {
    const schedule = await schedules.getOrCreate({
      ...def, isSample: true, reminder,
      repeat: { type: 'selectedDays', daysOfWeek: days, startDate: from, endDate: to },
    });
    for (let i = 0; i <= 20; i += 1) {
      const date = addDays(from, i);
      const [yy, mm, dd] = date.split('-').map(Number);
      if (date === today || days.includes(new Date(yy, mm - 1, dd).getDay())) {
        await occurrences.getOrCreate(createOccurrence(schedule, date, { isSample: true }));
      }
    }
  }

  // Sample workouts + finished sessions for the Fitness screen. Whole records are passed to getOrCreate, so it works
  // whether the repository's factory fills in defaults or passes records through (as occurrences/history already do).
  const { workouts, history } = services.workout;
  const byId = {};
  for (const def of WORKOUT_DEFS) byId[def.id] = await workouts.getOrCreate(createWorkout({ ...def, isSample: true }));
  for (const { ago, workout, minutes, hour } of SESSION_DEFS) {
    await history.getOrCreate(sampleSession(byId[workout], addDays(today, -ago), minutes, hour));
  }
}