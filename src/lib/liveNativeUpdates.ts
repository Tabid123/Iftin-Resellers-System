import { Capacitor } from '@capacitor/core';
import { buildTenantSlug } from '@/lib/nativeTenant';

const LIVE_APP_ORIGIN = 'https://iftinagents.com';
const SESSION_KEY = 'iftin:native-live-check';

function isPackagedNativeOrigin() {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname;
  return Capacitor.isNativePlatform() && (host === 'localhost' || host === '127.0.0.1');
}

/**
 * Tenant APKs keep a packaged bundle for offline startup, but when the device
 * has connectivity they hand the WebView over to the live tenant route.
 *
 * This means one installed APK can receive future frontend fixes immediately
 * without rebuilding/reinstalling. If the app starts offline, the packaged
 * bundle remains fully available.
 */
export async function openLiveTenantWhenAvailable(): Promise<void> {
  if (!isPackagedNativeOrigin()) return;
  const slug = buildTenantSlug();
  if (!slug || typeof navigator === 'undefined' || navigator.onLine === false) return;

  const liveUrl = `${LIVE_APP_ORIGIN}/t/${encodeURIComponent(slug)}${window.location.search || ''}`;

  try {
    // Avoid repeatedly probing during the same packaged startup.
    if (sessionStorage.getItem(SESSION_KEY) === liveUrl) return;
    sessionStorage.setItem(SESSION_KEY, liveUrl);

    // no-cors is intentional: we only need to know the host is reachable
    // before replacing the packaged page. The live route itself resolves the
    // tenant from /t/<slug>.
    await fetch(liveUrl, {
      method: 'GET',
      mode: 'no-cors',
      cache: 'no-store',
    });

    window.location.replace(liveUrl);
  } catch {
    // Network says "online" but the live site is unreachable. Stay on the
    // packaged offline-safe bundle instead of showing a WebView error page.
    try { sessionStorage.removeItem(SESSION_KEY); } catch {}
  }
}
