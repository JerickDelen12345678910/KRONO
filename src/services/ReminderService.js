import { addDays, toLocalDateTime } from '../models/common.js';
import {
  MAX_OFFSET_MINUTES, PLAN_HORIZON_DAYS, buildReminders, diffReminders, normalizeReminderSettings,
} from '../lib/reminders.js';
import { PERMISSION, assertReminderAdapter } from '../reminders/ReminderAdapter.js';

// A reminder can fire up to MAX_OFFSET_MINUTES (7 days) BEFORE its occurrence, so look that far past the planning window (+1 day of rounding).
const LOOKAHEAD_DAYS = PLAN_HORIZON_DAYS + Math.ceil(MAX_OFFSET_MINUTES / 1440) + 1;
const NOTHING = { scheduled: 0, cancelled: 0, kept: 0 };
const sameSettings = (a, b) => Object.keys(a).every((k) => a[k] === b[k]);

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

  // ---- permission (browser adapter; native adapters decide for themselves) ----
  getPermission() { return this.adapter.getPermission?.() ?? PERMISSION.UNSUPPORTED; }

  /** Call ONLY directly from a user action (click / tap). Never on startup. */
  async requestPermission() { return (await this.adapter.requestPermission?.()) ?? PERMISSION.UNSUPPORTED; }

  /** Stop everything (sign-out, React cleanup). Later sync() calls do nothing. */
  dispose() {
    this.disposed = true;
    this.adapter.dispose?.();
  }
}