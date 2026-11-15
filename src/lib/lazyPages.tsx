import * as React from 'react';
import { useLocation as useRouterLocation } from '@tanstack/react-router';
import { useTenant } from '@/contexts/TenantContext';
import { TenantSplash } from '@/components/TenantSplash';
import iftinLogo from '@/assets/iftin-agents-logo.png';
import Index from '@/components/pages/Index';
import ProviderSelection from '@/components/pages/ProviderSelection';
import CategorySelection from '@/components/pages/CategorySelection';
import DataPackages from '@/components/pages/DataPackages';
import PaymentProviders from '@/components/pages/PaymentProviders';
import PaymentSuccess from '@/components/pages/PaymentSuccess';
import OfflineMode from '@/components/pages/OfflineMode';
import Notifications from '@/components/pages/Notifications';
import Profile from '@/components/pages/Profile';
import OrderHistory from '@/components/pages/OrderHistory';

// Reuse the same import functions for lazy rendering and background prefetching.
const platformLoaders = {
  PlatformLayout: () => import('@/components/pages/platform/PlatformLayout'),
  PlatformDashboard: () => import('@/components/pages/platform/PlatformDashboard'),
  PlansPage: () => import('@/components/pages/platform/PlansPage'),
  ResellersPage: () => import('@/components/pages/platform/ResellersPage'),
  ResellerNewPage: () => import('@/components/pages/platform/ResellerNewPage'),
  ResellerDetailPage: () => import('@/components/pages/platform/ResellerDetailPage'),
  AppsPage: () => import('@/components/pages/platform/AppsPage'),
  FeaturesPage: () => import('@/components/pages/platform/FeaturesPage'),
} as const;

let platformWarmStarted = false;

/** Download tab code after platform login without remounting the Super Admin shell. */
export function warmPlatformPages() {
  if (typeof window === 'undefined' || platformWarmStarted) return;
  platformWarmStarted = true;
  void Promise.allSettled([
    platformLoaders.PlatformDashboard(),
    platformLoaders.ResellersPage(),
    platformLoaders.PlansPage(),
    platformLoaders.FeaturesPage(),
    platformLoaders.AppsPage(),
    platformLoaders.ResellerNewPage(),
    platformLoaders.ResellerDetailPage(),
  ]);
}

const secondaryLoaders = {
  PrivacyPolicy: () => import('@/components/pages/PrivacyPolicy'),
} as const;

const pages = {
  Index,
  ProviderSelection,
  CategorySelection,
  DataPackages,
  PaymentProviders,
  PaymentSuccess,
  OfflineMode,
  Notifications,
  Profile,
  OrderHistory,
  PrivacyPolicy: React.lazy(secondaryLoaders.PrivacyPolicy),
  AdminLogin: React.lazy(() => import('@/components/pages/AdminLogin')),
  SimpleAdminDashboard: React.lazy(() => import('@/components/pages/SimpleAdminDashboard')),
  SimpleAdminDetail: React.lazy(() => import('@/components/pages/SimpleAdminDetailWithProviderOrdering')),
  PlatformLayout: React.lazy(platformLoaders.PlatformLayout),
  PlatformDashboard: React.lazy(platformLoaders.PlatformDashboard),
  PlansPage: React.lazy(platformLoaders.PlansPage),
  ResellersPage: React.lazy(platformLoaders.ResellersPage),
  ResellerNewPage: React.lazy(platformLoaders.ResellerNewPage),
  ResellerDetailPage: React.lazy(platformLoaders.ResellerDetailPage),
  AppsPage: React.lazy(platformLoaders.AppsPage),
  FeaturesPage: React.lazy(platformLoaders.FeaturesPage),
} satisfies Record<string, React.ComponentType<any>>;

export type PageKey = keyof typeof pages;

export function lazyPage(key: PageKey): React.ComponentType<any> {
  return pages[key];
}

export function prefetchPage(key: PageKey) {
  const loader = (secondaryLoaders as Partial<Record<PageKey, () => Promise<unknown>>>)[key];
  if (loader) void loader();
}

export function warmPages() {
  if (typeof window === 'undefined') return;
  // Customer navigation pages are already present. Nothing to warm here.
}

function PageLoading() {
  const state = useTenant();
  const route = useRouterLocation();
  // /admin is not a tenant storefront. A full-screen TenantSplash here used
  // to flash on every lazy Super Admin tab switch, looking like a page reload.
  // Keep the existing platform sidebar mounted and show only content skeletons.
  if (/^\/admin(?:\/|$)/.test(route.pathname)) {
    return (
      <div role="status" aria-label="Loading Super Admin tab" className="px-4 py-6 sm:px-7 lg:px-8 lg:py-8">
        <div className="mb-7 h-7 w-36 animate-pulse rounded-md bg-slate-200" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl border border-slate-100 bg-white/80" />
          ))}
        </div>
      </div>
    );
  }
  const tenant = state.status === 'ready' || state.status === 'suspended' ? state.tenant : null;

  // Keep TenantGate's branded web splash on screen until the lazy page is ready.
  // No separate white loading page is inserted between splash and page.
  return (
    <TenantSplash
      logo={tenant?.logo_url || (state.status === 'platform' ? iftinLogo : null)}
      name={tenant?.name || (state.status === 'platform' ? 'Iftin Agents' : null)}
      color={tenant?.primary_color}
    />
  );
}

export function PageSuspense({ children }: { children: React.ReactNode }) {
  return <React.Suspense fallback={<PageLoading />}>{children}</React.Suspense>;
}
