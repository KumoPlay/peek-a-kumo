/**
 * "Add to Home Screen". An installed game opens like an app, works offline,
 * and browsers are much less likely to clear its saved progress.
 */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let promptEvent: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();

if (typeof window !== 'undefined') {
  // Chrome, Edge and Android browsers offer their own install dialog; keep it for our button.
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    promptEvent = event as InstallPromptEvent;
    listeners.forEach((listener) => listener());
  });
  window.addEventListener('appinstalled', () => {
    promptEvent = null;
    listeners.forEach((listener) => listener());
  });
}

export function onInstallChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** True when the game was opened from the home screen. */
export function isInstalled(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  const { userAgent, platform, maxTouchPoints } = navigator;
  return /iPad|iPhone|iPod/.test(userAgent) || (platform === 'MacIntel' && maxTouchPoints > 1);
}

/**
 * How this browser can add the game to the home screen:
 * 'button' = we can open the browser's install dialog,
 * 'ios' = the player uses Share → Add to Home Screen,
 * 'menu' = the player uses the browser menu.
 */
export function installWay(): 'button' | 'ios' | 'menu' {
  if (promptEvent) return 'button';
  return isIos() ? 'ios' : 'menu';
}

/** Opens the browser's install dialog. Resolves to true when the player said yes. */
export async function askToInstall(): Promise<boolean> {
  if (!promptEvent) return false;
  const event = promptEvent;
  promptEvent = null;
  try {
    await event.prompt();
    return (await event.userChoice).outcome === 'accepted';
  } catch {
    return false;
  } finally {
    listeners.forEach((listener) => listener());
  }
}

/** Is it worth gently suggesting the home screen here? Not when installed, and not on computers without an install dialog. */
export function shouldSuggestInstall(): boolean {
  if (isInstalled()) return false;
  const way = installWay();
  return way !== 'menu' || navigator.maxTouchPoints > 0;
}
