// Server-only helpers for the Iftin Partner "offline register" endpoint.
// The partner API key lives in the database (per tenant) and never reaches the browser.
const UUID_RE = /^[0-9a-f-]{36}$/i;
export const OFFLINE_PATH = '/partner-offline-register';
export const ALLOWED_PREFIXES = ['61', '77', '62', '68', '71', '64'];

export function normalizePhone(phone: unknown): string {
  let p = String(phone ?? '').replace(/^\+/, '').replace(/\D/g, '');
  if (p.startsWith('252')) p = p.slice(3);
  return p.slice(-9);
}

export function isValidPhone(p: string): boolean {
  return /^\d{9}$/.test(p) && ALLOWED_PREFIXES.includes(p.slice(0, 2));
}

export function isUuid(v: unknown): boolean {
  return typeof v === 'string' && UUID_RE.test(v);
}

/** Reads the active Iftin key for a tenant (no user context — tenant scoped). */
export async function getTenantApiKeyByTenant(tenantId: string): Promise<string | null> {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { data } = await supabaseAdmin
    .from('iftin_partner_credentials')
    .select('api_key')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .maybeSingle();
  return ((data as any)?.api_key as string | undefined) ?? null;
}

/** POST to Iftin with backoff on 429/5xx only. 400/409 are final. */
export async function callOfflineApi(
  apiKey: string,
  payload: Record<string, unknown>,
): Promise<{ status: number; body: any }> {
  const { iftinCall } = await import('./iftinPayments.server');
  let last: { status: number; body: any } = { status: 0, body: null };
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      last = await iftinCall(apiKey, OFFLINE_PATH, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    } catch {
      last = { status: 503, body: { error: 'network_error', message: 'Xiriirka Iftin ma shaqeynayo' } };
    }
    if ((last.status === 429 || last.status >= 500) && attempt < 2) {
      await new Promise((r) => setTimeout(r, 500 * Math.pow(2, attempt)));
      continue;
    }
    break;
  }
  return last;
}

/** Builds the exact upstream payload. sender/receiver stay strictly separate. */
export function buildOfflinePayload(
  input: any,
): { ok: true; payload: Record<string, unknown> } | { ok: false; error: string; message: string } {
  const action = String(input?.action ?? 'register');

  if (action === 'list') return { ok: true, payload: { action: 'list' } };

  if (action === 'delete') {
    if (isUuid(input?.id)) return { ok: true, payload: { action: 'delete', id: String(input.id) } };
    const sender = normalizePhone(input?.sender_phone);
    if (isValidPhone(sender)) return { ok: true, payload: { action: 'delete', sender_phone: sender } };
    return { ok: false, error: 'invalid_target', message: 'ID ama lambar sax ah lama helin' };
  }

  if (action === 'register' || action === 'update') {
    const sender_phone = normalizePhone(input?.sender_phone);
    const receiver_phone = normalizePhone(input?.receiver_phone);
    if (!isValidPhone(sender_phone)) {
      return { ok: false, error: 'invalid_sender_phone', message: 'Lambarka lacagta diraya sax ma aha' };
    }
    if (!isValidPhone(receiver_phone)) {
      return { ok: false, error: 'invalid_receiver_phone', message: 'Lambarka xirmada loo dirayo sax ma aha' };
    }
    const providerId = isUuid(input?.provider_id) ? String(input.provider_id) : null;
    const providerName = input?.provider_name ? String(input.provider_name) : null;
    if (!providerId && !providerName) {
      return { ok: false, error: 'missing_provider', message: 'Shirkadda lama doortin' };
    }
    return {
      ok: true,
      payload: {
        action,
        sender_phone,
        receiver_phone,
        ...(providerId ? { provider_id: providerId } : { provider_name: providerName }),
        ...(isUuid(input?.id) ? { id: String(input.id) } : {}),
        ...(input?.notes ? { notes: String(input.notes) } : {}),
        // sell_price is intentionally NOT sent — Iftin resolves it from partner_pricing.
      },
    };
  }

  return { ok: false, error: 'invalid_action', message: `Action lama garanayo: ${action}` };
}
