// This SaaS is a CLIENT of the Iftin Internet Partner API.
// Iftin owns the keys, pricing, limits, delivery engine and invoicing.
// We only store the key Iftin gave us (per tenant) and forward orders.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4'

export const IFTIN_BASE = 'https://tsjqvhddjfuecwxpcuil.supabase.co/functions/v1'

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-signature, x-tenant-id',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

export function adminClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
}

export function callbackUrl() {
  return `${Deno.env.get('SUPABASE_URL')}/functions/v1/iftin-callback`
}

export function normalizePhone(phone: string): string {
  let p = (phone || '').replace(/^\+/, '').replace(/\D/g, '')
  if (p.startsWith('252')) p = p.substring(3)
  return p.slice(-9)
}

export type IftinCredential = {
  id: string
  tenant_id: string
  api_key: string
  callback_secret: string | null
}

/** Reads the Iftin key for a tenant. Server-side only (service role). */
export async function getIftinCredential(
  admin: ReturnType<typeof adminClient>,
  tenantId: string,
): Promise<IftinCredential | null> {
  const { data } = await admin
    .from('iftin_partner_credentials')
    .select('id, tenant_id, api_key, callback_secret')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .maybeSingle()
  return (data as IftinCredential) ?? null
}

export async function hmacSha256Hex(body: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/** Constant-time compare of two hex strings. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/**
 * Calls the Iftin API with this tenant's key.
 * ONLY X-API-Key is sent — never apikey / Authorization (Iftin rejects those).
 * Every response is logged (status + body) so 401/422 is visible in the logs.
 */
export async function iftinFetch(
  apiKey: string,
  path: string,
  init: RequestInit = {},
): Promise<{ status: number; body: any }> {
  const headers = new Headers(init.headers ?? {})
  headers.delete('apikey')
  headers.delete('Authorization')
  headers.set('X-API-Key', apiKey)
  headers.set('Content-Type', 'application/json')

  const res = await fetch(`${IFTIN_BASE}${path}`, { ...init, headers })
  let body: any = null
  const text = await res.text()
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = { raw: text }
  }
  console.log(
    `[iftin] ${init.method ?? 'GET'} ${path} -> ${res.status} ${JSON.stringify(body).slice(0, 800)}`,
  )
  return { status: res.status, body }
}

/** GET /partner-status?external_ref=... — poll an order's status at Iftin. */
export async function iftinStatus(
  apiKey: string,
  externalRef: string,
): Promise<{ status: number; body: any }> {
  return await iftinFetch(
    apiKey,
    `/partner-status?external_ref=${encodeURIComponent(externalRef)}`,
    { method: 'GET' },
  )
}
