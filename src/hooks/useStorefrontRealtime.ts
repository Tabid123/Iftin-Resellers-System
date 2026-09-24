import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import { emitStorefront } from '@/lib/storefrontEvents';
import { workspaceQueryKey, workspaceStorage } from '@/lib/workspaceKeys';

/**
 * Single storefront realtime owner.
 *
 * Each table refreshes only the resource it owns. This avoids the old behavior
 * where one payment/package edit invalidated the entire catalog and triggered
 * multiple duplicate subscriptions and network requests.
 */
export function useStorefrontRealtime() {
  const queryClient = useQueryClient();
  const t = useTenant();
  const tenantId = t.status === 'ready' || t.status === 'suspended' ? t.tenant.id : '';

  useEffect(() => {
    if (!tenantId) return;

    const invalidate = (
      storageResources: string[],
      queryResources: string[],
      event: 'catalog-changed' | 'banners-changed' = 'catalog-changed',
    ) => {
      for (const resource of storageResources) workspaceStorage.remove(resource, tenantId);
      for (const resource of queryResources) {
        void queryClient.invalidateQueries({ queryKey: workspaceQueryKey(tenantId, resource) });
      }
      emitStorefront(event);
    };

    const filter = `tenant_id=eq.${tenantId}`;
    const channel = supabase.channel(`storefront-freshness-${tenantId}`);

    channel
      .on(
        'postgres_changes' as never,
        { event: '*', schema: 'public', table: 'providers_config', filter } as never,
        (() => invalidate(
          ['offline_providers'],
          ['providers', 'featuredPackages', 'popularPackages'],
        )) as never,
      )
      .on(
        'postgres_changes' as never,
        { event: '*', schema: 'public', table: 'package_categories', filter } as never,
        (() => invalidate(
          ['offline_categories'],
          ['categories'],
        )) as never,
      )
      .on(
        'postgres_changes' as never,
        { event: '*', schema: 'public', table: 'data_packages_config', filter } as never,
        (() => invalidate(
          ['offline_packages', 'offline_featured_packages', 'offline_popular_packages_v2', 'offline_popular_packages_v3'],
          ['packages', 'featuredPackages', 'popularPackages'],
        )) as never,
      )
      .on(
        'postgres_changes' as never,
        { event: '*', schema: 'public', table: 'payment_providers_config', filter } as never,
        (() => invalidate(
          ['offline_payment_providers'],
          ['paymentProviders'],
        )) as never,
      )
      .on(
        'postgres_changes' as never,
        { event: '*', schema: 'public', table: 'banners_config', filter } as never,
        (() => invalidate(
          ['offline_banners', 'offline_banners_at'],
          ['banners'],
          'banners-changed',
        )) as never,
      )
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [queryClient, tenantId]);
}
