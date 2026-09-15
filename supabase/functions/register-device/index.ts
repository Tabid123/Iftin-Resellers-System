import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface DeviceRegistrationRequest {
  deviceId: string
  deviceName?: string
  sim1Number?: string
  sim2Number?: string
  email?: string
  password?: string
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function normalizeText(value?: string | null): string | null {
  const normalized = value?.trim()
  return normalized ? normalized : null
}

function getProviderFromSimNumber(simNumber?: string | null): string | null {
  const normalized = simNumber?.replace(/^\+/, '')
  if (!normalized) return null
  if (normalized.startsWith('619') || normalized.startsWith('61619') || normalized.startsWith('252619')) return 'hormuud'
  if (normalized.startsWith('615') || normalized.startsWith('61615') || normalized.startsWith('252615')) return 'somnet'
  if (normalized.startsWith('634') || normalized.startsWith('61634') || normalized.startsWith('252634')) return 'somtel'
  if (normalized.startsWith('636') || normalized.startsWith('61636') || normalized.startsWith('252636')) return 'amtel'
  if (normalized.startsWith('680') || normalized.startsWith('61680') || normalized.startsWith('252680')) return 'somlink'
  return 'unknown'
}

async function ensureBalanceRows(supabase: ReturnType<typeof createClient>, androidDeviceId: string, hasSecondSim: boolean) {
  const { data: existingBalances } = await supabase
    .from('sim_balances')
    .select('sim_slot, balance_type')
    .eq('device_id', androidDeviceId)

  const wantedRows = [
    { device_id: androidDeviceId, sim_slot: 1, balance: 0, balance_type: 'evc_plus' },
    { device_id: androidDeviceId, sim_slot: 1, balance: 0, balance_type: 'evoucher' },
    ...(hasSecondSim
      ? [
          { device_id: androidDeviceId, sim_slot: 2, balance: 0, balance_type: 'evc_plus' },
          { device_id: androidDeviceId, sim_slot: 2, balance: 0, balance_type: 'evoucher' },
        ]
      : []),
  ]

  const missingRows = wantedRows.filter((row) =>
    !existingBalances?.some((b) => b.sim_slot === row.sim_slot && b.balance_type === row.balance_type)
  )

  if (!missingRows.length) return
  await supabase.from('sim_balances').insert(missingRows)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')

    if (!supabaseUrl || !supabaseServiceKey || !supabaseAnonKey) {
      return jsonResponse({ error: 'Supabase secrets are missing' }, 500)
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    const requestData: DeviceRegistrationRequest = await req.json()

    const deviceId = normalizeText(requestData.deviceId)
    const deviceName = normalizeText(requestData.deviceName) ?? 'Android Device'
    const sim1Number = normalizeText(requestData.sim1Number)
    const sim2Number = normalizeText(requestData.sim2Number)
    const email = normalizeText(requestData.email)
    const password = requestData.password?.trim() || null

    if (!deviceId) return jsonResponse({ error: 'Device ID is required' }, 400)

    // ====== 1) Find existing device ======
    const { data: existingById } = await supabase
      .from('android_devices')
      .select('*')
      .eq('device_id', deviceId)
      .limit(1)
      .maybeSingle()

    let existingDevice = existingById
    let resolvedTenantId: string | null = existingDevice?.tenant_id ?? null

    // ====== 2) If credentials provided → verify and bind tenant ======
    if (email && password) {
      const authClient = createClient(supabaseUrl, supabaseAnonKey)
      const { data: authData, error: authError } = await authClient.auth.signInWithPassword({
        email,
        password,
      })

      if (authError || !authData?.user) {
        console.error('Auth failed for device registration:', authError?.message)
        return jsonResponse({ error: 'Email ama password khalad ah' }, 401)
      }

      // Look up tenant the user owns/admins
      const { data: membership } = await supabase
        .from('tenant_members')
        .select('tenant_id, role')
        .eq('user_id', authData.user.id)
        .limit(1)
        .maybeSingle()

      if (!membership?.tenant_id) {
        return jsonResponse({ error: 'User-kan reseller uma laha tenant' }, 403)
      }

      // First-time bind, OR mismatch → reject mismatch to prevent stealing
      if (existingDevice?.tenant_id && existingDevice.tenant_id !== membership.tenant_id) {
        return jsonResponse(
          { error: 'Device-kan horey ayaa loogu xidhay reseller kale' },
          409,
        )
      }

      resolvedTenantId = membership.tenant_id
    }

    // ====== 3) Require tenant on new devices ======
    if (!existingDevice && !resolvedTenantId) {
      return jsonResponse(
        { error: 'Email iyo password loo baahan yahay marka ugu horeysa', needsLogin: true },
        401,
      )
    }

    const sim1Provider = getProviderFromSimNumber(sim1Number)
    const sim2Provider = getProviderFromSimNumber(sim2Number)
    const now = new Date().toISOString()

    const payload: Record<string, unknown> = {
      device_id: deviceId,
      device_name: deviceName,
      sim_number: sim1Number ?? existingDevice?.sim_number ?? '',
      sim2_number: sim2Number ?? existingDevice?.sim2_number ?? null,
      provider_name: sim1Provider ?? existingDevice?.provider_name ?? sim2Provider ?? 'unknown',
      sim1_provider: sim1Provider ?? existingDevice?.sim1_provider ?? null,
      sim2_provider: sim2Provider ?? existingDevice?.sim2_provider ?? null,
      last_ping_at: now,
      is_active: true,
      archived_at: null,
    }

    // Set tenant_id on insert, or on an existing device that has no tenant yet
    // (immutable once set, per trigger)
    if (resolvedTenantId && !existingDevice?.tenant_id) {
      payload.tenant_id = resolvedTenantId
    }

    const deviceQuery = existingDevice
      ? supabase.from('android_devices').update(payload).eq('id', existingDevice.id).select().single()
      : supabase.from('android_devices').insert(payload).select().single()

    const { data: androidDevice, error: upsertError } = await deviceQuery

    if (upsertError) {
      console.error('Error saving android device:', upsertError)
      throw upsertError
    }

    await ensureBalanceRows(
      supabase,
      androidDevice.id,
      Boolean(payload.sim2_number || payload.sim2_provider),
    )

    let tenantName: string | null = null
    if (androidDevice.tenant_id) {
      const { data: tenantRow } = await supabase
        .from('tenants')
        .select('name')
        .eq('id', androidDevice.tenant_id)
        .maybeSingle()
      tenantName = tenantRow?.name ?? null
    }

    return jsonResponse({
      success: true,
      device: androidDevice,
      tenantId: androidDevice.tenant_id,
      tenantName,
      message: existingDevice ? 'Device updated successfully' : 'Device registered successfully',
    })
  } catch (error: any) {
    console.error('Error in device registration:', error)
    return jsonResponse({ error: error?.message || 'Internal server error' }, 500)
  }
})
