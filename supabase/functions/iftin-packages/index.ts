// GET /iftin-packages?tenant_id=… — proxies Iftin GET /partner-packages (cached 5–10 min).
// The reseller-facing package list comes from Iftin, not from local config.
import { adminClient, corsHeaders, getIftinCredential, iftinFetch, json } from '../_shared/iftin.ts'

type CacheEntry = { at: number; body: any }
const CACHE_TTL_MS = 7 * 60 * 1000
const cache = new Map<string, CacheEntry>()

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'GET') return json({ error: 'Method not allowed' }, 405)

  const url = new URL(req.url)
  const tenantId = (url.searchParams.get('tenant_id') ?? '').trim()
  if (!/^[0-9a-f-]{36}$/i.test(tenantId)) return json({ error: 'tenant_id sax ma aha' }, 422)

  const hit = cache.get(tenantId)
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return json({ cached: true, ...hit.body })
  }

  const admin = adminClient()
  const cred = await getIftinCredential(admin, tenantId)
  if (!cred) return json({ error: 'Iftin API key lama dejin tenant-kan' }, 409)

  const { status, body } = await iftinFetch(cred.api_key, '/partner-packages')
  if (status < 200 || status >= 300) {
    return json({ error: body?.error ?? `Iftin API khalad (${status})` }, status)
  }

  cache.set(tenantId, { at: Date.now(), body })
  return json({ cached: false, ...body })
})
