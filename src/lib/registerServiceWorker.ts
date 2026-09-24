import { Capacitor } from '@capacitor/core';

// Registers the offline service worker (public/sw.js).
//
// Registration is refused in dev and in every Lovable preview/iframe context so
// a cached shell can never shadow the live editor preview. `?sw=off` acts as a
// kill switch: it unregisters the worker and clears its caches.

const SW_URL = "/sw.js";

function isPreviewHost(hostname: string): boolean {
  return (
    hostname.startsWith("id-preview--") ||
    hostname.startsWith("preview--") ||
    hostname === "lovableproject.com" ||
    hostname.endsWith(".lovableproject.com") ||
    hostname === "lovableproject-dev.com" ||
    hostname.endsWith(".lovableproject-dev.com") ||
    hostname === "beta.lovable.dev" ||
    hostname.endsWith(".beta.lovable.dev")
  );
}

async function clearAppCaches() {
  try {
    if (!('caches' in window)) return;
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
  } catch {
    /* ignore */
  }
}

async function unregisterAppWorker() {
  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(
      registrations
        .filter((registration) => {
          const worker =
            registration.active ?? registration.waiting ?? registration.installing;
          return !worker || worker.scriptURL.endsWith(SW_URL);
        })
        .map((registration) => registration.unregister()),
    );
  } catch {
    /* ignore */
  }
}

export function registerServiceWorker(): void {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

  // Tenant APKs load the live website. A service worker inside Android can pin
  // an older JS/CSS shell, which is why website UI/color/bottom-nav changes may
  // not appear in the APK. Native uses normal HTTP/WebView caching only.
  if (Capacitor.isNativePlatform()) {
    void unregisterAppWorker();
    void clearAppCaches();
    return;
  }

  const isIframe = window.self !== window.top;
  const killSwitch = new URLSearchParams(window.location.search).get("sw") === "off";
  const blocked =
    !import.meta.env.PROD ||
    isIframe ||
    killSwitch ||
    isPreviewHost(window.location.hostname);

  if (blocked) {
    void unregisterAppWorker();
    return;
  }

  const register = () => {
    void navigator.serviceWorker
      .register(SW_URL, { scope: "/" })
      .then((registration) => {
        const version = import.meta.env.VITE_BUILD_VERSION;
        if (!version) return;
        const worker =
          registration.active ?? registration.waiting ?? registration.installing;
        worker?.postMessage({ type: "SET_VERSION", version });
      })
      .catch(() => {
        /* offline support stays optional */
      });
  };

  if (document.readyState === "complete") register();
  else window.addEventListener("load", register, { once: true });
}
