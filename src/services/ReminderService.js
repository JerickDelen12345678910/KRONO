import { addDays, toLocalDateTime } from '../models/common.js';
import { OCCURRENCE_STATUS } from '../models/constants.js';
import {
  MAX_OFFSET_MINUTES, PLAN_HORIZON_DAYS, buildReminders, diffReminders, normalizeReminderSettings,
} from '../lib/reminders.js';
import { PERMISSION, assertReminderAdapter } from '../reminders/ReminderAdapter.js';

// A reminder can fire up to MAX_OFFSET_MINUTES (7 days) BEFORE its occurrence, so look that far past the planning window (+1 day of rounding).
const LOOKAHEAD_DAYS = PLAN_HORIZON_DAYS + Math.ceil(MAX_OFFSET_MINUTES / 1440) + 1;
const NOTHING = { scheduled: 0, cancelled: 0, kept: 0 };
const sameSettings = (a, b) => Object.keys(a).every((k) => a[k] === b[k]);

function shiftMinutes(baseDateTime, minutes) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(String(baseDateTime ?? ''));
  const base = m
    ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]) + minutes)
    : new Date(Date.now() + minutes * 60000);
  return toLocalDateTime(base);
}

/**
 * Keeps the platform scheduler (the adapter) equal to what buildReminders() says should exist.
 *  sync() is idempotent and safe to call as often as you like: calls that overlap are merged, a run with nothing to change touches nothing,
 *  and it NEVER rejects (a failing adapter gives { ok: false, error } and `lastError`), so reminders can never break saving.
 * It is triggered: once when the services are created (restore after restart), by ScheduleService changes (through its onChange hook),
 * and by setSettings(). Turning reminders off only cancels reminders; schedules and occurrences are never touched.
 */
export class ReminderService {
  /**
   * @param schedule        the ScheduleService (read only: list + listOccurrences)
   * @param adapter         a reminder adapter (src/reminders/ReminderAdapter.js)
   * @param settings        starting global settings (normalized; storage and UI come in PACE 3)
   * @param now             () => 'YYYY-MM-DDTHH:mm' local time, injectable for tests
   * @param onSettingsChange (settings) => void, called after the settings really changed (PACE 3 will persist from here)
   */
  constructor({ schedule, adapter, settings, now = () => toLocalDateTime(), onSettingsChange } = {}) {
    if (!schedule) throw new TypeError('ReminderService needs the schedule service.');
    this.schedule = schedule;
    this.adapter = assertReminderAdapter(adapter);
    this.settings = normalizeReminderSettings(settings);
    this.now = now;
    this.onSettingsChange = onSettingsChange;
    this.snoozes = new Map();   // id -> { reminder, fireAt }
    this.running = null;
    this.dirty = false;
    this.disposed = false;
    this.lastResult = null;
    this.lastError = null;
  }

  // ---- global settings (in memory for now) ----
  getSettings() { return { ...this.settings }; }

  /** Merge and re-sync only if something really changed. An invalid value or unknown key is ignored (the current value stays). Resolves with the settings in effect. */
  async setSettings(changes = {}) {
    const merged = normalizeReminderSettings({ ...this.settings, ...changes });
    const next = { ...merged };
    for (const key of Object.keys(changes)) if (key in this.settings && merged[key] !== changes[key]) next[key] = this.settings[key];
    if (sameSettings(next, this.settings)) return this.getSettings();
    this.settings = next;
    try { this.onSettingsChange?.({ ...next }); } catch { /* a failing listener must not stop the re-sync */ }
    await this.sync();
    return this.getSettings();
  }

  // ---- syncing ----
  /** Resolves with { ok, scheduled, cancelled, kept } (+ `error` when ok is false). Overlapping calls share one follow-up run. */
  sync() {
    if (this.disposed) return Promise.resolve({ ok: true, ...NOTHING });
    if (this.running) { this.dirty = true; return this.running; }
    this.running = (async () => {
      let result;
      try {
        do {
          this.dirty = false;
          result = await this.run();
        } while (this.dirty && !this.disposed);
      } finally {
        this.running = null;
      }
      return result;
    })();
    return this.running;
  }

  /** Resolves when no sync is running (handy in tests and before reading the adapter). */
  async whenIdle() {
    while (this.running) await this.running;
  }

  /** The reminders currently scheduled on this device (the adapter's own list), for display. Never rejects: [] when the adapter cannot say. */
  async listScheduled() {
    try {
      const rows = await this.adapter.list();
      return Array.isArray(rows) ? rows : [];
    } catch {
      return [];
    }
  }

  /**
   * Postpones a reminder (by id or reminder object) by `minutes` (defaults to `settings.snoozeMinutes`) from `now()`
   * and re-syncs the adapter. Returns the snoozed reminder or null when not found.
   */
  async snooze(idOrReminder, minutes) {
    if (this.disposed) return null;
    const base = typeof idOrReminder === 'object' && idOrReminder !== null
      ? idOrReminder
      : (await this.listScheduled()).find((r) => r.id === idOrReminder) ?? null;
    if (!base?.id) return null;
    const mins = Number.isInteger(minutes) && minutes > 0 ? minutes : this.settings.snoozeMinutes;
    const fireAt = shiftMinutes(this.now(), mins);
    const snoozed = { ...base, fireAt, snoozeMinutes: mins };
    this.snoozes.set(base.id, { reminder: snoozed, fireAt });
    await this.sync();
    return snoozed;
  }

  async run() {
    try {
      const now = this.now();
      const from = now.slice(0, 10);
      const [schedules, occurrences, current] = await Promise.all([
        this.schedule.list(),
        this.schedule.listOccurrences({ from, to: addDays(from, LOOKAHEAD_DAYS) }),
        this.adapter.list(),
      ]);
      const next = buildReminders({ schedules, occurrences, settings: this.settings, now });

      if (this.settings.enabled && this.snoozes.size > 0) {
        const occById = new Map(occurrences.map((o) => [o.id, o]));
        const nextById = new Map(next.map((r) => [r.id, r]));
        let mutated = false;
        for (const [id, entry] of this.snoozes.entries()) {
          if (entry.fireAt <= now) {
            this.snoozes.delete(id);
            continue;
          }
          const occ = occById.get(id);
          if (occ && (occ.deleted || occ.status !== OCCURRENCE_STATUS.SCHEDULED)) {
            this.snoozes.delete(id);
            continue;
          }
          if (nextById.has(id)) {
            nextById.get(id).fireAt = entry.fireAt;
            mutated = true;
          } else {
            next.push({ ...entry.reminder, fireAt: entry.fireAt });
            mutated = true;
          }
        }
        if (mutated) {
          next.sort((a, b) => a.fireAt.localeCompare(b.fireAt) || a.id.localeCompare(b.id));
        }
      }

      const diff = diffReminders(current, next);
      if (this.disposed) return { ok: true, ...NOTHING };
      if (diff.schedule.length) await this.adapter.schedule(diff.schedule);
      if (diff.cancel.length) await this.adapter.cancel(diff.cancel);
      this.lastError = null;
      this.lastResult = { ok: true, scheduled: diff.schedule.length, cancelled: diff.cancel.length, kept: diff.keep.length };
      return this.lastResult;
    } catch (error) {
      this.lastError = error;
      return { ok: false, error, ...NOTHING };
    }
  }

  // ---- permission (browser & native Capacitor adapters) ----
  getPermission() { return this.adapter.getPermission?.() ?? PERMISSION.UNSUPPORTED; }

  /** Refreshes async OS permission state (e.g. Android 13+ POST_NOTIFICATIONS) without prompting the user. */
  async refreshPermission() {
    if (typeof this.adapter.refreshPermission === 'function') {
      return (await this.adapter.refreshPermission()) ?? this.getPermission();
    }
    return this.getPermission();
  }

  /** Call ONLY directly from a user action (click / tap). Never on startup. */
  async requestPermission() { return (await this.adapter.requestPermission?.()) ?? PERMISSION.UNSUPPORTED; }

  /** Stop everything (sign-out, React cleanup). Later sync() calls do nothing. */
  dispose() {
    this.disposed = true;
    this.adapter.dispose?.();
  }
}