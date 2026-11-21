import { registerSW } from 'virtual:pwa-register';

/**
 * The service worker keeps a copy of the game on the device, so it opens
 * without internet after the first visit. When a new version has been
 * downloaded, the game offers an "Update" button instead of changing under
 * the player's hands.
 */
let updateReady = false;
let applyUpdate: (() => void) | null = null;
const listeners = new Set<() => void>();

export function startOfflineSupport(): void {
  if (!('serviceWorker' in navigator)) return;
  const update = registerSW({
    onNeedRefresh() {
      updateReady = true;
      listeners.forEach((listener) => listener());
    },
  });
  applyUpdate = () => void update(true);
}

export function isUpdateReady(): boolean {
  return updateReady;
}

export function onUpdateReady(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Switches to the new version and reloads. Progress is saved first by the caller. */
export function updateNow(): void {
  applyUpdate?.();
}
