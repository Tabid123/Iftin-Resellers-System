/**
 * Tiny event bus used to push freshness signals (admin changed something,
 * tenant config changed) into components without prop drilling.
 */
export type StorefrontEvent =
  | "banners-changed"
  | "catalog-changed"
  | "tenant-config-changed";

const NAME = "storefront:event";

export function emitStorefront(event: StorefrontEvent) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(NAME, { detail: event }));
}

export function onStorefront(event: StorefrontEvent, handler: () => void) {
  if (typeof window === "undefined") return () => {};
  const listener = (e: Event) => {
    if ((e as CustomEvent).detail === event) handler();
  };
  window.addEventListener(NAME, listener);
  return () => window.removeEventListener(NAME, listener);
}

/** Drop every cached storefront snapshot (content only, never auth). */
export function purgeStorefrontStorage() {
  if (typeof window === "undefined") return;
  try {
    const doomed: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (
        key.startsWith("offline_") ||
        key.startsWith("iftin_catalog") ||
        key.startsWith("najax.banners") ||
        key.startsWith("banners_")
      ) {
        doomed.push(key);
      }
    }
    doomed.forEach((key) => localStorage.removeItem(key));
  } catch {
    /* ignore storage restrictions */
  }
}
