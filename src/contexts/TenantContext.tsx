import React, { createContext, useContext, useEffect, useState } from "react";
import { supabase } from '@/integrations/supabase/client';
import { setTenantHeader } from '@/integrations/supabase/client';
import { emitStorefront, purgeStorefrontStorage } from '@/lib/storefrontEvents';
import { purgeNonActiveWorkspaceStorage } from '@/lib/workspaceKeys';
import {
  isNativeApp,
  buildTenantSlug,
  storedTenantSlug,
  storeTenantSlug,
  registerDeepLinkTenantListener,
} from '@/lib/nativeTenant';


export interface Tenant {
  id: string;
  slug: string;
  name: string;
  logo_url: string | null;
  primary_color: string | null;
  accent_color: string | null;
  status: "trial" | "active" | "suspended" | "cancelled";
  plan_id: string | null;
  trial_ends_at: string | null;
  current_period_end: string | null;
  support_phone?: string | null;
}


type TenantState =
  | { status: "loading"; tenant: null; isPlatform: false }
  | { status: "ready"; tenant: Tenant; isPlatform: false }
  | { status: "suspended"; tenant: Tenant; isPlatform: false }
  | { status: "not_found"; tenant: null; isPlatform: false; slug: string }
  // No connection AND nothing cached/baked in: this is a connectivity problem,
  // never a "this workspace does not exist" problem.
  | { status: "offline"; tenant: null; isPlatform: false; slug: string }
  | { status: "needs_code"; tenant: null; isPlatform: false }
  | { status: "platform"; tenant: null; isPlatform: true };

const TenantContext = createContext<TenantState>({
  status: "loading",
  tenant: null,
  isPlatform: false,
});

const RESERVED = new Set(["admin", "www", "api", "app", "mail", "status"]);

/**
 * Resolve the tenant slug from the current hostname.
 * - `admin.<domain>` → platform (super-admin) view
 * - `<slug>.<domain>` → tenant
 * - localhost / lovable.app preview → ?tenant=<slug> query, else "demo"
 */
function resolveSlug(): { slug: string | null; isPlatform: boolean; needsCode?: boolean } {
  const host = window.location.hostname;
  const path = window.location.pathname;
  const params = new URLSearchParams(window.location.search);
  const overrideTenant = params.get("tenant");
  const overridePlatform = params.get("platform") === "1";

  // Path-based super-admin override — /admin/* always renders super-admin console
  if (path === "/admin" || path.startsWith("/admin/")) {
    return { slug: null, isPlatform: true };
  }

  if (overridePlatform) return { slug: null, isPlatform: true };



  // Path-based tenant: /t/<slug>/... → tenant. The prefix stays in the URL
  // (it is the router basepath), so we only remember the slug here.
  const prefixSlug = path.match(/^\/t\/([^/]+)(?=\/|$)/);
  if (prefixSlug) {
    const slug = prefixSlug[1];
    try { localStorage.setItem("najax.tenant_slug", slug); } catch { /* ignore storage restrictions */ }
    return { slug, isPlatform: false };
  }

  // Rescue accidentally nested links like /providers/t/somdata/providers.
  const tMatch = path.match(/\/t\/([^/]+)(\/.*)?$/);
  if (tMatch) {
    const slug = tMatch[1];
    const rest = `/t/${slug}${tMatch[2] || "/"}`;
    try { localStorage.setItem("najax.tenant_slug", slug); } catch { /* ignore storage restrictions */ }
    window.history.replaceState(null, "", rest + window.location.search + window.location.hash);
    return { slug, isPlatform: false };
  }



  // Query override (works on any host)
  if (overrideTenant) {
    try { localStorage.setItem("najax.tenant_slug", overrideTenant); } catch { /* ignore storage restrictions */ }
    return { slug: overrideTenant, isPlatform: false };
  }

  // Per-tenant build (APK/AAB): the slug baked into the bundle is the single
  // source of truth and must win even when the WebView has not yet exposed the
  // Capacitor global. Shared by every tenant — no per-tenant branches here.
  const bakedSlug = buildTenantSlug();
  if (bakedSlug) return { slug: bakedSlug, isPlatform: false };

  // Native app without a baked slug: hostname is always `localhost`, so never
  // fall through to the platform console. Use the stored slug, otherwise ask
  // the user for their reseller code.
  if (isNativeApp()) {
    const slug = storedTenantSlug();
    if (slug) return { slug, isPlatform: false };
    return { slug: null, isPlatform: false, needsCode: true };
  }

  const isLocal =
    host === "localhost" ||
    host === "127.0.0.1" ||
    host.endsWith(".lovable.app") ||
    host.endsWith(".lovableproject.com");

  if (isLocal) {
    // Sticky slug for preview/prod-on-lovable: remember last `?tenant=`
    let stored: string | null = null;
    try { stored = localStorage.getItem("najax.tenant_slug"); } catch { /* ignore storage restrictions */ }
    // No hardcoded default — if nothing stored, send the user to the platform console
    if (!stored) {
      return { slug: null, isPlatform: true };
    }
    return { slug: stored, isPlatform: false };
  }


  const parts = host.split(".");
  if (parts.length < 3) return { slug: null, isPlatform: false };
  const sub = parts[0];
  if (sub === "admin") return { slug: null, isPlatform: true };
  if (RESERVED.has(sub)) return { slug: null, isPlatform: false };
  return { slug: sub, isPlatform: false };
}


function hexToHslTriplet(hex: string): string | null {
  const m = hex.replace("#", "").trim();
  if (!/^[0-9a-fA-F]{6}$/.test(m) && !/^[0-9a-fA-F]{3}$/.test(m)) return null;
  const full = m.length === 3 ? m.split("").map((c) => c + c).join("") : m;
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h *= 60;
  }
  return `${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

function toHslTriplet(value: string | null): string | null {
  if (!value) return null;
  const c = value.trim();
  if (!c) return null;
  if (c.startsWith("#")) return hexToHslTriplet(c);
  if (/^hsl\(/i.test(c)) return c.replace(/^hsl\(/i, "").replace(/\)$/, "").trim();
  return c;
}

function foregroundForHslTriplet(hsl: string | null): string | null {
  if (!hsl) return null;
  const parts = hsl.match(/[\d.]+/g)?.map(Number);
  if (!parts || parts.length < 3) return null;
  const lightness = parts[2];
  return lightness > 58 ? "270 30% 10%" : "0 0% 100%";
}

function applyColor(varName: string, brandVar: string, value: string | null) {
  const root = document.documentElement;
  const hsl = toHslTriplet(value);
  if (!hsl) return;
  root.style.setProperty(varName, hsl);
  root.style.setProperty(brandVar, `hsl(${hsl})`);
}

function applyBranding(tenant: Tenant | null) {
  applyColor("--primary", "--brand-primary", tenant?.primary_color ?? null);
  applyColor("--accent", "--brand-accent", tenant?.accent_color ?? null);

  const root = document.documentElement;
  const primary = toHslTriplet(tenant?.primary_color ?? null);
  const accent = toHslTriplet(tenant?.accent_color ?? null);
  const primaryForeground = foregroundForHslTriplet(primary);
  const accentForeground = foregroundForHslTriplet(accent);

  if (primary) {
    root.style.setProperty("--ring", primary);
    root.style.setProperty("--sidebar-primary", primary);
    root.style.setProperty("--gradient-button", `linear-gradient(135deg, hsl(${primary}), hsl(${accent || primary}))`);
    root.style.setProperty("--gradient-primary", `linear-gradient(135deg, hsl(${primary}), hsl(${accent || primary}))`);
    root.style.setProperty("--shadow-elegant", `0 10px 30px -10px hsl(${primary} / 0.3)`);
    root.style.setProperty("--shadow-glow", `0 0 40px hsl(${primary} / 0.2)`);
  }

  if (primaryForeground) {
    root.style.setProperty("--primary-foreground", primaryForeground);
    root.style.setProperty("--sidebar-primary-foreground", primaryForeground);
  }

  if (accentForeground) {
    root.style.setProperty("--accent-foreground", accentForeground);
  }
}


const TENANT_CACHE_PREFIX = "najax.tenant_cache.";

function readCachedTenant(slug: string): Tenant | null {
  try {
    const raw = localStorage.getItem(TENANT_CACHE_PREFIX + slug);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Tenant;
    return parsed && parsed.id ? parsed : null;
  } catch {
    return null;
  }
}

function writeCachedTenant(slug: string, tenant: Tenant) {
  try {
    localStorage.setItem(TENANT_CACHE_PREFIX + slug, JSON.stringify(tenant));
  } catch {
    /* ignore storage restrictions */
  }
}

const CACHE_OWNER_KEY = "najax.cache_owner_slug";

/**
 * Content caches (providers, categories, packages, payment methods, banners,
 * catalog) belong to exactly one workspace. When the app opens for a different
 * slug than the cache was written for, drop them so no workspace can ever show
 * another one's stale content. Shared by every tenant.
 */
function purgeForeignContentCaches(slug: string) {
  try {
    // Legacy shared (workspace-less) snapshots are never read again; they are
    // dropped on every start, whatever the slug, so old data can never render.
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
    doomed.forEach(key => localStorage.removeItem(key));
    localStorage.setItem(CACHE_OWNER_KEY, slug);
  } catch {
    /* ignore storage restrictions */
  }
}

/**
 * Per-tenant builds already know which tenant they were built for. When the
 * device starts fully offline there may be no cached tenant row yet, so use the
 * safe build-time identity instead of incorrectly showing "Workspace lama
 * helin". Shared by every tenant build; the check is only "was this bundle
 * built for this slug", never a per-tenant special case.
 * The empty id is intentional: tenant-scoped network calls stay disabled until
 * the real row is resolved from Supabase.
 */
function buildFallbackTenant(slug: string): Tenant | null {
  if (buildTenantSlug() !== slug) return null;
  const buildName = (import.meta.env.VITE_TENANT_NAME as string | undefined)?.trim();
  const buildLogo = (import.meta.env.VITE_TENANT_LOGO_URL as string | undefined)?.trim();
  const buildColor = (import.meta.env.VITE_SPLASH_COLOR as string | undefined)?.trim();
  const readableSlug = slug
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

  return {
    id: '',
    slug,
    name: buildName || readableSlug || slug,
    logo_url: buildLogo || null,
    primary_color: buildColor || null,
    accent_color: buildColor || null,
    status: 'active',
    plan_id: null,
    trial_ends_at: null,
    current_period_end: null,
    support_phone: null,
  };
}

export const TenantProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [state, setState] = useState<TenantState>({
    status: "loading",
    tenant: null,
    isPlatform: false,
  });

  useEffect(() => {
    const { slug, isPlatform, needsCode } = resolveSlug();

    void registerDeepLinkTenantListener(() => window.location.reload());

    if (needsCode) {
      setTenantHeader(null);
      setState({ status: "needs_code", tenant: null, isPlatform: false });
      return;
    }

    if (isPlatform) {
      // Super-admin console: don't scope queries to any tenant
      setTenantHeader(null);
      setState({ status: "platform", tenant: null, isPlatform: true });
      return;
    }

    if (!slug) {
      setTenantHeader(null);
      setState({
        status: "not_found",
        tenant: null,
        isPlatform: false,
        slug: "",
      });
      return;
    }

    // Clear any stale header before resolving the new tenant so the lookup
    // itself isn't filtered by a wrong tenant.
    setTenantHeader(null);
    purgeForeignContentCaches(slug);

    const cached = readCachedTenant(slug);
    const buildFallback = cached ? null : buildFallbackTenant(slug);

    // Offline-first: render immediately from the last known tenant. On a fresh
    // native install with no cache, render from the build identity instead of
    // blocking the whole app behind a network lookup.
    if (cached) {
      setTenantHeader(cached.id);
      // Drop legacy shared snapshots and any other workspace's snapshots before
      // a single frame can be rendered from them.
      purgeNonActiveWorkspaceStorage(cached.id);
      applyBranding(cached);
      setState(
        isTenantBlocked(cached)
          ? { status: "suspended", tenant: cached, isPlatform: false }
          : { status: "ready", tenant: cached, isPlatform: false },
      );
    } else if (buildFallback) {
      setTenantHeader(null);
      applyBranding(buildFallback);
      setState({ status: "ready", tenant: buildFallback, isPlatform: false });
    }

    let cancelled = false;
    let retryTimer: number | undefined;
    let transientFailures = 0;

    const hasOfflineIdentity = Boolean(cached || buildFallback);
    const LOOKUP_TIMEOUT_MS = 8000;
    const MAX_TRANSIENT_RETRIES = 3;

    /**
     * Three distinct outcomes, never collapsed into one another:
     *  - "missing"    → the server answered and the tenant does not exist (404)
     *  - "transient"  → no connection, timeout, or server error (5xx)
     *  - a tenant row → success
     */
    const lookupTenant = async (): Promise<
      { kind: "row"; tenant: Tenant } | { kind: "missing" } | { kind: "transient" }
    > => {
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        return { kind: "transient" };
      }
      try {
        // The slug lookup itself must never inherit a stale tenant header.
        setTenantHeader(null);
        const res = (await Promise.race([
          supabase.rpc("get_tenant_by_slug", { p_slug: slug }),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("tenant-lookup-timeout")), LOOKUP_TIMEOUT_MS),
          ),
        ])) as { data: unknown; error: unknown };

        if (res.error) return { kind: "transient" };
        const data = Array.isArray(res.data) ? res.data[0] : res.data;
        if (!data) return { kind: "missing" };
        return { kind: "row", tenant: data as Tenant };
      } catch {
        // Network failure, aborted request, or timeout — never a real 404.
        return { kind: "transient" };
      }
    };

    const resolveTenantFromNetwork = async () => {
      const result = await lookupTenant();
      if (cancelled) return;

      if (result.kind === "transient") {
        // Offline / server trouble: keep the cached or build identity in place
        // so the app stays fully usable, and retry quietly in the background.
        if (cached?.id) setTenantHeader(cached.id);
        transientFailures += 1;
        if (!hasOfflineIdentity) {
          if (transientFailures >= MAX_TRANSIENT_RETRIES) {
            // Still nothing to show: report a connectivity problem, not a 404.
            setState({ status: "offline", tenant: null, isPlatform: false, slug });
          }
          retryTimer = window.setTimeout(
            () => void resolveTenantFromNetwork(),
            Math.min(2000 * transientFailures, 15000),
          );
        }
        return;
      }

      if (result.kind === "missing") {
        // Successful lookup with no row means this tenant genuinely does not
        // exist; do not let an old cache/build identity mask that result.
        setTenantHeader(null);
        setState({ status: "not_found", tenant: null, isPlatform: false, slug });
        return;
      }

      transientFailures = 0;
      const tenant = result.tenant;
      // Tenant configuration changed on the server: never wait for a TTL to
      // expire. Drop the storefront snapshots and tell the app to refetch.
      const previous = readCachedTenant(slug);
      const changed = !previous || JSON.stringify(previous) !== JSON.stringify(tenant);
      setTenantHeader(tenant.id);
      purgeNonActiveWorkspaceStorage(tenant.id);
      applyBranding(tenant);
      writeCachedTenant(slug, tenant);
      if (changed && previous) {
        purgeStorefrontStorage();
        emitStorefront("tenant-config-changed");
        emitStorefront("banners-changed");
      }

      if (isTenantBlocked(tenant)) {
        setState({ status: "suspended", tenant, isPlatform: false });
        return;
      }

      setState({ status: "ready", tenant, isPlatform: false });
    };

    void resolveTenantFromNetwork();

    // A fresh-install offline APK has no real tenant id yet. Resolve it as soon
    // as connectivity returns, without forcing a page reload or visible flash.
    const handleOnline = () => {
      transientFailures = 0;
      void resolveTenantFromNetwork();
    };
    const handleVisible = () => {
      if (document.visibilityState === "visible") void resolveTenantFromNetwork();
    };
    window.addEventListener('online', handleOnline);
    document.addEventListener('visibilitychange', handleVisible);

    return () => {
      cancelled = true;
      if (retryTimer) window.clearTimeout(retryTimer);
      window.removeEventListener('online', handleOnline);
      document.removeEventListener('visibilitychange', handleVisible);
    };
  }, []);


  return (
    <TenantContext.Provider value={state}>{children}</TenantContext.Provider>
  );
};

export const useTenant = () => useContext(TenantContext);
