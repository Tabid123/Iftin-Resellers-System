// Iftin "Prepaid Intent" — client side. The API key never touches the browser;
// every call goes through the `iftin-intent` edge function.
import { supabase } from '@/integrations/supabase/client';
import { resolveTenantId } from '@/lib/iftinCatalog';

export type IftinIntent = {
  created: boolean;
  order_id: string;
  external_ref: string;
  intent_id: string | null;
  amount: number;
  base_price: number;
  your_profit: number;
  payment_number: string | null;
  ussd_code: string | null;
  expires_at: string | null;
  sender_phone: string;
};

export type IftinIntentStatus = {
  external_ref: string | null;
  intent_id: string | null;
  status: 'pending' | 'matched' | 'delivering' | 'delivered' | 'failed' | 'expired' | string;
  delivery_status: string | null;
  order_id: string | null;
  notes: string | null;
};

export class IftinIntentError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/iftin-intent`;
const ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

async function call(path: string, init: RequestInit) {
  const res = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      apikey: ANON,
      Authorization: `Bearer ${ANON}`,
      ...(init.headers ?? {}),
    },
  });
  let body: any = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  console.log(`[iftin-intent] ${init.method ?? 'GET'} ${path} -> ${res.status}`, body);
  if (!res.ok) {
    throw new IftinIntentError(
      body?.error ?? 'iftin_error',
      body?.message ?? `Iftin khalad (${res.status})`,
      res.status,
    );
  }
  return body;
}

export async function createIftinIntent(input: {
  receiver_phone: string;
  sender_phone: string;
  package_id: string;
  payment_provider: string;
  package_name?: string;
  data_amount?: string | null;
  provider_id?: string | null;
  customer_phone?: string;
}): Promise<IftinIntent> {
  const tenantId = await resolveTenantId();
  if (!tenantId) {
    throw new IftinIntentError('invalid_tenant', 'Reseller-ka lama garanayo', 422);
  }
  // Do not persist the auth session token here: the edge function verifies the
  // tenant itself and holds the Iftin key server-side.
  return (await call(FN_URL, {
    method: 'POST',
    body: JSON.stringify({ tenant_id: tenantId, ...input }),
  })) as IftinIntent;
}

export async function fetchIftinIntentStatus(externalRef: string): Promise<IftinIntentStatus> {
  const tenantId = await resolveTenantId();
  const qs = new URLSearchParams({ external_ref: externalRef });
  if (tenantId) qs.set('tenant_id', tenantId);
  return (await call(`${FN_URL}?${qs.toString()}`, { method: 'GET' })) as IftinIntentStatus;
}

/** Only these states are still moving; anything else is final. */
export function isIntentPending(status: string | null | undefined) {
  return status === 'pending' || status === 'matched' || status === 'delivering';
}

/** Keeps the Supabase import used for type-side effects only. */
export const _supabase = supabase;
