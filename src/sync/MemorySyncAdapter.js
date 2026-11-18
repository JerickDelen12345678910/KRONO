// Fake sync adapter (Phase 7 PACE 1, pull added in PACE 3): an in-memory stand-in "remote". Used in tests, and as the
// actual adapter in demo mode — so demo data never leaves the device; this just proves the SyncService/adapter contract
// works. Implements last-write-wins by `updatedAt` (decided 2026-11-17): a push whose `updatedAt` is OLDER than what is
// already "remote" loses and is reported as a conflict instead of overwriting it. Two SyncServices can share ONE instance
// to stand in for "two devices talking to the same cloud".
export class MemorySyncAdapter {
  constructor() {
    this.remote = new Map();   // collection -> Map(id -> record), the fake "cloud"
    this.order = new Map();    // collection -> Map(id -> server-order number): the fake "server clock" pull() cursors follow
    this.clock = 0;
    this.calls = [];           // every push()/pull() call, recorded so tests can inspect what was sent
    this.disposed = false;
  }

  table(collection) { return this.remote.get(collection) ?? this.remote.set(collection, new Map()).get(collection); }
  sequence(collection) { return this.order.get(collection) ?? this.order.set(collection, new Map()).get(collection); }

  /** Test helper: put a record "in the cloud" as if another device had pushed it (so pull() can see it). */
  seed(collection, record) {
    this.table(collection).set(record.id, { ...record });
    this.sequence(collection).set(record.id, (this.clock += 1));
  }

  async push(collection, records) {
    this.calls.push({ method: 'push', collection, records: records.map((r) => ({ ...r })) });
    if (this.disposed) return records.map((r) => ({ id: r.id, status: 'applied' }));
    const table = this.table(collection);
    return records.map((r) => {
      const existing = table.get(r.id);
      if (existing && existing.updatedAt > r.updatedAt) return { id: r.id, status: 'conflict', remote: { ...existing } };
      this.seed(collection, r);
      return { id: r.id, status: 'applied' };
    });
  }

  async pull(collection, { since = null } = {}) {
    this.calls.push({ method: 'pull', collection, since });
    if (this.disposed) return { records: [], cursor: since };
    const order = this.sequence(collection);
    const rows = [...this.table(collection).values()]
      .map((r) => [order.get(r.id) ?? 0, r])
      .filter(([n]) => n > (since ?? 0))
      .sort((a, b) => a[0] - b[0]);
    return { records: rows.map(([, r]) => ({ ...r })), cursor: rows.length ? rows[rows.length - 1][0] : since };
  }

  dispose() { this.disposed = true; }
}