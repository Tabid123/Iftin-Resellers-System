import { useLayoutEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTenant } from '@/contexts/TenantContext';
import { tenantOfflineBootstrap } from '@/generated/tenantOfflineBootstrap';
import { workspaceQueryKey, workspaceStorage } from '@/lib/workspaceKeys';

const RESOURCES = {
  providers: 'offline_providers',
  categories: 'offline_categories',
  packages: 'offline_packages',
  paymentProviders: 'offline_payment_providers',
  deliveryInstructions: 'offline_delivery_instructions',
  appSettings: 'offline_app_settings',
  featuredPackages: 'offline_featured_packages',
  banners: 'offline_banners',
  bannersAt: 'offline_banners_at',
  timestamp: 'offline_cache_timestamp',
  packagedAt: 'offline_packaged_bootstrap_at',
} as const;

type Bootstrap = {
  version: number;
  generated_at: string;
  tenant: { id: string; slug: string };
  providers: any[];
  categories: any[];
  packages: Record<string, any[]>;
  paymentProviders: any[];
  deliveryInstructions: any[];
  appSettings: any[];
  featuredPackages: any[];
  banners: any[];
};

function isBootstrap(value: unknown): value is Bootstrap {
  const item = value as Bootstrap | null;
  return Boolean(
    item &&
      item.version === 1 &&
      item.tenant?.id &&
      item.tenant?.slug &&
      Array.isArray(item.providers) &&
      Array.isArray(item.categories) &&
      item.packages &&
      typeof item.packages === 'object',
  );
}

/**
 * Seed a freshly installed tenant APK from the catalog snapshot packaged at
 * build time. This runs before paint, so provider/category/package screens can
 * render without waiting for the first network request.
 */
export function usePackagedOfflineBootstrap() {
  const queryClient = useQueryClient();
  const tenantState = useTenant();

  useLayoutEffect(() => {
    if (!isBootstrap(tenantOfflineBootstrap)) return;
    if (tenantState.status !== 'ready' && tenantState.status !== 'suspended') return;

    const tenant = tenantState.tenant;
    const snapshot = tenantOfflineBootstrap;
    if (tenant.id !== snapshot.tenant.id || tenant.slug !== snapshot.tenant.slug) return;

    const packagedAt = Date.parse(snapshot.generated_at);
    const existingAt = Number(workspaceStorage.get(RESOURCES.timestamp, tenant.id) || 0);
    const alreadySeededAt = Date.parse(
      workspaceStorage.get(RESOURCES.packagedAt, tenant.id) || '',
    );

    // A newer runtime sync always wins. Only seed when the device has no newer
    // snapshot than the one shipped inside this APK.
    if (Number.isFinite(packagedAt) && existingAt > packagedAt) return;
    if (Number.isFinite(packagedAt) && alreadySeededAt >= packagedAt) return;

    workspaceStorage.setJson(RESOURCES.providers, snapshot.providers, tenant.id);
    workspaceStorage.setJson(RESOURCES.categories, snapshot.categories, tenant.id);
    workspaceStorage.setJson(RESOURCES.packages, snapshot.packages, tenant.id);
    workspaceStorage.setJson(RESOURCES.paymentProviders, snapshot.paymentProviders, tenant.id);
    workspaceStorage.setJson(RESOURCES.deliveryInstructions, snapshot.deliveryInstructions, tenant.id);
    workspaceStorage.setJson(RESOURCES.appSettings, snapshot.appSettings, tenant.id);
    workspaceStorage.setJson(RESOURCES.featuredPackages, snapshot.featuredPackages, tenant.id);
    workspaceStorage.setJson(RESOURCES.banners, snapshot.banners, tenant.id);

    const stampedAt = Number.isFinite(packagedAt) ? packagedAt : Date.now();
    workspaceStorage.set(RESOURCES.timestamp, String(stampedAt), tenant.id);
    workspaceStorage.set(RESOURCES.bannersAt, String(stampedAt), tenant.id);
    workspaceStorage.set(RESOURCES.packagedAt, snapshot.generated_at, tenant.id);

    queryClient.setQueryData(workspaceQueryKey(tenant.id, 'providers'), snapshot.providers);
    queryClient.setQueryData(
      workspaceQueryKey(tenant.id, 'paymentProviders'),
      snapshot.paymentProviders,
    );
    queryClient.setQueryData(
      workspaceQueryKey(tenant.id, 'featuredPackages'),
      snapshot.featuredPackages,
    );
    queryClient.setQueryData(workspaceQueryKey(tenant.id, 'banners'), snapshot.banners);
    queryClient.setQueryData(workspaceQueryKey(tenant.id, 'categories'), snapshot.categories);

    for (const provider of snapshot.providers) {
      const providerId = String(provider?.id || '');
      if (!providerId) continue;
      queryClient.setQueryData(
        workspaceQueryKey(tenant.id, 'categories', providerId),
        snapshot.categories.filter((category) => String(category?.provider_id) === providerId),
      );
      queryClient.setQueryData(
        workspaceQueryKey(tenant.id, 'packages', providerId),
        snapshot.packages[providerId] || [],
      );
    }
  }, [queryClient, tenantState]);
}
