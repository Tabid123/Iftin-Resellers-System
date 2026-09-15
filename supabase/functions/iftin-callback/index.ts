// POST /iftin-callback — webhook receiver for Iftin order status changes.
// verify_jwt = false; authenticity comes from the HMAC-SHA256 X-Signature header
// computed over the RAW body with the tenant's Iftin callback secret.
import { adminClient, corsHeaders, hmacSha256Hex, json, safeEqual } from '../_shared/iftin.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const raw = await req.text()
  const signature = (req.headers.get('x-signature') ?? '').trim().replace(/^sha256=/, '')
  if (!signature) return json({ error: 'X-Signature waa waajib' }, 401)

  let payload: any
  try {
    payload = JSON.parse(raw)
  } catch {
    return json({ error: 'JSON body sax ma aha' }, 422)
  }

  const externalRef = String(payload?.external_ref ?? '').trim()
  if (!externalRef) return json({ error: 'external_ref waa waajib' }, 422)

  const admin = adminClient()

  const { data: ledger } = await admin
    .from('partner_orders_ledger')
    .select('id, tenant_id, order_id, amount, billable, status')
    .eq('external_ref', externalRef)
    .maybeSingle()

  if (!ledger) return json({ error: 'external_ref lama helin' }, 404)

  const { data: cred } = await admin
    .from('iftin_partner_credentials')
    .select('callback_secret')
    .eq('tenant_id', ledger.tenant_id)
    .maybeSingle()

  if (!cred?.callback_secret) return json({ error: 'Callback secret lama dejin' }, 401)

  const expected = await hmacSha256Hex(raw, cred.callback_secret)
  if (!safeEqual(expected, signature.toLowerCase())) {
    return json({ error: 'Saxeexa sax ma aha' }, 401)
  }

  // Iftin statuses: pending | processing | completed | failed
  const status = String(payload?.status ?? '').toLowerCase()
  const failed = status === 'failed' || status === 'cancelled'
  const completed = status === 'completed' || status === 'delivered'

  await admin
    .from('partner_orders_ledger')
    .update({
      status: failed ? 'failed' : completed ? 'completed' : 'pending',
      billable: failed ? 0 : Number(ledger.amount),
    })
    .eq('id', ledger.id)

  if (ledger.order_id) {
    await admin
      .from('orders')
      .update({
        status: failed ? 'failed' : 'completed',
        delivery_status: failed ? 'failed' : completed ? 'delivered' : 'processing',
        delivery_notes: payload?.message ?? `Iftin webhook: ${status}`,
        ...(completed ? { delivered_at: new Date().toISOString() } : {}),
      })
      .eq('id', ledger.order_id)
      .eq('tenant_id', ledger.tenant_id)
  }

  // Refund the postpaid balance once, only when it was still billable.
  if (failed && Number(ledger.billable) > 0) {
    await admin.rpc('adjust_tenant_balance', {
      _tenant_id: ledger.tenant_id,
      _delta: -Number(ledger.billable),
    })
  }

  return json({ received: true })
})
