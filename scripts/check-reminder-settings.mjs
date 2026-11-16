// Phase 5 PACE 3 — reminder settings persistence + new-schedule defaults. Pure checks only (no repositories needed).
import {
  DEFAULT_REMINDER_SETTINGS, defaultReminder, normalizeReminderSettings, REMINDER_SOUNDS, SNOOZE_OPTIONS,
} from '../src/lib/reminders.js';
import { loadReminderSettings, saveReminderSettings, REMINDER_SETTINGS_KEY } from '../src/lib/reminderSettingsStorage.js';
import { draftToInput, emptyDraft, validateDraft } from '../src/lib/scheduleForm.js';
import { createReminder } from '../src/models/schedule.js';

const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function fakeStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
  };
}

let passed = 0;
const failures = [];
function check(label, cond) { if (cond) passed += 1; else failures.push(label); }

// ---- reminderSettingsStorage.js ----
check('loadReminderSettings: empty storage returns the defaults', eq(loadReminderSettings(fakeStorage()), DEFAULT_REMINDER_SETTINGS));
check('loadReminderSettings: no storage at all (Node has no window) falls back to defaults without throwing', eq(loadReminderSettings(), DEFAULT_REMINDER_SETTINGS));

{
  const storage = fakeStorage();
  const saved = saveReminderSettings({ enabled: false, defaultOffsetMinutes: 30, defaultUseAlarm: false, sound: 'gentle', snoozeMinutes: 5 }, storage);
  check('saveReminderSettings: returns the normalized settings it stored', eq(saved, { enabled: false, defaultOffsetMinutes: 30, defaultUseAlarm: false, sound: 'gentle', snoozeMinutes: 5 }));
  check('saveReminderSettings -> loadReminderSettings: round-trips exactly', eq(loadReminderSettings(storage), saved));
  check('saveReminderSettings: writes under the documented storage key', storage.getItem(REMINDER_SETTINGS_KEY) != null);
}

{
  const storage = fakeStorage();
  const saved = saveReminderSettings({ sound: 'not-a-real-sound', snoozeMinutes: 999, defaultOffsetMinutes: -5 }, storage);
  check('saveReminderSettings: an invalid sound is normalized to the default before storing', saved.sound === DEFAULT_REMINDER_SETTINGS.sound);
  check('saveReminderSettings: an invalid snooze length is normalized to the default before storing', saved.snoozeMinutes === DEFAULT_REMINDER_SETTINGS.snoozeMinutes);
  check('saveReminderSettings: an invalid offset is normalized to the default before storing', saved.defaultOffsetMinutes === DEFAULT_REMINDER_SETTINGS.defaultOffsetMinutes);
  check('saveReminderSettings -> loadReminderSettings: the stored (normalized) value round-trips', eq(loadReminderSettings(storage), saved));
}

{
  const storage = fakeStorage({ [REMINDER_SETTINGS_KEY]: '{not valid json' });
  check('loadReminderSettings: corrupt JSON in storage falls back to defaults', eq(loadReminderSettings(storage), DEFAULT_REMINDER_SETTINGS));
}

{
  const storage = { getItem() { throw new Error('boom'); }, setItem() { throw new Error('boom'); } };
  let threw = false; let loaded;
  try { loaded = loadReminderSettings(storage); } catch { threw = true; }
  check('loadReminderSettings: a throwing storage falls back to defaults instead of throwing', !threw && eq(loaded, DEFAULT_REMINDER_SETTINGS));
  threw = false; let saved;
  try { saved = saveReminderSettings({ enabled: false }, storage); } catch { threw = true; }
  check('saveReminderSettings: a throwing storage never throws (settings just do not persist)', !threw && saved.enabled === false);
}

{
  const a = fakeStorage();
  const b = fakeStorage();
  saveReminderSettings({ enabled: false }, a);
  check('two separate storages stay independent', loadReminderSettings(b).enabled === true);
}

// ---- new-schedule reminder defaults (decision (a): inherit global defaults) ----
check('emptyDraft(): unchanged call signature keeps the old reminder shape', eq(emptyDraft().reminder, createReminder()));
check('emptyDraft({ date }): still works with no reminder override (backward compatible)', eq(emptyDraft({ date: '2026-03-01' }).reminder, createReminder()));

{
  const settings = normalizeReminderSettings({ defaultOffsetMinutes: 30, defaultUseAlarm: false });
  const draft = emptyDraft({ date: '2026-03-01', reminder: defaultReminder(settings) });
  check('emptyDraft({ reminder }): a custom reminder is used as-is', eq(draft.reminder, { enabled: true, offsetMinutes: 30, useAlarm: false }));
  check('emptyDraft({ reminder }): the date override is kept alongside the custom reminder', draft.date === '2026-03-01');

  const filled = { ...draft, title: 'Test', category: 'Personal', startTime: '08:00', endTime: '09:00' };
  const input = draftToInput(filled);
  check('draftToInput: carries the global-default reminder through to the service input unchanged', eq(input.reminder, { enabled: true, offsetMinutes: 30, useAlarm: false }));

  const { errors } = validateDraft(filled);
  check('validateDraft: a reminder built from valid global settings never fails validation on its own', !('reminder' in errors));
}

// every picker value Account.jsx offers must round-trip
for (const sound of REMINDER_SOUNDS) {
  const storage = fakeStorage();
  saveReminderSettings({ sound }, storage);
  check(`sound "${sound}" round-trips through storage`, loadReminderSettings(storage).sound === sound);
}
for (const snoozeMinutes of SNOOZE_OPTIONS) {
  const storage = fakeStorage();
  saveReminderSettings({ snoozeMinutes }, storage);
  check(`snooze length ${snoozeMinutes} round-trips through storage`, loadReminderSettings(storage).snoozeMinutes === snoozeMinutes);
}

if (failures.length) {
  console.error(`Phase 5 PACE 3 reminder settings FAILED (${failures.length} of ${passed + failures.length}):`);
  for (const f of failures) console.error(` - ${f}`);
  process.exit(1);
} else {
  console.log(`Phase 5 PACE 3 reminder settings OK (${passed} checks)`);
}