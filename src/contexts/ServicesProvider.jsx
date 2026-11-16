import { useEffect, useState } from 'react';
import { useAuth } from './AuthContext';
import { ServicesContext } from './ServicesContext';
import { createRepositories, createMemoryStore } from '../repositories/index.js';
import { createServices } from '../services/index.js';
import { seedDemoData } from '../services/demoSeed.js';

// Shared in-memory data. Phase 6 replaces this with IndexedDB (web) / SQLite (Android) adapters.
const store = createMemoryStore();

export function ServicesProvider({ children }) {
  const { user, demo } = useAuth();
  const uid = user?.uid ?? null;
  const [ready, setReady] = useState({ uid: null, services: null });

  useEffect(() => {
    if (!uid) return undefined;
    let alive = true;
    const services = createServices(createRepositories({ userId: uid, store }));
    (demo ? seedDemoData(services) : Promise.resolve()).then(() => { if (alive) setReady({ uid, services }); });
    return () => { alive = false; };
  }, [uid, demo]);

  const services = ready.uid === uid ? ready.services : null;
  if (uid && !services) return <div className="auth-loading" role="status">Loading…</div>;
  return <ServicesContext.Provider value={services}>{children}</ServicesContext.Provider>;
}
