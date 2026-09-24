import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import { emitStorefront } from '@/lib/storefrontEvents';
import { workspaceQueryKey, workspaceStorage } from '@/lib/workspaceKeys';

/**
 * One app-wide realtime subscription for everything a tenant admin can change
 * (providers, packages/prices, categories, payment methods, banners). Mounted
 * in the root layout so any screen the customer is on updates immediately —
 * no manual refresh, no waiting for a TTL to expire.
 */
export function useStorefrontRealtime() {
  const queryClient = useQueryClient();
  const t = useTenant();
  const tenantId = t.status === 'ready' || t.status === 'suspended' ? t.tenant.id : '';

  useEffect(() => {
    if (!tenantId) return;

    const CATALOG_RESOURCES = [
      'iftin_catalog_v3_local_images',
      'offline_providers',
      'offline_categories',
      'offline_packages',
      'offline_payment_providers',
      'offline_featured_packages',
      'offline_popular_packages_v3',
      'offline_cache_timestamp',
    ];

    const invalidateCatalog = () => {
      // Clear only this workspace's snapshots; another workspace's cache is
      // none of this subscription's business.
      CATALOG_RESOURCES.forEach((resource) => workspaceStorage.remove(resource, tenantId));
      for (const resource of [
        'providers',
        'categories',
        'packages',
        'featuredPackages',
        'popularPackages',
        'paymentProviders',
        'promotionalText',
      ]) {
        queryClient.invalidateQueries({ queryKey: workspaceQueryKey(tenantId, resource) });
      }
      emitStorefront('catalog-changed');
    };

    const invalidateBanners = () => {
      workspaceStorage.remove('offline_banners', tenantId);
      workspaceStorage.remove('offline_banners_at', tenantId);
      emitStorefront('banners-changed');
    };

    const filter = `tenant_id=eq.${tenantId}`;
    const channel = supabase.channel(`storefront-freshness-${tenantId}`);

    for (const table of [
      'providers_config',
      'data_packages_config',
      'package_categories',
      'payment_providers_config',
    ]) {
      channel.on(
        'postgres_changes' as never,
        { event: '*', schema: 'public', table, filter } as never,
        invalidateCatalog as never,
      );
    }

    channel.on(
      'postgres_changes' as never,
      { event: '*', schema: 'public', table: 'banners_config', filter } as never,
      invalidateBanners as never,
    );

    channel.subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [queryClient, tenantId]);
}
