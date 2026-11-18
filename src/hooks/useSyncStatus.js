import { useEffect, useState } from 'react';
import { useServices } from './useServices';

const POLL_MS = 3000;   // local edits emit no sync event, so a screen showing the status also re-reads it now and then
const UNKNOWN = { running: false, pending: null, ok: null, lastSyncedAt: null, lastError: null };

/** { running, pending, ok, lastSyncedAt, lastError } — live sync state for display (see SyncService.getStatus()). */
export function useSyncStatus() {
  const { sync } = useServices();
  const [status, setStatus] = useState(UNKNOWN);
  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      const next = await sync.getStatus();
      if (alive) setStatus(next);
    };
    refresh();
    const off = sync.subscribe(refresh);
    const timer = setInterval(refresh, POLL_MS);
    return () => { alive = false; off(); clearInterval(timer); };
  }, [sync]);
  return status;
}