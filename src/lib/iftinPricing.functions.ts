import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

const UUID_RE = /^[0-9a-f-]{36}$/i;
const PATH = '/partner-pricing';

export type PricingResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; message: string };

export type PartnerPrice = {
  package_id: string;
  package_name?: string | null;
  provider_id?: string | null;
  base_price?: number | null;
  sell_price?: number | null;
};

async function call(tenantId: string, userId: string, payload: unknown) {
  if (!UUID_RE.test(tenantId)) throw new Error('tenant_id sax ma aha');
  const { getTenantApiKey, iftinCall } = await import('./iftinPayments.server');
  const apiKey = await getTenantApiKey(tenantId, userId);
  return iftinCall(apiKey, PATH, { method: 'POST', body: JSON.stringify(payload) });
}

function messageFor(status: number, body: any) {
  if (status === 401) return 'API key-ga waa qaldan yahay (401)';
  if (status === 429) return 'Dalabyo aad u badan — isku day mar kale';
  if (status >= 500) return 'Iftin server-ka ma jawaabin — isku day mar kale';
  return body?.message ?? body?.error ?? `Khalad (${status})`;
}

/** Push one or many sell prices to Iftin's partner_pricing list. */
export const setIftinPrices = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { tenantId: string; prices: Array<{ package_id: string; price: number }> }) => input,
  )
  .handler(async ({ data, context }): Promise<PricingResult<{ saved: number; rejected: any[] }>> => {
    const prices = (data.prices ?? [])
      .map((p) => ({ package_id: String(p.package_id), price: Number(p.price) }))
      .filter((p) => UUID_RE.test(p.package_id) && p.price > 0);
    if (!prices.length) return { ok: false, status: 400, message: 'Qiimo sax ah lama helin' };

    const { status, body } = await call(data.tenantId, context.userId, { action: 'set', prices });
    if (status < 200 || status >= 300) {
      return { ok: false, status, message: messageFor(status, body) };
    }
    return {
      ok: true,
      data: { saved: Number(body?.saved ?? prices.length), rejected: body?.rejected ?? [] },
    };
  });

export const listIftinPrices = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { tenantId: string }) => input)
  .handler(async ({ data, context }): Promise<PricingResult<PartnerPrice[]>> => {
    const { status, body } = await call(data.tenantId, context.userId, { action: 'list' });
    if (status < 200 || status >= 300) {
      return { ok: false, status, message: messageFor(status, body) };
    }
    const list = Array.isArray(body?.prices) ? body.prices : Array.isArray(body) ? body : [];
    return { ok: true, data: list as PartnerPrice[] };
  });
