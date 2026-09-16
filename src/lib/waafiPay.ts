import { supabase } from '@/integrations/supabase/client';

export type WaafiPayPurchaseInput = {
  tenant_id: string;
  client_reference: string;
  payer_phone: string;
  receiver_phone: string;
  package_id: string;
  payment_provider_id?: string | null;
};

export type WaafiPayPurchaseResult = {
  success: boolean;
  payment_approved: boolean;
  delivery_queued: boolean;
  order_id?: string;
  reference_id: string;
  transaction_id?: string;
  message?: string;
};

const FALLBACK_CODES = new Set([
  'waafipay_not_configured',
  'waafipay_inactive',
  'waafipay_delivery_mode_not_supported',
]);

const FINAL_FAILURE_CODES = new Set([
  'payment_declined',
  'payment_cancelled',
  'insufficient_balance',
  'payment_timeout',
  'payment_failed',
]);

export class WaafiPayPurchaseError extends Error {
  code: string;
  allowLegacyFallback: boolean;
  canStartNewAttempt: boolean;
  details: any;

  constructor(code: string, message: string, details?: any) {
    super(message);
    this.name = 'WaafiPayPurchaseError';
    this.code = code;
    this.allowLegacyFallback = FALLBACK_CODES.has(code);
    this.canStartNewAttempt = FINAL_FAILURE_CODES.has(code);
    this.details = details;
  }
}

async function errorPayload(error: any): Promise<any> {
  const context = error?.context;
  if (context && typeof context.json === 'function') {
    try {
      return await context.json();
    } catch {
      return null;
    }
  }
  return null;
}

export async function purchaseWithWaafiPay(
  input: WaafiPayPurchaseInput,
): Promise<WaafiPayPurchaseResult> {
  const { data, error } = await supabase.functions.invoke('waafipay-purchase', {
    body: input,
  });

  let payload: any = data;
  if (error) payload = (await errorPayload(error)) || payload;

  const code = String(payload?.error || (error ? 'waafipay_request_failed' : ''));
  if (error || code) {
    throw new WaafiPayPurchaseError(
      code || 'waafipay_request_failed',
      String(payload?.message || error?.message || 'WaafiPay request failed'),
      payload,
    );
  }

  return payload as WaafiPayPurchaseResult;
}
