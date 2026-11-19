# AGENTS.md — All-in-One App (read this first, every session)

Works for ANY AI/tool (Claude Code, Claude chat, Codex, Gemini, Cursor). Goal: a new AI continues the project with **zero change to design or functionality**.

## 1. What this is
Offline-first multi-purpose app: **Scheduler + Fitness + Map** (+ COR OCR, reminders, sync) for web/PWA and Android (Capacitor). Philippines context. Full spec: `docs/PROJECT_PLAN.md`. Visual truth: `docs/design-preview.html` (open in a browser; Web / Mobile / All parts; Light / Dark).

**Stack (locked):** React 19 + Vite · React Router 6 · Bootstrap 5.3 (compiled CSS) + SCSS · Firebase Auth + Firestore · Recharts (line charts only). Later phases: IndexedDB (web), SQLite + Capacitor (Android), Google Maps, PWA.

## 2. Golden rules (never break)
1. **Do not change the design, layout, copy, or behavior** of anything already built unless the user explicitly asks. Match `docs/design-preview.html` and `docs/DESIGN_LOCK.md`.
2. **Follow the plan phases in order** (`docs/PROGRESS.md` shows where we are). Do the NEXT TASK only. Work one PACE at a time, then stop and wait.
3. **Never rewrite working files.** Make targeted edits; deliver complete updated files with their path.
4. **Colors/spacing only from tokens** (`src/styles/_design-tokens.scss`). No hard-coded hex, no new hues.
5. **Never reconstruct code from memory.** Read the real file first (ask the user to paste it if you can't see the disk).
6. After EVERY finished task: run build, commit, update `docs/PROGRESS.md`. (Do this per task, not only at the end — the user may hit a usage limit at any time.)

## 3. Start-of-session checklist
```
git status && git log -5 --oneline
npm run build
```
Then read `docs/PROGRESS.md` → "NEXT TASK", and `docs/DESIGN_LOCK.md`. If something is unclear, ask ALL questions in one message.

## 4. Project map
```
src/styles/   _design-tokens.scss (colors, shadows, sizes) · _variables.scss (Bootstrap var mapping) · _components.scss (all component CSS) · main.scss
src/contexts/ ThemeContext (light default, key "theme") · AuthContext (Firebase or demo mode)
src/components/layout/ AppShell, Header, Sidebar (>=820px), BottomNav (<820px), StatusBar (mobile only)
src/components/ui/     Button, Card, KPICard, Pill, ToggleSwitch, SegmentedControl, FilterChips, Row, Stepper, NoteBanner, LineChart, Icon
src/pages/    Dashboard, Scheduler, Fitness (+ ExerciseLibrary and ExerciseDetail at /fitness/exercises and /fitness/exercises/:id; MyWorkouts at /fitness/workouts; WorkoutForm at /fitness/workouts/new and /fitness/workouts/:id; WorkoutSession at /fitness/session/:id, Phase 9 PACE 4a), MapPage, Account, Login
src/routes/   AppRoutes, ProtectedRoute
src/models/   Shared data shapes + validators (pure JS, no UI/DB). `createX()` builds a record, `validateX()` returns { valid, errors }
src/repositories/ Repository (validate, version, soft delete, sync status, applyRemote = store a record that came FROM the backend as synced, Phase 7 PACE 3) + MemoryAdapter (demo mode) + IndexedDBAdapter (real users, one IndexedDB database per uid via `idb`, Phase 6 PACE 1-2) + createRepositories({ userId, store|createAdapter }) — SQLite/Android is Phase 13
src/services/  ScheduleService, WorkoutService (built-in exercise library lookups + `plan`/`today`/`upcoming`/`summary`/`progress`, Phase 9; the workout session: `openSession`/`findOpenSession`/`getSession`/`saveSessionEntries`/`finishSession`/`discardSession`, Phase 9 PACE 4a), PlaceService, ActivityService (dashboard timeline), SampleDataService, ReminderService (Android/web reminders), SyncService (offline sync, Phase 7: each run PULLS then PUSHES; conflicts resolved last-write-wins; `subscribe()` events + `getStatus()` snapshot for the UI) + createServices(repos)
src/reminders/ ReminderAdapter.js (adapter contract + PERMISSION) · MemoryReminderAdapter.js · BrowserNotificationAdapter.js (web, app-open only) · index.js (createDefaultReminderAdapter) — native Android adapter is Phase 13
src/sync/      SyncAdapter.js (adapter contract: push(collection, records) -> applied|conflict|error per record; optional pull(collection, { since }) -> { records, cursor }; last-write-wins by updatedAt) · MemorySyncAdapter.js (fake — demo mode and tests; can stand in for a shared cloud between two test devices) · FirestoreSyncAdapter.js (real cloud for signed-in users: one transaction per record at users/{uid}/{collection}/{id}; every push stamps a server `syncedAt` and pulls follow it, never the device's updatedAt; takes { db, doc, runTransaction, serverTimestamp, collection, query, where, orderBy, getDocs } so it stays Node-testable) · CursorStore.js (where a pull remembers its position: MemoryCursorStore for demo/tests, IndexedDBCursorStore keeps it in the user's own `syncMetadata` store) · index.js (createDefaultSyncAdapter({ userId, demo, firestore }) — Firestore only when !demo and a Firestore instance is passed)
src/contexts/ ServicesProvider.jsx + src/hooks/useServices.js  — screens get services with `const { schedule, workout, place, activity, reminders, sync } = useServices()`
src/lib/syncStatus.js (pure: sync status -> the 4 Account pipeline steps) · src/hooks/useSyncStatus.js (live sync status for display) · src/hooks/useRemoteChanges.js (a screen re-reads when a pull brings in records for the collections it shows) · src/lib/timeline.js (pure week/timeline/overlap logic) · src/lib/recurrence.js (repeat rule -> dates) · src/lib/calendar.js (month/year grids, view ranges) · src/lib/scheduleForm.js (form drafts + conversion) · src/lib/reminders.js (pure reminder planning: buildReminders/diffReminders/defaultReminder) · src/lib/reminderSettingsStorage.js (persists global reminder settings; swap target for Phase 6) · pages/ScheduleForm.jsx · src/services/demoSeed.js (isSample demo data: sample schedules + occurrences, and Fitness workouts + finished sessions, Phase 9 PACE 2b) · src/lib/errors.js (AppError + codes) · src/lib/firebase.js · src/hooks/useOnlineStatus.js · scripts/check-*.mjs (one per area) · scripts/check-all.mjs — run ALL with: npm run check
src/lib/cor.js (COR Review-step contract: validateCorFile, prepareCreate, row shape) · src/lib/corParser.js (pure: raw OCR text -> subjects/unparsedRows/`period` (school year + semester printed in the page header, null if absent); `LAYOUTS` registry, City College only; a row's day groups/room are found by SHAPE so column-by-column and line-by-line text read identically) · src/lib/corOcrCore.js (pure + Node-testable: `OCR_ERROR`, `CorOcrError`, `corFileKind`, `itemsToLines`/`textFromItems` = rebuild visual lines from positioned text) · src/lib/corOcr.js (BROWSER-ONLY: a PDF's own text layer first (pdfjs `getTextContent`), Tesseract.js OCR as fallback for photos/scans, run at ~300 dpi (PDF page scale 4; small images enlarged to 2500 px wide) because OCR accuracy depends on resolution; Vite `?url` import; re-exports corOcrCore; never import it from a `scripts/check-*.mjs`)
src/lib/exerciseLibrary.js (static built-in exercise library: 30 exercises, 5 per category, deeply frozen, never stored/synced; `FITNESS_DISCLAIMER`) · src/lib/fitness.js (pure Fitness logic: labels, week/month ranges, daily/weekly series, streaks, weekly stats, `plannedWorkouts`; no UI, no storage) · src/lib/fitnessView.js (pure view logic for the Fitness screen: KPI card texts, chart model + aria description, today's workout blocks, category filter) · src/lib/exerciseView.js (pure view logic for the exercise library + detail screens: filter chips, filters <-> URL query string, row and detail texts) · src/lib/workoutForm.js (pure logic of the workout builder: drafts that keep numbers as typed text, add/update/remove/move exercises, `validateDraft` (workout + per-exercise errors), `draftToInput` (update) / `draftToNewWorkout` (create), `itemsWithExercise`, picker and "My workouts" row texts, `deleteMessage`; the calendar link: `scheduleOptions`, `competingWorkouts`, `rivalsToUnlink`, `replaceMessage`, `isLinkLost`) · src/lib/session.js (pure logic of the workout session screen, Phase 9 PACE 4a: `planEntries` plan snapshot, `logSet`/`undoSet`/`skipEntry`/`unskipEntry`, `sessionProgress`/`progressText`, `finalizeEntries`, `finishMessage`/`discardMessage`, `entryView`, `elapsedSeconds`/`isOpenSession` + `SESSION_WINDOW_SECONDS`)
firestore.rules (owner-only; synced collections under users/{uid}/ are whitelisted + shape-checked, `syncedAt` must be the server time — add new synced collections there) · storage.rules · .env (never commit) · .env.example
```

## 5. Conventions
- Function components, named exports, one component per file. Reuse `components/ui/*` before creating new ones.
- Layout uses **viewport `@media (min-width: 820px)`** (NOT `@container`). Page columns: `.cols` (1.5fr/1fr) + `.stack`, always `minmax(0, …)`.
- Our class names must not collide with Bootstrap: use `ui-card`, `list-row`, `form-field` (never `.card`, `.row`).
- No inline styles for layout. No emoji as icons (use `Icon`). Charts: **line only**.
- Product rules: local-first saving then sync; **Sign out / Delete account disabled offline**; overlap warnings never block saving; maps/routes need internet; fitness text is general info, not medical advice.

## 5b. Data conventions (models)
- Dates `YYYY-MM-DD`, times `HH:mm` (local), timestamps ISO strings; weekdays 0=Sun..6=Sat.
- Every synced record: `id, createdAt, updatedAt, version, deleted/deletedAt (soft delete), syncStatus (local|pending|syncing|synced), isSample`. Change records only with `touch()` / `markDeleted()`.
- Recurring items = one `Schedule` definition + dated `Occurrence`s with deterministic id `${scheduleId}_${date}` (retries cannot duplicate).
- Colors in models are token names (primary/slate/success/warning), never hex.

## 5c. Layers (never skip one)
Screen/component -> **service** (`src/services`) -> **repository** (`src/repositories`) -> **storage adapter**. Components never touch a repository or database. Errors are `AppError` with a `code`; validation errors carry `details.errors` by field. In UI catch blocks show `handleError(e, 'context')` (never raw `e.message`).

## 5d. Scheduler UI notes
- Category colors use `data-color="primary|slate|success|warning"` (sets `--c`/`--cs`); never hard-code colors in components.
- The timeline shows only persisted occurrences (see Phase 4 PACE 2). Overlaps never block saving.

## 5e. Schedules and occurrences
- Create/edit schedules ONLY through `useServices().schedule.create/update`: they run `syncOccurrences`, which generates dated occurrences from the repeat rule. Writing to the repository directly leaves the timeline empty.
- Edits never rewrite history: done/skipped/past occurrences are kept; only upcoming scheduled ones follow the new rule/time. Tests inject the date: `createServices(repos, { today: () => 'YYYY-MM-DD' })`.

## 5g. Calendar views
- The Scheduler keeps ONE `view` state (day/week/month/year) and loads only the visible range through `activity.list({ from, to, category })`; navigation uses `shiftView`/`viewRange` from `lib/calendar.js`. Month/Year show dots only; details live in Day/Week.

## 5f. Forms
- Form logic is pure and tested in `src/lib/*Form.js`; the page only renders. Use `FormField` for label + control + error, `form-field` / `form-grid` / `row-2` styles, `type="date"` / `type="time"` inputs (they already produce `YYYY-MM-DD` / `HH:mm`).
- Show field errors only after the first Save attempt, then live. Save through a service, and show unexpected errors with `handleError`.

## 5h. Fitness
- All Fitness logic is pure in `src/lib/fitness.js` (tested by `scripts/check-fitness.mjs`); screens only render what it and `useServices().workout` return. The exercise library is static data (`src/lib/exerciseLibrary.js`): never stored, synced or edited; a workout item points at an exercise by `exerciseId`.
- A session's day is its LOCAL date (`sessionDate`), never the UTC date in `startedAt`. Weeks run Monday..Sunday.
- The weekly goal = number of workouts PLANNED that week (occurrences of schedules linked to a workout: `workout.scheduleId` or `schedule.linkedWorkoutId`). Nothing planned -> goal is `null`; never invent a number.
- Streak counts back from today, or from yesterday while today has no workout yet.
- The Fitness screen (`pages/Fitness.jsx`) only renders `fitnessView.js` output (tested by `scripts/check-fitness-view.mjs`); it gets data from `useServices().workout` (`summary`, `upcoming`, `progress`) and re-reads with `useRemoteChanges`. Category chips filter today's planned workouts. Fitness CSS lives in `_components.scss` (`.workout-*`, `.fit-note`).
- Demo mode seeds 3 sample workouts (`sample-upper-body` is linked to the `sample-gym` schedule) and 13 completed sample sessions in the past (never today), all `isSample`, ids fixed (`sample-session_<date>`); "Remove sample data" removes them. Tested by `scripts/check-demo-seed.mjs`. A new demo seed must pass WHOLE records to `getOrCreate`.
- Exercise library screens (`pages/ExerciseLibrary.jsx`, `pages/ExerciseDetail.jsx`) only render `exerciseView.js` output and read the static library through `useServices().workout.listExercises/getExercise/exerciseCount`. Their filters live in the URL (`?category=&difficulty=&q=`), and a detail's back button restores them from router state. Tested by `scripts/check-exercise-view.mjs`. CSS: `.exercise-*` in `_components.scss`.
- Workout builder (`pages/WorkoutForm.jsx`, `pages/MyWorkouts.jsx`; tested by `scripts/check-workout-form.mjs`): create / edit / delete a workout, exercises picked from the static library (`itemFromExercise` defaults) and edited per exercise (sets, reps OR seconds, rest), reorder with Up/Down. The form pattern is `ScheduleForm`'s: pure logic in `src/lib/workoutForm.js`, errors only after the first Save attempt, `handleError` for unexpected ones. Create passes a WHOLE record (`draftToNewWorkout`); create and update both carry `scheduleId` (the link to the calendar, `null` = not planned; the draft loads it, so an edit never loses it). Deleting a workout keeps its finished sessions (they store `workoutName`). `ExerciseDetail` has "Add to a workout": a new workout (`/fitness/workouts/new?exercise=<id>`) or appended to an existing one. `WorkoutService` has no `get(id)`: the builder reads `workout.list()` and finds the id.
- Calendar link (Phase 9 PACE 3c): "Plan on the calendar" in the builder links a workout to ONE existing schedule through `workout.scheduleId` (the link `plannedWorkouts` reads; nothing writes `schedule.linkedWorkoutId`). A schedule plans one workout: saving a workout onto a schedule another workout holds asks first (`replaceMessage`) and sets that workout's `scheduleId` to `null`. The form re-reads workouts and schedules at Save time. A link to a deleted schedule is shown as "not planned" and cleaned on the next save; My workouts shows "Scheduled" only while the schedule exists. The link never edits the schedule itself (no occurrence re-sync, no reminder change).
- `WorkoutService` is built from the whole repos map (it also reads `schedules` and `occurrences`); tests inject `today`. Fitness text is general information, not medical advice (`FITNESS_DISCLAIMER`); charts are line only.
- Workout session (Phase 9 PACE 4a; `pages/WorkoutSession.jsx` at `/fitness/session/:id`, pure logic in `src/lib/session.js`, tested by `scripts/check-session.mjs`): "Start workout" on the dashboard calls `workout.openSession(workoutId)` (continues the workout's open session started within the last 3 hours, else creates one whose `entries` carry a `plan` snapshot `{ sets, reps, durationSec, restSec }`; `startSession` is the older plan-less variant and is unchanged). The screen applies pure changes (`logSet`/`undoSet`/`skipEntry`/`unskipEntry`) and saves the whole `entries` after every change through `workout.saveSessionEntries` (saves are queued, so quick taps cannot overwrite each other); Finish (`finalizeEntries`: partly done = completed with the sets logged, untouched = skipped; disabled until a set is logged) calls `finishSession(id, { entries, activeSeconds })`; Discard calls `discardSession`. Active time is an ESTIMATE in 4a (time since the session started, at most 3 h) until PACE 4b adds the real counter. An in-progress session is never in `listHistory` or the weekly numbers. No CSS of its own: it reuses `.workout-*`, `.status-actions`, `.fit-note`, `.cols`/`.stack`.

## 6. Known gotchas (already solved — don't reintroduce)
- `ToggleSwitch` is a `<button>`: use `onClick` + `aria-checked`, not `onChange`/`:checked`.
- A container can't style itself with `@container`; that's why we use `@media`.
- Sass: `@use` rules must come first; partials needing tokens do `@use "design-tokens" as *;`.
- No `.env` → app runs in **demo mode** (fake user). Restart `npm run dev` after editing `.env`.
- A `scripts/check-*.mjs` runs in plain Node: it must never import a browser-only module (Vite `?url`/`?raw` imports, canvas, Worker, `import.meta.env`). Put the pure logic in its own Node-safe file and test that (example: `corOcrCore.js` vs `corOcr.js`).
- PowerShell (Windows): run one command per line.

## 7. Definition of done (every task)
- [ ] `npm run build` passes · [ ] `npm run check` passes (runs every check script) · [ ] checked at **390px and 1280px**, **Light and Dark** · [ ] no horizontal scroll
- [ ] matches design preview · [ ] `git commit -m "phase X: …"` · [ ] `docs/PROGRESS.md` updated (status, NEXT TASK, files changed)