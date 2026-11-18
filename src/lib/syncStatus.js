// Pure: turns a sync status snapshot (SyncService.getStatus()) into the four Account pipeline steps
// (Saved locally → Waiting → Syncing → Synced). Same look as the design preview: steps before the current one are done,
// the current one is highlighted, later ones are plain; "Waiting · N" shows how many changes are still to send.
//   syncing now            -> Saved locally ✓ · Waiting ✓ · Syncing (current) · Synced
//   changes not yet synced -> Saved locally ✓ · Waiting · N (current) · Syncing · Synced   (also while offline or retrying)
//   nothing pending        -> all four done
// `pending` null (local storage unreadable / not read yet) counts as waiting: never claim "Synced" without knowing.
export const PIPELINE_STEPS = Object.freeze(['Saved locally', 'Waiting', 'Syncing', 'Synced']);

export function pipelineSteps({ running = false, pending = null } = {}) {
  const current = running ? 2 : (pending === null || pending > 0 ? 1 : -1);
  return PIPELINE_STEPS.map((label, i) => {
    const state = current === -1 || i < current ? 'done' : i === current ? 'current' : '';
    return { label: i === 1 && state === 'current' && pending > 0 ? `${label} · ${pending}` : label, state };
  });
}