// In-memory reminder adapter: the default, and what the check scripts use. Nothing ever fires; it only remembers
// what was scheduled and records every call in `calls` so tests can prove "no duplicates, replace on edit, cancel on done".

const byFire = (a, b) => a.fireAt.localeCompare(b.fireAt) || a.id.localeCompare(b.id);

export class MemoryReminderAdapter {
  constructor() {
    this.name = 'memory';
    this.items = new Map();   // id -> reminder
    this.calls = [];          // [{ type: 'schedule' | 'cancel', ids: [...] }]
    this.disposed = false;
  }

  async list() {
    return [...this.items.values()].map((r) => ({ ...r })).sort(byFire);
  }

  /** Same id = replace. */
  async schedule(reminders = []) {
    if (this.disposed) return;
    this.calls.push({ type: 'schedule', ids: reminders.map((r) => r.id) });
    for (const r of reminders) this.items.set(r.id, { ...r });
  }

  async cancel(ids = []) {
    if (this.disposed) return;
    this.calls.push({ type: 'cancel', ids: [...ids] });
    for (const id of ids) this.items.delete(id);
  }

  dispose() {
    this.disposed = true;
    this.items.clear();
  }
}