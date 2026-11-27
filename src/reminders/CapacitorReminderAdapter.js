import { Capacitor, registerPlugin } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { PERMISSION } from './ReminderAdapter.js';
import { stopAlarmAudio } from './alarmAudio.js';

const KronoAlarm = registerPlugin('KronoAlarm');

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
    alarmPlugin = KronoAlarm,
    isNative = () => Capacitor.isNativePlatform(),
    clock = () => Date.now(),
  } = {}) {
    this.name = 'capacitor-local-notifications';
    this.plugin = plugin;
    this.alarmPlugin = alarmPlugin;
    this.isNative = isNative;
    this.clock = clock;
    this.permission = this.isSupported() ? PERMISSION.DEFAULT : PERMISSION.UNSUPPORTED;
    this.channelsReady = null;
    this.disposed = false;
    if (this.isSupported()) {
      this.refreshPermission();
    }
  }

  isSupported() {
    return Boolean(this.isNative?.() && this.plugin && typeof this.plugin.schedule === 'function');
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
    if (this.disposed || !this.isSupported()) return;
    await this.ensureChannels();
    const now = this.clock();

    const notifyList = [];
    const nativeAlarms = [];

    for (const r of reminders) {
      const at = fireDate(r.fireAt);
      const triggerAtMs = at.getTime();
      if (!(triggerAtMs > now)) continue;

      const isAlarm = r.mode === 'both' || r.mode === 'alarm';
      if (isAlarm) {
        nativeAlarms.push({
          id: String(r.id),
          triggerAtMs,
          title: r.title || 'KRONO Alarm',
          body: r.body ?? '',
          sound: r.sound || 'default',
        });
      } else {
        notifyList.push({
          id: notificationIdFor(r.id),
          title: r.title,
          body: r.body ?? '',
          channelId: CHANNEL_NOTIFY,
          sound: 'default',
          autoCancel: true,
          schedule: {
            at,
            allowWhileIdle: true,
          },
          extra: {
            reminder: { ...r },
          },
        });
      }
    }

    // 1. Schedule exact native Android alarms (rings even if app is killed or TikTok/Facebook is open)
    if (this.alarmPlugin && typeof this.alarmPlugin.scheduleAlarms === 'function') {
      await this.alarmPlugin.scheduleAlarms({ alarms: nativeAlarms }).catch(() => {});
    }

    // 2. Schedule standard non-alarm notifications
    if (notifyList.length > 0) {
      const numericIds = notifyList.map((n) => ({ id: n.id }));
      if (typeof this.plugin.cancel === 'function') {
        await this.plugin.cancel({ notifications: numericIds }).catch(() => {});
      }
      await this.plugin.schedule({ notifications: notifyList });
    }
  }

  async cancel(ids = []) {
    if (!this.isSupported() || ids.length === 0) return;
    stopAlarmAudio();
    if (this.alarmPlugin && typeof this.alarmPlugin.cancelAlarms === 'function') {
      await this.alarmPlugin.cancelAlarms({ ids: ids.map(String) }).catch(() => {});
    }
    if (typeof this.plugin.cancel === 'function') {
      const notifications = ids.map((id) => ({ id: notificationIdFor(id) }));
      await this.plugin.cancel({ notifications }).catch(() => {});
    }
  }

  dispose() {
    this.disposed = true;
  }
}