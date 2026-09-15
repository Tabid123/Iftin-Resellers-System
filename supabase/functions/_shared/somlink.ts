const SOMLINK_BASE = 'https://api.data.somlink.net';
const REQUEST_TIMEOUT_MS = 15000;

export class SomlinkApiError extends Error {
  stage: 'login' | 'send';
  status: number | null;
  response: unknown;

  constructor(stage: 'login' | 'send', message: string, status: number | null = null, response: unknown = null) {
    super(message);
    this.name = 'SomlinkApiError';
    this.stage = stage;
    this.status = status;
    this.response = response;
  }
}

function cleanDigits(value: string) {
  return String(value || '').replace(/\D/g, '');
}

function normalizeReceiver(value: string) {
  const digits = cleanDigits(value);
  return digits.startsWith('252') ? digits : `252${digits}`;
}

function normalizeToken(value: string) {
  return String(value || '').replace(/^Bearer\s+/i, '').trim();
}

async function readJson(response: Response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text.slice(0, 1000) };
  }
}

async function postJson(url: string, body: Record<string, unknown>) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const json = await readJson(response);
    return { response, json };
  } finally {
    clearTimeout(timer);
  }
}

export function sanitizeSomlinkResponse(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeSomlinkResponse);
  if (!value || typeof value !== 'object') return value;

  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (/token|password|secret|authorization/i.test(key)) {
      out[key] = '[redacted]';
    } else {
      out[key] = sanitizeSomlinkResponse(child);
    }
  }
  return out;
}

export async function somlinkLogin(walletPhone: string, password: string) {
  try {
    const { response, json } = await postJson(`${SOMLINK_BASE}/auth/data_v3_login`, {
      phone: String(walletPhone || '').trim(),
      password,
    });

    const body: any = json;
    const token = normalizeToken(
      body?.token ?? body?.access_token ?? body?.data?.token ?? body?.data?.access_token ?? '',
    );

    if (!response.ok || !token) {
      throw new SomlinkApiError(
        'login',
        'Somlink login failed',
        response.status,
        sanitizeSomlinkResponse(json),
      );
    }

    return { token, response: sanitizeSomlinkResponse(json) };
  } catch (error) {
    if (error instanceof SomlinkApiError) throw error;
    const message = error instanceof DOMException && error.name === 'AbortError'
      ? 'Somlink login timed out'
      : 'Somlink login request failed';
    throw new SomlinkApiError('login', message, null, null);
  }
}

export async function somlinkSendData(input: {
  token: string;
  receiverPhone: string;
  walletPhone: string;
  amount: number;
  bundleId: number;
}) {
  try {
    const { response, json } = await postJson(`${SOMLINK_BASE}/data/send_data`, {
      token: normalizeToken(input.token),
      data_phone: normalizeReceiver(input.receiverPhone),
      wallet_phone: cleanDigits(input.walletPhone),
      amount: Number(input.amount),
      bundle_id: Number(input.bundleId),
    });

    const body: any = json;
    const failed = !response.ok
      || body?.success === false
      || ['failed', 'error'].includes(String(body?.status || '').toLowerCase())
      || (body?.code != null && Number(body.code) !== 200);

    if (failed) {
      throw new SomlinkApiError(
        'send',
        'Somlink rejected the bundle delivery',
        response.status,
        sanitizeSomlinkResponse(json),
      );
    }

    return sanitizeSomlinkResponse(json);
  } catch (error) {
    if (error instanceof SomlinkApiError) throw error;
    const message = error instanceof DOMException && error.name === 'AbortError'
      ? 'Somlink delivery timed out'
      : 'Somlink delivery request failed';
    throw new SomlinkApiError('send', message, null, null);
  }
}
