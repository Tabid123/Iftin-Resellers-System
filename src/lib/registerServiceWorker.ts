import { Capacitor } from '@capacitor/core';

const SW_URL = "/sw.js";

async function clearWebAppCaches() {
  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
  } catch {
    /* ignore */
  }

  try {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((key) =>
          key.startsWith("iftin-static-") ||
          key.startsWith("iftin-dynamic-") ||
          key.startsWith("iftin-api-")
        )
        .map((key) => caches.delete(key)),
    );
  } catch {
    /* ignore */
  }
}

/**
 * Web storefront must always load the newest deployed frontend.
 *
 * Tenant Android APKs already have their own packaged offline fallback, so a
 * browser service worker must never pin an older web shell. Existing installs
 * are cleaned automatically; users should not need to clear browser/app cache.
 */
export function registerServiceWorker(): void {
  if (Capacitor.isNativePlatform()) return;
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

  void clearWebAppCaches();
}
