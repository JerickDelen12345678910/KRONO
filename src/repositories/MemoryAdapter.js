// In-memory storage adapter (PACE 2). Phase 6 adds IndexedDB / SQLite adapters with the SAME four methods:
//   get(id) · getAll() · put(record) · hardDelete(id)      (all async, all return copies)
const clone = (v) => (v == null ? v : structuredClone(v));

export const createMemoryStore = () => new Map();

export class MemoryAdapter {
  constructor(store, namespace) {
    this.table = store.get(namespace) ?? store.set(namespace, new Map()).get(namespace);
  }
  async get(id) { return clone(this.table.get(id) ?? null); }
  async getAll() { return [...this.table.values()].map(clone); }
  async put(record) { this.table.set(record.id, clone(record)); return clone(record); }
  async hardDelete(id) { return this.table.delete(id); }
}
