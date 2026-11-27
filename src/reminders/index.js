// Reminder scheduler adapters: native Android (Capacitor) first, then Web Notification API, then in-memory fallback.
import { BrowserNotificationAdapter } from './BrowserNotificationAdapter.js';
import {
  CHANNEL_ALARM, CHANNEL_NOTIFY, CapacitorReminderAdapter, notificationIdFor,
} from './CapacitorReminderAdapter.js';
import { MemoryReminderAdapter } from './MemoryReminderAdapter.js';

/** What the running app uses: native Capacitor notifications on Android, browser notifications on web, otherwise in-memory. */
export function createDefaultReminderAdapter() {
  const native = new CapacitorReminderAdapter();
  if (native.isSupported()) return native;
  const browser = new BrowserNotificationAdapter();
  return browser.isSupported() ? browser : new MemoryReminderAdapter();
}

export {
  BrowserNotificationAdapter,
  CapacitorReminderAdapter,
  CHANNEL_ALARM,
  CHANNEL_NOTIFY,
  MemoryReminderAdapter,
  notificationIdFor,
};
export { PERMISSION, assertReminderAdapter } from './ReminderAdapter.js';