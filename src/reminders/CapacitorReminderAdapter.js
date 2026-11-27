import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { PERMISSION } from './ReminderAdapter.js';
import { playAlarmSound } from './alarmAudio.js';

export const CHANNEL_NOTIFY = 'krono-reminders-v2';
export const CHANNEL_ALARM = 'krono-alarms-v2';

export function notificationIdFor(id) {
  const s = String(id ?? '');
  let hash = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    hash ^= s.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 1) % 2147483646) + 1;
}

function fireDate(fireAt) {
  const [date, time] = String(fireAt).split('T');
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm, 0, 0);
}

function mapPermission(display) {
  if (display === 'granted') return PERMISSION.GRANTED;
  if (display === 'denied') return PERMISSION.DENIED;
  if (display === 'prompt' || display === 'prompt-with-rationale') return PERMISSION.DEFAULT;
  return PERMISSION.UNSUPPORTED;
}

export class CapacitorReminderAdapter {
  constructor({
    plugin = LocalNotifications,
    isNative = () => Capacitor.isNativePlatform(),
    clock = () => Date.now(),
  } = {}) {
    this.name = 'capacitor-local-notifications';
    this.plugin = plugin;
    this.isNative = isNative;
    this.clock = clock;
    this.permission = this.isSupported() ? PERMISSION.DEFAULT : PERMISSION.UNSUPPORTED;
    this.channelsReady = null;
    this.disposed = false;
    this.receivedHandle = null;
    if (this.isSupported()) {
      this.refreshPermission();
      this.attachForegroundListener();
    }
  }

  isSupported() {
    return Boolean(this.isNative?.() && this.plugin && typeof this.plugin.schedule === 'function');
  }

  attachForegroundListener() {
    if (typeof this.plugin?.addListener !== 'function') return;
    try {
      this.receivedHandle = this.plugin.addListener('localNotificationReceived', (notification) => {
        const reminder = notification?.extra?.reminder;
        if (!reminder) return;
        const isAlarm = reminder.mode === 'both' || reminder.mode === 'alarm';
        if (reminder.sound === 'custom' || isAlarm) {
          playAlarmSound(reminder.sound || 'default', { loop: isAlarm, maxMs: isAlarm ? 25000 : 4000 }).catch(() => {});
        }
      });
    } catch {
      // Ignore
    }
  }

  getPermission() {
    return this.isSupported() ? this.permission : PERMISSION.UNSUPPORTED;
  }

  async refreshPermission() {
    if (!this.isSupported() || typeof this.plugin.checkPermissions !== 'function') {
      return this.getPermission();
    }
    try {
      const res = await this.plugin.checkPermissions();
      this.permission = mapPermission(res?.display);
    } catch {
      // Keep last known state
    }
    return this.permission;
  }

  async requestPermission() {
    if (!this.isSupported() || typeof this.plugin.requestPermissions !== 'function') {
      return PERMISSION.UNSUPPORTED;
    }
    try {
      const res = await this.plugin.requestPermissions();
      this.permission = mapPermission(res?.display);
      return this.permission;
    } catch {
      this.permission = PERMISSION.DENIED;
      return this.permission;
    }
  }

  ensureChannels() {
    if (this.channelsReady) return this.channelsReady;
    this.channelsReady = (async () => {
      if (typeof this.plugin?.createChannel !== 'function') return;
      try {
        await this.plugin.createChannel({
          id: CHANNEL_NOTIFY,
          name: 'KRONO Reminders',
          description: 'Upcoming classes and tasks',
          importance: 4,
          visibility: 1,
          sound: 'default',
          vibration: true,
        });
        await this.plugin.createChannel({
          id: CHANNEL_ALARM,
          name: 'KRONO Alarms',
          description: 'High-priority schedule alarms',
          importance: 5,
          visibility: 1,
          sound: 'default',
          usage: 4, // Android AudioAttributes.USAGE_ALARM (rings using phone Alarm volume)
          vibration: true,
        });
      } catch {
        // Android 8+ only
      }
    })();
    return this.channelsReady;
  }

  async list() {
    if (!this.isSupported() || typeof this.plugin.getPending !== 'function') return [];
    const res = await this.plugin.getPending();
    const pending = Array.isArray(res?.notifications) ? res.notifications : [];
    return pending
      .map((n) => n?.extra?.reminder)
      .filter((r) => r && typeof r.id === 'string')
      .map((r) => ({ ...r }));
  }

  async schedule(reminders = []) {
    if (this.disposed || !this.isSupported() || reminders.length === 0) return;
    await this.ensureChannels();
    const now = this.clock();
    const notifications = [];
    for (const r of reminders) {
      const at = fireDate(r.fireAt);
      if (!(at.getTime() > now)) continue;
      const isAlarm = r.mode === 'both' || r.mode === 'alarm';
      notifications.push({
        id: notificationIdFor(r.id),
        title: r.title,
        body: r.body ?? '',
        channelId: isAlarm ? CHANNEL_ALARM : CHANNEL_NOTIFY,
        sound: 'default',
        ongoing: isAlarm,
        autoCancel: !isAlarm,
        schedule: {
          at,
          allowWhileIdle: true,
        },
        extra: {
          reminder: { ...r },
        },
      });
    }
    if (notifications.length === 0) return;
    const numericIds = notifications.map((n) => ({ id: n.id }));
    if (typeof this.plugin.cancel === 'function') {
      await this.plugin.cancel({ notifications: numericIds }).catch(() => {});
    }
    await this.plugin.schedule({ notifications });
  }

  async cancel(ids = []) {
    if (!this.isSupported() || ids.length === 0 || typeof this.plugin.cancel !== 'function') return;
    const notifications = ids.map((id) => ({ id: notificationIdFor(id) }));
    await this.plugin.cancel({ notifications });
  }

  dispose() {
    this.disposed = true;
    this.receivedHandle?.remove?.();
  }
}