import { usePwa } from '../../hooks/usePwa';
import { Button } from './Button';

/**
 * "A new version is ready." — shown when the service worker has downloaded an update. The person chooses when to reload, so an
 * unsaved edit is never lost; "Later" hides it until the next launch.
 */
export function UpdateBanner() {
  const { updateReady, updateDismissed, applyUpdate, dismissUpdate } = usePwa();
  if (!updateReady || updateDismissed) return null;
  return (
    <div className="update-banner" role="status">
      <span>A new version is ready. Save your work, then reload.</span>
      <Button size="sm" onClick={applyUpdate}>Reload</Button>
      <Button size="sm" variant="ghost" onClick={dismissUpdate}>Later</Button>
    </div>
  );
}