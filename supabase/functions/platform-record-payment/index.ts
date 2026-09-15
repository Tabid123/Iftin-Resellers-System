// Super-admin only: record a manual payment and extend tenant's period_end
import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
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
  const { data: claims } = await userClient.auth.getClaims(
    authHeader.replace('Bearer ', ''),
  )
  if (!claims?.claims?.sub) return json({ error: 'Unauthorized' }, 401)

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data: roles } = await admin
    .from('user_roles').select('role').eq('user_id', claims.claims.sub)
  if (!(roles ?? []).some((r: any) => r.role === 'super_admin')) {
    return json({ error: 'Forbidden' }, 403)
  }

  try {
    const { tenant_id, amount, payment_method, period_days = 30, notes } =
      await req.json()
    if (!tenant_id || amount == null) {
      return json({ error: 'tenant_id, amount loo baahan yahay' }, 400)
    }

    const { data: tenant } = await admin
      .from('tenants').select('current_period_end, plan_id').eq('id', tenant_id).single()
    if (!tenant) return json({ error: 'tenant not found' }, 404)

    const start = new Date()
    const baseline = tenant.current_period_end
      ? new Date(tenant.current_period_end)
      : start
    const from = baseline > start ? baseline : start
    const period_end = new Date(from.getTime() + period_days * 86400000)

    await admin.from('tenant_subscriptions').insert({
      tenant_id,
      plan_id: tenant.plan_id,
      period_start: start.toISOString(),
      period_end: period_end.toISOString(),
      amount,
      payment_method: payment_method ?? 'manual',
      paid_at: start.toISOString(),
      recorded_by: claims.claims.sub,
      notes: notes ?? null,
    })

    await admin
      .from('tenants')
      .update({ current_period_end: period_end.toISOString(), status: 'active' })
      .eq('id', tenant_id)

    return json({ ok: true, period_end: period_end.toISOString() })
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
