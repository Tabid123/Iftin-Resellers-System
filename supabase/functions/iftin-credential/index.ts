// POST /iftin-credential — super-admin saves/updates/removes the Iftin API key
// for a tenant. The key is never returned to the browser (only masked metadata).
import { adminClient, corsHeaders, iftinFetch, json } from '../_shared/iftin.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4'

async function requireSuperAdmin(req: Request) {
  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader) return false
  const client = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  )
  const { data } = await client.rpc('is_super_admin')
  return data === true
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  if (!(await requireSuperAdmin(req))) {
    return json({ error: 'Super-admin kaliya' }, 403)
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return json({ error: 'JSON body sax ma aha' }, 422)
  }

  const admin = adminClient()
  const tenantId = String(body?.tenant_id ?? '').trim()
  const action = String(body?.action ?? 'save')
  if (!/^[0-9a-f-]{36}$/i.test(tenantId)) return json({ error: 'tenant_id sax ma aha' }, 422)

  if (action === 'status') {
    const { data } = await admin
      .from('iftin_partner_credentials')
      .select('is_active, last_used_at, updated_at, api_key, callback_secret')
      .eq('tenant_id', tenantId)
      .maybeSingle()
    if (!data) return json({ configured: false })
    return json({
      configured: true,
      is_active: data.is_active,
      last_used_at: data.last_used_at,
      updated_at: data.updated_at,
      key_prefix: String(data.api_key).slice(0, 13),
      has_callback_secret: Boolean(data.callback_secret),
    })
  }

  if (action === 'delete') {
    const { error } = await admin
      .from('iftin_partner_credentials')
      .delete()
      .eq('tenant_id', tenantId)
    if (error) return json({ error: error.message }, 500)
    return json({ configured: false, deleted: true })
  }

  if (action === 'test') {
    const { data } = await admin
      .from('iftin_partner_credentials')
      .select('api_key')
      .eq('tenant_id', tenantId)
      .maybeSingle()
    if (!data) return json({ error: 'Key lama dejin' }, 409)
    const { status, body: res } = await iftinFetch(String(data.api_key), '/partner-packages')
    return json({
      ok: status >= 200 && status < 300,
      status,
      count: res?.count ?? null,
      error: res?.error ?? null,
    })
  }

  // action = save
  const apiKey = String(body?.api_key ?? '').trim()
  const callbackSecret = body?.callback_secret ? String(body.callback_secret).trim() : null
  if (apiKey.length < 20) return json({ error: 'API key sax ma aha' }, 422)

  const { error } = await admin.from('iftin_partner_credentials').upsert(
    {
      tenant_id: tenantId,
      api_key: apiKey,
      callback_secret: callbackSecret,
      is_active: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'tenant_id' },
  )
  if (error) return json({ error: error.message }, 500)

  return json({ configured: true, key_prefix: apiKey.slice(0, 13) })
})
