# PROGRESS — the AI must update this after EVERY task

## CURRENT STATE
- Last updated: (date) by (AI/tool)
- Branch/last commit: (paste `git log -1 --oneline`)
- Build status: passing

## NEXT TASK  ← start here
**Phase 4 — Scheduler, PACE 2 (logic only, no UI change):** occurrence generation. Add `src/lib/recurrence.js` (pure): `occurrenceDates(schedule, { from, to })` for repeat types none / daily / weekly / selectedDays / custom (interval = every N days/weeks; document the rule in the file). Add `ScheduleService.syncOccurrences(scheduleId)` and call it from `create` and `update`: create missing occurrences inside the schedule span (cap ~366 days), remove only FUTURE occurrences that no longer match after an edit, and NEVER delete done/skipped history. Add `scripts/check-recurrence.mjs`. Needs from user: `src/services/ScheduleService.js`, `src/models/schedule.js`, `src/services/demoSeed.js`. Stop after PACE 2 and report.

## Phase checklist (from docs/PROJECT_PLAN.md)
| # | Phase | Status |
|---|-------|--------|
| 1 | Project foundation (Vite, Bootstrap+SCSS, responsive layout, UI components, Dashboard) | ✅ done |
| 2 | Firebase + Google sign-in + profiles + security rules | ✅ code done · ⏳ user must add `.env` keys and test sign-in |
| 3 | Shared core (models, services, repositories, error handling, activity structure) | ✅ done |
| 4 | Scheduler and calendar | 🟡 PACE 1 ✅ · PACE 2 next |
| 5 | Android reminders | ⬜ |
| 6 | Local databases (IndexedDB / SQLite) | ⬜ |
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
- **Phase 4:** PACE 1 Scheduler page (done) · PACE 2 occurrence generation (logic) · PACE 3 add/edit/delete schedule form (UI) with reminder + repeat fields · PACE 4 Day/Month/Year views · PACE 5 conflict warning before save + mark done/skipped history · PACE 6 COR stepper UI (UI only).

## Open issues / decisions
- Pre-existing lint warnings (not errors) in Phase 1/2 files: unused imports `NoteBanner`/`FilterChips` in `src/pages/Dashboard.jsx`, unused `navigate` in `src/components/layout/Header.jsx`. Clean up in a later cleanup pace; do not mix with feature work.

## Session log (append only — newest at bottom)
- Phase 1 ✅ · Phase 2 ✅ (code; Firebase test pending on user's side)
- Phase 3 PACE 1 ✅: `src/models/*` (constants, common, user, academic, schedule, workout, place, activity, index) + `scripts/check-models.mjs` (18 checks pass). Files changed: all new. No UI change.
- Phase 3 PACE 2 ✅: `src/repositories/` (Repository, MemoryAdapter, index), `src/services/` (Schedule, Workout, Place, SampleData, index), `src/lib/errors.js`, `scripts/check-repositories.mjs` (31 checks pass). Small edits: `COLLECTIONS.OCCURRENCES` in constants.js, `validateOccurrence` in schedule.js. In-memory storage only; real IndexedDB/SQLite adapters are Phase 6. No UI change.

## Phase 13 reminders (Android + Firebase) — decided: set this up in Phase 13, not before
- Firebase project ID: (fill in). Only a **Web** app is registered so far (Phase 2). The Android app is the same React code wrapped by Capacitor.
- At Phase 13, in order:
  1. Install Android Studio + JDK, add Capacitor (`@capacitor/core @capacitor/cli @capacitor/android`), `npx cap add android`.
  2. Register the Android app in Firebase: `firebase apps:create android "Multi Purpose App Android" --package-name <your.package.name> --project <id>`.
  3. Get the debug SHA-1 (`cd android` then `.\gradlew signingReport`) and add it: `firebase apps:android:sha:create <androidAppId> <sha1>`. Add the release SHA-1 before building the final APK.
  4. Download `google-services.json` into `android/app/`.
  5. Use a native Google sign-in plugin for Capacitor (web popup sign-in is unreliable inside the Android WebView) — confirm the current plugin and steps at that time.
  6. Test sign-in, offline sync and reminders on a real device.
- Phase 3 PACE 3 ✅: `src/lib/errors.js` (toAppError, toUserMessage, handleError, setErrorLogger), `src/models/activityMappers.js` + date helpers in common.js, `src/services/ActivityService.js` (list, listToday, listUpcoming), `src/contexts/ServicesContext.js` + `ServicesProvider.jsx`, `src/hooks/useServices.js`, wired in `src/main.jsx`. Small edits: AuthContext throws `AppError(OFFLINE)`, Account.jsx shows `handleError(e)` (same visible messages). `scripts/check-activity.mjs` (20 checks) + verified in a real browser. **Phase 3 complete.** No visible UI change.
- Phase 4 PACE 1 ✅: Scheduler page matching the design preview — legend with counts, Day/Week/Month/Year control (only Week active; others show a "coming" note), category filter chips, week strip with busy dots + prev/Today/next, hourly timeline 8AM–6PM with side-by-side overlaps + now line, overlap warning, reminder detail card for the selected event, "Upload COR" button -> `/scheduler/cor` placeholder. New: `src/lib/timeline.js`, `src/components/ui/WeekStrip.jsx`, `Timeline.jsx`, `src/services/demoSeed.js`, `scripts/check-timeline.mjs` (20 checks). Changed: `Scheduler.jsx`, `ServicesProvider.jsx` (seeds sample data in demo mode, shows Loading until ready), `Icon.jsx` (left/right), `_components.scss`. Data comes only from services. Verified in browser (desktop, mobile, dark, interactions).
