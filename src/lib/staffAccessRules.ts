/**
 * Staff access rules for the reseller admin.
 *
 * These are UI-level guardrails. The database/RPC layer must also enforce
 * the same permissions; hiding a page is NOT database authorization.
 */
export const RESTRICTED_ACCESS_MARKER = 'restricted_access';

export const STAFF_PERMISSION_KEYS = [
  'manage_packages',
  'manage_providers',
  'manage_orders',
  'view_transactions',
  'view_sales',
  'view_profit',
  'manage_users',
  'manage_settings',
  'manage_devices',
  'manage_bulk_sms',
  'view_audit_log',
  'manage_admins',
] as const;

export type StaffPermissionKey = typeof STAFF_PERMISSION_KEYS[number];

const VIEW_RULES: Record<string, readonly StaffPermissionKey[]> = {
  '': [],
  'dashboard': [],
  'transactions': ['view_transactions', 'view_sales', 'view_profit'],
  'warbixin': ['view_sales', 'view_profit'],
  'sms-lacago': ['view_transactions'],
  'bank-transactions': ['view_transactions'],
  'evoucher-rates': ['view_profit'],
  'daily-orders': ['manage_orders'],
  'orders': ['manage_orders'],
  'abdiqafar': ['manage_orders'],
  'all-orders': ['manage_orders'],
  'sales': ['view_sales'],
  'pending': ['manage_orders'],
  'failed': ['manage_orders'],
  'delivered': ['manage_orders'],
  'auto-topup': ['manage_orders'],
  'deliveries': ['manage_orders'],
  'unmatched': ['manage_orders', 'view_transactions'],
  'customers': ['manage_users'],
  'offline-registrations': ['manage_users'],
  'blocked': ['manage_users'],
  'providers': ['manage_providers'],
  'packages': ['manage_packages'],
  'iftin-pricing': ['manage_packages'],
  'categories': ['manage_packages'],
  'featured': ['manage_packages'],
  'delivery-rules': ['manage_packages'],
  'system-codes': ['manage_packages'],
  'discovery-pricing': ['manage_packages'],
  'devices': ['manage_devices'],
  'sim-pins': ['manage_devices'],
  'sms-logs': ['manage_devices'],
  'send-notification': ['manage_settings'],
  'bulk-sms': ['manage_bulk_sms'],
  'payment-settings': ['manage_settings'],
  'integrations': ['manage_settings'],
  'iftin-payment-numbers': ['manage_settings'],
  'iftin-wallet': ['view_profit'],
  'iftin-payments': ['view_transactions'],
  'offline-payment': ['manage_settings'],
  'banners': ['manage_settings'],
  'app-settings': ['manage_settings'],
  'apps': ['manage_settings'],
  'admin-management': ['manage_admins'],
  'audit-log': ['view_audit_log'],
  'fraud-alerts': ['view_audit_log'],
};

/** Unknown pages fail closed for restricted staff. */
export function mayViewStaffPage(
  view: string | undefined,
  mode: 'loading' | 'full' | 'restricted' | 'denied',
  permissions: ReadonlySet<string>,
): boolean {
  if (mode === 'full') return true;
  if (mode !== 'restricted') return false;
  const key = (view ?? '').replace(/^\/dashboard\/?/, '').split('?')[0];
  const required = VIEW_RULES[key];
  return required !== undefined && required.every((permission) => permissions.has(permission));
}
