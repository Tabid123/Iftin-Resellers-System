/**
 * Reseller-local overrides on top of the read-only Iftin catalog.
 *
 * ONLY two things are stored locally per reseller:
 *   1. package_id          → sell_price   (must be >= Iftin base_price)
 *   2. payment_provider_id → payment_number
 *
 * No pricing engine, no copies of packages/providers/categories.
 */
import { supabase } from '@/integrations/supabase/client';
import { getTenantId } from '@/integrations/supabase/client';

export type OverrideKind = 'package' | 'payment_provider';

export type ResellerOverride = {
  kind: OverrideKind;
  ref_id: string;
  sell_price: number | null;
  base_price: number | null;
  payment_number: string | null;
};

export type OverrideMaps = {
  sellPrice: Map<string, number>;
  paymentNumber: Map<string, string>;
};

const EMPTY: OverrideMaps = { sellPrice: new Map(), paymentNumber: new Map() };

let cache: OverrideMaps = EMPTY;

export function overrideMaps(): OverrideMaps {
  return cache;
}

/** Applies the local sell price when the reseller has set one. */
export function sellPriceFor(packageId: string, basePrice: number): number {
  const v = cache.sellPrice.get(packageId);
  return typeof v === 'number' && v >= basePrice ? v : basePrice;
}

/** Applies the local payment number when the reseller has set one. */
export function paymentNumberFor(providerId: string, fallback: string | null): string | null {
  return cache.paymentNumber.get(providerId) ?? fallback;
}

function toMaps(rows: ResellerOverride[]): OverrideMaps {
  const sellPrice = new Map<string, number>();
  const paymentNumber = new Map<string, string>();
  for (const r of rows) {
    if (r.kind === 'package' && r.sell_price != null) sellPrice.set(r.ref_id, Number(r.sell_price));
    if (r.kind === 'payment_provider' && r.payment_number) paymentNumber.set(r.ref_id, r.payment_number);
  }
  return { sellPrice, paymentNumber };
}

/** Loads the current tenant's overrides (storefront + admin). */
export async function loadResellerOverrides(): Promise<ResellerOverride[]> {
  const { data, error } = await (supabase as any).rpc('get_reseller_overrides');
  if (error) return [];
  const rows = ((data ?? []) as ResellerOverride[]);
  cache = toMaps(rows);
  loadedTenant = getTenantId();
  loadedRows = rows.length;
  return rows;
}

let overridesPromise: Promise<ResellerOverride[]> | null = null;
let loadedTenant: string | null = null;
let loadedRows = 0;

/**
 * Loads the overrides before the catalog is mapped. Cached per tenant, but an
 * empty result is retried: the first call can run before the tenant header is
 * set, which would otherwise pin the storefront to Iftin's prices forever.
 */
export function ensureResellerOverrides(): Promise<ResellerOverride[]> {
  const tenantId = getTenantId();
  const stale = loadedTenant !== tenantId || loadedRows === 0;
  if (!overridesPromise || stale) {
    overridesPromise = loadResellerOverrides().catch(() => {
      overridesPromise = null;
      return [] as ResellerOverride[];
    });
  }
  return overridesPromise;
}

/** Local profit shown to the reseller: sell_price − base_price. */
export function marginOf(sellPrice: number | null | undefined, basePrice: number): number {
  if (sellPrice == null || Number.isNaN(sellPrice)) return 0;
  return Number(sellPrice) - basePrice;
}

/** UI guard — Iftin's base price is the floor. */
export function isSellPriceValid(sellPrice: number | null | undefined, basePrice: number): boolean {
  if (sellPrice == null || Number.isNaN(sellPrice)) return false;
  return Number(sellPrice) >= basePrice;
}

export async function saveSellPrice(packageId: string, sellPrice: number, basePrice: number) {
  if (!isSellPriceValid(sellPrice, basePrice)) {
    throw new Error('Qiimaha iibka waa inuu ka weyn yahay ama la mid yahay base price-ka Iftin');
  }
  const { error } = await (supabase as any)
    .from('reseller_overrides')
    .upsert(
      { kind: 'package', ref_id: packageId, sell_price: sellPrice, base_price: basePrice },
      { onConflict: 'tenant_id,kind,ref_id' },
    );
  if (error) throw error;
  cache.sellPrice.set(packageId, sellPrice);
}

export async function savePaymentNumber(providerId: string, paymentNumber: string) {
  const { error } = await (supabase as any)
    .from('reseller_overrides')
    .upsert(
      { kind: 'payment_provider', ref_id: providerId, payment_number: paymentNumber },
      { onConflict: 'tenant_id,kind,ref_id' },
    );
  if (error) throw error;
  cache.paymentNumber.set(providerId, paymentNumber);
}
