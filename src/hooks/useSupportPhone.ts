import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useTenant } from '@/contexts/TenantContext';
import { supabase } from '@/integrations/supabase/client';
import { workspaceStorage } from '@/lib/workspaceKeys';
import { supportPhoneE164 } from '@/components/shop/ShopSupportFab';

const DEFAULT_SUPPORT_PHONE = '619535029';
const FAB_CACHE_KEY = 'fab_support_contacts';

export type TenantFabContacts = {
  support_whatsapp: string;
  support_call: string;
};

/** Normalise to a bare Somali number (no +252 / 252 prefix). */
export function normalizeSupportPhone(raw?: string | null): string {
  const digits = (raw ?? '').replace(/\D/g, '');
  if (!digits) return DEFAULT_SUPPORT_PHONE;
  const local = digits.startsWith('252') ? digits.slice(3) : digits;
  const withoutLeadingZero = local.length === 10 && local.startsWith('0') ? local.slice(1) : local;
  return withoutLeadingZero.length >= 7 ? withoutLeadingZero : DEFAULT_SUPPORT_PHONE;
}

/**
 * Use the independent WhatsApp and Call numbers configured by this tenant.
 * The legacy tenants.support_phone is only a fallback while no FAB settings
 * have been saved. This is shared by the Android APK and web storefront.
 */
export function resolveSupportContacts(
  contacts: TenantFabContacts | null | undefined,
  tenantFallback?: string | null,
) {
  const defaultNumber = tenantFallback?.trim() || DEFAULT_SUPPORT_PHONE;
  const callNumber = contacts?.support_call?.trim() || defaultNumber;
  const whatsappNumber = contacts?.support_whatsapp?.trim() || defaultNumber;
  const callE164 = supportPhoneE164(callNumber);
  const whatsappE164 = supportPhoneE164(whatsappNumber);

  return {
    phone: normalizeSupportPhone(callNumber),
    display: callE164,
    telHref: `tel:${callE164}`,
    whatsappHref: `https://wa.me/${whatsappE164.slice(1)}`,
  };
}

/**
 * Live tenant-specific contact numbers for Provider FAB, Categories, Profile
 * and customer-support chat. Reloads on window/app foreground, reconnection,
 * and periodically while the storefront is open; keeps a tenant-scoped offline
 * snapshot so an installed APK can still use the last known phone numbers.
 */
export function useSupportPhone() {
  const state = useTenant();
  const tenantId = state.tenant?.id ?? null;
  const queryClient = useQueryClient();

  // Android WebViews do not reliably emit browser focus when returning from
  // the dialer, WhatsApp, or the Android app switcher. Refresh on native resume.
  useEffect(() => {
    if (!tenantId) return;
    const refresh = () => {
      if (document.visibilityState === 'visible') {
        void queryClient.invalidateQueries({ queryKey: ['tenant-fab-contacts', tenantId] });
      }
    };
    const onFocus = () => refresh();
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', onFocus);
    let removeNativeListener: (() => void) | undefined;
    void import('@capacitor/app').then(({ App }) =>
      App.addListener('appStateChange', ({ isActive }) => {
        if (isActive) void queryClient.invalidateQueries({ queryKey: ['tenant-fab-contacts', tenantId] });
      }),
    ).then(listener => { removeNativeListener = () => { void listener.remove(); }; }).catch(() => {});
    return () => {
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', onFocus);
      removeNativeListener?.();
    };
  }, [tenantId, queryClient]);

  const contacts = useQuery({
    queryKey: ['tenant-fab-contacts', tenantId],
    enabled: Boolean(tenantId),
    queryFn: async (): Promise<TenantFabContacts> => {
      if (!tenantId) throw new Error('Tenant not resolved');
      const { data, error } = await supabase
        .from('tenant_fab_contacts')
        .select('support_whatsapp,support_call')
        .eq('tenant_id', tenantId)
        .maybeSingle();
      if (error) throw error;

      // An empty row intentionally falls back to the tenant's default phone.
      const resolved: TenantFabContacts = {
        support_whatsapp: data?.support_whatsapp ?? '',
        support_call: data?.support_call ?? '',
      };
      workspaceStorage.setJson(FAB_CACHE_KEY, resolved, tenantId);
      return resolved;
    },
    initialData: () => tenantId
      ? workspaceStorage.getJson<TenantFabContacts | undefined>(FAB_CACHE_KEY, undefined, tenantId)
      : undefined,
    initialDataUpdatedAt: 0,
    staleTime: 10_000,
    refetchOnMount: 'always',
    refetchOnWindowFocus: 'always',
    refetchOnReconnect: 'always',
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    retry: 1,
  });

  const fallback = state.tenant?.support_phone ?? null;
  // Render the last known contacts immediately. React Query refreshes them
  // silently in the background on mount, reconnect, resume and every 30 seconds.
  // Opening the FAB must never initiate a network request or block its buttons.
  return resolveSupportContacts(contacts.data, fallback);
}

export { DEFAULT_SUPPORT_PHONE };
