import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

export type OfflineRegistration = {
  id: string;
  sender_phone: string;
  receiver_phone: string;
  provider_id?: string | null;
  package_id?: string | null;
  package_name?: string | null;
  provider_name?: string | null;
  iftin_price?: number | null;
  sell_price?: number | null;
  profit_per_order?: number | null;
  notes?: string | null;
  is_active?: boolean | null;
  match_count?: number | null;
  last_matched_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type OfflineResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; code?: string; message: string };

const UUID_RE = /^[0-9a-f-]{36}$/i;
const PATH = '/partner-offline-register';

function messageFor(status: number, body: any): string {
  const code = String(body?.error ?? body?.code ?? '');
  if (status === 401) return 'API key-ga waa qaldan yahay (401)';
  if (code === 'already_registered' || status === 409) return 'Lambarkan waa la diiwaan geliyay';
  if (code === 'invalid_sender_phone') return 'Lambarka diraya sax ma aha';
  if (code === 'invalid_receiver_phone') return 'Lambarka helaya sax ma aha';
  if (code === 'missing_provider') return 'Shirkadda lama doortin';
  if (code === 'receiver_provider_mismatch') return 'Lambarka helaya kuma habboona shirkadda la doortay';
  if (code === 'provider_not_found') return 'Shirkaddan lama helin';
  if (status === 429) return 'Dalabyo aad u badan — sug wax yar oo isku day mar kale';
  if (status >= 500) return 'Iftin server-ka ma jawaabin — isku day mar kale';
  return body?.message ?? (code ? `Khalad: ${code}` : `Khalad (${status})`);
}

/** POST with backoff on 429/5xx only. 400/409 never retried. */
async function callOffline(apiKey: string, payload: unknown) {
  const { iftinCall } = await import('./iftinPayments.server');
  let last = { status: 0, body: null as any };
  for (let attempt = 0; attempt < 3; attempt++) {
    last = await iftinCall(apiKey, PATH, { method: 'POST', body: JSON.stringify(payload) });
    if (last.status === 429 || last.status >= 500) {
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, 500 * Math.pow(2, attempt)));
        continue;
      }
    }
    break;
  }
  return last;
}

async function keyFor(tenantId: string, userId: string) {
  if (!UUID_RE.test(tenantId)) throw new Error('tenant_id sax ma aha');
  const { getTenantApiKey } = await import('./iftinPayments.server');
  return getTenantApiKey(tenantId, userId);
}

export const listOfflineRegistrations = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { tenantId: string }) => input)
  .handler(async ({ data, context }): Promise<OfflineResult<OfflineRegistration[]>> => {
    const apiKey = await keyFor(data.tenantId, context.userId);
    const { status, body } = await callOffline(apiKey, { action: 'list' });
    if (status < 200 || status >= 300) {
      return { ok: false, status, code: body?.error, message: messageFor(status, body) };
    }
    const list = Array.isArray(body?.registrations)
      ? body.registrations
      : Array.isArray(body?.data)
        ? body.data
        : Array.isArray(body)
          ? body
          : [];
    return { ok: true, data: list as OfflineRegistration[] };
  });

export const saveOfflineRegistration = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      tenantId: string;
      sender_phone: string;
      receiver_phone: string;
      provider_id?: string;
      provider_name?: string;
      notes?: string;
    }) => input,
  )
  .handler(async ({ data, context }): Promise<OfflineResult<OfflineRegistration>> => {
    const apiKey = await keyFor(data.tenantId, context.userId);
    const sender = String(data.sender_phone).replace(/\D/g, '').slice(-9);
    const receiver = String(data.receiver_phone).replace(/\D/g, '').slice(-9);
    if (sender.length !== 9) return { ok: false, status: 400, message: 'Lambarka diraya waa 9 god' };
    if (receiver.length !== 9) return { ok: false, status: 400, message: 'Lambarka helaya waa 9 god' };
    const providerId = data.provider_id && UUID_RE.test(data.provider_id) ? data.provider_id : undefined;
    if (!providerId && !data.provider_name) {
      return { ok: false, status: 400, message: 'Shirkadda lama doortin' };
    }

    const { status, body } = await callOffline(apiKey, {
      action: 'register',
      sender_phone: sender,
      receiver_phone: receiver,
      ...(providerId ? { provider_id: providerId } : { provider_name: data.provider_name }),
      ...(data.notes ? { notes: data.notes } : {}),
    });
    if (status < 200 || status >= 300) {
      return { ok: false, status, code: body?.error, message: messageFor(status, body) };
    }
    return { ok: true, data: (body?.registration ?? body) as OfflineRegistration };
  });

export const deleteOfflineRegistration = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { tenantId: string; id?: string; sender_phone?: string }) => input)
  .handler(async ({ data, context }): Promise<OfflineResult<{ id?: string }>> => {
    const apiKey = await keyFor(data.tenantId, context.userId);
    const sender = String(data.sender_phone ?? '').replace(/\D/g, '').slice(-9);
    const byId = data.id && UUID_RE.test(data.id);
    if (!byId && sender.length !== 9) return { ok: false, status: 400, message: 'ID sax ma aha' };
    const { status, body } = await callOffline(
      apiKey,
      byId ? { action: 'delete', id: data.id } : { action: 'delete', sender_phone: sender },
    );
    if (status < 200 || status >= 300) {
      return { ok: false, status, code: body?.error, message: messageFor(status, body) };
    }
    return { ok: true, data: { id: data.id } };
  });
