// Screens call these services — never a repository or database directly.
import { ScheduleService } from './ScheduleService.js';
import { WorkoutService } from './WorkoutService.js';
import { PlaceService } from './PlaceService.js';
import { ActivityService } from './ActivityService.js';
import { SampleDataService } from './SampleDataService.js';
import { ReminderService } from './ReminderService.js';
import { SyncService } from './SyncService.js';
import { MemoryReminderAdapter } from '../reminders/MemoryReminderAdapter.js';

/**
 * options: { today, reminderAdapter, reminderSettings, onReminderSettingsChange, now, syncAdapter, syncIntervalMs }
 *  today  -> ScheduleService clock ('YYYY-MM-DD'); now -> reminder clock ('YYYY-MM-DDTHH:mm'); both injectable for tests
 *  reminderAdapter defaults to the in-memory adapter (nothing fires); the app passes a real one (see ServicesProvider)
 *  syncAdapter defaults to the in-memory fake (nothing syncs anywhere real yet, Phase 7 PACE 1); syncIntervalMs lets tests disable the timer
 */
export function createServices(repos, options = {}) {
  const {
    reminderAdapter, reminderSettings, onReminderSettingsChange, now, syncAdapter, syncIntervalMs, ...scheduleOptions
  } = options;
  let reminders = null;
  // ScheduleService only gets a generic "something changed" hook; it knows nothing about reminders.
  const schedule = new ScheduleService(repos, { ...scheduleOptions, onChange: () => reminders?.sync() });
  reminders = new ReminderService({
    schedule, adapter: reminderAdapter ?? new MemoryReminderAdapter(), settings: reminderSettings, now, onSettingsChange: onReminderSettingsChange,
  });
  reminders.sync();   // restore after restart: re-plan everything once at start (sync never rejects)
  const sync = new SyncService({ repos, adapter: syncAdapter, intervalMs: syncIntervalMs });
  return {
    schedule,
    workout: new WorkoutService(repos),
    place: new PlaceService(repos),
    activity: new ActivityService(repos),
    sampleData: new SampleDataService(repos),
    reminders,
    sync,
  };
}
export {
  ActivityService, ScheduleService, WorkoutService, PlaceService, SampleDataService, ReminderService, SyncService,
};