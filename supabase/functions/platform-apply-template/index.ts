import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401)

  const url = Deno.env.get('SUPABASE_URL')!
  const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: claims } = await userClient.auth.getClaims(authHeader.slice(7))
  if (!claims?.claims?.sub) return json({ error: 'Unauthorized' }, 401)

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data: roles } = await admin.from('user_roles').select('role')
    .eq('user_id', claims.claims.sub)
  if (!(roles ?? []).some((r: any) => r.role === 'super_admin')) {
    return json({ error: 'Forbidden' }, 403)
  }

  try {
    const { tenant_id, template_key } = await req.json()
    if (!tenant_id || template_key !== 'xog-dhameystiran-iftin') {
      return json({ error: 'tenant_id iyo template sax ah ayaa loo baahan yahay' }, 400)
    }
    const { data, error } = await admin.rpc('apply_master_template_to_tenant', {
      p_tenant_id: tenant_id,
      p_template_key: template_key,
    })
    if (error) return json({ error: error.message }, 400)
    return json({ ok: true, result: data })
  } catch (e) {
    return json({ error: (e as Error).message }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
