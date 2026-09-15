// Iftin "Prepaid Intent" — device-less payments.
//
// POST /iftin-intent  → creates the local order + POST /partner-payment-intent
//                       and returns payment_number + ussd_code for the customer.
// GET  /iftin-intent?external_ref=… (ama ?intent_id=) → GET /partner-intent-status
//                       oo dalabka maxalliga ah la sync-gareeyo.
//
// Iftin ayaa SMS-ka akhrinaya oo xirmada gaarsiinaya — MA JIRTO partner-order
// wicitaan, mana jirto delivery_queue maxalli ah.
import { adminClient, corsHeaders, getIftinCredential, iftinFetch, json, normalizePhone } from '../_shared/iftin.ts'

function callbackUrl() {
  return `${Deno.env.get('SUPABASE_URL')}/functions/v1/iftin-callback`
}

const UUID_RE = /^[0-9a-f-]{36}$/i

async function createIntent(req: Request) {
  let body: any
  try {
    body = await req.json()
  } catch {
    return json({ error: 'invalid_body', message: 'JSON body sax ma aha' }, 422)
  }

  const tenantId = String(body?.tenant_id ?? '').trim()
  if (!UUID_RE.test(tenantId)) {
    return json({ error: 'invalid_tenant', message: 'tenant_id sax ma aha' }, 422)
  }

  const receiverPhone = normalizePhone(String(body?.receiver_phone ?? ''))
  const senderPhone = normalizePhone(String(body?.sender_phone ?? ''))
  const packageId = String(body?.package_id ?? '').trim()
  const paymentProvider = String(body?.payment_provider ?? '').trim().toLowerCase()

  if (!receiverPhone || !senderPhone || !packageId || !paymentProvider) {
    return json(
      {
        error: 'missing_fields',
        message: 'receiver_phone, sender_phone, package_id, payment_provider waa waajib',
      },
      422,
    )
  }

  const admin = adminClient()
  const cred = await getIftinCredential(admin, tenantId)
  if (!cred) {
    return json({ error: 'missing_api_key', message: 'Iftin API key lama dejin tenant-kan' }, 409)
  }

  // Tenant-scoped, unique per order → Iftin treats a repeat as idempotent.
  const orderId = crypto.randomUUID()
  const externalRef = String(body?.external_ref ?? '').trim() || `t${tenantId}-${orderId}`

  const payload = {
    external_ref: externalRef,
    receiver_phone: receiverPhone,
    sender_phone: senderPhone,
    package_id: packageId,
    payment_provider: paymentProvider,
    callback_url: callbackUrl(),
  }
  console.log('[iftin] POST /partner-payment-intent payload', JSON.stringify(payload))

  const { status, body: res } = await iftinFetch(cred.api_key, '/partner-payment-intent', {
    method: 'POST',
    body: JSON.stringify(payload),
  })

  admin
    .from('iftin_partner_credentials')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', cred.id)
    .then(() => {})

  if (status < 200 || status >= 300) {
    return json(
      {
        error: res?.error ?? 'iftin_error',
        message: res?.message ?? res?.error ?? `Iftin API khalad (${status})`,
        iftin_status: status,
        details: res,
      },
      status,
    )
  }

  const amount = Number(res?.amount ?? 0)
  const basePrice = Number(res?.base_price ?? 0)

  // Order-ka maxalliga ah: weligeed "completed" lama dhigo halkan — kaliya
  // marka partner-intent-status uu yiraahdo delivered.
  await admin.from('orders').insert({
    id: orderId,
    tenant_id: tenantId,
    customer_phone: String(body?.customer_phone ?? senderPhone),
    sender_phone: senderPhone,
    receiver_phone: receiverPhone,
    package_id: UUID_RE.test(packageId) ? packageId : null,
    provider_id: UUID_RE.test(String(body?.provider_id ?? '')) ? body.provider_id : null,
    package_name: String(body?.package_name ?? 'Data Package'),
    data_amount: body?.data_amount ?? null,
    selling_price: amount,
    cost_price: basePrice,
    payment_number: res?.payment_number ?? null,
    payment_source: paymentProvider,
    status: 'pending_payment',
    delivery_status: 'awaiting_payment',
    delivery_notes: `Iftin intent ${res?.intent_id ?? '—'} (expires ${res?.expires_at ?? '—'})`,
    external_ref: externalRef,
    source: 'iftin_intent',
  })

  const { error: lErr } = await admin.from('partner_orders_ledger').insert({
    tenant_id: tenantId,
    order_id: orderId,
    external_ref: externalRef,
    amount,
    billable: basePrice,
    status: 'pending',
  })
  if (lErr && !/duplicate|unique/i.test(lErr.message)) {
    console.error('[iftin] ledger insert failed:', lErr.message)
  }

  return json(
    {
      created: true,
      order_id: orderId,
      external_ref: externalRef,
      intent_id: res?.intent_id ?? null,
      amount,
      base_price: basePrice,
      your_profit: Number(res?.your_profit ?? Math.max(0, amount - basePrice)),
      payment_number: res?.payment_number ?? null,
      ussd_code: res?.ussd_code ?? null,
      expires_at: res?.expires_at ?? null,
      sender_phone: senderPhone,
    },
    201,
  )
}

async function intentStatus(req: Request) {
  const url = new URL(req.url)
  const externalRef = (url.searchParams.get('external_ref') ?? '').trim()
  const intentId = (url.searchParams.get('intent_id') ?? '').trim()
  let tenantId = (url.searchParams.get('tenant_id') ?? '').trim()

  if (!externalRef && !intentId) {
    return json({ error: 'missing_ref', message: 'external_ref ama intent_id waa waajib' }, 422)
  }

  const admin = adminClient()

  const { data: ledger } = externalRef
    ? await admin
        .from('partner_orders_ledger')
        .select('id, tenant_id, order_id, amount, billable')
        .eq('external_ref', externalRef)
        .maybeSingle()
    : { data: null as any }

  if (!tenantId && ledger?.tenant_id) tenantId = ledger.tenant_id
  if (!UUID_RE.test(tenantId)) {
    return json({ error: 'invalid_tenant', message: 'tenant_id lama helin' }, 422)
  }

  const cred = await getIftinCredential(admin, tenantId)
  if (!cred) {
    return json({ error: 'missing_api_key', message: 'Iftin API key lama dejin' }, 409)
  }

  const qs = externalRef
    ? `external_ref=${encodeURIComponent(externalRef)}`
    : `intent_id=${encodeURIComponent(intentId)}`
  const { status, body } = await iftinFetch(cred.api_key, `/partner-intent-status?${qs}`, {
    method: 'GET',
  })

  if (status < 200 || status >= 300) {
    return json(
      {
        error: body?.error ?? 'iftin_error',
        message: body?.message ?? `Iftin API khalad (${status})`,
        iftin_status: status,
        details: body,
      },
      status,
    )
  }

  const s = String(body?.status ?? '').toLowerCase()
  const delivered = s === 'delivered'
  const failed = s === 'failed' || s === 'expired'

  if (ledger?.id) {
    await admin
      .from('partner_orders_ledger')
      .update({
        status: delivered ? 'completed' : failed ? 'failed' : 'pending',
        billable: failed ? 0 : Number(ledger.billable ?? ledger.amount),
      })
      .eq('id', ledger.id)
  }

  if (ledger?.order_id) {
    const patch: Record<string, unknown> = {
      delivery_status: delivered
        ? 'delivered'
        : failed
          ? 'failed'
          : s === 'delivering'
            ? 'processing'
            : s === 'matched'
              ? 'processing'
              : 'awaiting_payment',
      delivery_notes: body?.notes ?? `Iftin intent: ${s}`,
    }
    // Dalabku "completed" wuxuu noqonayaa KALIYA marka Iftin yiraahdo delivered.
    if (delivered) {
      patch.status = 'completed'
      patch.delivered_at = new Date().toISOString()
    } else if (failed) {
      patch.status = 'failed'
    }
    await admin.from('orders').update(patch).eq('id', ledger.order_id).eq('tenant_id', tenantId)
  }

  return json({
    external_ref: externalRef || null,
    intent_id: body?.intent_id ?? intentId ?? null,
    status: s,
    delivery_status: body?.delivery_status ?? null,
    order_id: ledger?.order_id ?? body?.order_id ?? null,
    notes: body?.notes ?? null,
    iftin: body,
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method === 'POST') return await createIntent(req)
  if (req.method === 'GET') return await intentStatus(req)
  return json({ error: 'method_not_allowed' }, 405)
})
