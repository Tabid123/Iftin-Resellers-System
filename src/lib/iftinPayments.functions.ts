import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

export type PaymentStatus = 'matched' | 'pending' | 'unmatched' | 'blocked' | string;

export type PartnerPayment = {
  receipt_id: string;
  created_at: string;
  sender_phone: string | null;
  amount: number | null;
  provider: string | null;
  status: PaymentStatus;
  receiver_phone: string | null;
  package_name: string | null;
  delivery_status: string | null;
  external_ref: string | null;
  can_resolve?: boolean;
  hint?: string | null;
};

export type PartnerPaymentsData = {
  summary: { total: number; matched: number; pending: number; unmatched: number; blocked: number };
  payments: PartnerPayment[];
};

const UUID_RE = /^[0-9a-f-]{36}$/i;

export const listPartnerPayments = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { tenantId: string; status?: string; limit?: number; offset?: number }) => input)
  .handler(async ({ data, context }): Promise<PartnerPaymentsData> => {
    if (!UUID_RE.test(data.tenantId)) throw new Error('tenant_id sax ma aha');
    const { getTenantApiKey, iftinCall, enrichPaymentsWithProvider } = await import('./iftinPayments.server');
    const apiKey = await getTenantApiKey(data.tenantId, context.userId);

    const qs = new URLSearchParams({
      status: data.status && data.status !== 'all' ? data.status : 'all',
      limit: String(Math.min(Math.max(Number(data.limit ?? 50) || 50, 1), 200)),
      offset: String(Math.max(Number(data.offset ?? 0) || 0, 0)),
    });

    const { status, body } = await iftinCall(apiKey, `/partner-payments?${qs.toString()}`, { method: 'GET' });
    if (status < 200 || status >= 300) {
      throw new Error(body?.message ?? body?.error ?? `Iftin API khalad (${status})`);
    }
    const payments = Array.isArray(body?.payments) ? (body.payments as PartnerPayment[]) : [];

    // Iftin sometimes returns provider as null; enrich from our orders/providers_config.
    const providerOverrides = await enrichPaymentsWithProvider(data.tenantId, payments);
    for (const p of payments) {
      // Iftin's provider is the payment network; we want the order's data provider.
      if (providerOverrides[p.receipt_id]) {
        p.provider = providerOverrides[p.receipt_id];
      }
    }

    return {
      summary: {
        total: Number(body?.summary?.total ?? 0),
        matched: Number(body?.summary?.matched ?? 0),
        pending: Number(body?.summary?.pending ?? 0),
        unmatched: Number(body?.summary?.unmatched ?? 0),
        blocked: Number(body?.summary?.blocked ?? 0),
      },
      payments,
    };
  });

export const resolvePartnerPayment = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { tenantId: string; receiptId: string }) => input)
  .handler(async ({ data, context }): Promise<{ ok: boolean; code?: string; message?: string }> => {
    if (!UUID_RE.test(data.tenantId)) throw new Error('tenant_id sax ma aha');
    if (!UUID_RE.test(data.receiptId)) throw new Error('receipt_id sax ma aha');
    const { getTenantApiKey, iftinCall } = await import('./iftinPayments.server');
    const apiKey = await getTenantApiKey(data.tenantId, context.userId);

    const { status, body } = await iftinCall(apiKey, '/partner-payments', {
      method: 'POST',
      body: JSON.stringify({ receipt_id: data.receiptId }),
    });

    if (status < 200 || status >= 300) {
      const code = String(body?.error ?? 'iftin_error');
      return {
        ok: false,
        code,
        message:
          code === 'no_open_intent'
            ? 'Marka hore samee dalab (intent) macaamiilkan, kadibna dib u isku day.'
            : (body?.message ?? `Iftin API khalad (${status})`),
      };
    }
    return { ok: true, message: body?.message ?? 'Dalabka waa la sameeyay — diritaanku wuu socdaa.' };
  });