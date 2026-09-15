import { useEffect } from "react";
import { useTenant } from "@/contexts/TenantContext";

function upsertLink(rel: string, href: string, attrs: Record<string, string> = {}) {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement("link");
    el.rel = rel;
    document.head.appendChild(el);
  }
  el.href = href;
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
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

    const slug = tenant?.slug;
    const theme = tenant?.primary_color?.trim() || "#1E3A8A";
    const logo = slug
      ? `/api/public/tenant-icon?tenant=${encodeURIComponent(slug)}`
      : "/icon-512.png";

    upsertLink("manifest", slug ? `/api/public/manifest?tenant=${encodeURIComponent(slug)}` : "/manifest.json");
    upsertMeta("theme-color", theme);
    upsertMeta("apple-mobile-web-app-capable", "yes");
    upsertMeta("apple-mobile-web-app-status-bar-style", "black-translucent");
    upsertMeta("apple-mobile-web-app-title", tenant?.name || "Iftin Agents");
    upsertLink("apple-touch-icon", logo);
    upsertLink("icon", logo, { type: "image/png" });


    if (tenant?.name) document.title = tenant.name;
  }, [tenant?.slug, tenant?.name, tenant?.logo_url, tenant?.primary_color]);

  return null;
}

export default TenantPwaMeta;
