import { useEffect, useRef } from 'react';
import { useServices } from './useServices';

/**
 * Calls onChange() when records in any of `collections` arrived from the backend (another device's edits, or a sync
 * conflict the cloud won), so a screen can re-read what it shows. Collection names are the createRepositories() keys.
 */
export function useRemoteChanges(collections, onChange) {
  const { sync } = useServices();
  const latest = useRef(onChange);
  useEffect(() => { latest.current = onChange; });
  const key = collections.join(',');
  useEffect(() => {
    const watched = key.split(',');
    return sync.subscribe((event) => {
      if (event.type === 'pulled' && watched.some((c) => event.changed[c])) latest.current();
    });
  }, [sync, key]);
}