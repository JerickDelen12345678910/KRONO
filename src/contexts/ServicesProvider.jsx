import { useEffect, useState } from 'react';
import { useAuth } from './AuthContext';
import { ServicesContext } from './ServicesContext';
import { createRepositories, createMemoryStore } from '../repositories/index.js';
import { createServices } from '../services/index.js';
import { seedDemoData } from '../services/demoSeed.js';
import { createDefaultReminderAdapter } from '../reminders/index.js';
import { loadReminderSettings, saveReminderSettings } from '../lib/reminderSettingsStorage.js';

// Shared in-memory data. Phase 6 replaces this with IndexedDB (web) / SQLite (Android) adapters.
const store = createMemoryStore();

export function ServicesProvider({ children }) {
  const { user, demo } = useAuth();
  const uid = user?.uid ?? null;
  const [ready, setReady] = useState({ uid: null, services: null });

  useEffect(() => {
    if (!uid) return undefined;
    let alive = true;
    const services = createServices(createRepositories({ userId: uid, store }), {
      reminderAdapter: createDefaultReminderAdapter(),
      reminderSettings: loadReminderSettings(),       // Phase 5 PACE 3: restore the saved global settings on start
      onReminderSettingsChange: saveReminderSettings,  // and persist them whenever ReminderService.setSettings() changes them
    });
    (demo ? seedDemoData(services) : Promise.resolve())
      .then(() => services.reminders.sync())   // seeded demo data must get its reminders too (idempotent, never rejects)
      .then(() => { if (alive) setReady({ uid, services }); });
    // Stop the reminder timers of these services (sign-out, StrictMode's double effect) so two copies never fire.
    return () => { alive = false; services.reminders.dispose(); };
  }, [uid, demo]);

  const services = ready.uid === uid ? ready.services : null;
  if (uid && !services) return <div className="auth-loading" role="status">Loading…</div>;
  return <ServicesContext.Provider value={services}>{children}</ServicesContext.Provider>;
}