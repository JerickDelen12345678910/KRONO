// Screens call these services — never a repository or database directly.
import { ScheduleService } from './ScheduleService.js';
import { WorkoutService } from './WorkoutService.js';
import { PlaceService } from './PlaceService.js';
import { ActivityService } from './ActivityService.js';
import { SampleDataService } from './SampleDataService.js';
import { ReminderService } from './ReminderService.js';
import { SyncService } from './SyncService.js';
import { MemoryReminderAdapter } from '../reminders/MemoryReminderAdapter.js';
import { syncNativeScheduleWidget } from '../lib/scheduleWidgetBridge.js';

export function createServices(repos, options = {}) {
  const {
    reminderAdapter, reminderSettings, onReminderSettingsChange, now, syncAdapter, syncIntervalMs, syncCursors, syncPullIntervalMs, ...scheduleOptions
  } = options;
  let reminders = null;
  let schedule = null;
  schedule = new ScheduleService(repos, {
    ...scheduleOptions,
    onChange: () => {
      reminders?.sync();
      syncNativeScheduleWidget(schedule);
    },
  });
  reminders = new ReminderService({
    schedule, adapter: reminderAdapter ?? new MemoryReminderAdapter(), settings: reminderSettings, now, onSettingsChange: onReminderSettingsChange,
  });
  reminders.sync();
  syncNativeScheduleWidget(schedule);
  const sync = new SyncService({
    repos, adapter: syncAdapter, intervalMs: syncIntervalMs, cursors: syncCursors, pullIntervalMs: syncPullIntervalMs,
    onPulled: (changed) => {
      if (changed.schedules || changed.occurrences) {
        reminders.sync();
        syncNativeScheduleWidget(schedule);
      }
    },
  });
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