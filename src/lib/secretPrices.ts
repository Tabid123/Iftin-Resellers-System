import { supabase } from '@/integrations/supabase/client';

const normalizedPrice = (value: unknown): number | null => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Number(parsed.toFixed(6));
};

/** Parse comma/whitespace separated admin input into unique positive prices. */
export function parseSecretPrices(input: string): number[] {
  const seen = new Set<number>();
  for (const token of String(input || '').split(/[\s,]+/)) {
    if (!token.trim()) continue;
    const price = normalizedPrice(token);
    if (price !== null) seen.add(price);
  }
  return [...seen];
}

/** Read the new array, with a harmless fallback for old rows that may expose secret_price. */
export function secretPricesOf(pkg: any): number[] {
  if (Array.isArray(pkg?.secret_prices)) {
    return [...new Set<number>(pkg.secret_prices.map(normalizedPrice).filter((v): v is number => v !== null))];
  }
  const legacy = normalizedPrice(pkg?.secret_price);
  return legacy === null ? [] : [legacy];
}

const priceSetOf = (pkg: any): Set<number> => {
  const values = [normalizedPrice(pkg?.selling_price), ...secretPricesOf(pkg)].filter(
    (v): v is number => v !== null,
  );
  return new Set(values);
};

/**
 * Tenant-safe through the existing data_packages_config RLS/header scope.
 * Detects selling↔selling, selling↔secret and secret↔secret collisions for one provider.
 */
export async function findPriceConflicts(
  providerId: string,
  sellingPrice: number,
  secretPrices: number[],
  skipId?: string | null,
): Promise<Array<{ id: string; package_name: string }>> {
  const wanted = new Set(
    [normalizedPrice(sellingPrice), ...secretPrices.map(normalizedPrice)].filter(
      (v): v is number => v !== null,
    ),
  );

  if (!providerId || wanted.size === 0) return [];

  let query = supabase
    .from('data_packages_config')
    .select('id, package_name, selling_price, secret_prices')
    .eq('provider_id', providerId)
    .eq('is_active', true)
    .limit(500);

  if (skipId) query = query.neq('id', skipId);

  const { data, error } = await query;
  if (error) throw error;

  return (data || [])
    .filter((pkg) => [...priceSetOf(pkg)].some((price) => wanted.has(price)))
    .map((pkg) => ({ id: pkg.id, package_name: pkg.package_name }));
}
