// Reminder scheduler adapters. The native Android adapter (PACE 4) will be added here.
import { BrowserNotificationAdapter } from './BrowserNotificationAdapter.js';
import { MemoryReminderAdapter } from './MemoryReminderAdapter.js';

/** What the running app uses: browser notifications when the browser has them, otherwise the in-memory adapter (nothing fires). */
export function createDefaultReminderAdapter() {
  const browser = new BrowserNotificationAdapter();
  return browser.isSupported() ? browser : new MemoryReminderAdapter();
}

export { BrowserNotificationAdapter, MemoryReminderAdapter };
export { PERMISSION, assertReminderAdapter } from './ReminderAdapter.js';