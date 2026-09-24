import * as React from 'react';
import Index from '@/components/pages/Index';
import ProviderSelection from '@/components/pages/ProviderSelection';
import CategorySelection from '@/components/pages/CategorySelection';
import DataPackages from '@/components/pages/DataPackages';
import PaymentProviders from '@/components/pages/PaymentProviders';
import PaymentSuccess from '@/components/pages/PaymentSuccess';
import OfflineMode from '@/components/pages/OfflineMode';
import Notifications from '@/components/pages/Notifications';
import Profile from '@/components/pages/Profile';

const secondaryLoaders = {
  OrderHistory: () => import('@/components/pages/OrderHistory'),
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
  OrderHistory: React.lazy(secondaryLoaders.OrderHistory),
  PrivacyPolicy: React.lazy(secondaryLoaders.PrivacyPolicy),
  AdminLogin: React.lazy(() => import('@/components/pages/AdminLogin')),
  SimpleAdminDashboard: React.lazy(() => import('@/components/pages/SimpleAdminDashboard')),
  SimpleAdminDetail: React.lazy(() => import('@/components/pages/SimpleAdminDetailWithProviderOrdering')),
  PlatformLayout: React.lazy(() => import('@/components/pages/platform/PlatformLayout')),
  PlatformDashboard: React.lazy(() => import('@/components/pages/platform/PlatformDashboard')),
  PlansPage: React.lazy(() => import('@/components/pages/platform/PlansPage')),
  ResellersPage: React.lazy(() => import('@/components/pages/platform/ResellersPage')),
  ResellerNewPage: React.lazy(() => import('@/components/pages/platform/ResellerNewPage')),
  ResellerDetailPage: React.lazy(() => import('@/components/pages/platform/ResellerDetailPage')),
  AppsPage: React.lazy(() => import('@/components/pages/platform/AppsPage')),
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
  const warm = () => { void secondaryLoaders.OrderHistory(); };
  if ('requestIdleCallback' in window) {
    (window as any).requestIdleCallback(warm, { timeout: 2500 });
  } else {
    window.setTimeout(warm, 500);
  }
}

export function PageSuspense({ children }: { children: React.ReactNode }) {
  return <React.Suspense fallback={null}>{children}</React.Suspense>;
}
