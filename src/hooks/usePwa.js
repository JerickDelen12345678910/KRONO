import { useSyncExternalStore } from 'react';
import { pwa } from '../pwa/index.js';

/**
 * { offlineReady, updateReady, updateDismissed, canInstall, installed, iosHint, install, applyUpdate, dismissUpdate }
 * (see src/lib/pwa.js). `install()` must be called from a click.
 */
export function usePwa() {
  const state = useSyncExternalStore(pwa.subscribe, pwa.getState, pwa.getState);
  return { ...state, install: pwa.promptInstall, applyUpdate: pwa.applyUpdate, dismissUpdate: pwa.dismissUpdate };
}