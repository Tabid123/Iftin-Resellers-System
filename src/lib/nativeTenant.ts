/**
 * Tenant resolution for the native (Capacitor) app.
 *
 * On the web the tenant comes from the hostname / `/t/<slug>` path. Inside the
 * native shell the hostname is `localhost`, so the tenant must come from:
 *   1. a build-time slug baked into the APK (`VITE_TENANT_SLUG`), or
 *   2. a slug the user entered once (reseller code), stored on device, or
 *   3. a deep link such as `iftin://t/<slug>` / `https://iftinagents.com/t/<slug>`.
 */

export const TENANT_STORAGE_KEY = "najax.tenant_slug";

/**
 * Detect the native shell. Shared by every tenant build.
 *
 * A single signal is not reliable: on some Android WebViews the Capacitor
 * global is injected late, so `isNativePlatform()` can be false during the
 * first render. We therefore also accept the native origins/user agent, and
 * treat "this bundle was built for one tenant" as native-ish, because only
 * per-tenant APK builds carry VITE_TENANT_SLUG.
 */
export function isNativeApp(): boolean {
  if (typeof window === "undefined") return false;

  const cap = (window as unknown as {
    Capacitor?: { isNativePlatform?: () => boolean; platform?: string };
  }).Capacitor;
  if (cap?.isNativePlatform?.()) return true;
  if (cap?.platform && cap.platform !== "web") return true;

  try {
    const protocol = window.location.protocol;
    if (protocol === "capacitor:" || protocol === "ionic:" || protocol === "file:") return true;
  } catch {
    /* ignore */
  }

  try {
    const ua = navigator.userAgent || "";
    if (/\b(Capacitor|Cordova)\b/i.test(ua)) return true;
    // Per-tenant APKs are served from localhost inside the WebView. A browser
    // dev session also uses localhost, so require the baked-in tenant slug.
    const host = window.location.hostname;
    const isLocalHost = host === "localhost" || host === "127.0.0.1";
    if (isLocalHost && buildTenantSlug() && /\bwv\b|; wv|Android/i.test(ua)) return true;
  } catch {
    /* ignore */
  }

  return false;
}

/** Slug baked into this build (per-tenant APKs produced by CI). */
export function buildTenantSlug(): string | null {
  const slug = (import.meta.env.VITE_TENANT_SLUG as string | undefined)?.trim();
  return slug ? slug.toLowerCase() : null;
}

export function storedTenantSlug(): string | null {
  try {
    return localStorage.getItem(TENANT_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function storeTenantSlug(slug: string) {
  try {
    localStorage.setItem(TENANT_STORAGE_KEY, slug.trim().toLowerCase());
  } catch {
    /* ignore storage restrictions */
  }
}

export function clearTenantSlug() {
  try {
    localStorage.removeItem(TENANT_STORAGE_KEY);
  } catch {
    /* ignore storage restrictions */
  }
}

/** Extract `<slug>` from `iftin://t/<slug>` or `https://host/t/<slug>`. */
export function slugFromDeepLink(url: string): string | null {
  const m = url.match(/(?:\/t\/|:\/\/t\/)([a-z0-9-]+)/i);
  return m ? m[1].toLowerCase() : null;
}

/** Listen for deep links while the native app is running. */
export async function registerDeepLinkTenantListener(onSlug: (slug: string) => void) {
  if (!isNativeApp()) return;
  try {
    const { App } = await import("@capacitor/app");
    await App.addListener("appUrlOpen", ({ url }) => {
      const slug = slugFromDeepLink(url);
      if (slug) {
        storeTenantSlug(slug);
        onSlug(slug);
      }
    });
  } catch {
    /* plugin not available */
  }
}
