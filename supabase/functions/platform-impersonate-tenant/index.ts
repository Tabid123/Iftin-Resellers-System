// Super-admin only: generate a one-time magic link for a tenant owner
// so the platform owner can impersonate the reseller's dashboard.
import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401)

  const url = Deno.env.get('SUPABASE_URL')!
  const token = authHeader.replace('Bearer ', '')

  const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: claims } = await userClient.auth.getClaims(token)
  if (!claims?.claims?.sub) return json({ error: 'Unauthorized' }, 401)

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  // Verify super_admin
  const { data: roles } = await admin
    .from('user_roles')
    .select('role')
    .eq('user_id', claims.claims.sub)
  const isSuper = (roles ?? []).some((r: any) => r.role === 'super_admin')
  if (!isSuper) return json({ error: 'Forbidden' }, 403)

  try {
    const { tenant_id, redirect_to } = await req.json().catch(() => ({}))
    if (!tenant_id) return json({ error: 'tenant_id required' }, 400)

    // 1. Find tenant + owner
    const { data: tenant, error: tErr } = await admin
      .from('tenants')
      .select('id, slug')
      .eq('id', tenant_id)
      .single()
    if (tErr || !tenant) return json({ error: 'tenant not found' }, 404)

    const { data: member, error: mErr } = await admin
      .from('tenant_members')
      .select('user_id, role')
      .eq('tenant_id', tenant_id)
      .order('role', { ascending: true })
      .limit(1)
      .maybeSingle()
    if (mErr) return json({ error: mErr.message }, 500)
    if (!member?.user_id) return json({ error: 'Reseller wax owner ah ma laha' }, 404)

    const { data: ownerUser, error: oErr } = await admin.auth.admin.getUserById(member.user_id)
    if (oErr || !ownerUser.user?.email) return json({ error: 'owner email lama helin' }, 404)

    // 2. Generate magic link for owner
    const finalRedirect = redirect_to || `/t/${tenant.slug}/providers`
    const { data: linkData, error: lErr } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email: ownerUser.user.email,
      options: { redirectTo: finalRedirect },
    })
    if (lErr || !linkData) return json({ error: lErr?.message ?? 'link failed' }, 500)

    // 3. Audit log
    await admin.from('audit_logs').insert({
      action: 'impersonate_tenant',
      actor_id: claims.claims.sub,
      tenant_id,
      details: { owner_email: ownerUser.user.email, owner_id: member.user_id },
    }).then(() => {}, () => {}) // ignore if audit_logs schema differs

    return json({
      success: true,
      action_link: linkData.properties?.action_link,
      owner_email: ownerUser.user.email,
      tenant_slug: tenant.slug,
    })
  } catch (e: any) {
    return json({ error: e?.message ?? 'unknown' }, 500)
  }
})
