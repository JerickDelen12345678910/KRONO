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
src/pages/    Dashboard, Scheduler, Fitness, MapPage, Account, Login
src/routes/   AppRoutes, ProtectedRoute
src/models/   Shared data shapes + validators (pure JS, no UI/DB). `createX()` builds a record, `validateX()` returns { valid, errors }
src/repositories/ Repository (validate, version, soft delete, sync status, applyRemote = store a record that came FROM the backend as synced, Phase 7 PACE 3) + MemoryAdapter (demo mode) + IndexedDBAdapter (real users, one IndexedDB database per uid via `idb`, Phase 6 PACE 1-2) + createRepositories({ userId, store|createAdapter }) — SQLite/Android is Phase 13
src/services/  ScheduleService, WorkoutService, PlaceService, ActivityService (dashboard timeline), SampleDataService, ReminderService (Android/web reminders), SyncService (offline sync, Phase 7: each run PULLS then PUSHES; conflicts resolved last-write-wins) + createServices(repos)
src/reminders/ ReminderAdapter.js (adapter contract + PERMISSION) · MemoryReminderAdapter.js · BrowserNotificationAdapter.js (web, app-open only) · index.js (createDefaultReminderAdapter) — native Android adapter is Phase 13
src/sync/      SyncAdapter.js (adapter contract: push(collection, records) -> applied|conflict|error per record; optional pull(collection, { since }) -> { records, cursor }; last-write-wins by updatedAt) · MemorySyncAdapter.js (fake — demo mode and tests; can stand in for a shared cloud between two test devices) · FirestoreSyncAdapter.js (real cloud for signed-in users: one transaction per record at users/{uid}/{collection}/{id}; every push stamps a server `syncedAt` and pulls follow it, never the device's updatedAt; takes { db, doc, runTransaction, serverTimestamp, collection, query, where, orderBy, getDocs } so it stays Node-testable) · CursorStore.js (where a pull remembers its position: MemoryCursorStore for demo/tests, IndexedDBCursorStore keeps it in the user's own `syncMetadata` store) · index.js (createDefaultSyncAdapter({ userId, demo, firestore }) — Firestore only when !demo and a Firestore instance is passed)
src/contexts/ ServicesProvider.jsx + src/hooks/useServices.js  — screens get services with `const { schedule, workout, place, activity, reminders, sync } = useServices()`
src/lib/timeline.js (pure week/timeline/overlap logic) · src/lib/recurrence.js (repeat rule -> dates) · src/lib/calendar.js (month/year grids, view ranges) · src/lib/scheduleForm.js (form drafts + conversion) · src/lib/reminders.js (pure reminder planning: buildReminders/diffReminders/defaultReminder) · src/lib/reminderSettingsStorage.js (persists global reminder settings; swap target for Phase 6) · pages/ScheduleForm.jsx · src/services/demoSeed.js (isSample demo data) · src/lib/errors.js (AppError + codes) · src/lib/firebase.js · src/hooks/useOnlineStatus.js · scripts/check-*.mjs (one per area) · scripts/check-all.mjs — run ALL with: npm run check
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

## 6. Known gotchas (already solved — don't reintroduce)
- `ToggleSwitch` is a `<button>`: use `onClick` + `aria-checked`, not `onChange`/`:checked`.
- A container can't style itself with `@container`; that's why we use `@media`.
- Sass: `@use` rules must come first; partials needing tokens do `@use "design-tokens" as *;`.
- No `.env` → app runs in **demo mode** (fake user). Restart `npm run dev` after editing `.env`.
- PowerShell (Windows): run one command per line.

## 7. Definition of done (every task)
- [ ] `npm run build` passes · [ ] `npm run check` passes (runs every check script) · [ ] checked at **390px and 1280px**, **Light and Dark** · [ ] no horizontal scroll
- [ ] matches design preview · [ ] `git commit -m "phase X: …"` · [ ] `docs/PROGRESS.md` updated (status, NEXT TASK, files changed)