import { useEffect, useState } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from '@/hooks/use-toast'
import { Loader2, KeyRound, Trash2, PlugZap, BookOpen } from 'lucide-react'

type Props = { tenant: any; onRefresh: () => void }

const IFTIN_BASE = 'https://tsjqvhddjfuecwxpcuil.supabase.co/functions/v1'
const OUR_CALLBACK = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/iftin-callback`

function DocBlock({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border p-3 space-y-1">
      <div className="text-xs font-semibold">{title}</div>
      <pre className="text-[11px] whitespace-pre-wrap break-all text-muted-foreground">{body}</pre>
    </div>
  )
}

export default function PartnerApiTab({ tenant, onRefresh }: Props) {
  const [cred, setCred] = useState<any>({ configured: false })
  const [orders, setOrders] = useState<any[]>([])
  const [invoices, setInvoices] = useState<any[]>([])
  const [apiKey, setApiKey] = useState('')
  const [callbackSecret, setCallbackSecret] = useState('')
  const [busy, setBusy] = useState(false)
  const [mode, setMode] = useState<string>(tenant.delivery_mode ?? 'android_device')
  const [catalog, setCatalog] = useState<any>(null)

  const callCred = async (payload: any) => {
    const { data, error } = await supabase.functions.invoke('iftin-credential', {
      body: { tenant_id: tenant.id, ...payload },
    })
    if (error || (data as any)?.error) {
      throw new Error((data as any)?.error ?? error?.message ?? 'Khalad')
    }
    return data as any
  }

  const load = async () => {
    if ((tenant.delivery_mode ?? 'android_device') !== 'api_partner') {
      setOrders([]); setInvoices([]); setCatalog(null); setCred({ configured: false })
      return
    }
    const [o, i] = await Promise.all([
      supabase.from('partner_orders_ledger').select('*')
        .eq('tenant_id', tenant.id).order('created_at', { ascending: false }).limit(50),
      supabase.from('partner_invoices').select('*')
        .eq('tenant_id', tenant.id).order('invoice_date', { ascending: false }).limit(30),
    ])
    setOrders(o.data ?? []); setInvoices(i.data ?? [])
    // Credit state comes from Iftin's catalog — Iftin owns these numbers.
    try {
      const { data: cat } = await supabase.functions.invoke(
        `iftin-catalog?tenant_id=${tenant.id}`, { method: 'GET' },
      )
      setCatalog(cat ?? null)
    } catch {
      setCatalog(null)
    }
    try {
      setCred(await callCred({ action: 'status' }))
    } catch {
      setCred({ configured: false })
    }
  }
  useEffect(() => { load() }, [tenant.id])
  useEffect(() => { setMode(tenant.delivery_mode ?? 'android_device') }, [tenant.delivery_mode])

  const saveMode = async () => {
    setBusy(true)
    const { error } = await supabase.from('tenants').update({ delivery_mode: mode }).eq('id', tenant.id)
    setBusy(false)
    if (error) return toast({ title: 'Khalad', description: error.message, variant: 'destructive' })
    toast({ title: '✅ Delivery mode la keydiyay' })
    onRefresh()
  }

  const saveKey = async () => {
    setBusy(true)
    try {
      await callCred({ action: 'save', api_key: apiKey.trim(), callback_secret: callbackSecret.trim() || null })
      setApiKey(''); setCallbackSecret('')
      toast({ title: '✅ Key-ga Iftin waa la keydiyay (secret ahaan)' })
      load()
    } catch (e: any) {
      toast({ title: 'Khalad', description: e.message, variant: 'destructive' })
    } finally { setBusy(false) }
  }

  const testKey = async () => {
    setBusy(true)
    try {
      const r = await callCred({ action: 'test' })
      toast({
        title: r.ok ? '✅ Key-ga wuu shaqeeyaa' : 'Key-ga wuu diiday',
        description: r.ok ? `Xirmooyin: ${r.count ?? '—'}` : `${r.status}: ${r.error ?? ''}`,
        variant: r.ok ? undefined : 'destructive',
      })
    } catch (e: any) {
      toast({ title: 'Khalad', description: e.message, variant: 'destructive' })
    } finally { setBusy(false) }
  }

  const deleteKey = async () => {
    if (!confirm('Key-ga Iftin la tirtiro? Dalabyada API-ga isla markiiba way joogsanayaan.')) return
    setBusy(true)
    try {
      await callCred({ action: 'delete' })
      toast({ title: 'Key la tirtiray' })
      load()
    } catch (e: any) {
      toast({ title: 'Khalad', description: e.message, variant: 'destructive' })
    } finally { setBusy(false) }
  }

  const markPaid = async (inv: any) => {
    if (!confirm(`Fatuurada ${inv.invoice_date} ($${inv.total_amount}) waa la bixiyay?`)) return
    const { error } = await supabase.from('partner_invoices')
      .update({ status: 'paid', paid_at: new Date().toISOString() }).eq('id', inv.id)
    if (error) return toast({ title: 'Khalad', description: error.message, variant: 'destructive' })
    await supabase.rpc('adjust_tenant_balance', {
      _tenant_id: tenant.id, _delta: -Number(inv.total_amount),
    })
    toast({ title: '✅ Fatuurada waa la xisaabtay' })
    load(); onRefresh()
  }

  const isPartner = mode === 'api_partner'
  const balanceDue = Number(catalog?.balance_due ?? tenant.balance_due ?? 0)
  const creditLimit = Number(catalog?.credit_limit ?? 0)
  const limitReached = creditLimit > 0 && balanceDue >= creditLimit
  const catalogError = catalog?.error as string | undefined
  const catalogErrorText =
    catalogError === 'missing_api_key' || catalogError === 'invalid_api_key'
      ? 'API key-ga waa qaldan yahay'
      : catalogError === 'partner_suspended'
        ? 'Partner-ka waa la joojiyay (suspended)'
        : catalogError
          ? 'Xiriirka Iftin ma shaqeynayo — xogtii hore ayaa la tusayaa'
          : null

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
        <CardTitle>Iftin API (client)</CardTitle>
        <div className="flex items-center gap-2">
          <Badge variant={isPartner ? 'default' : 'secondary'}>
            {isPartner ? 'API Partner' : 'Android Device'}
          </Badge>
          {isPartner && (
            <>
              <Badge variant={cred.configured ? 'default' : 'destructive'}>
                {cred.configured ? `Key: ${cred.key_prefix}…` : 'Key ma jiro'}
              </Badge>
              <Badge variant={balanceDue > 0 ? 'destructive' : 'secondary'}>
                Deyn: ${balanceDue.toFixed(2)}
              </Badge>
              <Badge variant="outline">Credit limit: ${creditLimit.toFixed(2)}</Badge>
              {limitReached && <Badge variant="destructive">Xadka la gaaray — dalab la joojiyay</Badge>}
              {catalog?.stale && <Badge variant="outline">Xog duugoobay (stale)</Badge>}
            </>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isPartner && catalogErrorText && (
          <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {catalogErrorText}
          </div>
        )}

        <div className="grid md:grid-cols-3 gap-3 pb-4 mb-4 border-b items-end">
          <div>
            <Label>Delivery mode</Label>
            <select
              className="mt-1 h-9 w-full rounded-md border bg-background px-3 text-sm"
              value={mode} onChange={e => setMode(e.target.value)}
            >
              <option value="android_device">android_device (APK / SIM / USSD)</option>
              <option value="api_partner">api_partner (Iftin API)</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <Button size="sm" onClick={saveMode} disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Keydi
            </Button>
            <span className="text-xs text-muted-foreground ml-3">
              api_partner: dalabyada Iftin ayaa loo dirayaa (POST /partner-order) — delivery_queue maxalli lama gelinayo.
              Credit/daily limit iyo qiimaha Iftin ayaa maamula.
            </span>
          </div>
        </div>

        {!isPartner && (
          <p className="text-sm text-muted-foreground">
            Tenant-kan wuxuu ku shaqeeyaa Android Device (APK / SIM / USSD) — API key iyo xogta Iftin API looma baahna.
            Haddii aad rabto API, ka dooro "api_partner" kor.
          </p>
        )}

        {isPartner && (
        <Tabs defaultValue="key">
          <TabsList>
            <TabsTrigger value="key">Iftin Key</TabsTrigger>
            <TabsTrigger value="orders">Dalabyada</TabsTrigger>
            <TabsTrigger value="invoices">Fatuuro (maalinle)</TabsTrigger>
            <TabsTrigger value="docs">Docs</TabsTrigger>
          </TabsList>

          {/* ---------------- KEY ---------------- */}
          <TabsContent value="key" className="space-y-4 pt-4">
            <div className="rounded-lg border p-4 space-y-3">
              <div>
                <div className="font-medium text-sm flex items-center gap-2">
                  <KeyRound className="h-4 w-4" /> Key-ga Iftin geli
                </div>
                <p className="text-xs text-muted-foreground">
                  Key-ga (<span className="font-mono">ift_live_…</span>) Iftin Internet ayaa bixiya —
                  halkan gacan ku geli. Server-side kaliya ayuu kaydsan, frontend-ka marnaba lama tuso.
                </p>
              </div>
              <div className="grid md:grid-cols-2 gap-3">
                <div>
                  <Label>Iftin API key</Label>
                  <Input type="password" autoComplete="off" placeholder="ift_live_…"
                    value={apiKey} onChange={e => setApiKey(e.target.value)} />
                </div>
                <div>
                  <Label>Callback secret (webhook)</Label>
                  <Input type="password" autoComplete="off" placeholder="whsec_…"
                    value={callbackSecret} onChange={e => setCallbackSecret(e.target.value)} />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={saveKey} disabled={busy || apiKey.trim().length < 20}>
                  {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Keydi key
                </Button>
                {cred.configured && (
                  <>
                    <Button size="sm" variant="outline" onClick={testKey} disabled={busy}>
                      <PlugZap className="h-4 w-4 mr-1" /> Tijaabi
                    </Button>
                    <Button size="sm" variant="ghost" onClick={deleteKey} disabled={busy}>
                      <Trash2 className="h-4 w-4 mr-1 text-destructive" /> Tirtir
                    </Button>
                  </>
                )}
              </div>
            </div>

            <div className="rounded-lg border p-3 text-xs space-y-1">
              <div className="font-medium">Xaaladda</div>
              <div>Key: {cred.configured ? `${cred.key_prefix}… (firfircoon)` : '— lama dejin —'}</div>
              <div>Callback secret: {cred.has_callback_secret ? '✓ la dejiyay' : '— maqan —'}</div>
              <div>Isticmaalkii dambe: {cred.last_used_at ? new Date(cred.last_used_at).toLocaleString() : '—'}</div>
              <div className="pt-1 text-muted-foreground">
                Webhook URL-ka Iftin loo siinayo: <span className="font-mono break-all">{OUR_CALLBACK}</span>
              </div>
            </div>
          </TabsContent>

          {/* ---------------- ORDERS ---------------- */}
          <TabsContent value="orders" className="pt-4">
            {orders.length === 0 ? (
              <p className="text-sm text-muted-foreground">Dalab API ah weli ma jiro.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-muted-foreground">
                  <tr><th className="py-2">Waqti</th><th>external_ref</th><th>Qiime</th><th>Billable</th><th>Xaalad</th><th>Fatuuro</th></tr>
                </thead>
                <tbody>
                  {orders.map(o => (
                    <tr key={o.id} className="border-t">
                      <td className="py-2 text-xs">{new Date(o.created_at).toLocaleString()}</td>
                      <td className="font-mono text-xs">{o.external_ref}</td>
                      <td>${Number(o.amount).toFixed(2)}</td>
                      <td>${Number(o.billable).toFixed(2)}</td>
                      <td>
                        <Badge variant={
                          o.status === 'completed' ? 'default'
                            : o.status === 'failed' ? 'destructive' : 'secondary'
                        }>{o.status}</Badge>
                      </td>
                      <td className="text-xs">{o.invoice_id ? '✓' : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </TabsContent>

          {/* ---------------- INVOICES ---------------- */}
          <TabsContent value="invoices" className="pt-4">
            {invoices.length === 0 ? (
              <p className="text-sm text-muted-foreground">Fatuuro weli ma jirto.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-muted-foreground">
                  <tr><th className="py-2">Taariikh</th><th>Dalabyo</th><th>Wadar</th><th>Xaalad</th><th /></tr>
                </thead>
                <tbody>
                  {invoices.map(inv => (
                    <tr key={inv.id} className="border-t">
                      <td className="py-2">{inv.invoice_date}</td>
                      <td>{inv.orders_count}</td>
                      <td>${Number(inv.total_amount).toFixed(2)}</td>
                      <td>
                        <Badge variant={inv.status === 'paid' ? 'default' : 'destructive'}>
                          {inv.status === 'paid' ? 'La bixiyay' : 'Lama bixin'}
                        </Badge>
                      </td>
                      <td className="text-right">
                        {inv.status !== 'paid' && (
                          <Button size="sm" variant="outline" onClick={() => markPaid(inv)}>
                            Mark paid
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </TabsContent>

          {/* ---------------- DOCS ---------------- */}
          <TabsContent value="docs" className="pt-4 space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <BookOpen className="h-4 w-4" /> Sida isku xirku u shaqeeyo
            </div>
            <DocBlock title="Iftin base URL (provider)" body={IFTIN_BASE} />
            <DocBlock
              title="Dalab — SaaS → Iftin"
              body={`POST ${IFTIN_BASE}/partner-order
X-API-Key: <iftin_api_key ee tenant-ka>
Content-Type: application/json

{
  "external_ref": "t<tenant_id>-<order_id>",
  "receiver_phone": "61XXXXXXX",
  "package_code": "<ussd_code>",
  "callback_url": "${OUR_CALLBACK}"
}`}
            />
            <DocBlock title="Xirmooyinka (cache 5–10 daq)" body={`GET ${IFTIN_BASE}/partner-packages\nX-API-Key: <iftin_api_key>`} />
            <DocBlock title="Status" body={`GET ${IFTIN_BASE}/partner-status?external_ref=…`} />
            <DocBlock
              title="Webhook receiver (annaga)"
              body={`POST ${OUR_CALLBACK}
X-Signature: sha256=HMAC-SHA256(raw body, callback_secret)
→ cusboonaysiiyaa orders.status iyo billable (fashil = 0)`}
            />
            <div className="rounded-lg border p-3 text-xs text-muted-foreground space-y-1">
              <div className="font-medium text-foreground">Mas'uuliyad</div>
              <div>Iftin: key-yada, qiimaha, credit/daily limit, delivery engine, suspend/revoke, fatuuro 24-saac.</div>
              <div>SaaS/reseller: key-ga kaydi, dalab dir, deynta bixi.</div>
              <div className="pt-1">401 key khaldan · 402 credit/daily limit · 403 suspend · 422 input</div>
            </div>
          </TabsContent>
        </Tabs>
        )}
      </CardContent>
    </Card>
  )
}
