// Sync adapter CONTRACT (Phase 7 PACE 1, extended in PACE 2). SyncService talks only to this shape, so the backend can be swapped:
//   MemorySyncAdapter (tests / demo mode) · FirestoreSyncAdapter (real cloud push for signed-in users).
//
// REQUIRED (async):
//   push(collection, records) -> for each record, upsert it remotely UNLESS a newer version is already there
//     (last-write-wins by `updatedAt`, decided 2026-11-17); returns one result per record, in the same order:
//       { id, status: 'applied' }             the record is now the source of truth remotely
//       { id, status: 'conflict', remote }     a newer remote record won; `remote` is the winning copy
//       { id, status: 'error', error }         this one record failed (rules, bad id, network); it stays pending and
//                                              is retried next sweep, and must NOT stop the other records
//     push() may still reject when the whole call cannot start (e.g. offline); SyncService treats that as a failed run.
//     `records` is always an array of FULL records, including soft-delete markers — deleted records sync too, per
//     docs/PROJECT_PLAN.md section 5's "use deletion markers" rule. push() must be safe to call again with the
//     exact same records: it's an upsert keyed by record.id, so a retry can never create a duplicate.
// OPTIONAL:
//   dispose()   stop everything (sockets, timers); the adapter should ignore push() afterwards
//   name        short label for logs

export const SYNC_RESULT = Object.freeze({ APPLIED: 'applied', CONFLICT: 'conflict', ERROR: 'error' });

export const ADAPTER_METHODS = Object.freeze(['push']);

/** Returns the adapter, or throws a TypeError naming the missing methods. */
export function assertSyncAdapter(adapter) {
  const missing = ADAPTER_METHODS.filter((m) => typeof adapter?.[m] !== 'function');
  if (missing.length) throw new TypeError(`Sync adapter is missing: ${missing.join(', ')}`);
  return adapter;
}