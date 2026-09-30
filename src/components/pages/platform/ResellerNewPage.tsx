import { useEffect, useState } from 'react'
import { useNavigate } from "@/lib/router-compat"
import { supabase } from '@/integrations/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from '@/hooks/use-toast'
import { Loader2 } from 'lucide-react'

export default function ResellerNewPage() {
  const navigate = useNavigate()
  const [plans, setPlans] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [seedFull, setSeedFull] = useState(true)
  const [sourceTenants, setSourceTenants] = useState<any[]>([])
  const [sourceId, setSourceId] = useState('')
  const [form, setForm] = useState({
    name: '', slug: '', owner_email: '', owner_password: '',
    plan_id: '', primary_color: '276 100% 20%',
    is_trial: false,
    period_days: 365,
    first_year_price: 50,
    renewal_yearly_price: 150,
    support_phone: '',
    delivery_mode: 'android_device',
    iftin_api_key: '',
    iftin_callback_secret: '',
    prepare_data: false,
    template_key: '',

  })

  useEffect(() => {
    supabase.from('subscription_plans').select('id, name, price_monthly')
      .eq('is_active', true).then(({ data }) => {
        const list = data ?? []
        setPlans(list)
        if (list[0]) setForm(f => ({ ...f, plan_id: (list[0] as any).id }))
      })
    supabase.from('tenants').select('id, name, slug').order('name').then(({ data }) => {
      const list = data ?? []
      setSourceTenants(list)
      const demo = list.find((t: any) => t.slug === 'demo')
      setSourceId(((demo ?? list[0]) as any)?.id ?? '')
    })
  }, [])


  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true)
    try {
      // Slug waa subdomain kaliya (tusaale "marwan"), ma aha domain buuxa
      const slug = form.slug.toLowerCase().trim().split('.')[0].replace(/[^a-z0-9-]/g, '')
      if (slug.length < 2) throw new Error('Slug waa inuu noqdaa ugu yaraan 2 xaraf (tusaale: marwan)')
      if (!form.is_trial) {
        if (!Number.isFinite(form.first_year_price) || form.first_year_price < 0) {
          throw new Error('Qiimaha sanadka 1aad geli')
        }
        if (!Number.isFinite(form.renewal_yearly_price) || form.renewal_yearly_price < 150 || form.renewal_yearly_price > 200) {
          throw new Error('Qiimaha sanadaha xiga waa inuu u dhexeeyaa $150 iyo $200')
        }
      }

      const { data, error } = await supabase.functions.invoke('platform-create-tenant', {
        body: { ...form, slug },
      })
      if (error) {
        // Edge function non-2xx: soo saar farriinta dhabta ah
        let msg = error.message
        try {
          const res = (error as any)?.context
          if (res && typeof res.json === 'function') {
            const j = await res.json()
            msg = j?.error ?? msg
          }
        } catch { /* ignore */ }
        throw new Error(msg)
      }
      if ((data as any)?.error) throw new Error((data as any).error)
      const tenantId = (data as any).tenant.id


      // api_partner: key-ga Iftin isla markiiba waa la keydiyaa (server-side kaliya)
      if (form.delivery_mode === 'api_partner' && form.iftin_api_key.trim()) {
        const { data: cd, error: ce } = await supabase.functions.invoke('iftin-credential', {
          body: {
            tenant_id: tenantId,
            action: 'save',
            api_key: form.iftin_api_key.trim(),
            callback_secret: form.iftin_callback_secret.trim() || null,
          },
        })
        if (ce || (cd as any)?.error) {
          toast({
            title: 'Reseller la sameeyay, laakiin key-ga ma keydsamin',
            description: (cd as any)?.error ?? ce?.message,
            variant: 'destructive',
          })
        } else {
          toast({ title: '✅ Key-ga Iftin waa la keydiyay' })
        }
      }

      if (seedFull && sourceId) {
        const { data: sd, error: se } = await (supabase as any).rpc('seed_tenant_from_template', {
          p_target: tenantId, p_source: sourceId,
        })
        if (se) {
          toast({ title: 'Reseller la sameeyay, xogta ma buuxsamin', description: se.message, variant: 'destructive' })
        } else {
          const r = (sd ?? {}) as any
          toast({
            title: '✅ Xog dhameystiran waa la buuxiyay',
            description: `Shirkado ${r.providers ?? 0} · Categories ${r.categories ?? 0} · Packages ${r.packages ?? 0}`,
          })
        }
      }

      toast({ title: '✅ Reseller la sameeyay', description: form.name })
      navigate(`/admin/resellers/${tenantId}`)
    } catch (e: any) {
      toast({ title: 'Khalad', description: e.message, variant: 'destructive' })
    } finally { setLoading(false) }
  }

  return (
    <div className="p-4 sm:p-6 max-w-2xl">
      <h1 className="text-xl sm:text-2xl font-bold mb-4">Reseller Cusub</h1>
      <Card>
        <CardHeader><CardTitle>Faahfaahin</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>Magaca</Label>
                <Input required value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })} />
              </div>
              <div>
                <Label>Subdomain (slug)</Label>
                <Input required
                  placeholder="marwan" value={form.slug}
                  onChange={e => setForm({ ...form, slug: e.target.value.toLowerCase() })} />
                <p className="text-xs text-muted-foreground mt-1">
                  Subdomain kaliya (tusaale: <b>marwan</b>) — ha ku darin ".iftinagents.com"
                </p>
              </div>

            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>Owner email</Label>
                <Input type="email" required value={form.owner_email}
                  onChange={e => setForm({ ...form, owner_email: e.target.value })} />
              </div>
              <div>
                <Label>Owner password (min 8)</Label>
                <Input type="text" required minLength={8} value={form.owner_password}
                  onChange={e => setForm({ ...form, owner_password: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>Plan</Label>
                <select className="w-full h-10 rounded-md border bg-background px-3"
                  value={form.plan_id}
                  onChange={e => setForm({ ...form, plan_id: e.target.value })}>
                  {plans.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground mt-1">
                  Plan-ku wuxuu xakameeyaa features-ka; qiimaha reseller-ka hoos ayaa si gaar ah looga qorayaa.
                </p>
              </div>

              <div>
                <Label>Nooca reseller-ka</Label>
                <select
                  className="w-full h-10 rounded-md border bg-background px-3"
                  value={form.is_trial ? 'trial' : 'paid'}
                  onChange={e => {
                    const trial = e.target.value === 'trial'
                    setForm({
                      ...form,
                      is_trial: trial,
                      period_days: trial ? 3 : 365,
                    })
                  }}
                >
                  <option value="paid">Paid — 1 sano</option>
                  <option value="trial">Trial — 3 maalmood</option>
                </select>
                <p className="text-xs text-muted-foreground mt-1">
                  Paid reseller-ku hal sano ayuu furanyahay. Trial-ku waa 3 maalmood.
                </p>
              </div>
            </div>

            {!form.is_trial ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-4 space-y-3">
                <div>
                  <div className="text-sm font-semibold">Yearly Pricing</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Qiimahan reseller-kan ayuu gaar u yahay; lama isticmaalayo qiimihii legacy-ga ahaa ee $20/month.
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label>Qiimaha sanadka 1aad ($)</Label>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      required
                      value={form.first_year_price}
                      onChange={e => setForm({ ...form, first_year_price: +e.target.value })}
                    />
                    <p className="text-xs text-muted-foreground mt-1">Default: $50 / yearly</p>
                  </div>
                  <div>
                    <Label>Qiimaha sanadaha xiga ($ / yearly)</Label>
                    <Input
                      type="number"
                      min={150}
                      max={200}
                      step="0.01"
                      required
                      value={form.renewal_yearly_price}
                      onChange={e => setForm({ ...form, renewal_yearly_price: +e.target.value })}
                    />
                    <p className="text-xs text-muted-foreground mt-1">Qiimaha la oggol yahay: $150–$200 / yearly</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                Trial reseller — 3 maalmood. Qiime Year 1 ama renewal lama qorayo ilaa paid laga dhigo.
              </div>
            )}
            <div className="rounded-lg border p-3 space-y-3 bg-muted/30">
              <div>
                <Label>Ma rabtaa xogta shirkadaha iyo xirmooyinka in laguugu diyaariyo?</Label>
                <select className="mt-1 w-full h-10 rounded-md border bg-background px-3"
                  value={form.prepare_data ? 'yes' : 'no'}
                  onChange={e => setForm({
                    ...form,
                    prepare_data: e.target.value === 'yes',
                    template_key: e.target.value === 'yes' ? 'xog-dhameystiran-iftin' : '',
                  })}>
                  <option value="no">Maya — tenant madhan</option>
                  <option value="yes">Haa — xog diyaarsan</option>
                </select>
              </div>
              {form.prepare_data && (
                <div>
                  <Label>Master Template</Label>
                  <select className="mt-1 w-full h-10 rounded-md border bg-background px-3"
                    value={form.template_key}
                    onChange={e => setForm({ ...form, template_key: e.target.value })}>
                    <option value="xog-dhameystiran-iftin">Xog Dhameystiran – Iftin Internet</option>
                  </select>
                  <p className="text-xs text-muted-foreground mt-1">
                    Providers, categories, packages, delivery instructions, Maamuus, Somlink iyo
                    payment methods ayaa tenant-kan loogu samaynayaa IDs cusub. Xogtu tenant kale lama wadaagayso.
                  </p>
                </div>
              )}
            </div>

            <div>
              <Label>Delivery mode</Label>
              <select className="w-full h-10 rounded-md border bg-background px-3"
                value={form.delivery_mode}
                onChange={e => setForm({ ...form, delivery_mode: e.target.value })}>
                <option value="android_device">android_device — APK / SIM / USSD</option>
                <option value="api_partner">api_partner — Iftin API (X-API-Key)</option>
              </select>
              <p className="text-xs text-muted-foreground mt-1">
                api_partner: dalabyada Iftin Internet API-ga ayaa loo dirayaa.
                android_device: APK-ga reseller-ka (SIM/USSD).
              </p>
            </div>

            {form.delivery_mode === 'api_partner' && (
              <div className="rounded-lg border p-3 space-y-3 bg-muted/30">
                <div>
                  <div className="text-sm font-medium">Key-ga Iftin (partner)</div>
                  <p className="text-xs text-muted-foreground">
                    Key-ga Iftin Internet ayaa bixiya. Server-side kaliya ayuu kaydsan —
                    frontend-ka marnaba lama tuso.
                  </p>
                </div>
                <div>
                  <Label>Iftin API key</Label>
                  <Input type="password" autoComplete="off" placeholder="ift_live_…"
                    required minLength={20}
                    value={form.iftin_api_key}
                    onChange={e => setForm({ ...form, iftin_api_key: e.target.value })} />
                </div>
                <div>
                  <Label>Callback secret (webhook) — ikhtiyaari</Label>
                  <Input type="password" autoComplete="off" placeholder="whsec_…"
                    value={form.iftin_callback_secret}
                    onChange={e => setForm({ ...form, iftin_callback_secret: e.target.value })} />
                </div>
              </div>
            )}


            <div>
              <Label>Lambarka customer support (9 god)</Label>
              <Input type="tel" inputMode="numeric" maxLength={9} placeholder="615555495"
                value={form.support_phone}
                onChange={e => setForm({ ...form, support_phone: e.target.value.replace(/\D/g, '').slice(0, 9) })} />
              <p className="text-xs text-muted-foreground mt-1">
                Lambarkan ayaa ka muuqanaya app-ka reseller-kan marka customer-ku support raadinayo.
              </p>
            </div>

            <div>
              <Label>Primary color (HSL "H S% L%")</Label>
              <Input value={form.primary_color}
                onChange={e => setForm({ ...form, primary_color: e.target.value })} />
            </div>

            <div className="rounded-lg border p-3 space-y-2 bg-muted/30">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" checked={seedFull} onChange={e => setSeedFull(e.target.checked)} />
                Xog dhameystiran ku buuxi (shirkado, categories, packages, USSD)
              </label>
              {seedFull && (
                <select className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={sourceId} onChange={e => setSourceId(e.target.value)}>
                  {sourceTenants.map(t => (
                    <option key={t.id} value={t.id}>{t.name} ({t.slug})</option>
                  ))}
                </select>
              )}
              <p className="text-xs text-muted-foreground">
                Lambarka lacag-bixinta wuu bannaanaanayaa — reseller-ku wuu gelinayaa. Dalabyada iyo macaamiisha lama koobiyeeyo.
              </p>
            </div>

            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Samee Reseller
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
