// Fake sync adapter (Phase 7 PACE 1): an in-memory stand-in "remote". Used in tests, and as the actual default
// until PACE 2 adds a real Firestore adapter — so right now NOTHING syncs anywhere real yet; this just proves the
// SyncService/adapter contract works. Implements last-write-wins by `updatedAt` (decided 2026-11-17): a push whose
// `updatedAt` is OLDER than what is already "remote" loses and is reported as a conflict instead of overwriting it.
export class MemorySyncAdapter {
  constructor() {
    this.remote = new Map();   // collection -> Map(id -> record), the fake "cloud"
    this.calls = [];           // every push() call, recorded so tests can inspect what was sent
    this.disposed = false;
  }

  async push(collection, records) {
    this.calls.push({ method: 'push', collection, records: records.map((r) => ({ ...r })) });
    if (this.disposed) return records.map((r) => ({ id: r.id, status: 'applied' }));
    const table = this.remote.get(collection) ?? this.remote.set(collection, new Map()).get(collection);
    return records.map((r) => {
      const existing = table.get(r.id);
      if (existing && existing.updatedAt > r.updatedAt) return { id: r.id, status: 'conflict', remote: { ...existing } };
      table.set(r.id, { ...r });
      return { id: r.id, status: 'applied' };
    });
  }

  dispose() { this.disposed = true; }
}