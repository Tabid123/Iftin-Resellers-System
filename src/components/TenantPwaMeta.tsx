import { useEffect } from "react";
import { useTenant } from "@/contexts/TenantContext";
import iftinPlatformIcon from "@/assets/iftin-resellers-icon.jpg";
import { initializeOneSignal, syncOneSignalTenant } from "@/services/onesignal";

function upsertLink(rel: string, href: string, attrs: Record<string, string> = {}) {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement("link");
    el.rel = rel;
    document.head.appendChild(el);
  }
  el.href = href;
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  if (!attrs.type) el.removeAttribute("type");
}

function upsertMeta(name: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.name = name;
    document.head.appendChild(el);
  }
  el.content = content;
}

/**
 * Keeps the PWA install metadata (manifest, theme color, icons, splash)
 * in sync with the active tenant so every tenant installs with its own
 * name, logo and brand colour.
 */
export function TenantPwaMeta() {
  const { tenant } = useTenant();

  useEffect(() => {
    if (typeof document === "undefined") return;

    const isPlatform = /^\/admin(?:\/|$)/.test(window.location.pathname);
    const slug = isPlatform ? null : tenant?.slug;
    // If an installed APK is booting from a cached tenant snapshot, keep the
    // pre-hydration tenant favicon until the authoritative tenant resolves.
    const unresolvedSlug = !isPlatform && !slug &&
      window.location.pathname.match(/^\/t\/([a-z0-9-]+)(?:\/|$)/i)?.[1];
    if (unresolvedSlug) return;

    const theme = slug ? tenant?.primary_color?.trim() || "#1E3A8A" : "#1E3A8A";
    const packagedOrigin = /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname);
    const logoVersion = tenant?.logo_url ? encodeURIComponent(tenant.logo_url.slice(-36)) : "";
    const logo = slug && tenant?.logo_url
      ? packagedOrigin
        ? tenant.logo_url  // packaged APK has no backend /api/public routes
        : `/api/public/tenant-icon?tenant=${encodeURIComponent(slug)}&v=${logoVersion}`
      : iftinPlatformIcon;

    upsertLink("manifest", slug ? `/api/public/manifest?tenant=${encodeURIComponent(slug)}` : "/manifest.json");
    upsertMeta("theme-color", theme);
    upsertMeta("apple-mobile-web-app-capable", "yes");
    upsertMeta("apple-mobile-web-app-status-bar-style", "black-translucent");
    upsertMeta("apple-mobile-web-app-title", slug ? tenant?.name || "App" : "Iftin Resellers");
    upsertLink("apple-touch-icon", logo, slug ? {} : { type: "image/jpeg" });
    upsertLink("icon", logo, slug ? {} : { type: "image/jpeg" });

    document.title = slug ? tenant?.name || "App" : "Iftin Resellers — Super Admin";
  }, [tenant?.slug, tenant?.name, tenant?.logo_url, tenant?.primary_color]);

  // Native push must only be initialized after the authoritative tenant has
  // resolved. This prevents a previously opened tenant from leaking its push
  // audience/tag into another tenant storefront.
  useEffect(() => {
    if (!tenant?.id) {
      syncOneSignalTenant(null);
      return;
    }

    const pushTenant = { id: tenant.id, slug: tenant.slug ?? null };
    void initializeOneSignal(pushTenant).then((ready) => {
      if (ready) syncOneSignalTenant(pushTenant);
    });
  }, [tenant?.id, tenant?.slug]);

  return null;
}

export default TenantPwaMeta;
