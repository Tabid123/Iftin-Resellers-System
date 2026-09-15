// Super-admin only: create a new tenant + owner auth user + member + initial subscription
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

  // verify super_admin
  const { data: roles } = await admin
    .from('user_roles')
    .select('role')
    .eq('user_id', claims.claims.sub)
  const isSuper = (roles ?? []).some((r: any) => r.role === 'super_admin')
  if (!isSuper) return json({ error: 'Forbidden' }, 403)

  try {
    const body = await req.json()
    const {
      slug,
      name,
      owner_email,
      owner_password,
      plan_id,
      primary_color,
      support_phone,
      logo_url,
      period_days = 30,
      delivery_mode = 'android_device',
      delivery_tenant_id = null,
      credit_limit = 0,
      daily_limit = 0,
      prepare_data = false,
      template_key = null,
    } = body



    if (!slug || !name || !owner_email || !owner_password) {
      return json({ error: 'slug, name, owner_email, owner_password loo baahan yahay' }, 400)
    }
    if (!/^[a-z0-9-]{2,30}$/.test(slug)) {
      return json({ error: 'slug must be 2-30 chars, lowercase a-z, 0-9, -' }, 400)
    }
    const reserved = ['admin', 'www', 'api', 'app', 'mail', 'status']
    if (reserved.includes(slug)) return json({ error: 'slug is reserved' }, 400)

    // 1) tenant
    const { data: tenant, error: tErr } = await admin
      .from('tenants')
      .insert({
        slug,
        name,
        primary_color: primary_color ?? null,
        support_phone: support_phone ? String(support_phone).replace(/\D/g, '').slice(-9) : null,
        logo_url: logo_url ?? null,
        plan_id: plan_id ?? null,
        status: 'active',
        delivery_mode: delivery_mode === 'api_partner' ? 'api_partner' : 'android_device',
        delivery_tenant_id: delivery_mode === 'api_partner' ? (delivery_tenant_id ?? null) : null,
        credit_limit: Number(credit_limit) || 0,
        daily_limit: Number(daily_limit) || 0,
        current_period_end: new Date(Date.now() + period_days * 86400000).toISOString(),



      })
      .select()
      .single()
    if (tErr || !tenant) return json({ error: tErr?.message ?? 'tenant insert failed' }, 500)

    // 2) auth user
    const { data: u, error: uErr } = await admin.auth.admin.createUser({
      email: owner_email,
      password: owner_password,
      email_confirm: true,
    })
    if (uErr || !u.user) {
      await admin.from('tenants').delete().eq('id', tenant.id)
      return json({ error: uErr?.message ?? 'owner create failed' }, 500)
    }

    // 3) tenant member (owner)
    const { error: mErr } = await admin.from('tenant_members').insert({
      tenant_id: tenant.id,
      user_id: u.user.id,
      role: 'owner',
    })
    if (mErr) return json({ error: mErr.message }, 500)

    // 4) initial subscription record (zero-amount activation)
    if (plan_id) {
      const { data: plan } = await admin
        .from('subscription_plans')
        .select('price_monthly')
        .eq('id', plan_id)
        .single()
      await admin.from('tenant_subscriptions').insert({
        tenant_id: tenant.id,
        plan_id,
        period_start: new Date().toISOString(),
        period_end: tenant.current_period_end,
        amount: plan?.price_monthly ?? 0,
        payment_method: 'initial',
        paid_at: new Date().toISOString(),
        recorded_by: claims.claims.sub,
      })
    }

    // 5) Optional independent tenant copy from a ready Master Template.
    let template_result = null
    if (prepare_data === true) {
      if (template_key !== 'xog-dhameystiran-iftin') {
        await admin.auth.admin.deleteUser(u.user.id)
        await admin.from('tenants').delete().eq('id', tenant.id)
        return json({ error: 'template_not_allowed' }, 400)
      }
      const { data: cloned, error: cloneErr } = await admin.rpc(
        'apply_master_template_to_tenant',
        { p_tenant_id: tenant.id, p_template_key: template_key },
      )
      if (cloneErr) {
        await admin.auth.admin.deleteUser(u.user.id)
        await admin.from('tenants').delete().eq('id', tenant.id)
        return json({ error: cloneErr.message }, 500)
      }
      template_result = cloned
    }

    return json({ ok: true, tenant, template_result })
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
