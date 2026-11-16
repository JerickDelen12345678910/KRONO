# PROGRESS — the AI must update this after EVERY task

## CURRENT STATE
- Last updated: 2026-11-17 by Claude (claude.ai chat)
- Branch/last commit: `master`; Phase 6 PACE 1 (IndexedDB adapter, isolated) is treated as committed per the user's go-ahead to move on — **not explicitly confirmed with build/check/lint output, please confirm or flag if it wasn't actually run.** Phase 6 PACE 2 (wiring it into ServicesProvider) files are delivered but NOT yet committed — awaiting your verification.
- Build status: Phase 6 PACE 2 not yet run by the user: `npm run build`, `npm run check` (expect 14/14 scripts, new `check-indexeddb-wiring.mjs`), `npm run lint`, then by eye (see Open issues).

## NEXT TASK  ← start here
**First:** verify Phase 6 PACE 2 (see Open issues), then `git commit -m "phase 6 pace 2: wire IndexedDBAdapter into ServicesProvider for real users; demo stays in-memory"`.

Once that's confirmed, **Phase 6 is effectively complete for web** — SQLite/Android local storage is explicitly deferred to Phase 13 (needs the Capacitor project), same pattern as Phase 5 PACE 4. Next up would be **Phase 7 — offline synchronization** (operation queue, automatic sync, conflict handling, retry rules): decide pacing with the user before starting, same as every phase start.

## Phase checklist (from docs/PROJECT_PLAN.md)
| # | Phase | Status |
|---|-------|--------|
| 1 | Project foundation (Vite, Bootstrap+SCSS, responsive layout, UI components, Dashboard) | ✅ done |
| 2 | Firebase + Google sign-in + profiles + security rules | ✅ code done · ⏳ user must add `.env` keys and test sign-in |
| 3 | Shared core (models, services, repositories, error handling, activity structure) | ✅ done |
| 4 | Scheduler and calendar | ✅ PACE 1–6 done (PACE 5 and 6 awaiting your verification) |
| 5 | Android reminders | 🟡 PACE 1 ✅ · PACE 2 ✅ (verified + committed) · PACE 3 delivered, awaiting your verification · PACE 4 deferred to Phase 13 |
| 6 | Local databases (IndexedDB / SQLite) | 🟡 PACE 1 (adapter, isolated) treated as done per go-ahead, unconfirmed · PACE 2 (wiring) delivered, awaiting verification · SQLite/Android deferred to Phase 13 |
| 7 | Offline sync | ⬜ |
| 8 | COR OCR | ⬜ |
| 9 | Fitness module | ⬜ |
| 10 | Map module | ⬜ |
| 11 | Unified dashboard (live data) | ⬜ |
| 12 | PWA | ⬜ |
| 13 | Android app (Capacitor, APK) | ⬜ |
| 14 | Final testing and release | ⬜ |

Statuses: ⬜ todo · 🟡 in progress (note which PACE) · ✅ done.

## Suggested paces
- **Phase 3:** PACE 1 models · PACE 2 services + repositories (interfaces only, no DB yet) · PACE 3 error handling + common activity structure.
- **Phase 4:** PACE 1 page (done) · PACE 2 occurrence generation (done) · PACE 3 add/edit/delete form (done) · PACE 4 Day/Month/Year views (done) · PACE 5 conflict warning + mark done/skipped + history (done) · PACE 6 COR stepper UI (done; UI only, real OCR is Phase 8).
- **Phase 5:** PACE 1 reminder planning logic (done) · PACE 2 ReminderService + adapter interface + in-memory/browser adapters (done, verified, committed) · PACE 3 settings UI (done; awaiting your verification) · PACE 4 native Android adapter (needs the Capacitor project; do at the start of Phase 13).
- **Phase 6:** PACE 1 IndexedDB adapter (web), same four-method contract as MemoryAdapter, tested in isolation (done, treated as committed) · PACE 2 wire it into ServicesProvider for real (non-demo) users, demo stays in-memory (done; awaiting verification) · SQLite/Android local storage deferred to Phase 13.

## Open issues / decisions
- **PACE 1 was not explicitly re-confirmed with terminal output before moving to PACE 2** — the user said to proceed, so this progress file treats PACE 1 as done, but if `npm install idb`/`npm install -D fake-indexeddb`, `npm run build`, `npm run check`, or `npm run lint` weren't actually run on PACE 1's files, do that now alongside PACE 2's verification below.
- **Phase 6 PACE 2 to verify on the real repo:** `npm run build`, `npm run check` (new `check-indexeddb-wiring.mjs`, expect 10 checks; total 14/14 scripts), `npm run lint` (0 warnings expected). By eye: demo mode (no `.env`) behaves exactly as before — nothing should look or feel different. If `.env` is configured: sign in with a real Google account, create something (e.g. a schedule), reload the page, and confirm it's still there; sign out and back in and confirm it's still there; check DevTools → Application → IndexedDB for a database named `local-data_<uid>` with one object store per collection (`schedules`, `occurrences`, `academicPeriods`, `subjects`, `workouts`, `exerciseHistory`, `destinations`). No console errors either way.
- Phase 6 decisions (change only if the user asks): **one IndexedDB database per user** (named `local-data_<uid>`), with **one object store per `COLLECTIONS` entry**, declared once at a versioned "upgrade" (`DB_VERSION = 1` in `IndexedDBAdapter.js`) since IndexedDB can't create stores dynamically per user; keyPath is `id` with **no secondary indexes** — `Repository.list()` already filters/sorts in JS after `getAll()`, so IndexedDB behaves identically to the memory store rather than introducing a second filtering path. Demo mode (no `.env`) always uses the shared in-memory store (`demoStore` in `ServicesProvider.jsx`), matching the pattern already used for the reminder adapter (`createDefaultReminderAdapter()`); only real signed-in users get IndexedDB. Uses the `idb` library (promise wrapper) rather than the raw callback-based IndexedDB API — decided 2026-11-17. `closeUserDB(uid)` is called on `ServicesProvider`'s cleanup (sign-out, StrictMode's double effect) to drop the cached connection — it never deletes the database itself, and is a safe no-op for demo users (who never open one). SQLite for Android is explicitly deferred to Phase 13 (needs the Capacitor project) — same pattern as Phase 5 PACE 4.
- **New dependencies added:** `idb` (runtime) and `fake-indexeddb` (devDependency, polyfills IndexedDB in Node so `check-indexeddb.mjs`/`check-indexeddb-wiring.mjs` can run outside a browser). The user needs to have run `npm install idb` and `npm install -D fake-indexeddb` for PACE 1/2 to build and check correctly.
- AGENTS.md updated (PACE 2) to mention `IndexedDBAdapter` alongside `MemoryAdapter` in the project map, and to note SQLite/Android is Phase 13.
- Phase 5 PACE 3 decisions (change only if the user asks): a NEW schedule's reminder starts from `defaultReminder(settings)` (the user's global defaults) — decided 2026-11-16; `emptyDraft()` stays backward compatible (an omitted `reminder` still falls back to `createReminder()`), so only `ScheduleForm.jsx` passes the override, nothing else calling `emptyDraft()` needed a change. "Alarm only" is still not offered anywhere (unchanged from PACE 1/2 — the model doesn't support it yet). Settings persist via `src/lib/reminderSettingsStorage.js` (a thin wrapper around `localStorage`, normalizes before and after storing, never throws) wired into `ServicesProvider.jsx` as `reminderSettings`/`onReminderSettingsChange`. Notification permission is requested ONLY from the "Enable notifications" button's click handler, never automatically; the button disables once `granted` or `unsupported`.
- Phase 5 PACE 2 caveat (still applies): reminders follow changes made through `ScheduleService` (its `onChange` hook). If `SampleDataService` / `demoSeed.js` (or any future code) writes schedules or occurrences straight to the repositories, call `reminders.sync()` afterwards (ServicesProvider already does this once after seeding).
- Phase 5 decisions (change only if the user asks): reminder planning is pure and platform-free (`src/lib/reminders.js`); one reminder per occurrence and its id IS the occurrence id (`${scheduleId}_${date}`), so re-planning never duplicates; fire time = occurrence date + start time minus the schedule's `reminder.offsetMinutes` (local time); only `scheduled` occurrences of existing, non-deleted schedules with `reminder.enabled`; a reminder whose time is not after `now` is dropped (missed); rolling window = next 14 days, max 60 reminders (Android limits pending alarms), re-planned on start / change / restart; global switch off -> no reminders but nothing is deleted; mode = `useAlarm ? 'both' : 'notify'`. "Alarm only" cannot be stored with the current model yet. Global settings shape: `{ enabled, defaultOffsetMinutes, defaultUseAlarm, sound, snoozeMinutes }`; sounds are names only (`default`, `gentle`, `bright`), snooze 5/10/15 min (default 10); real audio, preview, volume, snooze/dismiss actions and restore-after-reboot are native (PACE 4).
- Phase 5 PACE 2 decisions (change only if the user asks): the adapter contract lives in `src/reminders/ReminderAdapter.js`: required async `list()`, `schedule(reminders)` (same id REPLACES), `cancel(ids)` (unknown ids ignored); optional `getPermission()`, `requestPermission()`, `dispose()`, `name`. `ReminderService` is `useServices().reminders`. `sync()` NEVER rejects, overlapping calls are merged, a run with nothing to change makes no adapter call. The app uses `createDefaultReminderAdapter()`: the browser adapter when the browser has `Notification`, otherwise the in-memory one. Permission is NEVER requested automatically. Turning reminders off only cancels reminders; schedules and occurrences are never touched.
- Phase 5 PACE 2 — verified by the user on the real repo (2026-11-16): build/check/lint all ✅, already committed. By-eye demo-mode check confirmed okay (2026-11-17). **Phase 5 PACE 2 fully complete.**
- Phase 5 PACE 3 ✅ (code delivered; user verifies build/check/lint/visuals — committed per the user 2026-11-17): reminder settings UI, new-schedule reminder defaults. See prior session log entry for full file list.
- PACE 6 (COR): committed by the user; `npm run check` passes (check-cor 69 checks). The visual checks at `/scheduler/cor` (390px + 1280px, Light + Dark) have not been reported yet: do them when convenient.
- PACE 6 assumptions (change only if the user asks): class schedules use category `School`; the period is today + 18 weeks, not editable; sample rows are hard-coded (5 rows, 1 low-confidence); low-confidence rows start unticked and are read-only; schedules are created one by one through `useServices().schedule.create` with `isSample: false`; retries never duplicate already-created ones; the file card uses the `up` icon.
- Lint was clean (0 warnings) as of Phase 4 PACE 4. Keep it that way: re-run lint after every PACE.
- PACE 5 to verify on the real repo: build/check/lint, then by eye at 390px + 1280px, Light + Dark: overlap banner, Mark done/Skip/Undo, Recent history card, Month agenda dimming.
- PACE 5 relies on `Timeline.jsx` already adding the `done` class to done blocks, and `Pill` accepting `variant="ok"`. If not, paste `Timeline.jsx`/`Pill.jsx` and fix there.
- PACE 5 decisions (change only if the user asks): a conflict = any category, same date, overlapping time; cancelled/skipped items are ignored, done items still count; Undo is offered for done and skipped only; Recent history = last 30 days, max 10 rows, Day view only.

## Session log (append only — newest at bottom)
- Phase 1 ✅ · Phase 2 ✅ (code; Firebase test pending on user's side)
- Phase 3 PACE 1 ✅: `src/models/*` + `scripts/check-models.mjs` (18 checks). No UI change.
- Phase 3 PACE 2 ✅: `src/repositories/`, `src/services/`, `src/lib/errors.js`, `scripts/check-repositories.mjs` (31 checks). In-memory storage only; real adapters are Phase 6. No UI change.
- Phase 3 PACE 3 ✅: `src/lib/errors.js`, `src/models/activityMappers.js`, `src/services/ActivityService.js`, `ServicesProvider.jsx`, `useServices.js`. `scripts/check-activity.mjs` (20 checks). **Phase 3 complete.**
- Phase 4 PACE 1 ✅: Scheduler page matching the design preview. New: `timeline.js`, `WeekStrip.jsx`, `Timeline.jsx`, `demoSeed.js`, `scripts/check-timeline.mjs` (20 checks).
- Phase 4 PACE 2 ✅ (logic only): `recurrence.js`, `syncOccurrences`, `Repository.restore`, injectable clock. `scripts/check-recurrence.mjs` (27 checks), `check-all.mjs`.
- Phase 4 PACE 3 ✅: add/edit/delete schedule. New: `ScheduleForm.jsx`, `scheduleForm.js`, `FormField.jsx`. `scripts/check-scheduleform.mjs` (22 checks).
- Phase 4 PACE 4 ✅: Day/Week/Month/Year views. New: `calendar.js`, `MonthGrid.jsx`, `YearGrid.jsx`. `scripts/check-calendar.mjs` (16 checks).
- Phase 4 PACE 5 ✅: conflict warning, Done/Skipped/Undo, history. New: `conflicts.js`. `scripts/check-conflicts.mjs` (42 checks).
- Phase 4 PACE 6 ✅: COR stepper UI. New: `cor.js`, `CorUpload.jsx`. `scripts/check-cor.mjs` (66 checks). **Phase 4 complete.**
- Phase 5 PACE 1 ✅ (committed): reminder planning logic, no UI. New: `src/lib/reminders.js`, `scripts/check-reminders.mjs` (63 checks + 12 end-to-end).
- Phase 5 PACE 2 ✅ (verified + committed 2026-11-16, by-eye confirmed 2026-11-17): ReminderService + adapters, no UI. New: `src/reminders/*`, `src/services/ReminderService.js`, `scripts/check-reminders-service.mjs` (80 checks). **Phase 5 PACE 2 fully complete.**
- Phase 5 PACE 3 ✅ (committed by the user 2026-11-17): reminder settings UI, new-schedule reminder defaults. New: `src/lib/reminderSettingsStorage.js`, `scripts/check-reminder-settings.mjs` (25 checks). Changed: `scheduleForm.js`, `ScheduleForm.jsx`, `Account.jsx`, `ServicesProvider.jsx`, `SegmentedControl.jsx`, `AGENTS.md`.
- Phase 6 PACE 1 (treated as committed per the user's go-ahead 2026-11-17, not explicitly re-confirmed with terminal output): IndexedDB storage adapter (web), same four-method contract as `MemoryAdapter`, not yet wired into the app. New: `src/repositories/IndexedDBAdapter.js` (`IndexedDBAdapter`, `openUserDB`, `closeUserDB`, `createIndexedDBAdapterFactory` — one IndexedDB database per uid, one object store per `COLLECTIONS` entry), `scripts/check-indexeddb.mjs` (15 checks, using `fake-indexeddb` to run in Node). Changed: `src/repositories/index.js` (re-exports the new adapter). New dependencies: `idb` (runtime), `fake-indexeddb` (dev).
- Phase 6 PACE 2 ✅ (code delivered; user verifies build/check/lint/visuals): wired `IndexedDBAdapter` into `ServicesProvider.jsx` for real (non-demo) signed-in users; demo mode keeps the shared in-memory store. New: `scripts/check-indexeddb-wiring.mjs` (10 checks: structural wiring, generic `Repository` + `IndexedDBAdapter` round-trip, persistence across close/reopen, `createServices()` booting cleanly against it, demo-mode wiring unaffected). Changed: `src/contexts/ServicesProvider.jsx` (`demo ? memory store : createIndexedDBAdapterFactory(uid)`; `closeUserDB(uid)` added to the cleanup alongside `reminders.dispose()`), `AGENTS.md` (project map: `IndexedDBAdapter` noted, SQLite/Android called out as Phase 13).

## Phase 13 reminders (Android + Firebase) — decided: set this up in Phase 13, not before
- Firebase project ID: (fill in). Only a **Web** app is registered so far (Phase 2). The Android app is the same React code wrapped by Capacitor.
- At Phase 13, in order:
  1. Install Android Studio + JDK, add Capacitor, `npx cap add android`.
  2. Register the Android app in Firebase; get the debug SHA-1 and add it (release SHA-1 before the final APK).
  3. Download `google-services.json` into `android/app/`.
  4. Use a native Google sign-in plugin for Capacitor (web popup sign-in is unreliable inside the Android WebView).
  5. Test sign-in, offline sync and reminders on a real device.
  6. Build the native Android reminder adapter (Phase 5 PACE 4): real audio/preview/volume, snooze/dismiss actions, restore-after-reboot, and decide "alarm only" mode if still wanted.
  7. Build the Android local storage adapter (Phase 6, SQLite via Capacitor) — same four-method contract (`get`/`getAll`/`put`/`hardDelete`) as `MemoryAdapter`/`IndexedDBAdapter`, so it drops into `createRepositories({ createAdapter })` the same way.