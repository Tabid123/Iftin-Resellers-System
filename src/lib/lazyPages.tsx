import * as React from 'react';
import Index from '@/components/pages/Index';
import ProviderSelection from '@/components/pages/ProviderSelection';
import CategorySelection from '@/components/pages/CategorySelection';
import DataPackages from '@/components/pages/DataPackages';
import PaymentProviders from '@/components/pages/PaymentProviders';
import OfflineMode from '@/components/pages/OfflineMode';

/**
 * Keep only the immediate purchase path in the startup bundle.
 *
 * History is comparatively heavy (invoice generation + filesystem helpers), and
 * loading every customer page before the providers screen paints made the whole
 * storefront feel slower. Secondary pages are split into chunks and warmed in
 * idle time, so the first paint stays light while bottom-nav taps still find
 * their destination already downloaded on normal devices.
 */
const loaders = {
  PaymentSuccess: () => import('@/components/pages/PaymentSuccess'),
  OrderHistory: () => import('@/components/pages/OrderHistory'),
  Notifications: () => import('@/components/pages/Notifications'),
  Profile: () => import('@/components/pages/Profile'),
  PrivacyPolicy: () => import('@/components/pages/PrivacyPolicy'),
} as const;

const lazySecondary = {
  PaymentSuccess: React.lazy(loaders.PaymentSuccess),
  OrderHistory: React.lazy(loaders.OrderHistory),
  Notifications: React.lazy(loaders.Notifications),
  Profile: React.lazy(loaders.Profile),
  PrivacyPolicy: React.lazy(loaders.PrivacyPolicy),
};

const adminLoaders = {
  AdminLogin: () => import('@/components/pages/AdminLogin'),
  SimpleAdminDashboard: () => import('@/components/pages/SimpleAdminDashboard'),
  SimpleAdminDetail: () => import('@/components/pages/SimpleAdminDetailWithProviderOrdering'),
  PlatformLayout: () => import('@/components/pages/platform/PlatformLayout'),
  PlatformDashboard: () => import('@/components/pages/platform/PlatformDashboard'),
  PlansPage: () => import('@/components/pages/platform/PlansPage'),
  ResellersPage: () => import('@/components/pages/platform/ResellersPage'),
  ResellerNewPage: () => import('@/components/pages/platform/ResellerNewPage'),
  ResellerDetailPage: () => import('@/components/pages/platform/ResellerDetailPage'),
  AppsPage: () => import('@/components/pages/platform/AppsPage'),
} as const;

const pages = {
  Index,
  ProviderSelection,
  CategorySelection,
  DataPackages,
  PaymentProviders,
  OfflineMode,
  ...lazySecondary,
  AdminLogin: React.lazy(adminLoaders.AdminLogin),
  SimpleAdminDashboard: React.lazy(adminLoaders.SimpleAdminDashboard),
  SimpleAdminDetail: React.lazy(adminLoaders.SimpleAdminDetail),
  PlatformLayout: React.lazy(adminLoaders.PlatformLayout),
  PlatformDashboard: React.lazy(adminLoaders.PlatformDashboard),
  PlansPage: React.lazy(adminLoaders.PlansPage),
  ResellersPage: React.lazy(adminLoaders.ResellersPage),
  ResellerNewPage: React.lazy(adminLoaders.ResellerNewPage),
  ResellerDetailPage: React.lazy(adminLoaders.ResellerDetailPage),
  AppsPage: React.lazy(adminLoaders.AppsPage),
} satisfies Record<string, React.ComponentType<any>>;

export type PageKey = keyof typeof pages;

export function lazyPage(key: PageKey): React.ComponentType<any> {
  return pages[key];
}

export function prefetchPage(key: PageKey) {
  const secondaryLoader = (loaders as Partial<Record<PageKey, () => Promise<unknown>>>)[key];
  if (secondaryLoader) {
    void secondaryLoader();
    return;
  }
  const adminLoader = (adminLoaders as Partial<Record<PageKey, () => Promise<unknown>>>)[key];
  if (adminLoader) void adminLoader();
}

export function warmPages() {
  if (typeof window === 'undefined') return;

  const warm = () => {
    // These are the bottom-nav destinations. Warm them only after the providers
    // screen has had a chance to paint; never compete with the first tap/frame.
    void loaders.OrderHistory();
    void loaders.Notifications();
    void loaders.Profile();
  };

  const timer = window.setTimeout(() => {
    if ('requestIdleCallback' in window) {
      (window as any).requestIdleCallback(warm, { timeout: 1800 });
    } else {
      warm();
    }
  }, 700);

  return () => window.clearTimeout(timer);
}

/** Lazy secondary/admin chunks render inside the current page shell. */
export function PageSuspense({ children }: { children: React.ReactNode }) {
  return <React.Suspense fallback={null}>{children}</React.Suspense>;
}
