// Reminder scheduler ADAPTER contract (Phase 5 PACE 2). ReminderService talks only to this shape, so the platform can be swapped:
//   MemoryReminderAdapter (tests / default) · BrowserNotificationAdapter (web, only while the app is open) · native Android adapter (PACE 4).
//
// REQUIRED (all async):
//   list()               -> the planned reminders that are scheduled right now (same shape as buildReminders() items)
//   schedule(reminders)  -> schedule them; a reminder with an id that already exists REPLACES the old one (never a duplicate)
//   cancel(ids)          -> cancel them; unknown ids are ignored
// OPTIONAL:
//   getPermission()      -> 'granted' | 'denied' | 'default' | 'unsupported'   (sync)
//   requestPermission()  -> same values; must only be called from a user action (a click), never on startup
//   dispose()            -> stop everything (timers); the adapter must ignore schedule() afterwards
//   name                 -> short label for logs / the settings screen

export const PERMISSION = Object.freeze({ GRANTED: 'granted', DENIED: 'denied', DEFAULT: 'default', UNSUPPORTED: 'unsupported' });

export const ADAPTER_METHODS = Object.freeze(['list', 'schedule', 'cancel']);

/** Returns the adapter, or throws a TypeError naming the missing methods. */
export function assertReminderAdapter(adapter) {
  const missing = ADAPTER_METHODS.filter((m) => typeof adapter?.[m] !== 'function');
  if (missing.length) throw new TypeError(`Reminder adapter is missing: ${missing.join(', ')}`);
  return adapter;
}