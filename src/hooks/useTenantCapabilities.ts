import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/contexts/TenantContext';

export type DeliveryMode = 'android_device' | 'api_partner';

/**
 * Modules-ka aan loo baahnayn reseller-ka API partner ah.
 * (Iftin ayaa maamula devices, SIM, USSD, delivery iyo qiimaha aasaasiga.)
 */
const PARTNER_HIDDEN = new Set<string>([
  // Devices & delivery engine — Iftin ayaa haya
  'devices', 'sms-logs', 'auto-topup', 'deliveries', 'bulk-sms',
  // Local catalog / USSD config — catalog-ka waxaa laga soo qaataa API-ga
  'providers', 'packages', 'categories', 'featured', 'delivery-rules', 'system-codes', 'discovery-pricing',
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


const CACHE_KEY = 'najax.tenant_delivery_mode';
const cache = new Map<string, DeliveryMode>();

export function useTenantCapabilities() {
  const { tenant } = useTenant();
  const tenantId = tenant?.id ?? null;
  const [mode, setMode] = useState<DeliveryMode>(() => {
    if (tenantId && cache.has(tenantId)) return cache.get(tenantId)!;
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { id: string; mode: DeliveryMode };
        if (parsed.id === tenantId) return parsed.mode;
      }
    } catch { /* ignore */ }
    return 'android_device';
  });

  useEffect(() => {
    if (!tenantId) return;
    let active = true;
    (async () => {
      const { data } = await supabase
        .from('tenants').select('delivery_mode').eq('id', tenantId).maybeSingle();
      const next = (data?.delivery_mode === 'api_partner' ? 'api_partner' : 'android_device') as DeliveryMode;
      cache.set(tenantId, next);
      try { localStorage.setItem(CACHE_KEY, JSON.stringify({ id: tenantId, mode: next })); } catch { /* ignore */ }
      if (active) setMode(next);
    })();
    return () => { active = false; };
  }, [tenantId]);

  const isPartner = mode === 'api_partner';
  const canSee = (view?: string) => {
    if (!view) return true;
    const key = view.replace(/^\/dashboard\/?/, '');
    if (!key) return true;
    if (isPartner) return !PARTNER_HIDDEN.has(key);
    return !PARTNER_ONLY.has(key);
  };

  return { mode, isPartner, canSee };
}
