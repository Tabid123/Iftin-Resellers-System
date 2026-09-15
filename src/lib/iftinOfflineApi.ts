/**
 * Client helper for Iftin offline registration.
 *
 * Every registration goes to the Iftin Partner API FIRST (via our
 * /api/public/offline-register proxy). Only a 2xx response is treated as
 * success; failures are surfaced with the server error code and, when the
 * failure is transient (offline / network / 5xx), queued for retry.
 */
import { resolveTenantId } from '@/lib/iftinCatalog';

export const ALLOWED_PREFIXES = ['61', '77', '62', '68', '71', '64'];

export const normalizePhone = (p: unknown): string => {
  let s = String(p ?? '').replace(/^\+/, '').replace(/\D/g, '');
  if (s.startsWith('252')) s = s.slice(3);
  return s.slice(-9);
};

export const isValidOfflinePhone = (p: string): boolean =>
  /^\d{9}$/.test(p) && ALLOWED_PREFIXES.includes(p.slice(0, 2));

export type OfflineApiResult = {
  ok: boolean;
  status: number;
  error?: string | null;
  message?: string | null;
  data?: any;
  queued?: boolean;
};

export type OfflineRegisterInput = {
  senderPhone: string;
  receiverPhone: string;
  providerName?: string | null;
  providerId?: string | null;
  notes?: string | null;
  tenantId?: string | null;
};

const QUEUE_KEY = 'iftin_offline_reg_queue';

type QueueItem = OfflineRegisterInput & { queuedAt: number };

const readQueue = (): QueueItem[] => {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? (JSON.parse(raw) as QueueItem[]) : [];
  } catch {
    return [];
  }
};

const writeQueue = (items: QueueItem[]) => {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(items));
  } catch {
    /* noop */
  }
};

export const getQueuedRegistrations = (): QueueItem[] => readQueue();

const enqueue = (input: OfflineRegisterInput) => {
  const q = readQueue().filter(
    (i) => normalizePhone(i.senderPhone) !== normalizePhone(input.senderPhone),
  );
  q.push({ ...input, queuedAt: Date.now() });
  writeQueue(q);
};

/**
 * In the native (Capacitor) app the web bundle is served from a local
 * scheme, so a relative "/api/..." URL never reaches our server. Use the
 * published origin there.
 */
// NOTE: iftin-agent-friend.lovable.app 307-redirects to the custom domain,
// which costs an extra cross-origin hop (and a second CORS preflight) on every
// request from the APK. Point straight at the final origin.
const PUBLISHED_ORIGIN =
  (import.meta as any).env?.VITE_PUBLIC_APP_URL || 'https://iftinagents.com';

export function apiBase(): string {
  if (typeof window === 'undefined') return '';
  const cap = (window as any).Capacitor;
  const native = Boolean(cap?.isNativePlatform?.());
  const origin = window.location.origin || '';
  if (native || origin.startsWith('file:') || /^https?:\/\/localhost/.test(origin)) {
    return PUBLISHED_ORIGIN.replace(/\/$/, '');
  }
  return '';
}

/** Requests never hang: abort after this many ms so the UI can recover. */
const REQUEST_TIMEOUT_MS = 20000;

async function postOffline(body: Record<string, unknown>): Promise<OfflineApiResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${apiBase()}/api/public/offline-register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    let json: any = null;
    try {
      json = await res.json();
    } catch {
      json = null;
    }
    return {
      ok: Boolean(json?.ok) && res.ok,
      status: json?.status ?? res.status,
      error: json?.error ?? null,
      message: json?.message ?? null,
      data: json?.data ?? null,
    };
  } catch (e: any) {
    const timedOut = e?.name === 'AbortError';
    return {
      ok: false,
      status: 0,
      error: timedOut ? 'timeout' : 'network_error',
      message: timedOut ? 'Server-ka ma jawaabin — isku day mar kale' : (e?.message ?? 'Internet ma jiro'),
    };
  } finally {
    clearTimeout(timer);
  }
}

const somaliMessage = (r: OfflineApiResult): string => {
  const code = String(r.error ?? '');
  if (code === 'already_registered' || r.status === 409) return 'Lambarkan hore ayaa loo diiwaan geliyay';
  if (code === 'invalid_sender_phone') return 'Lambarka lacagta diraya sax ma aha';
  if (code === 'invalid_receiver_phone') return 'Lambarka xirmada loo dirayo sax ma aha';
  if (code === 'missing_provider') return 'Shirkadda lama doortin';
  if (code === 'receiver_provider_mismatch') return 'Lambarka helaya kuma habboona shirkadda la doortay';
  if (code === 'provider_not_found') return 'Shirkaddan lama helin';
  if (code === 'missing_api_key') return 'Iftin API key lama dejin';
  if (code === 'missing_tenant') return 'Tenant-ka lama aqoonsan';
  if (r.status === 401) return 'API key-ga waa qaldan yahay (401)';
  if (r.status === 429) return 'Dalabyo aad u badan — sug wax yar';
  if (code === 'timeout') return 'Server-ka ma jawaabin — isku day mar kale';
  if (r.status === 0 || code === 'network_error') return 'Internet ma jiro — isku day mar kale';
  if (r.status >= 500) return 'Iftin server-ka ma jawaabin — isku day mar kale';
  return r.message || (code ? `Khalad: ${code}` : `Khalad (${r.status})`);
};

/** Registers a customer at Iftin. Iftin is the only source of truth — no local copy. */
export async function registerOfflineCustomer(
  input: OfflineRegisterInput,
  opts: { queueOnFailure?: boolean } = { queueOnFailure: false },
): Promise<OfflineApiResult> {
  const sender_phone = normalizePhone(input.senderPhone);
  const receiver_phone = normalizePhone(input.receiverPhone);

  if (!isValidOfflinePhone(sender_phone)) {
    return { ok: false, status: 400, error: 'invalid_sender_phone', message: 'Lambarka lacagta diraya sax ma aha' };
  }
  if (!isValidOfflinePhone(receiver_phone)) {
    return { ok: false, status: 400, error: 'invalid_receiver_phone', message: 'Lambarka xirmada loo dirayo sax ma aha' };
  }

  const tenantId =
    input.tenantId ??
    (await Promise.race([
      resolveTenantId(),
      new Promise<null>((r) => setTimeout(() => r(null), 8000)),
    ]));
  if (!tenantId) {
    return { ok: false, status: 400, error: 'missing_tenant', message: 'Tenant-ka lama aqoonsan' };
  }

  const payload = {
    tenant_id: tenantId,
    action: 'register',
    sender_phone,
    receiver_phone,
    ...(input.providerId ? { provider_id: input.providerId } : {}),
    ...(input.providerName ? { provider_name: input.providerName } : {}),
    ...(input.notes ? { notes: input.notes } : {}),
  };

  // Log the exact payload so sender/receiver can be verified in the field.
  console.info('[offline-reg] sending', {
    sender_phone: payload.sender_phone,
    receiver_phone: payload.receiver_phone,
    provider: input.providerName ?? input.providerId,
  });

  const res = await postOffline(payload);
  const transient = !res.ok && (res.status === 0 || res.status === 429 || res.status >= 500);

  if (transient && opts.queueOnFailure !== false) {
    enqueue({ ...input, tenantId });
    return { ...res, queued: true, message: somaliMessage(res) };
  }

  return { ...res, message: res.ok ? (res.message ?? null) : somaliMessage(res) };
}

export async function listOfflineCustomers(tenantId?: string | null): Promise<OfflineApiResult> {
  const tid = tenantId ?? (await resolveTenantId());
  if (!tid) return { ok: false, status: 400, error: 'missing_tenant', message: 'Tenant-ka lama aqoonsan' };
  return postOffline({ tenant_id: tid, action: 'list' });
}

export async function updateOfflineCustomer(
  input: OfflineRegisterInput & { id?: string },
): Promise<OfflineApiResult> {
  const tid = input.tenantId ?? (await resolveTenantId());
  if (!tid) return { ok: false, status: 400, error: 'missing_tenant', message: 'Tenant-ka lama aqoonsan' };
  const res = await postOffline({
    tenant_id: tid,
    action: 'update',
    ...(input.id ? { id: input.id } : {}),
    sender_phone: normalizePhone(input.senderPhone),
    receiver_phone: normalizePhone(input.receiverPhone),
    ...(input.providerId ? { provider_id: input.providerId } : {}),
    ...(input.providerName ? { provider_name: input.providerName } : {}),
  });
  return { ...res, message: res.ok ? res.message : somaliMessage(res) };
}

export async function deleteOfflineCustomer(
  input: { id?: string; senderPhone?: string; tenantId?: string | null },
): Promise<OfflineApiResult> {
  const tid = input.tenantId ?? (await resolveTenantId());
  if (!tid) return { ok: false, status: 400, error: 'missing_tenant', message: 'Tenant-ka lama aqoonsan' };
  const res = await postOffline({
    tenant_id: tid,
    action: 'delete',
    ...(input.id ? { id: input.id } : {}),
    ...(input.senderPhone ? { sender_phone: normalizePhone(input.senderPhone) } : {}),
  });
  return { ...res, message: res.ok ? res.message : somaliMessage(res) };
}

/** Retries queued registrations. Safe to call on every "back online" event. */
export async function flushOfflineRegistrationQueue(): Promise<{ sent: number; left: number }> {
  const queue = readQueue();
  if (queue.length === 0) return { sent: 0, left: 0 };
  const remaining: QueueItem[] = [];
  let sent = 0;
  for (const item of queue) {
    const res = await registerOfflineCustomer(item, { queueOnFailure: false });
    // 409 already_registered means the row exists upstream — drop it.
    if (res.ok || res.status === 409) sent += 1;
    else if (res.status === 0 || res.status === 429 || res.status >= 500) remaining.push(item);
    // 4xx validation errors are permanent → drop.
  }
  writeQueue(remaining);
  return { sent, left: remaining.length };
}
