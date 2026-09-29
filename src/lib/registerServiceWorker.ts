import { Capacitor } from '@capacitor/core';

const BUILD_VERSION =
  (import.meta.env.VITE_BUILD_VERSION as string | undefined)?.trim() || "dev";
const SW_URL = `/sw.js?v=${encodeURIComponent(BUILD_VERSION)}`;

/**
 * Register the web/PWA service worker so the storefront can keep its app shell
 * and previously cached tenant pages available when the device is offline.
 *
 * Native Android builds use their packaged offline shell instead and do not
 * need the browser service worker.
 */
export function registerServiceWorker(): void {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

  // The packaged APK runs on localhost and must not install a service worker.
  // After a live update, however, the same native WebView is on the secure
  // iftinagents.com origin; allow that origin to cache the applied live build
  // so the next APK launch can reuse it without downloading the same update.
  if (
    Capacitor.isNativePlatform() &&
    (window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1")
  ) {
    return;
  }

  void navigator.serviceWorker
    .register(SW_URL, { scope: "/", updateViaCache: "none" })
    .then((registration) => registration.update())
    .catch((error) => {
      console.warn("[SW] Registration failed:", error);
    });
}
