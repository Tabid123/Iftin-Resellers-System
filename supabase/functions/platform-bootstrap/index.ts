// Bootstrap the FIRST super_admin user.
// Only callable when no super_admin exists yet (open one-time setup).
import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Probe mode: GET or empty body → just report whether super_admin exists
    let body: any = {}
    if (req.method === 'POST') {
      try { body = await req.json() } catch { body = {} }
    }
    const isProbe = !body?.email && !body?.password

    if (isProbe) {
      const { count } = await admin
        .from('user_roles')
        .select('user_id', { count: 'exact', head: true })
        .eq('role', 'super_admin')
      return json({ exists: (count ?? 0) > 0 })
    }

    const { email, password } = body
    if (!email || !password || password.length < 8) {
      return json({ error: 'email iyo password (8+) loo baahan yahay' }, 400)
    }


    // Block if a super_admin already exists
    const { count, error: countErr } = await admin
      .from('user_roles')
      .select('user_id', { count: 'exact', head: true })
      .eq('role', 'super_admin')

    if (countErr) return json({ error: countErr.message }, 500)
    if ((count ?? 0) > 0) return json({ error: 'Super admin already exists' }, 403)

    // Create auth user
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })
    if (createErr || !created.user) {
      return json({ error: createErr?.message ?? 'create failed' }, 500)
    }

    // Insert super_admin role
    const { error: roleErr } = await admin
      .from('user_roles')
      .insert({ user_id: created.user.id, role: 'super_admin' })
    if (roleErr) return json({ error: roleErr.message }, 500)

    return json({ ok: true, user_id: created.user.id })
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
