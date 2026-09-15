// Super-admin only: reset password for a tenant owner
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

function generatePassword(len = 12) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  const arr = new Uint32Array(len)
  crypto.getRandomValues(arr)
  let out = ''
  for (let i = 0; i < len; i++) out += chars[arr[i] % chars.length]
  return out
}

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

  const { data: roles } = await admin
    .from('user_roles')
    .select('role')
    .eq('user_id', claims.claims.sub)
  const isSuper = (roles ?? []).some((r: any) => r.role === 'super_admin')
  if (!isSuper) return json({ error: 'Forbidden' }, 403)

  try {
    const body = await req.json().catch(() => ({}))
    const { tenant_id, password: providedPassword } = body as {
      tenant_id?: string
      password?: string
    }
    if (!tenant_id) return json({ error: 'tenant_id required' }, 400)

    const password =
      providedPassword && providedPassword.length >= 6
        ? providedPassword
        : generatePassword(12)

    // Find tenant owner (or first member)
    const { data: member, error: mErr } = await admin
      .from('tenant_members')
      .select('user_id, role')
      .eq('tenant_id', tenant_id)
      .order('role', { ascending: true })
      .limit(1)
      .maybeSingle()
    if (mErr) return json({ error: mErr.message }, 500)
    if (!member?.user_id) return json({ error: 'Reseller wax owner ah ma laha' }, 404)

    const { data: updated, error: uErr } = await admin.auth.admin.updateUserById(
      member.user_id,
      { password },
    )
    if (uErr) return json({ error: uErr.message }, 500)

    return json({
      success: true,
      email: updated.user?.email ?? null,
      password,
    })
  } catch (e: any) {
    return json({ error: e?.message ?? 'unknown' }, 500)
  }
})
