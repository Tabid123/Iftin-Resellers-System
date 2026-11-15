import { isTenantAdminPath } from './tenantPwaManifest';

type InstallChoice = { outcome: 'accepted' | 'dismissed'; platform?: string };
export type AdminInstallPrompt = Event & {
  prompt(): Promise<void>;
  userChoice: Promise<InstallChoice>;
};

let cachedPrompt: AdminInstallPrompt | null = null;
let listening = false;
const listeners = new Set<() => void>();

function notifyListeners() {
  listeners.forEach(callback => callback());
}

export function hasAdminInstallPrompt(): boolean {
  return cachedPrompt !== null;
}

export function isAdminInstallContext(): boolean {
  if (typeof window === 'undefined' || !isTenantAdminPath(window.location.pathname)) return false;
  const manifest = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
  if (!manifest) return false;
  try {
    const url = new URL(manifest.href, window.location.origin);
    return url.origin === window.location.origin &&
      url.pathname === '/api/public/manifest' &&
      url.searchParams.get('app') === 'admin';
  } catch {
    return false;
  }
}

export function initAdminInstallPromptListener() {
  if (typeof window === 'undefined' || listening) return;
  listening = true;
  window.addEventListener('beforeinstallprompt', (event: Event) => {
    // Never capture/install the customer manifest from the same origin.
    if (!isAdminInstallContext()) return;
    event.preventDefault();
    cachedPrompt = event as AdminInstallPrompt;
    notifyListeners();
  });
  window.addEventListener('appinstalled', () => {
    cachedPrompt = null;
    notifyListeners();
  });
}

export function subscribeAdminInstallPrompt(callback: () => void): () => void {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

export async function requestAdminPwaInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  if (!isAdminInstallContext() || !cachedPrompt) return 'unavailable';
  const promptEvent = cachedPrompt;
  cachedPrompt = null;
  notifyListeners();
  await promptEvent.prompt();
  const choice = await promptEvent.userChoice;
  return choice.outcome === 'accepted' ? 'accepted' : 'dismissed';
}
