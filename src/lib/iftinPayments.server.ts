// Server-only helpers for the Iftin Partner "payments" endpoints.
// The API key lives in the database (per tenant) and never reaches the browser.
const IFTIN_BASE = 'https://tsjqvhddjfuecwxpcuil.supabase.co/functions/v1';

const PREFIX_TO_PROVIDER: Record<string, string> = {
  '61': 'Hormuud',
  '77': 'Hormuud',
  '62': 'Somtel / e-Dahab',
  '68': 'Somnet / Jeeb',
  '63': 'Telesom / Zaad',
  '71': 'Amtel',
  '90': 'Golis / Sahal',
  '85': 'Golis / Sahal',
  '67': 'Nationlink',
  '69': 'Nationlink',
};

function providerFromPhone(phone: string | null | undefined): string | null {
  const digits = String(phone ?? '').replace(/\D/g, '');
  // Normalize Somalia numbers: drop +252 or 252 prefix.
  const local = digits.startsWith('252') ? digits.slice(3) : digits;
  const prefix2 = local.slice(0, 2);
  return PREFIX_TO_PROVIDER[prefix2] ?? null;
}

export async function getTenantApiKey(tenantId: string, userId: string): Promise<string> {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');

  const { data: roles } = await supabaseAdmin
    .from('user_roles')
    .select('role')
    .eq('user_id', userId);
  const isSuperAdmin = (roles ?? []).some((r: any) => r.role === 'super_admin');

  if (!isSuperAdmin) {
    const { data: member } = await supabaseAdmin
      .from('tenant_members')
      .select('tenant_id')
      .eq('user_id', userId)
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (!member) throw new Error('Xaq uma lihid tenant-kan');
  }

  const { data: cred } = await supabaseAdmin
    .from('iftin_partner_credentials')
    .select('api_key')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .maybeSingle();

  const apiKey = (cred as any)?.api_key as string | undefined;
  if (!apiKey) throw new Error('Iftin API key lama dejin tenant-kan');
  return apiKey;
}

export async function enrichPaymentsWithProvider(
  tenantId: string,
  payments: Array<{
    receipt_id: string;
    external_ref?: string | null;
    sender_phone?: string | null;
    receiver_phone?: string | null;
    provider?: string | null;
  }>,
): Promise<Record<string, string | null>> {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');

  const externalRefs = payments
    .map((p) => String(p.external_ref ?? '').trim())
    .filter((r) => r.length > 0);

  let orderMap = new Map<string, { provider_id?: string | null; payment_source?: string | null }>();

  if (externalRefs.length > 0) {
    const { data: orders } = await supabaseAdmin
      .from('orders')
      .select('external_ref, provider_id, payment_source')
      .eq('tenant_id', tenantId)
      .in('external_ref', externalRefs);

    for (const o of orders ?? []) {
      if (o.external_ref) {
        orderMap.set(o.external_ref, {
          provider_id: o.provider_id,
          payment_source: o.payment_source,
        });
      }
    }
  }

  // Load provider names for any provider_ids we found.
  const providerIds = Array.from(new Set(
    Array.from(orderMap.values())
      .map((o) => o.provider_id)
      .filter((id): id is string => Boolean(id)),
  ));

  const providerNameMap = new Map<string, string>();
  if (providerIds.length > 0) {
    const { data: configs } = await supabaseAdmin
      .from('providers_config')
      .select('id, provider_name')
      .eq('tenant_id', tenantId)
      .in('id', providerIds);

    for (const c of configs ?? []) {
      if (c.id && c.provider_name) providerNameMap.set(c.id, c.provider_name);
    }
  }

  const result: Record<string, string | null> = {};
  for (const p of payments) {
    const ref = String(p.external_ref ?? '').trim();
    const order = ref ? orderMap.get(ref) : undefined;

    // "Shirkadda" = shirkadda dalabka (network-ka helaya), MAAHA shirkadda lacag bixinta.
    let provider: string | null = null;
    if (order?.provider_id && providerNameMap.has(order.provider_id)) {
      provider = providerNameMap.get(order.provider_id) ?? null;
    } else {
      provider = providerFromPhone(p.receiver_phone ?? p.sender_phone);
    }

    result[p.receipt_id] = provider;
  }

  return result;
}

export async function iftinCall(
  apiKey: string,
  path: string,
  init: RequestInit = {},
): Promise<{ status: number; body: any }> {
  const headers = new Headers(init.headers ?? {});
  headers.set('X-API-Key', apiKey);
  headers.set('Content-Type', 'application/json');
  const res = await fetch(`${IFTIN_BASE}${path}`, { ...init, headers });
  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }
  return { status: res.status, body };
}