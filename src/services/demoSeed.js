// Sample schedules for demo mode (all flagged isSample so "Remove sample data" can delete them safely).
// Deterministic ids -> running it twice never duplicates anything.
import { addDays, toLocalDate } from '../models/common.js';
import { createOccurrence } from '../models/schedule.js';

const reminder = { enabled: true, offsetMinutes: 15, useAlarm: true };
const DEFS = [
  { id: 'sample-ds', title: 'Data Structures', category: 'School', location: 'Room 304', startTime: '08:00', endTime: '09:30', days: [1, 4] },
  { id: 'sample-dm', title: 'Discrete Math', category: 'School', location: 'Room 112', startTime: '10:00', endTime: '11:30', days: [2, 5] },
  { id: 'sample-gym', title: 'Upper body workout', category: 'Exercise', location: 'Gym', startTime: '12:30', endTime: '13:15', days: [1, 3, 6] },
  { id: 'sample-cap', title: 'Capstone meeting', category: 'Projects', location: 'Library', startTime: '15:00', endTime: '16:00', days: [4] },
  { id: 'sample-study', title: 'Study group', category: 'School', location: 'Cafe', startTime: '15:30', endTime: '16:30', days: [4] },
  { id: 'sample-trip', title: 'Travel to Makati', category: 'Travel', location: 'Makati', startTime: '17:00', endTime: '18:00', days: [4] },
];

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
}
