import { useCallback, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useConnectivity } from '@/contexts/ConnectivityContext';
import { useTenant } from '@/contexts/TenantContext';
import {
  fetchIftinCatalog,
  hasCatalog,
  isApiPartnerTenant,
  mapCategories,
  mapPackages,
  mapPaymentProviders,
  mapPopularPackages,
  mapProviders,
  readCachedCatalog,
  type IftinCatalog,
} from '@/lib/iftinCatalog';
import { cacheImages } from '@/lib/imageCache';
import { activeWorkspaceId, workspaceQueryKey, workspaceStorage } from '@/lib/workspaceKeys';

/**
 * Resource names, not storage keys. The real saved name always goes through
 * `workspaceStorage`, which prefixes the active workspace id.
 */
export const CACHE_RESOURCES = {
  providers: 'offline_providers',
  categories: 'offline_categories',
  packages: 'offline_packages',
  paymentProviders: 'offline_payment_providers',
  deliveryInstructions: 'offline_delivery_instructions',
  appSettings: 'offline_app_settings',
  featuredPackages: 'offline_featured_packages',
  popularPackages: 'offline_popular_packages_v2',
  banners: 'offline_banners',
  bannersAt: 'offline_banners_at',
  timestamp: 'offline_cache_timestamp',
} as const;

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const RETRY_DELAY_MS = 250;

function groupPackagesByProvider(packages: any[]) {
  const grouped: Record<string, any[]> = {};
  for (const pkg of packages) {
    const providerId = String(pkg?.provider_id ?? '');
    if (!providerId) continue;
    (grouped[providerId] ??= []).push(pkg);
  }
  return grouped;
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function rpcWithRetry<T = any>(name: string, args?: Record<string, unknown>): Promise<T> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const { data, error } = await (supabase as any).rpc(name, args);
      if (!error) return data as T;
      lastError = error;
    } catch (error) {
      lastError = error;
    }
    if (attempt === 0) await sleep(RETRY_DELAY_MS);
  }
  throw lastError ?? new Error(`RPC failed: ${name}`);
}

export const useOfflineCache = () => {
  const queryClient = useQueryClient();
  const { isReallyOnline } = useConnectivity();
  const tenantState = useTenant();
  const workspaceId =
    tenantState.status === 'ready' || tenantState.status === 'suspended'
      ? tenantState.tenant.id || null
      : null;

  const hydratedForRef = useRef<string | null>(null);
  const cachedForRef = useRef<string | null>(null);
  const sourceRef = useRef<'unknown' | 'iftin' | 'local'>('unknown');

  /**
   * Every write goes through this guard: a response that arrives after the
   * workspace changed is discarded instead of poisoning the new workspace.
   */
  const stillActive = useCallback(
    (id: string | null) => Boolean(id) && activeWorkspaceId() === id,
    [],
  );

  const hydrateIftinCatalog = useCallback(
    (catalog: IftinCatalog, id: string | null) => {
      if (!hasCatalog(catalog) || !stillActive(id)) return false;

      const providers = mapProviders(catalog);
      const categories = mapCategories(catalog);
      const packages = mapPackages(catalog);
      const paymentProviders = mapPaymentProviders(catalog);
      const popularPackages = mapPopularPackages(catalog);
      const packagesByProvider = groupPackagesByProvider(packages);

      sourceRef.current = 'iftin';

      queryClient.setQueryData(workspaceQueryKey(id, 'providers'), providers);
      queryClient.setQueryData(workspaceQueryKey(id, 'paymentProviders'), paymentProviders);
      queryClient.setQueryData(workspaceQueryKey(id, 'popularPackages'), popularPackages);

      for (const provider of providers) {
        const providerCategories = categories.filter((c: any) => c.provider_id === provider.id);
        const providerPackages = packagesByProvider[provider.id] ?? [];
        queryClient.setQueryData(workspaceQueryKey(id, 'categories', provider.id), providerCategories);
        queryClient.setQueryData(workspaceQueryKey(id, 'packages', provider.id), providerPackages);
        queryClient.setQueryData(
          workspaceQueryKey(id, 'promotionalText', provider.id),
          provider.promotional_text || '',
        );
      }

      workspaceStorage.setJson(CACHE_RESOURCES.providers, providers, id);
      workspaceStorage.setJson(CACHE_RESOURCES.categories, categories, id);
      workspaceStorage.setJson(CACHE_RESOURCES.packages, packagesByProvider, id);
      workspaceStorage.setJson(CACHE_RESOURCES.paymentProviders, paymentProviders, id);
      workspaceStorage.setJson(CACHE_RESOURCES.popularPackages, popularPackages, id);
      workspaceStorage.set(CACHE_RESOURCES.timestamp, Date.now().toString(), id);

      cacheImages([
        ...providers.map((p: any) => p.provider_logo),
        ...categories.map((c: any) => c.category_image),
        ...paymentProviders.map((p: any) => p.provider_logo),
        ...popularPackages.map((p: any) => p.provider_logo),
      ]);

      return true;
    },
    [queryClient, stillActive],
  );

  const cacheData = useCallback(
    async (forceIftin = false) => {
      const id = activeWorkspaceId();
      if (!id) return; // never fetch workspace-owned data before resolution

      try {
        // Delivery mode is resolved once and memoized. Android-device tenants
        // never touch the Iftin partner catalog; API partners never fall back
        // to another tenant's/local storefront source.
        const isPartner = await isApiPartnerTenant(id);
        if (!stillActive(id)) return;

        if (isPartner) {
          const catalog = await fetchIftinCatalog({ force: forceIftin });
          if (!stillActive(id)) return;
          if (catalog && hydrateIftinCatalog(catalog, id)) return;
          // Keep the last known partner snapshot visible on transient API errors.
          return;
        }

        sourceRef.current = 'local';

        // Bootstrap independent storefront resources together. This removes the
        // old providers -> categories -> packages waterfall from cold starts.
        const [
          providersResult,
          paymentProvidersResult,
          deliveryInstructionsResult,
          featuredPackagesResult,
          appSettingsResult,
          bannersResult,
        ] = await Promise.allSettled([
          rpcWithRetry<any[]>('get_active_providers'),
          rpcWithRetry<any[]>('get_active_payment_providers'),
          rpcWithRetry<any[]>('get_tenant_delivery_instructions'),
          rpcWithRetry<any[]>('get_featured_packages'),
          rpcWithRetry<any[]>('get_tenant_app_settings'),
          queryClient.fetchQuery({
            queryKey: workspaceQueryKey(id, 'banners'),
            queryFn: () => rpcWithRetry<any[]>('get_tenant_banners'),
            staleTime: 60 * 1000,
          }),
        ]);
        if (!stillActive(id)) return;

        const cachedProviders = workspaceStorage.getJson<any[]>(CACHE_RESOURCES.providers, [], id);
        const providers =
          providersResult.status === 'fulfilled' && Array.isArray(providersResult.value)
            ? providersResult.value
            : cachedProviders;

        if (providersResult.status === 'fulfilled' && Array.isArray(providersResult.value)) {
          workspaceStorage.setJson(CACHE_RESOURCES.providers, providersResult.value, id);
          queryClient.setQueryData(workspaceQueryKey(id, 'providers'), providersResult.value);
        } else if (cachedProviders.length) {
          queryClient.setQueryData(workspaceQueryKey(id, 'providers'), cachedProviders);
        }

        const existingCategories = workspaceStorage.getJson<any[]>(CACHE_RESOURCES.categories, [], id);
        const existingPackages = workspaceStorage.getJson<Record<string, any[]>>(
          CACHE_RESOURCES.packages,
          {},
          id,
        );

        // Categories and packages depend only on provider ids, so once the
        // provider list is known every provider is fetched in parallel.
        const providerSnapshots = await Promise.all(
          providers.map(async (provider: any) => {
            const [categoriesResult, packagesResult] = await Promise.allSettled([
              rpcWithRetry<any[]>('get_active_categories', { p_provider_id: provider.id }),
              rpcWithRetry<any[]>('get_public_packages', { p_provider_id: provider.id }),
            ]);
            return { provider, categoriesResult, packagesResult };
          }),
        );
        if (!stillActive(id)) return;

        let mergedCategories = existingCategories;
        const mergedPackages: Record<string, any[]> = { ...existingPackages };

        for (const snapshot of providerSnapshots) {
          const providerId = String(snapshot.provider.id);

          if (
            snapshot.categoriesResult.status === 'fulfilled' &&
            Array.isArray(snapshot.categoriesResult.value)
          ) {
            const fresh = snapshot.categoriesResult.value;
            mergedCategories = [
              ...mergedCategories.filter((cat: any) => String(cat.provider_id) !== providerId),
              ...fresh,
            ];
            queryClient.setQueryData(workspaceQueryKey(id, 'categories', providerId), fresh);
          } else {
            const cached = mergedCategories.filter((cat: any) => String(cat.provider_id) === providerId);
            if (cached.length) {
              queryClient.setQueryData(workspaceQueryKey(id, 'categories', providerId), cached);
            }
          }

          if (
            snapshot.packagesResult.status === 'fulfilled' &&
            Array.isArray(snapshot.packagesResult.value)
          ) {
            const fresh = snapshot.packagesResult.value;
            mergedPackages[providerId] = fresh;
            queryClient.setQueryData(workspaceQueryKey(id, 'packages', providerId), fresh);
          } else if (Array.isArray(mergedPackages[providerId])) {
            queryClient.setQueryData(
              workspaceQueryKey(id, 'packages', providerId),
              mergedPackages[providerId],
            );
          }
        }

        const uniqueCategories = Array.from(
          new Map(mergedCategories.map((cat: any) => [cat.id, cat])).values(),
        );
        workspaceStorage.setJson(CACHE_RESOURCES.categories, uniqueCategories, id);
        workspaceStorage.setJson(CACHE_RESOURCES.packages, mergedPackages, id);
        queryClient.setQueryData(workspaceQueryKey(id, 'categories'), uniqueCategories);

        if (
          paymentProvidersResult.status === 'fulfilled' &&
          Array.isArray(paymentProvidersResult.value)
        ) {
          workspaceStorage.setJson(
            CACHE_RESOURCES.paymentProviders,
            paymentProvidersResult.value,
            id,
          );
          queryClient.setQueryData(
            workspaceQueryKey(id, 'paymentProviders'),
            paymentProvidersResult.value,
          );
        }

        if (
          deliveryInstructionsResult.status === 'fulfilled' &&
          Array.isArray(deliveryInstructionsResult.value)
        ) {
          workspaceStorage.setJson(
            CACHE_RESOURCES.deliveryInstructions,
            deliveryInstructionsResult.value,
            id,
          );
        }

        if (
          featuredPackagesResult.status === 'fulfilled' &&
          Array.isArray(featuredPackagesResult.value)
        ) {
          workspaceStorage.setJson(CACHE_RESOURCES.featuredPackages, featuredPackagesResult.value, id);
          queryClient.setQueryData(
            workspaceQueryKey(id, 'featuredPackages'),
            featuredPackagesResult.value,
          );
        }

        if (appSettingsResult.status === 'fulfilled' && Array.isArray(appSettingsResult.value)) {
          const filtered = appSettingsResult.value.filter((s: any) =>
            ['payment_number', 'payment_prefix'].includes(s.setting_key),
          );
          workspaceStorage.setJson(CACHE_RESOURCES.appSettings, filtered, id);
        }

        if (bannersResult.status === 'fulfilled' && Array.isArray(bannersResult.value)) {
          const freshBanners = bannersResult.value;
          const cachedBanners = workspaceStorage.getJson<any[]>(CACHE_RESOURCES.banners, [], id);

          if (freshBanners.length > 0) {
            workspaceStorage.setJson(CACHE_RESOURCES.banners, freshBanners, id);
            workspaceStorage.set(CACHE_RESOURCES.bannersAt, Date.now().toString(), id);
            queryClient.setQueryData(workspaceQueryKey(id, 'banners'), freshBanners);
          } else if (cachedBanners.length > 0) {
            // A startup request may fire before the x-tenant-id header is fully
            // established. Never replace a known-good tenant banner with that
            // transient empty response.
            queryClient.setQueryData(workspaceQueryKey(id, 'banners'), cachedBanners);
          } else {
            // Do not stamp an empty startup response as fresh. RotatingBanner
            // will retry directly until tenant resolution has settled.
            queryClient.removeQueries({
              queryKey: workspaceQueryKey(id, 'banners'),
              exact: true,
            });
          }
        }

        cacheImages([
          ...providers.map((p: any) => p.provider_logo),
          ...uniqueCategories.map((c: any) => c.category_image),
          ...(paymentProvidersResult.status === 'fulfilled' && Array.isArray(paymentProvidersResult.value)
            ? paymentProvidersResult.value.map((p: any) => p.provider_logo)
            : []),
          ...(bannersResult.status === 'fulfilled' && Array.isArray(bannersResult.value)
            ? bannersResult.value
                .filter((b: any) => b?.media_type !== 'video')
                .map((b: any) => b.banner_image)
            : []),
        ]);

        workspaceStorage.set(CACHE_RESOURCES.timestamp, Date.now().toString(), id);
      } catch {
        // Keep the last known workspace cache visible.
      }
    },
    [hydrateIftinCatalog, queryClient, stillActive],
  );

  const forceRefreshCache = useCallback(async () => {
    if (!isReallyOnline) return;
    await cacheData(true);
  }, [cacheData, isReallyOnline]);

  const loadCachedData = useCallback(() => {
    const id = activeWorkspaceId();
    if (!id) return; // never restore workspace-owned data before resolution
    try {
      const catalog = readCachedCatalog(id);
      if (catalog && hydrateIftinCatalog(catalog, id)) return;

      const providers = workspaceStorage.getJson<any[]>(CACHE_RESOURCES.providers, [], id);
      if (Array.isArray(providers) && providers.length) {
        queryClient.setQueryData(workspaceQueryKey(id, 'providers'), providers);
      }

      const categories = workspaceStorage.getJson<any[]>(CACHE_RESOURCES.categories, [], id);
      if (Array.isArray(categories) && categories.length) {
        const uniqueCategories = Array.from(
          new Map(categories.map((cat: any) => [cat.id, cat])).values(),
        ) as any[];
        queryClient.setQueryData(workspaceQueryKey(id, 'categories'), uniqueCategories);
        for (const provider of providers) {
          const list = uniqueCategories.filter((cat: any) => String(cat.provider_id) === String(provider.id));
          queryClient.setQueryData(workspaceQueryKey(id, 'categories', provider.id), list);
        }
      }

      const paymentProviders = workspaceStorage.getJson<any[]>(
        CACHE_RESOURCES.paymentProviders,
        [],
        id,
      );
      if (Array.isArray(paymentProviders) && paymentProviders.length) {
        queryClient.setQueryData(workspaceQueryKey(id, 'paymentProviders'), paymentProviders);
      }

      const rawPackages = workspaceStorage.getJson<any>(CACHE_RESOURCES.packages, null, id);
      if (rawPackages) {
        const packagesData = Array.isArray(rawPackages)
          ? groupPackagesByProvider(rawPackages)
          : rawPackages;
        Object.entries(packagesData || {}).forEach(([providerId, packages]) => {
          queryClient.setQueryData(workspaceQueryKey(id, 'packages', providerId), packages);
        });
      }

      const popular = workspaceStorage.getJson<any[]>(CACHE_RESOURCES.popularPackages, [], id);
      if (Array.isArray(popular) && popular.length) {
        queryClient.setQueryData(workspaceQueryKey(id, 'popularPackages'), popular);
      }

      const featured = workspaceStorage.getJson<any[]>(CACHE_RESOURCES.featuredPackages, [], id);
      if (Array.isArray(featured) && featured.length) {
        queryClient.setQueryData(workspaceQueryKey(id, 'featuredPackages'), featured);
      }

      const banners = workspaceStorage.getJson<any[]>(CACHE_RESOURCES.banners, [], id);
      if (Array.isArray(banners) && banners.length) {
        queryClient.setQueryData(workspaceQueryKey(id, 'banners'), banners);
        cacheImages(
          banners
            .filter((banner: any) => banner?.media_type !== 'video')
            .map((banner: any) => banner.banner_image),
        );
      }
    } catch {
      // Ignore malformed cache; the network refresh repairs it.
    }
  }, [hydrateIftinCatalog, queryClient]);

  const isCacheStale = useCallback((id: string): boolean => {
    const timestamp = workspaceStorage.get(CACHE_RESOURCES.timestamp, id);
    if (!timestamp) return true;
    return Date.now() - parseInt(timestamp, 10) > CACHE_TTL_MS;
  }, []);

  // Restore only after the workspace is known, and re-run on workspace change.
  useEffect(() => {
    if (!workspaceId) return;
    if (hydratedForRef.current === workspaceId) return;
    hydratedForRef.current = workspaceId;
    loadCachedData();
  }, [workspaceId, loadCachedData]);

  useEffect(() => {
    if (!workspaceId || !isReallyOnline) return;
    if (cachedForRef.current === workspaceId) return;
    cachedForRef.current = workspaceId;
    if (sourceRef.current === 'unknown' || isCacheStale(workspaceId)) {
      void cacheData();
    }
  }, [workspaceId, isReallyOnline, cacheData, isCacheStale]);

  // Resume safety: mark active storefront queries stale without doing a full
  // providers/categories/packages crawl on every focus. Active screens refetch
  // in the background while cached content stays instantly tappable.
  useEffect(() => {
    if (!workspaceId) return;
    let lastRefreshAt = 0;

    const revalidateWhenVisible = () => {
      if (document.visibilityState !== 'visible' || !isReallyOnline) return;
      const now = Date.now();
      if (now - lastRefreshAt < 10_000) return;
      lastRefreshAt = now;

      for (const resource of [
        'providers',
        'categories',
        'packages',
        'featuredPackages',
        'popularPackages',
        'paymentProviders',
        'banners',
      ]) {
        void queryClient.invalidateQueries({ queryKey: workspaceQueryKey(workspaceId, resource) });
      }
    };

    document.addEventListener('visibilitychange', revalidateWhenVisible);
    window.addEventListener('focus', revalidateWhenVisible);
    return () => {
      document.removeEventListener('visibilitychange', revalidateWhenVisible);
      window.removeEventListener('focus', revalidateWhenVisible);
    };
  }, [workspaceId, isReallyOnline, queryClient]);

  return {
    cacheData,
    loadCachedData,
    forceRefreshCache,
  };
};
