import { useEffect, useState } from 'react';
import { useAuth } from './AuthContext';
import { ServicesContext } from './ServicesContext';
import { createRepositories, createMemoryStore, createIndexedDBAdapterFactory, closeUserDB } from '../repositories/index.js';
import { createServices } from '../services/index.js';
import { seedDemoData } from '../services/demoSeed.js';
import { createDefaultReminderAdapter } from '../reminders/index.js';
import { loadReminderSettings, saveReminderSettings } from '../lib/reminderSettingsStorage.js';

// Demo mode's data is throwaway, so it stays in one shared in-memory store for the app's lifetime (never persisted).
const demoStore = createMemoryStore();

export function ServicesProvider({ children }) {
  const { user, demo } = useAuth();
  const uid = user?.uid ?? null;
  const [ready, setReady] = useState({ uid: null, services: null });

  useEffect(() => {
    if (!uid) return undefined;
    let alive = true;
    // Demo mode: shared in-memory store (ephemeral, as before). Real signed-in users: IndexedDB, one database per
    // uid (Phase 6 PACE 1), so their data survives reloads and sign-outs on this device.
    const repos = demo
      ? createRepositories({ userId: uid, store: demoStore })
      : createRepositories({ userId: uid, createAdapter: createIndexedDBAdapterFactory(uid) });
    const services = createServices(repos, {
      reminderAdapter: createDefaultReminderAdapter(),
      reminderSettings: loadReminderSettings(),
      onReminderSettingsChange: saveReminderSettings,
    });
    (demo ? seedDemoData(services) : Promise.resolve())
      .then(() => services.reminders.sync())   // seeded demo data must get its reminders too (idempotent, never rejects)
      .then(() => { if (alive) setReady({ uid, services }); });
    // Stop the reminder timers of these services (sign-out, StrictMode's double effect) so two copies never fire, and
    // drop the cached IndexedDB connection (a no-op for demo mode, which never opened one) so a later sign-in reopens cleanly.
    return () => { alive = false; services.reminders.dispose(); closeUserDB(uid); };
  }, [uid, demo]);

  const services = ready.uid === uid ? ready.services : null;
  if (uid && !services) return <div className="auth-loading" role="status">Loading…</div>;
  return <ServicesContext.Provider value={services}>{children}</ServicesContext.Provider>;
}