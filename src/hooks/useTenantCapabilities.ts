import { useShop } from '@/components/shop/useShop';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import { useAdminPermissions } from '@/hooks/useAdminPermissions';

export type DeliveryMode = 'android_device' | 'api_partner';

/**
 * Modules-ka aan loo baahnayn reseller-ka API partner ah.
 * (Iftin ayaa maamula devices, SIM, USSD, delivery iyo qiimaha aasaasiga.)
 */
const PARTNER_HIDDEN = new Set<string>([
  // Devices & delivery engine — Iftin ayaa haya
  'devices', 'sms-logs', 'auto-topup', 'deliveries', 'bulk-sms',
  // Local catalog / USSD config — catalog-ka waxaa laga soo qaataa API-ga
  'providers', 'packages', 'categories', 'featured', 'delivery-rules', 'system-codes', 'sim-pins', 'discovery-pricing',
  // SIM/bank/e-voucher accounting — ma khusayso partner
  'sms-lacago', 'bank-transactions', 'evoucher-rates',
  // Offline (SMS) ordering — device ayuu u baahan
  // ('offline-registrations' waa la muujinayaa: partner-ku Iftin API ayuu isticmaalaa)
  'offline-payment', 'orders', 'abdiqafar',
  // Settings-ka lacagta ee Iftin maamulo — partner-ku uma baahna
  'payment-settings', 'integrations',
]);

/**
 * Modules-ka kaliya khuseeya reseller-ka API partner ah.
 * Tenant-ka Android delivery (SIM/USSD) ma arko kuwan.
 */
const PARTNER_ONLY = new Set<string>([
  'iftin-wallet',          // Wallet-ka Iftin API
  'warbixin',              // Warbixinta API-ga
  'iftin-pricing',         // Qiimaha partner-ka ee Iftin
  'iftin-payment-numbers', // Lambarada lacagta ee catalog-ka API-ga
  'iftin-payments',        // Lacagaha SMS-ka ee API-ga
]);



/** One permission check for sidebar items AND directly opened detail URLs. */
const VIEW_PERMISSION: Record<string, string> = {
  'transactions': 'view_transactions',
  'warbixin': 'view_transactions',
  'sms-lacago': 'view_transactions',
  'bank-transactions': 'view_transactions',
  'evoucher-rates': 'view_transactions',
  'iftin-payments': 'view_transactions',
  'iftin-wallet': 'view_profit',
  'daily-orders': 'manage_orders',
  'orders': 'manage_orders',
  'abdiqafar': 'manage_orders',
  'all-orders': 'manage_orders',
  'sales': 'manage_orders',
  'pending': 'manage_orders',
  'failed': 'manage_orders',
  'delivered': 'manage_orders',
  'unmatched': 'manage_orders',
  'deliveries': 'manage_orders',
  'customers': 'manage_users',
  'offline-registrations': 'manage_users',
  'blocked': 'manage_users',
  'providers': 'manage_providers',
  'packages': 'manage_packages',
  'categories': 'manage_packages',
  'featured': 'manage_packages',
  'delivery-rules': 'manage_packages',
  'system-codes': 'manage_packages',
  'discovery-pricing': 'manage_packages',
  'iftin-pricing': 'manage_packages',
  'devices': 'manage_devices',
  'sim-pins': 'manage_devices',
  'sms-logs': 'manage_devices',
  'auto-topup': 'manage_devices',
  'bulk-sms': 'manage_bulk_sms',
  'send-notification': 'manage_settings',
  'payment-settings': 'manage_settings',
  'iftin-payment-numbers': 'manage_settings',
  'offline-payment': 'manage_settings',
  'banners': 'manage_settings',
  'app-settings': 'manage_settings',
  'apps': 'manage_settings',
  'admin-management': 'manage_admins',
  'audit-log': 'view_audit_log',
  'fraud-alerts': 'view_audit_log',
};

// TenantContext already carries the delivery mode for the current workspace.
// Do not assume Android mode before the API-partner flag has finished resolving.
export function useTenantCapabilities() {
  const { tenant } = useTenant();
  const shop = useShop();
  const { can, loadingPermissions, permissionsError, retryPermissions } = useAdminPermissions();
  const tenantId = tenant?.id ?? null;
  const contextMode: DeliveryMode | null =
    tenant?.delivery_mode === 'api_partner' || tenant?.delivery_mode === 'android_device'
      ? tenant.delivery_mode : null;

  const [lookup, setLookup] = useState<{
    tenantId: string | null;
    mode: DeliveryMode | null;
    error: string | null;
  }>({ tenantId: null, mode: null, error: null });
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (!tenantId || contextMode) return;
    let active = true;
    (async () => {
      const { data, error } = await supabase.from('tenants')
        .select('delivery_mode').eq('id', tenantId).maybeSingle();
      if (!active) return;
      if (error || !data) {
        setLookup({
          tenantId,
          mode: null,
          error: error?.message || 'Unable to resolve tenant delivery mode',
        });
      } else {
        setLookup({
          tenantId,
          mode: data.delivery_mode === 'api_partner' ? 'api_partner' : 'android_device',
          error: null,
        });
      }
    })();
    return () => { active = false; };
  }, [tenantId, contextMode, retryKey]);

  const matchingLookup = lookup.tenantId === tenantId ? lookup : null;
  const mode = contextMode ?? matchingLookup?.mode ?? null;
  const modeError = !contextMode ? matchingLookup?.error ?? null : null;
  const loadingMode = !!tenantId && mode === null && !modeError;
  const isPartner = mode === 'api_partner';

  const canSee = (view?: string) => {
    if (!view) return true;
    const key = view.replace(/^\\/dashboard\\/?/, '').split('?')[0];
    if (!key) return true;
    if (key === 'integrations') return false;
    if (['shop', 'ecommerce-categories', 'ecommerce-packages', 'ecommerce-stock', 'ecommerce-orders', 'ecommerce-settings'].includes(key)) {
      return !loadingPermissions && !loadingMode && shop.enabled && can('manage_settings');
    }
    // While the mode or permissions are pending, no access decision is final.
    if (loadingPermissions || loadingMode || permissionsError || modeError) return false;
    if (isPartner && PARTNER_HIDDEN.has(key)) return false;
    if (!isPartner && PARTNER_ONLY.has(key)) return false;
    const permission = VIEW_PERMISSION[key];
    return permission ? can(permission) : false;
  };

  return {
    mode,
    isPartner,
    canSee,
    can,
    loadingPermissions,
    permissionsError,
    retryPermissions,
    loadingMode,
    modeError,
    retryMode: () => {
      setLookup({ tenantId: null, mode: null, error: null });
      setRetryKey(value => value + 1);
    },
    shopLoading: shop.loading,
    shopError: shop.error,
  };
}
