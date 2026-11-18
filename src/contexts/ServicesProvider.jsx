import { useEffect, useState } from 'react';
import { doc, runTransaction, serverTimestamp, collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import { useAuth } from './AuthContext';
import { ServicesContext } from './ServicesContext';
import { createRepositories, createMemoryStore, createIndexedDBAdapterFactory, openUserDB, closeUserDB } from '../repositories/index.js';
import { createServices } from '../services/index.js';
import { seedDemoData } from '../services/demoSeed.js';
import { createDefaultReminderAdapter } from '../reminders/index.js';
import { loadReminderSettings, saveReminderSettings } from '../lib/reminderSettingsStorage.js';
import { createDefaultSyncAdapter, MemoryCursorStore, IndexedDBCursorStore } from '../sync/index.js';
import { db, isFirebaseConfigured } from '../lib/firebase';

// Demo mode's data is throwaway, so it stays in one shared in-memory store for the app's lifetime (never persisted).
const demoStore = createMemoryStore();

export function ServicesProvider({ children }) {
  const { user, demo, online } = useAuth();
  const uid = user?.uid ?? null;
  const [ready, setReady] = useState({ uid: null, services: null });

  useEffect(() => {
    if (!uid) return undefined;
    let alive = true;
    // Demo mode: shared in-memory store (ephemeral, as before). Real signed-in users: IndexedDB, one database per
    // uid (Phase 6), so their data survives reloads and sign-outs on this device.
    const repos = demo
      ? createRepositories({ userId: uid, store: demoStore })
      : createRepositories({ userId: uid, createAdapter: createIndexedDBAdapterFactory(uid) });
    const services = createServices(repos, {
      reminderAdapter: createDefaultReminderAdapter(),
      reminderSettings: loadReminderSettings(),
      onReminderSettingsChange: saveReminderSettings,
      // Phase 7: real signed-in users sync to Firestore (users/{uid}/…) and remember their pull position in their own
      // IndexedDB database; demo mode keeps the in-memory fake and a throwaway in-memory cursor.
      syncAdapter: createDefaultSyncAdapter({
        userId: uid,
        demo,
        firestore: isFirebaseConfigured && db ? { db, doc, runTransaction, serverTimestamp, collection, query, where, orderBy, getDocs } : null,
      }),
      syncCursors: demo ? new MemoryCursorStore() : new IndexedDBCursorStore(openUserDB(uid)),
    });
    (demo ? seedDemoData(services) : Promise.resolve())
      .then(() => services.reminders.sync())   // seeded demo data must get its reminders too (idempotent, never rejects)
      .then(() => { if (alive) setReady({ uid, services }); });
    // Stop the reminder timers and the sync loop of these services (sign-out, StrictMode's double effect) so two
    // copies never fire, and drop the cached IndexedDB connection (a no-op for demo mode) so a later sign-in reopens cleanly.
    return () => { alive = false; services.reminders.dispose(); services.sync.dispose(); closeUserDB(uid); };
  }, [uid, demo]);

  const services = ready.uid === uid ? ready.services : null;

  // Coming back online (and signing in, which is the first time `services` exists) is one of sync's triggers, alongside its own
  // periodic sweep and anything that calls services.sync.sync() directly. It forces a pull; the periodic sweep only pulls every few minutes.
  useEffect(() => {
    if (online) services?.sync.sync({ pull: true });
  }, [online, services]);

  // The UI shows only "Waiting" for a sync that keeps failing (e.g. rules rejecting a write), so say why in the console.
  // Offline failures are expected and stay quiet.
  useEffect(() => services?.sync.subscribe((event) => {
    if (event.type === 'run-end' && !event.result.ok && navigator.onLine) console.warn('[sync] a run did not finish:', services.sync.lastError);
  }), [services]);

  if (uid && !services) return <div className="auth-loading" role="status">Loading…</div>;
  return <ServicesContext.Provider value={services}>{children}</ServicesContext.Provider>;
}