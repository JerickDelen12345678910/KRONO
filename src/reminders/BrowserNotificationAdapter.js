// Best-effort reminders for the browser / PWA using the Notification API and timers.
// LIMITS (by design, the real thing is the native Android adapter in PACE 4):
//  - it only works while the app is open: timers die when the tab or app is closed, and nothing is restored until the next start
//  - no alarm, no custom sound, no snooze: `mode`, `sound` and `snoozeMinutes` are ignored here
//  - permission is NEVER asked by itself: call requestPermission() straight from a user action (a click or tap)
// Everything platform-specific is injectable, so the check script runs it in Node with fakes.
import { PERMISSION } from './ReminderAdapter.js';

const MAX_TIMEOUT_MS = 2 ** 31 - 1;   // setTimeout overflows above this (~24.8 days)

/** 'YYYY-MM-DDTHH:mm' (local time) -> epoch ms. */
function fireTimeMs(fireAt) {
  const [date, time] = fireAt.split('T');
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm).getTime();
}

export class BrowserNotificationAdapter {
  constructor({
    notification = globalThis.Notification,
    setTimer = (fn, ms) => globalThis.setTimeout(fn, ms),
    clearTimer = (id) => globalThis.clearTimeout(id),
    clock = () => Date.now(),
  } = {}) {
    this.name = 'browser-notification';
    this.Notification = notification;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.clock = clock;
    this.items = new Map();   // id -> { reminder, at, timer }
    this.disposed = false;
  }

  isSupported() {
    return typeof this.Notification === 'function';
  }

  getPermission() {
    return this.isSupported() ? this.Notification.permission : PERMISSION.UNSUPPORTED;
  }

  /** Call ONLY from a user action. Asks once; if the answer is already known it is returned without asking again. */
  async requestPermission() {
    if (!this.isSupported()) return PERMISSION.UNSUPPORTED;
    const current = this.Notification.permission;
    if (current !== PERMISSION.DEFAULT) return current;
    // Old Safari uses a callback, modern browsers return a promise: support both.
    return new Promise((resolve) => {
      const result = this.Notification.requestPermission(resolve);
      if (result && typeof result.then === 'function') result.then(resolve, () => resolve(PERMISSION.DENIED));
    });
  }

  async list() {
    return [...this.items.values()].map(({ reminder }) => ({ ...reminder }));
  }

  /** Same id = replace (the old timer is cleared first). A reminder that is already due is dropped (missed). */
  async schedule(reminders = []) {
    if (this.disposed) return;
    for (const reminder of reminders) {
      this.drop(reminder.id);
      const at = fireTimeMs(reminder.fireAt);
      if (!(at > this.clock())) continue;
      this.items.set(reminder.id, { reminder: { ...reminder }, at, timer: null });
      this.arm(reminder.id);
    }
  }

  async cancel(ids = []) {
    for (const id of ids) this.drop(id);
  }

  dispose() {
    this.disposed = true;
    for (const id of [...this.items.keys()]) this.drop(id);
  }

  // ---- internals ----
  drop(id) {
    const entry = this.items.get(id);
    if (!entry) return;
    if (entry.timer !== null) this.clearTimer(entry.timer);
    this.items.delete(id);
  }

  /** Waits for the fire time; long waits are split into steps because setTimeout cannot count past ~24.8 days. */
  arm(id) {
    const entry = this.items.get(id);
    if (!entry || this.disposed) return;
    const wait = entry.at - this.clock();
    if (wait <= 0) { this.fire(id); return; }
    entry.timer = this.setTimer(() => this.arm(id), Math.min(wait, MAX_TIMEOUT_MS));
  }

  fire(id) {
    const entry = this.items.get(id);
    if (!entry) return;
    this.items.delete(id);
    if (this.getPermission() !== PERMISSION.GRANTED) return;
    try {
      // `tag` makes a repeat of the same reminder replace the earlier notification instead of stacking.
      new this.Notification(entry.reminder.title, { body: entry.reminder.body, tag: entry.reminder.id });
    } catch {
      /* some mobile browsers refuse `new Notification()` outside a service worker: best effort only */
    }
  }
}