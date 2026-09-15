import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

export type IntentResult = 'delivered' | 'delivering' | 'failed' | 'awaiting_payment' | 'expired' | string;

export type PartnerIntent = {
  intent_id: string;
  external_ref: string | null;
  receiver_phone: string | null;
  sender_phone: string | null;
  amount: number | null;
  base_price: number | null;
  your_profit: number | null;
  package_name: string | null;
  data_amount: string | null;
  order_id: string | null;
  paid: boolean;
  counts_as_order: boolean;
  result: IntentResult;
  result_label: string | null;
  result_label_en: string | null;
  reason: string | null;
  delivery_status: string | null;
  delivered_at: string | null;
  created_at: string | null;
};

export type PartnerIntentSummary = {
  orders: number;
  delivered: number;
  delivering: number;
  failed: number;
  awaiting_payment: number;
  expired_unpaid: number;
};

export type PartnerIntentsData = {
  unpaid_ttl_minutes: number;
  summary: PartnerIntentSummary;
  intents: PartnerIntent[];
};

const UUID_RE = /^[0-9a-f-]{36}$/i;

const num = (v: unknown) => Number(v ?? 0) || 0;

function normalizeSummary(s: any): PartnerIntentSummary {
  return {
    orders: num(s?.orders),
    delivered: num(s?.delivered),
    delivering: num(s?.delivering),
    failed: num(s?.failed),
    awaiting_payment: num(s?.awaiting_payment),
    expired_unpaid: num(s?.expired_unpaid),
  };
}

export const listPartnerIntents = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { tenantId: string; limit?: number; includeUnpaid?: boolean }) => input,
  )
  .handler(async ({ data, context }): Promise<PartnerIntentsData> => {
    if (!UUID_RE.test(data.tenantId)) throw new Error('tenant_id sax ma aha');
    const { getTenantApiKey, iftinCall } = await import('./iftinPayments.server');
    const apiKey = await getTenantApiKey(data.tenantId, context.userId);

    const qs = new URLSearchParams({
      limit: String(Math.min(Math.max(Number(data.limit ?? 100) || 100, 1), 200)),
    });
    if (data.includeUnpaid) qs.set('include_unpaid', '1');

    const { status, body } = await iftinCall(apiKey, `/partner-intent-status?${qs.toString()}`, {
      method: 'GET',
    });
    if (status < 200 || status >= 300) {
      throw new Error(body?.message ?? body?.error ?? `Iftin API khalad (${status})`);
    }

    return {
      unpaid_ttl_minutes: num(body?.unpaid_ttl_minutes) || 60,
      summary: normalizeSummary(body?.summary),
      intents: Array.isArray(body?.intents) ? (body.intents as PartnerIntent[]) : [],
    };
  });

export const getPartnerIntent = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { tenantId: string; externalRef?: string; intentId?: string }) => input)
  .handler(async ({ data, context }): Promise<PartnerIntent | null> => {
    if (!UUID_RE.test(data.tenantId)) throw new Error('tenant_id sax ma aha');
    const { getTenantApiKey, iftinCall } = await import('./iftinPayments.server');
    const apiKey = await getTenantApiKey(data.tenantId, context.userId);

    const qs = new URLSearchParams();
    if (data.externalRef) qs.set('external_ref', data.externalRef);
    else if (data.intentId) qs.set('intent_id', data.intentId);
    else throw new Error('external_ref ama intent_id waa loo baahan yahay');

    const { status, body } = await iftinCall(apiKey, `/partner-intent-status?${qs.toString()}`, {
      method: 'GET',
    });
    if (status < 200 || status >= 300) {
      throw new Error(body?.message ?? body?.error ?? `Iftin API khalad (${status})`);
    }
    const intent = body?.intent ?? (Array.isArray(body?.intents) ? body.intents[0] : null) ?? null;
    return intent as PartnerIntent | null;
  });
