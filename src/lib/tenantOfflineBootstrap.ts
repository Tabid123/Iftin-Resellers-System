import { workspaceStorage } from '@/lib/workspaceKeys';

const BOOTSTRAP_PATH = '/tenant-bootstrap.json';
const BOOTSTRAP_APPLIED = 'offline_bootstrap_applied_v1';

export interface TenantOfflineBootstrap {
  schemaVersion: number;
  generatedAt: string;
  tenant: { id: string; slug: string; [key: string]: unknown };
  resources: {
    providers?: unknown[];
    categories?: unknown[];
    packages?: Record<string, unknown[]>;
    paymentProviders?: unknown[];
    deliveryInstructions?: unknown[];
    appSettings?: unknown[];
    featuredPackages?: unknown[];
    popularPackages?: unknown[];
    banners?: unknown[];
  };
}

async function readBundledBootstrap(): Promise<TenantOfflineBootstrap | null> {
  try {
    const response = await fetch(BOOTSTRAP_PATH, { cache: 'no-store' });
    if (!response.ok) return null;
    const snapshot = (await response.json()) as TenantOfflineBootstrap;
    if (snapshot?.schemaVersion !== 1 || !snapshot?.tenant?.id) return null;
    return snapshot;
  } catch {
    return null;
  }
}

/**
 * Seeds the workspace-scoped local cache from data physically packaged in the
 * tenant APK. This makes a brand-new install browseable without a first network
 * request. The online cache layer remains authoritative and refreshes this data
 * as soon as connectivity is available.
 */
export async function hydrateBundledTenantBootstrap(workspaceId: string): Promise<boolean> {
  if (!workspaceId) return false;

  const applied = workspaceStorage.get(BOOTSTRAP_APPLIED, workspaceId);
  const existingProviders = workspaceStorage.getJson<unknown[]>('offline_providers', [], workspaceId);
  if (applied && existingProviders.length > 0) return false;

  const snapshot = await readBundledBootstrap();
  if (!snapshot || String(snapshot.tenant.id) !== workspaceId) return false;

  const resources = snapshot.resources || {};
  workspaceStorage.setJson('offline_providers', resources.providers ?? [], workspaceId);
  workspaceStorage.setJson('offline_categories', resources.categories ?? [], workspaceId);
  workspaceStorage.setJson('offline_packages', resources.packages ?? {}, workspaceId);
  workspaceStorage.setJson('offline_payment_providers', resources.paymentProviders ?? [], workspaceId);
  workspaceStorage.setJson('offline_delivery_instructions', resources.deliveryInstructions ?? [], workspaceId);
  workspaceStorage.setJson('offline_app_settings', resources.appSettings ?? [], workspaceId);
  workspaceStorage.setJson('offline_featured_packages', resources.featuredPackages ?? [], workspaceId);
  workspaceStorage.setJson('offline_popular_packages_v2', resources.popularPackages ?? [], workspaceId);
  workspaceStorage.setJson('offline_banners', resources.banners ?? [], workspaceId);
  workspaceStorage.set('offline_banners_at', Date.now().toString(), workspaceId);
  workspaceStorage.set('offline_cache_timestamp', Date.now().toString(), workspaceId);
  workspaceStorage.set(BOOTSTRAP_APPLIED, snapshot.generatedAt || '1', workspaceId);
  return true;
}
