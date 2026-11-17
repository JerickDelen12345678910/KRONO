# PROGRESS — the AI must update this after EVERY task

## CURRENT STATE
- Last updated: 2026-11-17 by Claude (claude.ai chat)
- Branch/last commit: `master`; Phase 6 (IndexedDB) is complete and committed. Phase 7 PACE 1 (sync adapter contract + SyncService, push-only, in-memory fake — no real backend wired yet) files are delivered but NOT yet committed — awaiting your verification.
- Build status: Phase 7 PACE 1 not yet run by the user: `npm run build`, `npm run check` (expect 15/15 scripts, new `check-sync.mjs`), `npm run lint`, then by eye (should look identical to before — see Open issues).

## NEXT TASK  ← start here
**First:** verify Phase 7 PACE 1 (see Open issues), then `git commit -m "phase 7 pace 1: sync adapter contract + SyncService (push-only, in-memory fake), not yet wired to a real backend"`.

Once confirmed, **PACE 2** is the real Firestore adapter: implement `push(collection, records)` against Cloud Firestore (likely a transaction per record to read-then-compare-`updatedAt` before writing, matching the last-write-wins policy `MemorySyncAdapter` already models), extend `createDefaultSyncAdapter()` to return it when `isFirebaseConfigured && !demo` (mirrors how `IndexedDBAdapter` was gated), and write `firestore.rules` restricting each collection to its own `userId`. This needs `src/lib/firebase.js` and `firestore.rules` (if it exists yet) pasted before starting, and is gated on the user actually configuring `.env` to test against a real project — same blocker as Phase 2/6's real-backend checks.

## Phase checklist (from docs/PROJECT_PLAN.md)
| # | Phase | Status |
|---|-------|--------|
| 1 | Project foundation (Vite, Bootstrap+SCSS, responsive layout, UI components, Dashboard) | ✅ done |
| 2 | Firebase + Google sign-in + profiles + security rules | ✅ code done · ⏳ user must add `.env` keys and test sign-in |
| 3 | Shared core (models, services, repositories, error handling, activity structure) | ✅ done |
| 4 | Scheduler and calendar | ✅ PACE 1–6 done (PACE 5 and 6 awaiting your verification) |
| 5 | Android reminders | 🟡 PACE 1 ✅ · PACE 2 ✅ (verified + committed) · PACE 3 delivered, awaiting your verification · PACE 4 deferred to Phase 13 |
| 6 | Local databases (IndexedDB / SQLite) | ✅ web done (PACE 1+2 verified + committed) · SQLite/Android deferred to Phase 13 |
| 7 | Offline sync | 🟡 PACE 1 (adapter contract + SyncService, push-only, fake backend) delivered, awaiting your verification · PACE 2 (real Firestore adapter) next, gated on `.env` · PACE 3 (pull + conflict resolution) · PACE 4 (Account.jsx sync-pipeline UI reflects real state) |
| 8 | COR OCR | ⬜ |
| 9 | Fitness module | ⬜ |
| 10 | Map module | ⬜ |
| 11 | Unified dashboard (live data) | ⬜ |
| 12 | PWA | ⬜ |
| 13 | Android app (Capacitor, APK) | ⬜ |
| 14 | Final testing and release | ⬜ |

Statuses: ⬜ todo · 🟡 in progress (note which PACE) · ✅ done.

## Suggested paces
- **Phase 6:** PACE 1 IndexedDB adapter (done) · PACE 2 wiring (done) · SQLite/Android deferred to Phase 13.
- **Phase 7:** PACE 1 `SyncAdapter` contract + `MemorySyncAdapter` (fake/default) + `SyncService` sweeping every repo's `listUnsynced()`, push-only, tested entirely against the fake adapter (done; awaiting verification) · PACE 2 real Firestore adapter + `firestore.rules`, gated on `.env` (not started) · PACE 3 pull (remote → local) + applying a conflict's winning remote record back into local storage (not started) · PACE 4 `Account.jsx`'s sync pipeline reflects real per-record/global state instead of the current hard-coded "Waiting" display (not started).

## Open issues / decisions
- **Phase 7 PACE 1 to verify on the real repo:** `npm run build`, `npm run check` (new `check-sync.mjs`), `npm run lint` (0 warnings expected). By eye: the app should look and behave exactly as before — the only change is a quiet 20-second background sweep that has nothing to do in demo mode almost all the time. Watch the console for a minute or two to confirm no errors.
- **Two product/architecture decisions were made for Phase 7, per docs/PROJECT_PLAN.md §5's requirement to "define a conflict policy before implementation" (decided 2026-11-17, change only if the user asks):** (1) **conflict policy = last-write-wins by `updatedAt`** — no manual merge UI, matching that nothing like that exists anywhere in `docs/DESIGN_LOCK.md` or the design preview; (2) **queue design = reuse the existing `syncStatus` field** per record rather than a separate operation-log collection — `Repository.listUnsynced()` already existed for exactly this (built in Phase 3 PACE 2, "used by Phase 7"), and `touch()`/`markDeleted()` in `models/common.js` already reset `syncStatus` away from `synced` on every edit/delete, so the queue needed no new code at all, just a consumer.
- **PACE 1 scope deliberately stops short of full conflict resolution:** when `push()` reports a `conflict` (remote has a newer `updatedAt`), `SyncService` counts it and leaves the local record pending — it does NOT yet pull that winning remote record down into local storage. That requires a pull direction that doesn't exist until PACE 3; until then, a conflicting record is safely re-checked every ~20s sweep (harmless, since `push()` is an upsert check, not an append) without being lost, corrupted, or duplicated.
- SyncService triggers (decided 2026-11-17): (1) once implicitly whenever anything calls `services.sync.sync()`; (2) a periodic sweep every 20 seconds (`DEFAULT_INTERVAL_MS` in `SyncService.js`), chosen as a reasonable default rather than asked about, since it's an implementation detail rather than a product decision — tell me if you want it tuned; (3) a `useEffect` in `ServicesProvider.jsx` that calls `sync()` whenever `online` (from `useAuth()`, backed by `useOnlineStatus.js`) becomes true. Deliberately NOT wired through each service's own `onChange` hook the way reminders are — that pattern only exists on `ScheduleService` today, and wiring it into `WorkoutService`/`PlaceService`/etc. too would mean guessing at files not yet seen; the periodic sweep already catches every repository's pending records regardless of which service wrote them, without needing that.
- `SyncService` is generic: it iterates whatever's in the `repos` map passed to it (currently `schedules`, `occurrences`, `academicPeriods`, `subjects`, `workouts`, `exerciseHistory`, `destinations` — exactly `createRepositories()`'s output) and calls `listUnsynced()`/`setSyncStatus()` on each, so any future collection added to `createRepositories()` is picked up automatically with no `SyncService` change needed.
- `createDefaultSyncAdapter()` (in `src/sync/index.js`) always returns `MemorySyncAdapter` for now — nothing syncs anywhere real yet. PACE 2 only needs to change what that one function returns (mirrors how `createDefaultReminderAdapter()` picks browser vs. memory); no other file should need to change for that swap.
- Files that will be needed before PACE 2 can start: `src/lib/firebase.js` (to see the existing Firestore client setup) and `firestore.rules` (if one already exists, to extend rather than guess at from scratch).
- (Everything below unchanged from the last verified state.)
- Phase 6 decisions: one IndexedDB database per user (`local-data_<uid>`), one object store per `COLLECTIONS` entry, keyPath `id`, no secondary indexes. Demo mode always uses the shared in-memory store. Uses the `idb` library. `closeUserDB(uid)` called on cleanup. SQLite/Android deferred to Phase 13.
- Phase 5 PACE 3 decisions: a NEW schedule's reminder starts from `defaultReminder(settings)`; `emptyDraft()` stays backward compatible; "alarm only" still not offered; settings persist via `reminderSettingsStorage.js`; permission requested only from a click handler.
- Phase 5 decisions: reminder planning pure/platform-free; one reminder per occurrence; rolling window 14 days, max 60; mode = `useAlarm ? 'both' : 'notify'`.
- Phase 5 PACE 2 decisions: adapter contract in `ReminderAdapter.js`; `sync()` never rejects; permission never requested automatically.
- Phase 5 PACE 2 — fully complete (verified + committed, by-eye confirmed).
- Phase 5 PACE 3 — committed by the user.
- PACE 6 (COR): committed; visual checks at `/scheduler/cor` not yet reported.
- Lint clean (0 warnings) as of Phase 4 PACE 4; kept clean through every PACE since.
- PACE 5 decisions: a conflict (scheduling, unrelated to sync conflicts above) = any category, same date, overlapping time; Undo offered for done/skipped only; Recent history = last 30 days, max 10 rows, Day view only.

## Session log (append only — newest at bottom)
*(unchanged through Phase 6 — see prior entries)*
- Phase 7 PACE 1 ✅ (code delivered; user verifies build/check/lint/by-eye): sync adapter contract + SyncService, push-only, no real backend. New: `src/sync/SyncAdapter.js` (contract: `push(collection, records)` → `applied`/`conflict`), `src/sync/MemorySyncAdapter.js` (fake/default — an in-memory stand-in "remote" implementing last-write-wins by `updatedAt`), `src/sync/index.js` (`createDefaultSyncAdapter`), `src/services/SyncService.js` (sweeps every repo's `listUnsynced()`, merges overlapping calls like `ReminderService`, never rejects, 20s periodic sweep by default), `scripts/check-sync.mjs` (~24 checks, using the permissive `exerciseHistory` repo as a generic stand-in to avoid guessing at other models' validation shapes). Changed: `src/services/index.js` (`services.sync`), `src/contexts/ServicesProvider.jsx` (passes `createDefaultSyncAdapter()`, triggers `sync()` when `online` becomes true, disposes on cleanup), `AGENTS.md` (project map).

## Phase 13 reminders (Android + Firebase) — decided: set this up in Phase 13, not before
*(unchanged — see prior entries)*