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
      .from('tenants').select('current_period_end, plan_id, billing_cycle, monthly_price').eq('id', tenant_id).single()
    if (!tenant) return json({ error: 'tenant not found' }, 404)

    const start = new Date()
    const billingCycle = tenant.billing_cycle === 'monthly' ? 'monthly' : 'yearly'
    const requestedAmount = Number(amount)
    if (!Number.isFinite(requestedAmount) || requestedAmount < 0) {
      return json({ error: 'Invalid payment amount' }, 400)
    }
    if (billingCycle === 'monthly' && requestedAmount !== Number(tenant.monthly_price ?? 15)) {
      return json({ error: 'Monthly renewal amount must be $15' }, 400)
    }
    const days = Number(period_days)
    if (billingCycle !== 'monthly' && (!Number.isInteger(days) || days < 1 || days > 3660)) {
      return json({ error: 'Invalid period days' }, 400)
    }
    const baseline = tenant.current_period_end ? new Date(tenant.current_period_end) : start
    const from = baseline > start ? baseline : start
    const period_end = new Date(from)
    if (billingCycle === 'monthly') {
      // Billing anniversaries use calendar months, never a fixed 30 days.
      const day = period_end.getUTCDate()
      period_end.setUTCDate(1)
      period_end.setUTCMonth(period_end.getUTCMonth() + 1)
      const lastDay = new Date(Date.UTC(period_end.getUTCFullYear(), period_end.getUTCMonth() + 1, 0)).getUTCDate()
      period_end.setUTCDate(Math.min(day, lastDay))
    } else {
      period_end.setUTCDate(period_end.getUTCDate() + days)
    }

    const { error: subscriptionError } = await admin.from('tenant_subscriptions').insert({
      tenant_id,
      plan_id: tenant.plan_id,
      period_start: from.toISOString(),
      period_end: period_end.toISOString(),
      amount,
      payment_method: payment_method ?? 'manual',
      paid_at: start.toISOString(),
      recorded_by: claims.claims.sub,
      notes: billingCycle === 'monthly' ? [notes, 'Monthly renewal - $15'].filter(Boolean).join(' | ') : (notes ?? null),
    })

    if (subscriptionError) return json({ error: subscriptionError.message }, 500)

    const { error: updateError } = await admin
      .from('tenants')
      .update({ current_period_end: period_end.toISOString(), status: 'active' })
      .eq('id', tenant_id)
    if (updateError) return json({ error: updateError.message }, 500)

    return json({ ok: true, period_end: period_end.toISOString(), billing_cycle: billingCycle })
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
