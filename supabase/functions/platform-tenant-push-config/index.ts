import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-tenant-id',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const APP_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

async function requireSuperAdmin(req: Request) {
  const authHeader = req.headers.get('Authorization') || ''
  if (!authHeader.startsWith('Bearer ')) return null

  const url = Deno.env.get('SUPABASE_URL') || ''
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  if (!url || !anonKey || !serviceKey) return null

  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const token = authHeader.slice('Bearer '.length).trim()
  const { data: claims } = await userClient.auth.getClaims(token)
  const userId = String(claims?.claims?.sub || '')
  if (!userId) return null

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: role } = await admin
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .eq('role', 'super_admin')
    .maybeSingle()

  return role ? { admin, userId } : null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const auth = await requireSuperAdmin(req)
  if (!auth) return json({ error: 'super_admin_only' }, 403)

  const body = await req.json().catch(() => ({}))
  const tenantId = String(body?.tenant_id || '').trim()
  const action = String(body?.action || 'status').trim().toLowerCase()

  if (!UUID_RE.test(tenantId)) return json({ error: 'invalid_tenant' }, 400)

  const { data: tenant } = await auth.admin
    .from('tenants')
    .select('id,name,slug')
    .eq('id', tenantId)
    .maybeSingle()
  if (!tenant) return json({ error: 'tenant_not_found' }, 404)

  const { data: existing, error: existingError } = await auth.admin
    .from('tenant_push_config')
    .select('tenant_id,onesignal_app_id,rest_api_key_secret_id,enabled,updated_at')
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (existingError) return json({ error: existingError.message }, 500)

  if (action === 'status') {
    return json({
      configured: Boolean(existing?.onesignal_app_id),
      tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug },
      onesignal_app_id: existing?.onesignal_app_id || '',
      enabled: existing?.enabled !== false,
      has_rest_api_key: Boolean(existing?.rest_api_key_secret_id),
      updated_at: existing?.updated_at || null,
    })
  }

  if (action !== 'save') return json({ error: 'unsupported_action' }, 400)

  const appId = String(body?.onesignal_app_id || '').trim().toLowerCase()
  const apiKey = String(body?.rest_api_key || '').trim()
  const enabled = body?.enabled !== false

  if (!APP_ID_RE.test(appId)) {
    return json({ error: 'invalid_onesignal_app_id' }, 422)
  }

  if (apiKey) {
    if (apiKey.length < 8) return json({ error: 'invalid_rest_api_key' }, 422)
    const { error } = await auth.admin.rpc('set_tenant_push_config', {
      p_tenant_id: tenantId,
      p_onesignal_app_id: appId,
      p_rest_api_key: apiKey,
      p_enabled: enabled,
    })
    if (error) return json({ error: error.message }, 500)
  } else {
    if (!existing?.rest_api_key_secret_id) {
      return json({ error: 'rest_api_key_required' }, 422)
    }
    const { error } = await auth.admin
      .from('tenant_push_config')
      .update({
        onesignal_app_id: appId,
        enabled,
        updated_at: new Date().toISOString(),
      })
      .eq('tenant_id', tenantId)
    if (error) return json({ error: error.message }, 500)
  }

  const { data: saved } = await auth.admin
    .from('tenant_push_config')
    .select('onesignal_app_id,rest_api_key_secret_id,enabled,updated_at')
    .eq('tenant_id', tenantId)
    .maybeSingle()

  return json({
    success: true,
    configured: true,
    onesignal_app_id: saved?.onesignal_app_id || appId,
    enabled: saved?.enabled !== false,
    has_rest_api_key: Boolean(saved?.rest_api_key_secret_id),
    updated_at: saved?.updated_at || new Date().toISOString(),
  })
})
