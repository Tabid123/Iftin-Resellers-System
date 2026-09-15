import snapshotJson from '@/generated/tenant-offline-snapshot.json';

export type BundledTenant = {
  id: string;
  slug: string;
  name: string;
  logo_url: string | null;
  primary_color: string | null;
  accent_color: string | null;
  status: 'trial' | 'active' | 'suspended' | 'cancelled';
  plan_id: string | null;
  trial_ends_at: string | null;
  current_period_end: string | null;
  support_phone?: string | null;
};

export type BundledOfflineSnapshot = {
  version: number;
  generatedAt: string | null;
  tenant: BundledTenant | null;
  providers: any[];
  categories: any[];
  packages: Record<string, any[]>;
  paymentProviders: any[];
  deliveryInstructions: any[];
  appSettings: any[];
  featuredPackages: any[];
  banners: any[];
};

const snapshot = snapshotJson as BundledOfflineSnapshot;

export function getBundledOfflineSnapshot(slug?: string | null): BundledOfflineSnapshot | null {
  if (!snapshot?.tenant?.id || !snapshot.tenant.slug) return null;
  if (slug && snapshot.tenant.slug !== slug) return null;
  return snapshot;
}

export function getBundledTenant(slug?: string | null): BundledTenant | null {
  return getBundledOfflineSnapshot(slug)?.tenant ?? null;
}
