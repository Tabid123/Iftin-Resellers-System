// Reseller wallet — all Iftin calls proxied by the `iftin-wallet` edge function.
import { supabase } from '@/integrations/supabase/client';
import { resolveTenantId } from '@/lib/iftinCatalog';

export type WalletLedgerEntry = {
  id?: string;
  created_at?: string;
  external_ref?: string;
  order_id?: string;
  amount?: number;
  base_price?: number;
  profit?: number;
  status?: string;
  receiver_phone?: string;
  package_name?: string;
  available_at?: string;
};

export type WalletPayout = {
  id?: string;
  created_at?: string;
  amount?: number;
  status?: string;
  payout_phone?: string;
  payout_method?: string;
};

export type IftinWalletData = {
  wallet: { pending: number; available: number; paid_out: number };
  payout_settings: {
    payout_phone?: string | null;
    payout_method?: string | null;
    auto_payout_enabled?: boolean | null;
    min_payout_amount?: number | null;
  } | null;
  ledger: WalletLedgerEntry[];
  payouts: WalletPayout[];
};

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/iftin-wallet`;
const ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

async function call(search: string, init: RequestInit = {}) {
  const tenantId = await resolveTenantId();
  if (!tenantId) throw new Error('Reseller-ka lama garanayo');
  const { data: session } = await supabase.auth.getSession();
  const token = session?.session?.access_token;
  if (!token) throw new Error('Fadlan gal (sign in) si aad wallet-ka u aragto');

  const qs = new URLSearchParams(search);
  qs.set('tenant_id', tenantId);
  const url = `${FN_URL}?${qs.toString()}`;

  const res = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      apikey: ANON,
      Authorization: `Bearer ${token}`,
    },
  });
  let body: any = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  console.log(`[iftin-wallet] ${init.method ?? 'GET'} ${url} -> ${res.status}`, body);
  if (!res.ok) throw new Error(body?.message ?? body?.error ?? `Iftin khalad (${res.status})`);
  return body;
}

export async function fetchIftinWallet(): Promise<IftinWalletData> {
  const body = await call('');
  return {
    wallet: {
      pending: Number(body?.wallet?.pending ?? 0),
      available: Number(body?.wallet?.available ?? 0),
      paid_out: Number(body?.wallet?.paid_out ?? 0),
    },
    payout_settings: body?.payout_settings ?? null,
    ledger: Array.isArray(body?.ledger) ? body.ledger : [],
    payouts: Array.isArray(body?.payouts) ? body.payouts : [],
  };
}

export async function saveIftinPayoutSettings(input: {
  payout_phone: string;
  payout_method: string;
  auto_payout_enabled: boolean;
  min_payout_amount: number;
}) {
  return await call('', { method: 'POST', body: JSON.stringify(input) });
}

export async function requestIftinPayout(amount?: number) {
  return await call('action=payout', {
    method: 'POST',
    body: JSON.stringify(amount && amount > 0 ? { amount } : {}),
  });
}
