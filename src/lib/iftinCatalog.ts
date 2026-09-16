/**
 * Iftin Internet catalog (client side).
 *
 * We are ONLY a client of the Iftin API. Providers, categories, packages,
 * prices, payment numbers and USSD prefixes all come from
 * `GET /partner-catalog` (proxied by our `iftin-catalog` edge function so the
 * ift_live_… key never reaches the browser).
 */
import { supabase } from '@/integrations/supabase/client';
import { getTenantId, setTenantHeader } from '@/integrations/supabase/client';
import { ensureResellerOverrides, loadResellerOverrides, paymentNumberFor, sellPriceFor } from '@/lib/resellerOverrides';
import { cacheImages } from '@/lib/imageCache';
import { localizeImage } from '@/lib/localImages';
import { decideWorkspace, rememberedWorkspace } from '@/lib/workspaceMembership';
import { workspaceStorage } from '@/lib/workspaceKeys';

export type IftinCatalog = {
  partner?: string;
  balance_due?: number;
  credit_limit?: number;
  counts?: { providers?: number; packages?: number; payment_providers?: number };
  providers?: any[];
  payment_providers?: any[];
  generated_at?: string;
  stale?: boolean;
  error?: string | null;
};

/** Resource name; the real saved name is workspace-scoped. */
const CATALOG_RESOURCE = 'iftin_catalog_v3_local_images';
const TTL_MS = 5 * 60 * 1000;

let inflight: Promise<IftinCatalog | null> | null = null;
let memo: { at: number; tenantId: string | null; catalog: IftinCatalog } | null = null;
/** Membership resolution is a network round trip — resolve it once per session. */
let tenantPromise: Promise<string | null> | null = null;

function readCachedEntry(tenantId?: string | null): { at: number; catalog: IftinCatalog } | null {
  try {
    const raw = workspaceStorage.get(CATALOG_RESOURCE, tenantId);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.catalog) return null;
    return { at: Number(parsed.at ?? 0), catalog: parsed.catalog };
  } catch {
    return null;
  }
}

export function readCachedCatalog(tenantId?: string | null): IftinCatalog | null {
  return readCachedEntry(tenantId)?.catalog ?? null;
}

export const IFTIN_ERROR_MESSAGES: Record<string, string> = {
  missing_api_key: 'API key-ga waa qaldan yahay (lama dejin)',
  invalid_api_key: 'API key-ga waa qaldan yahay',
  partner_suspended: 'Partner-ka waa la joojiyay (suspended)',
  network_error: 'Xiriirka Iftin ma shaqeynayo — xogtii hore ayaa la tusayaa',
};

export function iftinErrorMessage(code?: string | null): string | null {
  if (!code) return null;
  return IFTIN_ERROR_MESSAGES[code] ?? `Iftin API khalad: ${code}`;
}

/**
 * Workspace resolution hierarchy (single authoritative path):
 *   1. the active workspace header, set by TenantContext after validating the
 *      slug against the server;
 *   2. otherwise the signed-in user's validated membership.
 *
 * A persisted workspace id is NEVER authoritative on its own — the previous
 * `iftin_tenant_id_v1` shortcut could re-point the whole app at the last
 * workspace used on this device, including its banners. It is gone.
 *
 * With more than one membership no workspace is chosen automatically; that
 * needs an explicit selection instead of arbitrary database ordering.
 */
export async function resolveTenantId(): Promise<string | null> {
  const fromHeader = getTenantId();
  if (fromHeader) return fromHeader;
  if (tenantPromise) return tenantPromise;
  tenantPromise = (async () => {
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user) return null;
      const { data } = await supabase
        .from('tenant_members')
        .select('tenant_id')
        .eq('user_id', auth.user.id);
      const ids = Array.from(
        new Set((Array.isArray(data) ? data : []).map((row: any) => row?.tenant_id).filter(Boolean)),
      ) as string[];
      const decision = decideWorkspace({
        memberships: ids,
        rememberedWorkspaceId: rememberedWorkspace(),
      });
      if (decision.status !== 'ready') {
        if (decision.status === 'choose' && import.meta.env?.DEV) {
          console.error(
            '[workspace] This account belongs to multiple workspaces; an explicit active-workspace selection is required.',
          );
        }
        return null;
      }
      const memberTenantId = decision.workspaceId;
      setTenantHeader(memberTenantId);
      return memberTenantId;
    } catch {
      return null;
    }
  })();
  const resolved = await tenantPromise;
  if (!resolved) tenantPromise = null;
  return resolved;
}

/**
 * Iftin API data belongs ONLY to tenants whose delivery_mode is `api_partner`.
 * Android/SIM tenants must never see the Iftin catalog (providers, packages,
 * payment numbers) — they use their own local data.
 */
const MODE_CACHE_KEY = 'najax.tenant_delivery_mode';
const modeMemo = new Map<string, boolean>();

function clearCatalogCache(tenantId?: string | null) {
  memo = null;
  workspaceStorage.remove(CATALOG_RESOURCE, tenantId);
}

export async function isApiPartnerTenant(tenantId: string): Promise<boolean> {
  if (modeMemo.has(tenantId)) return modeMemo.get(tenantId)!;
  let cached: boolean | null = null;
  try {
    const raw = localStorage.getItem(MODE_CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { id: string; mode: string };
      if (parsed?.id === tenantId) cached = parsed.mode === 'api_partner';
    }
  } catch { /* ignore */ }

  try {
    const { data, error } = await supabase
      .from('tenants')
      .select('delivery_mode')
      .eq('id', tenantId)
      .maybeSingle();
    if (error) return cached ?? true; // offline / transient → keep previous behaviour
    const isPartner = (data as any)?.delivery_mode === 'api_partner';
    modeMemo.set(tenantId, isPartner);
    try {
      localStorage.setItem(
        MODE_CACHE_KEY,
        JSON.stringify({ id: tenantId, mode: isPartner ? 'api_partner' : 'android_device' }),
      );
    } catch { /* ignore */ }
    return isPartner;
  } catch {
    return cached ?? true;
  }
}

/** Fetches the catalog (5 min cache). Returns null when Iftin is not configured. */
export async function fetchIftinCatalog(opts: { force?: boolean } = {}): Promise<IftinCatalog | null> {
  const tenantId = await resolveTenantId();
  if (!tenantId) return null;

  if (!(await isApiPartnerTenant(tenantId))) {
    clearCatalogCache(tenantId);
    return null;
  }

  // A memo left over from another workspace must never be served.
  if (memo && memo.tenantId !== tenantId) memo = null;

  if (!memo && !opts.force) {
    const entry = readCachedEntry(tenantId);
    if (entry && Date.now() - entry.at < TTL_MS) {
      memo = { at: entry.at, tenantId, catalog: entry.catalog };
      await ensureResellerOverrides();
      return entry.catalog;
    }
  }

  if (!opts.force && inflight) return inflight;


  if (!opts.force && memo && memo.tenantId === tenantId && Date.now() - memo.at < TTL_MS) {
    await ensureResellerOverrides();
    return memo.catalog;
  }
  if (!opts.force && inflight) return inflight;

  inflight = (async () => {
    try {
      const qs = new URLSearchParams();
      if (tenantId) qs.set('tenant_id', tenantId);
      if (opts.force) qs.set('refresh', '1');
      const url =
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/iftin-catalog` +
        (qs.toString() ? `?${qs.toString()}` : '');
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const res = await fetch(url, {
        method: 'GET',
        headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
      });
      const body: any = await res.json().catch(() => null);

      if (!body) {
        const cached = readCachedCatalog(tenantId);
        if (cached) return { ...cached, stale: true, error: 'network_error' };
        return null;
      }
      if (body?.error && !body?.providers) {
        const cached = readCachedCatalog(tenantId);
        if (cached) return { ...cached, stale: true, error: body.error };
        if (body.error === 'missing_api_key') return null;
        return { error: body.error, providers: [], payment_providers: [] };
      }

      const catalog: IftinCatalog = {
        ...body,
        stale: Boolean(body?.stale),
        error: body?.error ?? null,
      };
      // Discard a response that came back after the workspace changed.
      if (getTenantId() && getTenantId() !== tenantId) return null;
      memo = { at: Date.now(), tenantId, catalog };
      workspaceStorage.setJson(CATALOG_RESOURCE, { at: Date.now(), catalog }, tenantId);
      await loadResellerOverrides().catch(() => []);
      cacheLegacyShapes(catalog, tenantId);
      return catalog;
    } catch {
      const cached = readCachedCatalog(tenantId);
      return cached ? { ...cached, stale: true, error: 'network_error' } : null;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

export function hasCatalog(catalog: IftinCatalog | null | undefined): boolean {
  return Boolean(catalog && Array.isArray(catalog.providers) && catalog.providers.length > 0);
}

export function catalogCategoryId(providerId: string, categoryId: string | null | undefined): string {
  return categoryId ?? `guud-${providerId}`;
}

export function mapProviders(catalog: IftinCatalog) {
  return [...(catalog.providers ?? [])]
    .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))
    .map((p) => ({
      id: p.provider_id,
      provider_name: p.provider_name,
      provider_logo: localizeImage('provider', p.provider_logo, p.provider_name),
      promotional_text: p.promotional_text ?? null,
      display_order: p.display_order ?? 0,
      is_active: true,
    }));
}

export function mapCategories(catalog: IftinCatalog, providerId?: string | null) {
  const out: any[] = [];
  for (const p of catalog.providers ?? []) {
    if (providerId && p.provider_id !== providerId) continue;
    const cats = [...(p.categories ?? [])].sort(
      (a, b) => (a.display_order ?? 0) - (b.display_order ?? 0),
    );
    for (const c of cats) {
      out.push({
        id: catalogCategoryId(p.provider_id, c.category_id),
        category_name: c.category_id ? c.category_name : (c.category_name || 'Guud'),
        category_image: localizeImage('category', c.category_image, c.category_name, p.provider_name),
        display_order: c.display_order ?? 0,
        provider_id: p.provider_id,
        is_active: true,
      });
    }
  }
  return out;
}

export function mapPackages(catalog: IftinCatalog, providerId?: string | null) {
  const out: any[] = [];
  for (const p of catalog.providers ?? []) {
    if (providerId && p.provider_id !== providerId) continue;
    for (const c of p.categories ?? []) {
      for (const pkg of c.packages ?? []) {
        const basePrice = Number(pkg.base_price ?? pkg.price ?? 0);
        const rawCost = (pkg as any).cost_price ?? (pkg as any).costPrice ?? null;
        const costPrice = rawCost === null || rawCost === '' ? null : Number(rawCost);

        out.push({
          id: pkg.package_id,
          package_name: pkg.name,
          data_amount: pkg.data ?? '',
          validity_days: String(pkg.validity ?? ''),
          selling_price: sellPriceFor(pkg.package_id, basePrice),
          base_price: basePrice,
          cost_price: costPrice,
          connection_type_label: pkg.type ?? '',
          category_id: catalogCategoryId(p.provider_id, c.category_id),
          provider_id: p.provider_id,
          ussd_code: pkg.package_code ?? null,
          package_code: pkg.package_code ?? null,
          is_active: true,
        });
      }
    }
  }
  return out.sort((a, b) => a.selling_price - b.selling_price);
}

export function mapPaymentProviders(catalog: IftinCatalog) {
  return (catalog.payment_providers ?? []).map((pp) => ({
    id: pp.id,
    provider_name: pp.name,
    provider_logo: localizeImage('payment', pp.logo, pp.name),
    payment_number: paymentNumberFor(pp.id, pp.payment_number ?? null),
    base_payment_number: pp.payment_number ?? null,
    prefix_code: pp.prefix_code ?? pp.ussd_prefix ?? null,
    ussd_prefix: pp.ussd_prefix ?? null,
    ussd_code_template: pp.ussd_template ?? null,
    commission_rate: Number(pp.commission_rate ?? 0),
    is_active: true,
  }));
}

const DEFAULT_USSD_PREFIX: Record<string, string> = { '61': '*712*', '77': '*712*', '68': '*812*' };

/**
 * Qaabka lacagta ee USSD-ka — sida gacanta (manual) loogu diro:
 *  - 1      -> "1"
 *  - 0.10   -> "010"   (ka yar $1: nuqul aan calaamad lahayn)
 *  - 1.50   -> "1*50"
 */
export function formatUssdAmount(amount: number | string): string {
  const n = Number(String(amount).replace('$', '').trim());
  if (!isFinite(n)) return String(amount);
  if (Number.isInteger(n)) return String(n);
  const str = n.toFixed(2);
  if (n < 1) return str.replace('.', '').replace(/^0+/, '0');
  return str.replace('.', '*');
}

function normalizePaymentAmount(amount: number | string): string {
  const raw = String(amount).replace('$', '').trim();
  // Horay ayaa loo qaabeeyay: "1*50" ama "010" — sidiisa ha ahaato.
  if (/^\d+\*\d{2}$/.test(raw)) return raw;
  if (/^0\d+$/.test(raw)) return raw;
  if (/^\d+(?:\.\d+)?$/.test(raw)) return formatUssdAmount(raw);
  return raw;
}

export function buildPaymentUssd(
  paymentProvider: { ussd_code_template?: string | null; ussd_prefix?: string | null; prefix_code?: string | null; payment_number?: string | null },
  amount: number | string,
): string | null {
  const number = String(paymentProvider.payment_number ?? '').replace(/\D/g, '');
  if (!number) return null;

  const prefixCode = String(paymentProvider.prefix_code ?? '').trim();
  const explicitPrefix = String(paymentProvider.ussd_prefix ?? '').trim();
  const resolvedPrefix = explicitPrefix || DEFAULT_USSD_PREFIX[prefixCode] || (prefixCode.startsWith('*') ? prefixCode : '');
  const ussdAmount = normalizePaymentAmount(amount);

  const compactPrefix = resolvedPrefix.replace(/\s/g, '');
  const isEvc = compactPrefix.startsWith('*712*') || prefixCode === '61' || prefixCode === '77';
  if (isEvc) {
    return `*712*${number}*${ussdAmount}#`;
  }

  const tpl = paymentProvider.ussd_code_template;
  if (tpl) {
    return tpl
      .replace(/\{\{?\s*(number|payment_number|phone)\s*\}?\}/gi, number)
      .replace(/\{\{?\s*amount\s*\}?\}/gi, ussdAmount);
  }

  if (!resolvedPrefix) return null;
  const base = resolvedPrefix.endsWith('*') ? resolvedPrefix : `${resolvedPrefix}*`;
  return `${base}${number}*${ussdAmount}#`;
}

/** Keeps the workspace-scoped offline caches filled from Iftin's catalog. */
function cacheLegacyShapes(catalog: IftinCatalog, tenantId: string) {
  if (!hasCatalog(catalog)) return;
  try {
    const providers = mapProviders(catalog);
    const paymentProviders = mapPaymentProviders(catalog);
    const categories = mapCategories(catalog);
    const packages = mapPackages(catalog);
    const packagesByProvider: Record<string, any[]> = {};
    for (const pkg of packages) {
      (packagesByProvider[pkg.provider_id] ??= []).push(pkg);
    }
    workspaceStorage.setJson('offline_providers', providers, tenantId);
    workspaceStorage.setJson('offline_categories', categories, tenantId);
    workspaceStorage.setJson('offline_packages', packagesByProvider, tenantId);
    workspaceStorage.setJson('offline_payment_providers', paymentProviders, tenantId);
    cacheImages([
      ...providers.map((p: any) => p.provider_logo),
      ...paymentProviders.map((p: any) => p.provider_logo),
      ...categories.map((c: any) => c.category_image),
    ]);
  } catch { /* quota */ }
}

export function catalogLimits(catalog: IftinCatalog | null | undefined) {
  const balance = Number(catalog?.balance_due ?? 0);
  const limit = Number(catalog?.credit_limit ?? 0);
  const blocked = limit > 0 && balance >= limit;
  return { balance, limit, blocked };
}

export function isOrderingBlocked(): boolean {
  const catalog = memo?.catalog ?? readCachedCatalog();
  return catalogLimits(catalog).blocked;
}

export type PopularPackageDTO = {
  package_id: string;
  package_name: string;
  data_amount: string;
  selling_price: number;
  provider_id: string;
  provider_name: string;
  provider_logo: string | null;
  connection_type_label: string;
};

export function mapPopularPackages(catalog: IftinCatalog | null | undefined): PopularPackageDTO[] {
  if (!catalog) return [];
  const anyCatalog = catalog as any;
  const providers: any[] = catalog.providers ?? [];

  const providerById = new Map<string, any>();
  for (const p of providers) providerById.set(String(p.provider_id ?? p.id), p);

  let raw: any[] = anyCatalog.popular_packages ?? anyCatalog.popularPackages ?? [];
  if (!Array.isArray(raw) || raw.length === 0) {
    raw = [];
    for (const p of providers) {
      const list = p.popular_packages ?? p.popularPackages ?? [];
      for (const pkg of list) raw.push({ ...pkg, provider_id: pkg.provider_id ?? p.provider_id ?? p.id });
    }
  }

  return raw
    .map((pkg: any) => {
      const providerId = String(pkg.provider_id ?? pkg.providerId ?? '');
      const provider = providerById.get(providerId);
      const packageId = String(pkg.package_id ?? pkg.id ?? '');
      const basePrice = Number(pkg.selling_price ?? pkg.price ?? pkg.base_price ?? 0);
      return {
        package_id: packageId,
        package_name: String(pkg.package_name ?? pkg.name ?? ''),
        data_amount: String(pkg.data_amount ?? pkg.data ?? ''),
        selling_price: sellPriceFor(packageId, basePrice),
        provider_id: providerId,
        provider_name: String(pkg.provider_name ?? provider?.provider_name ?? ''),
        provider_logo: localizeImage(
          'provider',
          pkg.provider_logo ?? provider?.provider_logo,
          pkg.provider_name ?? provider?.provider_name,
        ),
        connection_type_label: String(pkg.connection_type_label ?? pkg.type ?? ''),
      };
    })
    .filter((p) => p.package_id && (p.data_amount || p.package_name));
}
