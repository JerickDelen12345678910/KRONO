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
src/repositories/ Repository (validate, version, soft delete, sync status) + MemoryAdapter + createRepositories({ userId })  — storage swappable in Phase 6
src/services/  ScheduleService, WorkoutService, PlaceService, SampleDataService + createServices(repos)
src/lib/errors.js (AppError + codes) · src/lib/firebase.js · src/hooks/useOnlineStatus.js · scripts/check-models.mjs · scripts/check-repositories.mjs (run: node scripts/<file>)
firestore.rules · storage.rules · .env (never commit) · .env.example
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
Screen/component -> **service** (`src/services`) -> **repository** (`src/repositories`) -> **storage adapter**. Components never touch a repository or database. Errors are `AppError` with a `code`; validation errors carry `details.errors` by field.

## 6. Known gotchas (already solved — don't reintroduce)
- `ToggleSwitch` is a `<button>`: use `onClick` + `aria-checked`, not `onChange`/`:checked`.
- A container can't style itself with `@container`; that's why we use `@media`.
- Sass: `@use` rules must come first; partials needing tokens do `@use "design-tokens" as *;`.
- No `.env` → app runs in **demo mode** (fake user). Restart `npm run dev` after editing `.env`.
- PowerShell (Windows): run one command per line.

## 7. Definition of done (every task)
- [ ] `npm run build` passes · [ ] `node scripts/check-models.mjs` and `node scripts/check-repositories.mjs` pass · [ ] checked at **390px and 1280px**, **Light and Dark** · [ ] no horizontal scroll
- [ ] matches design preview · [ ] `git commit -m "phase X: …"` · [ ] `docs/PROGRESS.md` updated (status, NEXT TASK, files changed)
