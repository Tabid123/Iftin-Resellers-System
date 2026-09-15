// GET /iftin-status?external_ref=... — polls Iftin GET /partner-status and syncs the local order.
import { adminClient, corsHeaders, getIftinCredential, iftinStatus, json } from '../_shared/iftin.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  const url = new URL(req.url)
  let externalRef = (url.searchParams.get('external_ref') ?? '').trim()
  if (!externalRef && req.method === 'POST') {
    try {
      const b = await req.json()
      externalRef = String(b?.external_ref ?? '').trim()
    } catch { /* ignore */ }
  }
  if (!externalRef) return json({ error: 'external_ref waa waajib' }, 422)

  const admin = adminClient()
  const { data: ledger } = await admin
    .from('partner_orders_ledger')
    .select('id, tenant_id, order_id, amount, billable')
    .eq('external_ref', externalRef)
    .maybeSingle()

  if (!ledger?.tenant_id) return json({ error: 'external_ref lama helin' }, 404)

  const cred = await getIftinCredential(admin, ledger.tenant_id)
  if (!cred) return json({ error: 'Iftin API key lama dejin' }, 409)

  const { status, body } = await iftinStatus(cred.api_key, externalRef)
  console.log(`[iftin-status] ${externalRef} -> ${status}`, JSON.stringify(body).slice(0, 800))

  if (status < 200 || status >= 300) {
    return json({ error: body?.error ?? `Iftin API khalad (${status})`, status, body }, status)
  }

  const s = String(body?.status ?? '').toLowerCase()
  const failed = s === 'failed' || s === 'cancelled'
  const completed = s === 'completed' || s === 'delivered'

  await admin
    .from('partner_orders_ledger')
    .update({
      status: failed ? 'failed' : completed ? 'completed' : 'pending',
      billable: failed ? 0 : Number(ledger.billable ?? ledger.amount),
    })
    .eq('id', ledger.id)

  if (ledger.order_id && (failed || completed)) {
    await admin
      .from('orders')
      .update({
        status: failed ? 'failed' : 'completed',
        delivery_status: failed ? 'failed' : 'delivered',
        delivery_notes: body?.message ?? `Iftin status: ${s}`,
        ...(completed ? { delivered_at: new Date().toISOString() } : {}),
      })
      .eq('id', ledger.order_id)
      .eq('tenant_id', ledger.tenant_id)
  }

  if (failed && Number(ledger.billable) > 0) {
    await admin.rpc('adjust_tenant_balance', {
      _tenant_id: ledger.tenant_id,
      _delta: -Number(ledger.billable),
    })
  }

  return json({ external_ref: externalRef, status: s, iftin: body })
})
