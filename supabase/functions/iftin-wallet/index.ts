// Reseller wallet (faa'iidada) — proxies Iftin's wallet & payout endpoints.
//
// GET  /iftin-wallet?tenant_id=…              → GET  /partner-wallet
// POST /iftin-wallet?tenant_id=…              → POST /partner-wallet (payout settings)
// POST /iftin-wallet?tenant_id=…&action=payout → POST /partner-payout
//
// Wallet-ka waa xog dhaqaale — waa in la galo (signed in) oo la yahay xubin
// tenant-ka ama super-admin.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4'
import { adminClient, corsHeaders, getIftinCredential, iftinFetch, json } from '../_shared/iftin.ts'

const UUID_RE = /^[0-9a-f-]{36}$/i

async function authorize(req: Request, tenantId: string): Promise<string | null> {
  const authHeader = req.headers.get('Authorization') ?? ''
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!token) return 'Unauthorized'

  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  )
  const { data: claims } = await userClient.auth.getClaims(token)
  const userId = claims?.claims?.sub
  if (!userId) return 'Unauthorized'

  const admin = adminClient()
  const { data: roles } = await admin.from('user_roles').select('role').eq('user_id', userId)
  if ((roles ?? []).some((r: any) => r.role === 'super_admin')) return null

  const { data: member } = await admin
    .from('tenant_members')
    .select('tenant_id')
    .eq('user_id', userId)
    .eq('tenant_id', tenantId)
    .maybeSingle()
  return member ? null : 'Forbidden'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  const url = new URL(req.url)
  const tenantId = (url.searchParams.get('tenant_id') ?? '').trim()
  if (!UUID_RE.test(tenantId)) {
    return json({ error: 'invalid_tenant', message: 'tenant_id sax ma aha' }, 422)
  }

  const denied = await authorize(req, tenantId)
  if (denied) return json({ error: denied.toLowerCase() }, denied === 'Forbidden' ? 403 : 401)

  const admin = adminClient()
  const cred = await getIftinCredential(admin, tenantId)
  if (!cred) {
    return json({ error: 'missing_api_key', message: 'Iftin API key lama dejin tenant-kan' }, 409)
  }

  let path = '/partner-wallet'
  let init: RequestInit = { method: 'GET' }

  if (req.method === 'POST') {
    let body: any = {}
    try {
      body = (await req.json()) ?? {}
    } catch {
      body = {}
    }
    if ((url.searchParams.get('action') ?? '') === 'payout') {
      path = '/partner-payout'
      const amount = Number(body?.amount)
      init = {
        method: 'POST',
        body: JSON.stringify(Number.isFinite(amount) && amount > 0 ? { amount } : {}),
      }
    } else {
      init = {
        method: 'POST',
        body: JSON.stringify({
          payout_phone: String(body?.payout_phone ?? '').trim(),
          payout_method: String(body?.payout_method ?? 'evc').trim().toLowerCase(),
          auto_payout_enabled: Boolean(body?.auto_payout_enabled),
          min_payout_amount: Number(body?.min_payout_amount ?? 1),
        }),
      }
    }
  } else if (req.method !== 'GET') {
    return json({ error: 'method_not_allowed' }, 405)
  }

  const { status, body } = await iftinFetch(cred.api_key, path, init)
  if (status < 200 || status >= 300) {
    return json(
      {
        error: body?.error ?? 'iftin_error',
        message: body?.message ?? `Iftin API khalad (${status})`,
        iftin_status: status,
        details: body,
      },
      status,
    )
  }
  return json(body ?? {})
})
