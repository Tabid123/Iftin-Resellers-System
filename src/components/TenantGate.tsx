import React from "react";
import { useTenant } from "@/contexts/TenantContext";
import { ResellerCodeGate } from "@/components/ResellerCodeGate";
import { AlertCircle, Lock, MessageCircle, Wallet, WifiOff } from "lucide-react";
import { normalizeSupportPhone } from "@/hooks/useSupportPhone";
import { isNativeApp } from "@/lib/nativeTenant";



interface Props {
  children: React.ReactNode;
}

/**
 * Wraps the app and gates rendering on tenant resolution.
 * - loading  → spinner
 * - not_found → message
 * - suspended → blocking banner
 * - ready / platform → render children
 */
const WEB_SPLASH_MS = 1500;

export const TenantGate: React.FC<Props> = ({ children }) => {
  // The packaged Android HTML is server-rendered during CI. If we emit the
  // branded TenantGate splash into that static HTML, Android paints it even
  // though the <head> immediately redirects online APKs to the live tenant.
  // Suppress only that build-time SSR frame; client hydration still owns the
  // normal TenantGate splash for packaged offline startup.
  if (typeof window === "undefined" && import.meta.env.VITE_CAPACITOR_BUILD === "true") {
    return null;
  }

  const state = useTenant();
  const [showStartupSplash, setShowStartupSplash] = React.useState(true);
  const startupSplashStartedRef = React.useRef(false);

  const routeTenantSlug =
    typeof window !== "undefined"
      ? window.location.pathname.match(/^\/t\/([^/]+)(?=\/|$)/)?.[1] ?? null
      : null;

  const nativeParams =
    typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  const nativeBranding = nativeParams?.get("nativeSplash") === "1";
  // Native startup already has a branded handoff surface. Do not put a second
  // timed web splash behind it, which otherwise appears when the overlay lifts.
  const nativeHandoff = nativeBranding || isNativeApp();
  const nativeSplashLogo = nativeBranding ? nativeParams?.get("brandLogo") || null : null;
  const nativeSplashName = nativeBranding ? nativeParams?.get("brandName") || null : null;
  const nativeSplashColor = nativeBranding ? nativeParams?.get("brandColor") || null : null;

  const tenant =
    state.status === "ready" || state.status === "suspended" ? state.tenant : null;

  let cachedLogo: string | null = null;
  let cachedName: string | null = null;
  if (!tenant && routeTenantSlug && typeof window !== "undefined") {
    try {
      const raw = localStorage.getItem(`najax.tenant_cache.${routeTenantSlug}`);
      if (raw) {
        const cached = JSON.parse(raw);
        cachedLogo = cached?.logo_url || null;
        cachedName = cached?.name || null;
      }
    } catch {
      // Ignore invalid/blocked cache. Do not show a generic fallback splash.
    }
  }

  const buildLogo = (import.meta.env.VITE_TENANT_LOGO_URL as string | undefined) || null;
  const buildName = (import.meta.env.VITE_TENANT_NAME as string | undefined) || null;
  const splashLogo = tenant?.logo_url || cachedLogo || nativeSplashLogo || buildLogo;
  const splashName = tenant?.name || cachedName || nativeSplashName || buildName || routeTenantSlug || "";

  const hasTenantIdentity = Boolean(
    tenant ||
    routeTenantSlug ||
    nativeSplashName ||
    nativeSplashLogo ||
    cachedName ||
    cachedLogo ||
    buildName ||
    buildLogo
  );

  // TenantGate is the only web splash. Start its timer once per page load;
  // later tenant/logo/name refreshes must never restart the splash.
  React.useEffect(() => {
    if (!hasTenantIdentity || startupSplashStartedRef.current) return;
    startupSplashStartedRef.current = true;
    const timer = window.setTimeout(() => {
      setShowStartupSplash(false);
    }, WEB_SPLASH_MS);
    return () => window.clearTimeout(timer);
  }, [hasTenantIdentity]);

  // Never render a separate solid-colour transition screen. Tenant routes
  // use the single branded splash below; non-tenant startup stays on the
  // normal app surface while identity resolves.
  if (hasTenantIdentity && (state.status === "loading" || (!nativeHandoff && showStartupSplash))) {
    return (
      <div
        id="tenant-web-splash"
        className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-primary"
        style={nativeSplashColor && !tenant ? { backgroundColor: nativeSplashColor } : undefined}
      >
        {splashLogo ? (
          <img
            src={splashLogo}
            alt={splashName}
            className="h-36 w-36 rounded-2xl object-cover shadow-lg"
            onError={(event) => {
              event.currentTarget.style.display = "none";
            }}
          />
        ) : null}
        <div className="mt-8 h-9 w-9 animate-spin rounded-full border-[3px] border-accent/30 border-t-accent" />
      </div>
    );
  }

  if (state.status === "needs_code") {
    return <ResellerCodeGate />;
  }

  if (state.status === "offline") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-md text-center space-y-4">
          <WifiOff className="h-12 w-12 mx-auto text-muted-foreground" />
          <h1 className="text-2xl font-bold">Xiriir ma jiro</h1>
          <p className="text-muted-foreground">
            App-ku ma gaari karo server-ka hadda. Hubi internet-kaaga — waan
            isku dayi doonnaa mar kale si toos ah.
          </p>
        </div>
      </div>
    );
  }

  if (state.status === "not_found") {

    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-md text-center space-y-4">
          <div className="text-6xl font-bold text-muted-foreground">404</div>
          <AlertCircle className="h-12 w-12 mx-auto text-destructive" />
          <h1 className="text-2xl font-bold">Workspace lama helin</h1>
          <p className="text-muted-foreground">
            Subdomain-kani ma xidhna workspace shaqaynaya. Hubi URL-ka ama la
            xidhiidh maamulaha platform-ka.
          </p>
        </div>
      </div>
    );
  }

  if (state.status === "suspended") {
    const t = state.tenant;
    const waPhone = "619535029";
    const endsAt = t?.trial_ends_at ?? t?.current_period_end ?? null;
    const expired = endsAt ? new Date(endsAt).getTime() <= Date.now() : false;
    const kind =
      t?.suspension_kind ??
      (expired ? (t?.trial_ends_at ? "trial_expired" : "expired") : null);
    const manualReason = (t?.suspension_reason ?? "").trim();

    const reasonText =
      kind === "trial_expired"
        ? "Waqtiga tijaabada ayaa kaa dhacay"
        : kind === "expired"
          ? "Waqtiga tijaabada wuu dhacay"
          : manualReason || "Maamulka sare ayaa xiray";

    const when = t?.suspended_at ? new Date(t.suspended_at) : null;
    const whenText =
      when && !Number.isNaN(when.getTime())
        ? `${when.toLocaleDateString("so-SO")} · ${when.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}`
        : "—";

    return (
      <div
        className="min-h-screen flex flex-col items-center p-6"
        style={{ background: "#0b0b14", color: "#fff" }}
      >
        <div className="w-full max-w-md flex-1 flex flex-col items-center justify-center space-y-6">
          <div
            className="h-24 w-24 rounded-3xl flex items-center justify-center"
            style={{ background: "#171726", border: "1px solid #2a2a3d" }}
          >
            <Lock className="h-10 w-10" style={{ color: "#ef4444" }} />
          </div>

          <div className="text-center space-y-2">
            <h1 className="text-2xl font-bold">Nidaamkaagu Wuu Xiran Yahay</h1>
            <p className="text-sm" style={{ color: "#9aa0b4" }}>
              Adeegga app-kaagu waa hakad. Hoos ka eeg sababta.
            </p>
          </div>

          <div
            className="w-full rounded-2xl p-4 space-y-3"
            style={{ background: "#12121f", border: "1px solid #23233a" }}
          >
            <div className="flex items-start justify-between gap-3 text-sm">
              <span style={{ color: "#9aa0b4" }}>Sababta Hakinta</span>
              <span className="text-right font-semibold" style={{ color: "#ef4444" }}>
                {reasonText}
              </span>
            </div>
            <div
              className="flex items-center justify-between gap-3 text-sm pt-3"
              style={{ borderTop: "1px solid #23233a" }}
            >
              <span style={{ color: "#9aa0b4" }}>Taariikhda Xiritaanka</span>
              <span className="font-semibold">{whenText}</span>
            </div>
          </div>

          <div
            className="w-full rounded-2xl p-4 flex gap-3 text-sm"
            style={{ background: "#101a26", border: "1px solid #1d3348", color: "#9fb6cc" }}
          >
            <AlertCircle className="h-5 w-5 shrink-0" style={{ color: "#3b82f6" }} />
            <p>
              {reasonText} fadlan bixi bill ka.
            </p>
          </div>

          <a
            href={`https://wa.me/252619535029`}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold text-white active:scale-[0.98] transition-transform"
            style={{ background: "linear-gradient(135deg, #3b82f6, #2563eb)", boxShadow: "0 4px 12px rgba(59,130,246,0.3)" }}
          >
            <Wallet className="h-4 w-4" />
            Pay
          </a>
        </div>

        <a
          href={`https://wa.me/252${waPhone}`}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full max-w-md flex items-center justify-center gap-2 rounded-2xl py-4 font-bold text-white active:scale-[0.98] transition-transform"
          style={{ background: "#25D366" }}
        >
          <MessageCircle className="h-5 w-5" />
          La xiriir WhatsApp (Super Admin)
        </a>
        <p className="text-xs mt-3" style={{ color: "#6b7186" }}>
          Saacadaha Shaqada: 24/7 · Iftin Agents System Security
        </p>
      </div>
    );
  }


  // Android waits for this actual app surface, not merely WebView progress or
  // document.readyState, before lifting its single startup overlay.
  return <div id="tenant-app-ready" className="contents">{children}</div>;
};
