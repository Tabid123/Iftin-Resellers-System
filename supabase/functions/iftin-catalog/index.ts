// GET /iftin-catalog?tenant_id=… — proxies Iftin GET /partner-catalog.
// We are only a CLIENT of the Iftin Internet API: no local pricing, no key
// generation, no invoicing. The browser never sees the ift_live_… key.
import { adminClient, corsHeaders, getIftinCredential, iftinFetch, json } from '../_shared/iftin.ts'

type CacheEntry = { at: number; body: any }
const CACHE_TTL_MS = 5 * 60 * 1000
const cache = new Map<string, CacheEntry>()

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'GET' && req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  const url = new URL(req.url)
  let tenantId = (
    url.searchParams.get('tenant_id') ?? req.headers.get('x-tenant-id') ?? ''
  ).trim()
  if (!tenantId && req.method === 'POST') {
    try {
      const body = await req.json()
      tenantId = String(body?.tenant_id ?? '').trim()
    } catch { /* ignore */ }
  }

  const force = url.searchParams.get('refresh') === '1'
  const cacheKey = tenantId || '__global__'

  // Missing tenant context/configuration is an expected application state,
  // not an authentication failure. Keep it 2xx so browser error overlays do
  // not turn a recoverable empty catalog into a blank screen.
  if (!tenantId) {
    return json({ error: 'missing_tenant', message: 'Tenant-ka lama aqoonsan' })
  }

  const hit = cache.get(cacheKey)
  if (!force && hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return json({ cached: true, stale: false, ...hit.body })
  }

  // Per-tenant key first (set by super-admin), else the project-wide secret.
  let apiKey: string | null = null
  if (/^[0-9a-f-]{36}$/i.test(tenantId)) {
    const cred = await getIftinCredential(adminClient(), tenantId)
    apiKey = cred?.api_key ?? null
  }
  if (!apiKey) apiKey = Deno.env.get('IFTIN_API_KEY') ?? null

  if (!apiKey) {
    return json({ error: 'missing_api_key', message: 'Iftin API key lama dejin' })
  }

  let status = 0
  let body: any = null
  try {
    const res = await iftinFetch(apiKey, '/partner-catalog')
    status = res.status
    body = res.body
  } catch (_e) {
    // Network error → serve the last known catalog with a stale flag.
    if (hit) return json({ cached: true, stale: true, ...hit.body })
    return json({ error: 'network_error', message: 'Xiriirka Iftin ma shaqeynayo' }, 503)
  }

  if (status === 401) {
    if (hit) return json({ error: body?.error ?? 'invalid_api_key', cached: true, stale: true, ...hit.body }, 200)
    return json({ error: body?.error ?? 'invalid_api_key', message: 'API key-ga waa qaldan yahay' }, 401)
  }
  if (status === 403) {
    return json({ error: 'partner_suspended', message: 'Partner-ka waa la joojiyay (suspended)' }, 403)
  }
  if (status < 200 || status >= 300) {
    if (hit) return json({ cached: true, stale: true, ...hit.body })
    return json({ error: body?.error ?? `iftin_error_${status}`, message: body?.message ?? `Iftin API khalad (${status})` }, status)
  }

  cache.set(cacheKey, { at: Date.now(), body })
  return json({ cached: false, stale: false, ...body })
})
