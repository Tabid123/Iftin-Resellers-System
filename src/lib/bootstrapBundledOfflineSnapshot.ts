import { getBundledOfflineSnapshot } from '@/lib/bundledOfflineSnapshot';
import { workspaceStorage } from '@/lib/workspaceKeys';

const TENANT_CACHE_PREFIX = 'najax.tenant_cache.';

/**
 * Seed a freshly-installed tenant APK before React mounts. This gives the
 * TenantProvider a real tenant UUID and gives useOfflineCache a complete
 * storefront snapshot even when the first launch happens in airplane mode.
 *
 * A newer runtime cache always wins over the APK-bundled snapshot, so opening
 * an older APK never rolls live-synced data backwards.
 */
export function bootstrapBundledOfflineSnapshot() {
  if (typeof window === 'undefined') return;
  const snapshot = getBundledOfflineSnapshot();
  const tenant = snapshot?.tenant;
  if (!snapshot || !tenant?.id || !tenant.slug) return;

  try {
    const tenantKey = TENANT_CACHE_PREFIX + tenant.slug;
    if (!localStorage.getItem(tenantKey)) {
      localStorage.setItem(tenantKey, JSON.stringify(tenant));
    }

    const bundledAt = snapshot.generatedAt ? Date.parse(snapshot.generatedAt) : 0;
    const cachedAtRaw = workspaceStorage.get('offline_cache_timestamp', tenant.id);
    const cachedAt = cachedAtRaw ? Number(cachedAtRaw) : 0;

    // Existing online-synced state is newer; never overwrite it with the copy
    // that was baked into the APK at release time.
    if (cachedAt && (!bundledAt || cachedAt >= bundledAt)) return;

    workspaceStorage.setJson('offline_providers', snapshot.providers ?? [], tenant.id);
    workspaceStorage.setJson('offline_categories', snapshot.categories ?? [], tenant.id);
    workspaceStorage.setJson('offline_packages', snapshot.packages ?? {}, tenant.id);
    workspaceStorage.setJson('offline_payment_providers', snapshot.paymentProviders ?? [], tenant.id);
    workspaceStorage.setJson('offline_delivery_instructions', snapshot.deliveryInstructions ?? [], tenant.id);
    workspaceStorage.setJson('offline_app_settings', snapshot.appSettings ?? [], tenant.id);
    workspaceStorage.setJson('offline_featured_packages', snapshot.featuredPackages ?? [], tenant.id);
    workspaceStorage.setJson('offline_banners', snapshot.banners ?? [], tenant.id);
    workspaceStorage.set('offline_banners_at', String(bundledAt || Date.now()), tenant.id);
    workspaceStorage.set('offline_cache_timestamp', String(bundledAt || Date.now()), tenant.id);
  } catch {
    // Storage-restricted devices can still use the normal online bootstrap.
  }
}
