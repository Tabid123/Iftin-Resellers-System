/**
 * Warms the code-split admin view chunks while the dashboard is idle, so
 * tapping a tab renders instantly instead of waiting on a network download.
 */
let started = false;

const loaders: Array<() => Promise<unknown>> = [
  // Most-used views first
  () => import('@/components/admin/simple/OrderViews'),
  () => import('@/components/admin/simple/CustomerViews'),
  () => import('@/components/admin/simple/ConfigViews'),
  () => import('@/components/admin/TransactionsDashboard'),
  () => import('@/components/admin/SmsLacagoCards'),
  () => import('@/components/admin/DeliveryTracker'),
  () => import('@/components/admin/UnmatchedPayments'),
  () => import('@/components/admin/BalanceManagement'),
  () => import('@/components/admin/simple/AbdiqafarView'),
  () => import('@/components/admin/BankTransactions'),
  () => import('@/components/admin/IftinWallet'),
  () => import('@/components/admin/IftinPricing'),
  () => import('@/components/admin/IftinPaymentNumbers'),
  () => import('@/components/admin/SmsLogsViewer'),
  () => import('@/components/admin/BulkSmsManager'),
  () => import('@/components/admin/SendNotification'),
  () => import('@/components/admin/AppSettings'),
  () => import('@/components/admin/OfflinePaymentSettings'),
  () => import('@/components/admin/PackageDeliveryRules'),
  () => import('@/components/admin/AdminManagement'),
  () => import('@/components/admin/AuditLogViewer'),
  () => import('@/components/admin/FraudAlerts'),
  () => import('@/components/admin/CompanyFinances'),
  () => import('@/components/admin/CombinedPaymentAnalytics'),
];

function onIdle(cb: () => void, timeout = 1200) {
  const ric = (window as unknown as {
    requestIdleCallback?: (fn: () => void, opts?: { timeout: number }) => number;
  }).requestIdleCallback;
  if (ric) ric(cb, { timeout });
  else window.setTimeout(cb, timeout);
}

/** Downloads admin chunks one-by-one during idle time. Safe to call repeatedly. */
export function prefetchAdminViews() {
  if (started || typeof window === 'undefined') return;
  started = true;

  // Don't burn data on a metered / very slow connection.
  const conn = (navigator as unknown as {
    connection?: { saveData?: boolean; effectiveType?: string };
  }).connection;
  if (conn?.saveData || conn?.effectiveType === 'slow-2g' || conn?.effectiveType === '2g') return;

  let i = 0;
  const next = () => {
    if (i >= loaders.length) return;
    const load = loaders[i++];
    load()
      .catch(() => {})
      .finally(() => onIdle(next, 400));
  };
  onIdle(next);
}
