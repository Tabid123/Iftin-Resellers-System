import { getTenantId, setTenantHeader, supabase } from '@/integrations/supabase/client';

export type TenantOfflineProvider = {
  id: string;
  provider_name: string;
  display_order?: number | null;
};

export type TenantOfflineCategory = {
  id: string;
  provider_id: string;
  category_name: string;
  display_order?: number | null;
};

export type TenantOfflinePackage = {
  id: string;
  provider_id: string;
  category_id: string | null;
  package_name: string;
  selling_price: number;
  display_order?: number | null;
};

export type TenantOfflineCatalog = {
  providers: TenantOfflineProvider[];
  categories: TenantOfflineCategory[];
  packages: TenantOfflinePackage[];
};

export type TenantOfflineRegistration = {
  id: string;
  tenant_id: string;
  sender_phone: string;
  receiver_phone: string;
  provider_id?: string | null;
  provider_name?: string | null;
  package_id?: string | null;
  package_name?: string | null;
  is_active?: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export async function resolveTenantNativeId(): Promise<string | null> {
  const current = getTenantId();
  if (current) return current;

  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return null;

  const { data, error } = await supabase
    .from('tenant_members')
    .select('tenant_id')
    .eq('user_id', auth.user.id);

  if (error) return null;
  const ids = Array.from(
    new Set((data ?? []).map((row: any) => row?.tenant_id).filter(Boolean)),
  ) as string[];

  if (ids.length !== 1) return null;
  setTenantHeader(ids[0]);
  return ids[0];
}

export async function fetchTenantOfflineCatalog(): Promise<TenantOfflineCatalog> {
  const tenantId = await resolveTenantNativeId();
  if (!tenantId) throw new Error('Tenant-ka lama aqoonsan');

  const [providersRes, categoriesRes, packagesRes] = await Promise.all([
    supabase
      .from('providers_config')
      .select('id, provider_name, display_order')
      .eq('is_active', true)
      .order('display_order', { ascending: true }),
    supabase
      .from('package_categories')
      .select('id, provider_id, category_name, display_order')
      .eq('is_active', true)
      .order('display_order', { ascending: true }),
    supabase
      .from('data_packages_config')
      .select('id, provider_id, category_id, package_name, selling_price, display_order')
      .eq('is_active', true)
      .order('display_order', { ascending: true }),
  ]);

  if (providersRes.error) throw providersRes.error;
  if (categoriesRes.error) throw categoriesRes.error;
  if (packagesRes.error) throw packagesRes.error;

  return {
    providers: (providersRes.data ?? []) as TenantOfflineProvider[],
    categories: (categoriesRes.data ?? []) as TenantOfflineCategory[],
    packages: (packagesRes.data ?? []).map((pkg: any) => ({
      ...pkg,
      selling_price: Number(pkg.selling_price || 0),
    })) as TenantOfflinePackage[],
  };
}

export function tenantOfflineProviders(catalog: TenantOfflineCatalog | null) {
  return catalog?.providers ?? [];
}

export function tenantOfflineCategories(
  catalog: TenantOfflineCatalog | null,
  providerId?: string | null,
) {
  if (!catalog) return [];
  return catalog.categories.filter(
    (category) => !providerId || String(category.provider_id) === String(providerId),
  );
}

export function tenantOfflinePackages(
  catalog: TenantOfflineCatalog | null,
  providerId?: string | null,
  categoryId?: string | null,
) {
  if (!catalog) return [];
  return catalog.packages.filter(
    (pkg) =>
      (!providerId || String(pkg.provider_id) === String(providerId)) &&
      (!categoryId || String(pkg.category_id) === String(categoryId)),
  );
}

export async function listTenantOfflineRegistrations(options?: { page?: number; pageSize?: number }): Promise<{ rows: TenantOfflineRegistration[]; total: number }> {
  const tenantId = await resolveTenantNativeId();
  if (!tenantId) throw new Error('Tenant-ka lama aqoonsan');

  const page = Math.max(0, Number(options?.page ?? 0) || 0);
  const pageSize = Math.min(100, Math.max(1, Number(options?.pageSize ?? 50) || 50));
  const from = page * pageSize;
  const to = from + pageSize - 1;

  const { data, error, count } = await supabase
    .from('offline_registrations')
    .select(
      'id, tenant_id, sender_phone, receiver_phone, provider_id, provider_name, package_id, package_name, is_active, created_at, updated_at',
      { count: 'exact' },
    )
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) throw error;
  return { rows: (data ?? []) as TenantOfflineRegistration[], total: count ?? 0 };
}

export async function saveTenantOfflineRegistration(input: {
  sender_phone: string;
  receiver_phone: string;
  provider_id: string;
  provider_name?: string | null;
  package_id: string;
  package_name?: string | null;
}) {
  const tenantId = await resolveTenantNativeId();
  if (!tenantId) throw new Error('Tenant-ka lama aqoonsan');

  const { data: pkg, error: pkgError } = await supabase
    .from('data_packages_config')
    .select('id, provider_id, package_name')
    .eq('id', input.package_id)
    .eq('provider_id', input.provider_id)
    .eq('is_active', true)
    .maybeSingle();

  if (pkgError) throw pkgError;
  if (!pkg) throw new Error('Xirmadan tenant-kan lagama helin');

  const { error } = await supabase.rpc('storefront_save_offline_registration', {
    p_sender: input.sender_phone,
    p_receiver: input.receiver_phone,
    p_provider_id: input.provider_id,
    p_provider_name: input.provider_name ?? null,
    p_package_id: input.package_id,
    p_package_name: pkg.package_name ?? input.package_name ?? null,
  });

  if (error) throw error;
}

export async function deleteTenantOfflineRegistration(id: string) {
  const { error } = await supabase.from('offline_registrations').delete().eq('id', id);
  if (error) throw error;
}
