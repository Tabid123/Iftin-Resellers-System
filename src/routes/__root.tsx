import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { warmPages } from "@/lib/lazyPages";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { TenantProvider } from "@/contexts/TenantContext";
import { TenantPwaMeta } from "@/components/TenantPwaMeta";
import { ConnectivityProvider } from "@/contexts/ConnectivityContext";
import { TenantGate } from "@/components/TenantGate";
import { StatusBarColor } from "@/components/StatusBarColor";
import { registerTenantChangeListener } from '@/integrations/supabase/client';
import { initNativeBars } from '@/lib/nativeStatusBar';
import { usePackagedOfflineBootstrap } from "@/hooks/usePackagedOfflineBootstrap";
import { useOfflineCache } from "@/hooks/useOfflineCache";
import { useEdgeToEdge } from "@/hooks/useEdgeToEdge";
import { useKeyboardInsets } from "@/hooks/useKeyboardInsets";
import { useAndroidBackButton } from "@/hooks/useAndroidBackButton";
import { useAutoOnlineRedirect } from "@/hooks/useAutoOnlineRedirect";
import { useStorefrontRealtime } from "@/hooks/useStorefrontRealtime";
import { onStorefront } from "@/lib/storefrontEvents";
import { useQueryClient } from "@tanstack/react-query";
import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { registerServiceWorker } from "@/lib/registerServiceWorker";
import { buildTenantSlug } from "@/lib/nativeTenant";
import { Capacitor } from "@capacitor/core";

const CHUNK_RELOAD_KEY = "iftin:chunk-reload";
const OFFLINE_CACHE_SCHEMA_KEY = "iftin:offline-cache-schema";
const OFFLINE_CACHE_SCHEMA_VERSION = "tenant-scoped-v1";
const CHUNK_ERROR_PATTERN = /Failed to fetch dynamically imported module|Importing a module script failed|Loading chunk|Failed to fetch/i;

function isChunkLoadError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return CHUNK_ERROR_PATTERN.test(message);
}

function recoverFromStaleChunk() {
  try {
    const previousAttempt = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY) ?? 0);
    if (Date.now() - previousAttempt < 30_000) return false;
    sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()));
    window.location.reload();
    return true;
  } catch {
    window.location.reload();
    return true;
  }
}

const chunkRecoveryScript = `
  (() => {
    const key = ${JSON.stringify(CHUNK_RELOAD_KEY)};
    window.addEventListener('vite:preloadError', (event) => {
      event.preventDefault();
      try {
        const previousAttempt = Number(sessionStorage.getItem(key) || 0);
        if (Date.now() - previousAttempt < 30000) return;
        sessionStorage.setItem(key, String(Date.now()));
      } catch {}
      window.location.reload();
    });
  })();
`;

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">The page you're looking for doesn't exist or has been moved.</p>
        <div className="mt-6">
          <Link to="/" className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">Go home</Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
    if (isChunkLoadError(error)) recoverFromStaleChunk();
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">This page didn't load</h1>
        <p className="mt-2 text-sm text-muted-foreground">Something went wrong on our end. You can try refreshing or head back home.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button onClick={() => { router.invalidate(); reset(); }} className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">Try again</button>
          <a href="/" className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent">Go home</a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "theme-color", content: "#1E3A8A" },
      { name: "mobile-web-app-capable", content: "yes" },
      { title: "Iftin Agents — Buy Mobile Data & Airtime in Somalia" },
      { name: "description", content: "Buy mobile data bundles and airtime instantly from Somali networks with fast, secure mobile-money payments." },
      { name: "author", content: "Iftin Agents" },
      { property: "og:title", content: "Iftin Agents — Buy Mobile Data & Airtime in Somalia" },
      { property: "og:description", content: "Buy mobile data bundles and airtime instantly from Somali networks with fast, secure mobile-money payments." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Iftin Agents — Buy Mobile Data & Airtime in Somalia" },
      { name: "twitter:description", content: "Buy mobile data bundles and airtime instantly from Somali networks with fast, secure mobile-money payments." },
      { property: "og:image", content: "https://iftinagents.com/og-image.png" },
      { name: "twitter:image", content: "https://iftinagents.com/og-image.png" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.png", type: "image/png" },
      { rel: "manifest", href: "/manifest.json" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

// Apply the last-known tenant colours before first paint so no default
// (Najax) colours flash while the tenant record loads.
const earlyTenantBrandScript = `(function(){try{
var s=localStorage.getItem('najax.tenant_slug');if(!s)return;
var t=JSON.parse(localStorage.getItem('najax.tenant_cache.'+s)||'null');if(!t)return;
function h(c){if(!c)return null;c=String(c).trim();if(c.charAt(0)!=='#')return c.replace(/^hsl\\(/i,'').replace(/\\)$/,'');
var x=c.slice(1);if(x.length===3)x=x.split('').map(function(a){return a+a}).join('');
var r=parseInt(x.substr(0,2),16)/255,g=parseInt(x.substr(2,2),16)/255,b=parseInt(x.substr(4,2),16)/255;
var M=Math.max(r,g,b),m=Math.min(r,g,b),l=(M+m)/2,d=M-m,H=0,S=0;
if(d){S=l>.5?d/(2-M-m):d/(M+m);H=M===r?(g-b)/d+(g<b?6:0):M===g?(b-r)/d+2:(r-g)/d+4;H*=60}
return Math.round(H)+' '+Math.round(S*100)+'% '+Math.round(l*100)+'%'}
var st=document.documentElement.style,p=h(t.primary_color),a=h(t.accent_color);
if(p){st.setProperty('--primary',p);st.setProperty('--ring',p);st.setProperty('--brand-primary','hsl('+p+')');
var L=parseFloat(p.split(' ')[2]);st.setProperty('--primary-foreground',L>58?'222 30% 10%':'0 0% 100%');}
if(a){st.setProperty('--accent',a);st.setProperty('--brand-accent','hsl('+a+')');}
}catch(e){}})();`;

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
        <script dangerouslySetInnerHTML={{ __html: earlyTenantBrandScript }} />
        <script dangerouslySetInnerHTML={{ __html: chunkRecoveryScript }} />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function AppContent() {
  usePackagedOfflineBootstrap();
  useOfflineCache();
  useEdgeToEdge();
  useKeyboardInsets();
  useAutoOnlineRedirect();
  useStorefrontRealtime();
  const appQueryClient = useQueryClient();

  useEffect(() => onStorefront("tenant-config-changed", () => appQueryClient.invalidateQueries()), [appQueryClient]);
  const { showExitDialog, handleExitApp, handleCancelExit } = useAndroidBackButton();

  useEffect(() => initNativeBars(), []);

  return (
    <>
      <TenantPwaMeta />
      <StatusBarColor />
      <Outlet />

      <AlertDialog open={showExitDialog} onOpenChange={handleCancelExit}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ka bax App-ka?</AlertDialogTitle>
            <AlertDialogDescription>Ma hubtaa inaad rabto inaad ka baxdo Najax Data app-ka?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancelExit}>Maya</AlertDialogCancel>
            <AlertDialogAction onClick={handleExitApp}>Haa, Ka bax</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function NativeLiveStartupGate({ children }: { children: ReactNode }) {
  const packagedNative =
    typeof window !== "undefined" &&
    Capacitor.isNativePlatform() &&
    (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");

  useEffect(() => {
    if (!packagedNative) return;

    const slug = buildTenantSlug();
    if (!slug || typeof navigator === "undefined" || navigator.onLine === false) return;

    const controller = new AbortController();
    let settled = false;
    const liveUrl = `https://iftinagents.com/t/${encodeURIComponent(slug)}${window.location.search || ""}`;

    // Keep the packaged tenant UI visible while checking the live storefront.
    // Never cover startup with a blank/brand-colour screen.
    fetch(liveUrl, {
      method: "GET",
      mode: "no-cors",
      cache: "no-store",
      signal: controller.signal,
    })
      .then(() => {
        if (settled) return;
        settled = true;
        window.location.replace(liveUrl);
      })
      .catch(() => {
        settled = true;
      });

    return () => {
      settled = true;
      controller.abort();
    };
  }, [packagedNative]);

  return <>{children}</>;
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  useEffect(() => {
    registerServiceWorker();
    const buildVersion = import.meta.env.VITE_BUILD_VERSION;
    if (!buildVersion || !("serviceWorker" in navigator)) return;
    void navigator.serviceWorker.ready.then((registration) => {
      const worker = registration.active ?? registration.waiting ?? registration.installing;
      worker?.postMessage({ type: "SET_VERSION", version: buildVersion });
    });
  }, []);

  useEffect(() => {
    try {
      // Old builds stored remote artwork as one large base64 JSON object.
      // Removing it is cheap; parsing/stringifying it on mobile was not.
      localStorage.removeItem("img_cache_v1");
      const version = String(import.meta.env.VITE_BUILD_VERSION ?? "dev");
      localStorage.setItem("app_cache_version", version);
      if (localStorage.getItem(OFFLINE_CACHE_SCHEMA_KEY) === OFFLINE_CACHE_SCHEMA_VERSION) return;
      const legacyUnscopedKeys = ["offline_providers", "offline_categories", "offline_packages", "offline_payment_providers"];
      for (const key of legacyUnscopedKeys) localStorage.removeItem(key);
      localStorage.setItem(OFFLINE_CACHE_SCHEMA_KEY, OFFLINE_CACHE_SCHEMA_VERSION);
    } catch {}
  }, []);

  useEffect(() => { warmPages(); }, []);
  useEffect(
    () =>
      registerTenantChangeListener((prev, next) => {
        // null -> tenant is normal startup, not a workspace switch.
        // Clearing here made the first bottom-nav tap compete with a full cache
        // rebuild. Clear only when an established tenant is actually replaced
        // or when tenant mode is intentionally left.
        if (prev && prev !== next) queryClient.clear();
      }),
    [queryClient],
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ConnectivityProvider>
        <ThemeProvider>
          <LanguageProvider>
            <TooltipProvider>
              <Toaster />
              <Sonner />
              <NativeLiveStartupGate>
                <TenantProvider>
                  <TenantGate>
                    <AppContent />
                  </TenantGate>
                </TenantProvider>
              </NativeLiveStartupGate>
            </TooltipProvider>
          </LanguageProvider>
        </ThemeProvider>
      </ConnectivityProvider>
    </QueryClientProvider>
  );
}
