// Where the global reminder settings are kept (Phase 5 PACE 3). A small, swappable helper: Phase 6 can replace
// localStorage with the real per-user database without ServicesProvider.jsx or Account.jsx needing to change —
// they only ever call loadReminderSettings() / saveReminderSettings(settings).
import { normalizeReminderSettings } from './reminders.js';

export const REMINDER_SETTINGS_KEY = 'reminderSettings';

function safeStorage() {
  try { return typeof window === 'undefined' ? null : window.localStorage; } catch { return null; }
}

/** The saved settings, normalized. Defaults when nothing is saved yet, the saved value is corrupt, or storage is unavailable (never throws). */
export function loadReminderSettings(storage = safeStorage()) {
  if (!storage) return normalizeReminderSettings();
  try {
    const raw = storage.getItem(REMINDER_SETTINGS_KEY);
    return normalizeReminderSettings(raw ? JSON.parse(raw) : undefined);
  } catch {
    return normalizeReminderSettings();
  }
}

/** Normalizes first (so only valid values are ever stored), then saves. Never throws; returns the normalized settings either way. */
export function saveReminderSettings(settings, storage = safeStorage()) {
  const normalized = normalizeReminderSettings(settings);
  if (storage) {
    try { storage.setItem(REMINDER_SETTINGS_KEY, JSON.stringify(normalized)); } catch { /* storage full/unavailable: just won't persist */ }
  }
  return normalized;
}