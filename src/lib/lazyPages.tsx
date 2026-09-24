import * as React from 'react';
import Index from '@/components/pages/Index';
import ProviderSelection from '@/components/pages/ProviderSelection';
import CategorySelection from '@/components/pages/CategorySelection';
import DataPackages from '@/components/pages/DataPackages';
import PaymentProviders from '@/components/pages/PaymentProviders';
import PaymentSuccess from '@/components/pages/PaymentSuccess';
import OfflineMode from '@/components/pages/OfflineMode';
import OrderHistory from '@/components/pages/OrderHistory';
import Notifications from '@/components/pages/Notifications';
import Profile from '@/components/pages/Profile';
import PrivacyPolicy from '@/components/pages/PrivacyPolicy';

/**
 * Match the proven Iftin Internet storefront behavior:
 * customer pages are already in the main bundle, so a bottom-nav tap never
 * waits for a route chunk to download/parse. Only admin/platform pages stay
 * lazy because they are not part of the customer purchase path.
 */
const pages = {
  Index,
  ProviderSelection,
  CategorySelection,
  DataPackages,
  PaymentProviders,
  PaymentSuccess,
  OfflineMode,
  OrderHistory,
  Notifications,
  Profile,
  PrivacyPolicy,
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

export function prefetchPage(_key: PageKey) {}

export function warmPages() {}

/** Customer pages are synchronous; admin chunks stream behind this boundary. */
export function PageSuspense({ children }: { children: React.ReactNode }) {
  return <React.Suspense fallback={null}>{children}</React.Suspense>;
}
