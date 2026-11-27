import { PERMISSION } from './ReminderAdapter.js';
import { playAlarmSound } from './alarmAudio.js';

const MAX_TIMEOUT_MS = 2 ** 31 - 1;

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
    this.items = new Map();
    this.disposed = false;
  }

  isSupported() {
    return typeof this.Notification === 'function';
  }

  getPermission() {
    return this.isSupported() ? this.Notification.permission : PERMISSION.UNSUPPORTED;
  }

  async requestPermission() {
    if (!this.isSupported()) return PERMISSION.UNSUPPORTED;
    const current = this.Notification.permission;
    if (current !== PERMISSION.DEFAULT) return current;
    return new Promise((resolve) => {
      const result = this.Notification.requestPermission(resolve);
      if (result && typeof result.then === 'function') result.then(resolve, () => resolve(PERMISSION.DENIED));
    });
  }

  async list() {
    return [...this.items.values()].map(({ reminder }) => ({ ...reminder }));
  }

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

  drop(id) {
    const entry = this.items.get(id);
    if (!entry) return;
    if (entry.timer !== null) this.clearTimer(entry.timer);
    this.items.delete(id);
  }

  arm(id) {
    const entry = this.items.get(id);
    if (!entry || this.disposed) return;
    const wait = entry.at - this.clock();
    if (wait <= 0) { this.fire(id); return; }
    entry.timer = this.setTimer(() => this.arm(id), Math.min(wait, MAX_TIMEOUT_MS));
  }

  async fire(id) {
    const entry = this.items.get(id);
    if (!entry) return;
    this.items.delete(id);
    const { reminder } = entry;
    const isAlarm = reminder.mode === 'both' || reminder.mode === 'alarm';

    playAlarmSound(reminder.sound || 'default', { loop: isAlarm, maxMs: isAlarm ? 20000 : 4000 }).catch(() => {});

    if (this.getPermission() !== PERMISSION.GRANTED) return;

    try {
      if (globalThis.navigator?.serviceWorker?.ready) {
        const reg = await globalThis.navigator.serviceWorker.ready;
        if (reg && typeof reg.showNotification === 'function') {
          await reg.showNotification(reminder.title, {
            body: reminder.body,
            tag: reminder.id,
            renotify: true,
            requireInteraction: isAlarm,
            vibrate: isAlarm ? [400, 200, 400, 200, 400] : [200, 100, 200],
          });
          return;
        }
      }
      new this.Notification(reminder.title, { body: reminder.body, tag: reminder.id });
    } catch {
      try { new this.Notification(reminder.title, { body: reminder.body, tag: reminder.id }); } catch { /* best effort */ }
    }
  }
}