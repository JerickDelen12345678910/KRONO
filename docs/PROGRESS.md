# PROGRESS — the AI must update this after EVERY task

## CURRENT STATE
- Last updated: 2026-11-16 by Claude (claude.ai chat)
- Branch/last commit: `9618f88 (HEAD -> master) phase 4 pace 4: day, month and year views` (PACE 5 files are delivered but NOT yet committed)
- Build status: PACE 4 passing. PACE 5 unverified on the real repo: run `npm run build`, `npm run check`, `npm run lint` and the 390px/1280px Light/Dark checks, then commit.

## NEXT TASK  ← start here
**First:** verify PACE 5 (see Open issues), then `git commit -m "phase 4 pace 5: conflict warning, done/skipped/undo, history"`.

**Phase 4 — Scheduler, PACE 6 (COR stepper UI, UI only; real OCR is Phase 8):** replace `CorPlaceholder` (route `/scheduler/cor`) with a 3-step stepper **Upload → Review → Create** per DESIGN_LOCK: reuse the existing `Stepper`; a privacy note (`NoteBanner variant="info"`); Upload step = file picker UI only (nothing is uploaded or read); Review step = a table/list of sample parsed subjects where a **low-confidence row is outlined amber** (status never by color alone: add a "Needs review" label); Create step = confirm, then create the class schedules ONLY through `useServices().schedule.create` (weekly `selectedDays` rule, `isSample: false`). Keep parsing/draft logic pure in `src/lib/cor*.js` + `scripts/check-cor.mjs`. Needs from user: `docs/design-preview.html` (COR section), `docs/PROJECT_PLAN.md` (COR section), `src/components/ui/Stepper.jsx`, `src/pages/Scheduler.jsx` (the PACE 5 version), `src/models/academic.js`, `src/lib/scheduleForm.js`, the Stepper/COR-related part of `src/styles/_components.scss`. Stop after PACE 6 and report (Phase 4 is then complete).

## Phase checklist (from docs/PROJECT_PLAN.md)
| # | Phase | Status |
|---|-------|--------|
| 1 | Project foundation (Vite, Bootstrap+SCSS, responsive layout, UI components, Dashboard) | ✅ done |
| 2 | Firebase + Google sign-in + profiles + security rules | ✅ code done · ⏳ user must add `.env` keys and test sign-in |
| 3 | Shared core (models, services, repositories, error handling, activity structure) | ✅ done |
| 4 | Scheduler and calendar | 🟡 PACE 1–5 ✅ (PACE 5 awaiting your verification) · PACE 6 next |
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
- **Phase 4:** PACE 1 page (done) · PACE 2 occurrence generation (done) · PACE 3 add/edit/delete form (done) · PACE 4 Day/Month/Year views (done) · PACE 5 conflict warning + mark done/skipped + history (done) · PACE 6 COR stepper UI (UI only; real OCR is Phase 8).

## Open issues / decisions
- Lint was clean (0 warnings) as of Phase 4 PACE 4. Keep it that way: re-run lint after PACE 5 (new hooks in `ScheduleForm.jsx` and `Scheduler.jsx`).
- PACE 5 to verify on the real repo: `npm run build`, `npm run check` (new `check-conflicts.mjs`), lint, then by eye at 390px + 1280px, Light + Dark: (1) form: pick a time that overlaps an existing item -> amber banner inside the Time card, Save still works; editing a schedule never warns about itself; (2) detail card: Mark done / Skip / Undo, pill shows Done/Skipped; (3) Day view: "Recent history" card; (4) Month agenda: done rows dimmed with a check, skipped rows dimmed + struck through.
- PACE 5 relies on two things not visible when it was written: `Timeline.jsx` already adds the `done` class to done blocks (the stylesheet had `.timeline-event.done {opacity:.6}`), and `Pill` accepts `variant="ok"` (green, used for Done). If the timeline block is not dimmed, or the Done pill is blue, paste `Timeline.jsx` / `Pill.jsx` and fix there. Skipped blocks are NOT styled on the timeline (they drop out of the overlap warning and show in the detail card, agenda and history); add a `skipped` class in `Timeline.jsx` if wanted.
- PACE 5 decisions (change only if the user asks): a conflict = any category, same date, overlapping time; cancelled/skipped items are ignored, done items still count; Undo is offered for done and skipped only (cancelled has no buttons); Recent history = last 30 days up to today, max 10 rows, Day view only, follows the category filter.

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
- Phase 4 PACE 2 ✅ (logic only, no UI change): `src/lib/recurrence.js` (none/daily/custom/weekly/selectedDays + interval, 366-day window), `ScheduleService.create/update` now generate occurrences via `syncOccurrences` (creates missing, restores re-added, removes only upcoming scheduled ones that no longer match, updates upcoming times, NEVER touches done/skipped/past history; one-time schedules move wholly), `Repository.restore`, injectable clock `createServices(repos, { today })`, `scripts/check-recurrence.mjs` (27 checks), `scripts/check-all.mjs` + `npm run check`. Existing check scripts updated for the new behaviour + fixed test date.
- Phase 4 PACE 3 ✅: add / edit / delete schedule. New: `src/pages/ScheduleForm.jsx` (routes `/scheduler/new?date=` and `/scheduler/edit/:id`), `src/lib/scheduleForm.js` (pure: drafts, repeat defaults, weekday toggle, draft->service input, focusDate), `src/components/ui/FormField.jsx`, `scripts/check-scheduleform.mjs` (22 checks). Changed: `Scheduler.jsx` (New schedule button, Edit schedule button, `?date=` param, routes), `Dashboard.jsx` (New schedule quick action opens the form), `FilterChips.jsx` (optional `label`), `Icon.jsx` (edit), `_components.scss`. Save goes only through `useServices().schedule.create/update` (generates occurrences; update sends `expectedVersion`). Errors show per field after the first Save attempt and update live. Verified in browser (add, validate, edit, delete, missing id, dashboard link, mobile dark).
- Phase 4 PACE 4 ✅: Day / Week / Month / Year views all work. New: `src/lib/calendar.js` (monthGrid, yearMonths, viewRange, shiftView, dayCounts…), `src/components/ui/MonthGrid.jsx` (up to 3 dots + "+N" per day), `YearGrid.jsx` (12 mini months, busy days tinted), `scripts/check-calendar.mjs` (16 checks). Changed: `Scheduler.jsx` (rewritten around a `view` state; prev/Today/next follow the view; tapping a day opens Day, tapping a month opens Month; Month shows an agenda card; category filter + legend work in every view), `LineChart.jsx` (removed unused props -> 0 lint warnings), `_components.scss`. Verified in browser (all views, navigation, filter, mobile dark).
- Phase 4 PACE 5 ✅ (code delivered; user verifies build/lint/visuals): conflict warning, Done / Skipped / Undo, history. New: `src/lib/conflicts.js` (pure: `conflictRange`, `findConflicts(input, existing, { ignoreScheduleId })`, `conflictMessage`; expands the draft with `occurrenceDates`, ignores cancelled/skipped and the schedule being edited, never blocks saving), `scripts/check-conflicts.mjs` (42 checks: overlap edges, statuses, midnight, incomplete drafts, repeating drafts, message, real services, status cycle, history). Changed: `ScheduleForm.jsx` (loads `activity.list` for the draft's date range; amber `NoteBanner` in the Time card, up to 3 conflicts + "You can still save"), `Scheduler.jsx` (Mark done / Skip / Undo in the detail card via `schedule.setOccurrenceStatus` then re-read; status pill; done/skipped rows in the Month agenda; "Recent history" card in Day view; data reload key), `ScheduleService.js` (+ `listHistory({ from, to, category, limit })`: done + skipped, newest first, joined with schedule title/category; `setOccurrenceStatus` already existed and is unchanged), `Icon.jsx` (+ `check`, `undo`), `_components.scss` (one appended PACE 5 block, tokens only). No new hues, no layout change outside the new controls.