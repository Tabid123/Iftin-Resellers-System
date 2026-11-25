import { useEffect, useState } from 'react'
import { Link, useLocation } from '@/lib/router-compat'
import { platformSupabase as supabase } from '@/integrations/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { toast } from '@/hooks/use-toast'
import { ShoppingBag, Store, Users } from 'lucide-react'

type Tenant = {
  id: string; name: string; slug: string; status: string
  plan_id: string | null; billing_cycle: string | null
  current_period_end: string | null; trial_ends_at: string | null
  support_phone: string | null; delivery_mode: string | null
}
type Plan = { id: string; name: string; is_active: boolean }
type Feature = { tenant_id: string; enabled: boolean; plan_id: string | null }

export function canActivateShop(t: Tenant) {
  if (!['active', 'trial'].includes(t.status)) return false
  const expiry = t.status === 'trial' ? (t.trial_ends_at ?? t.current_period_end) : t.current_period_end
  return !expiry || new Date(expiry).getTime() > Date.now()
}
const formattedDate = (value: string | null) =>
  value ? new Date(value).toLocaleDateString('en-GB') : '—'

export default function FeaturesPage() {
  const location = useLocation()
  const tenantParam = new URLSearchParams(location.search).get('tenant') ?? ''
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [plans, setPlans] = useState<Plan[]>([])
  const [features, setFeatures] = useState<Feature[]>([])
  const [selectedId, setSelectedId] = useState(tenantParam)
  const [selectedPlan, setSelectedPlan] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let live = true
    ;(async () => {
      const [t, p, f] = await Promise.all([
        supabase.from('tenants')
          .select('id,name,slug,status,plan_id,billing_cycle,current_period_end,trial_ends_at,support_phone,delivery_mode')
          .order('name'),
        supabase.from('subscription_plans').select('id,name,is_active').order('display_order'),
        (supabase as any).from('tenant_shop_features').select('tenant_id,enabled,plan_id'),
      ])
      if (!live) return
      if (t.error || p.error || f.error) {
        setError(t.error?.message || p.error?.message || f.error?.message || 'Features lama soo akhrin karo')
      } else {
        setTenants((t.data ?? []) as Tenant[])
        setPlans((p.data ?? []) as Plan[])
        setFeatures((f.data ?? []) as Feature[])
      }
      setLoading(false)
    })()
    return () => { live = false }
  }, [])

  const tenant = tenants.find(t => t.id === selectedId)
  const feature = features.find(f => f.tenant_id === selectedId)
  const isOn = feature?.enabled === true
  const activePlans = plans.filter(p => p.is_active)
  const displayedPlans = plans.filter(p => p.is_active || p.id === feature?.plan_id)
  const enabledCount = features.filter(f => f.enabled).length
  const matches = tenants.filter(t => (t.name + ' ' + t.slug).toLowerCase().includes(search.toLowerCase().trim()))

  useEffect(() => {
    const fromTenant = activePlans.some(p => p.id === tenant?.plan_id) ? tenant?.plan_id : undefined
    const defaultPlan = activePlans.find(p =>
      tenant?.billing_cycle === 'monthly' ? p.name === 'Monthly $15' : p.name === 'Yearly'
    )?.id
    setSelectedPlan(feature?.plan_id ?? fromTenant ?? defaultPlan ?? '')
  }, [selectedId, tenant?.plan_id, tenant?.billing_cycle, feature?.plan_id, plans])

  async function save(nextEnabled: boolean) {
    if (busy || !tenant || !selectedPlan) return
    if (nextEnabled && !canActivateShop(tenant)) {
      toast({ title: 'Subscription-ka tenant-ka ma shaqaynayo', variant: 'destructive' })
      return
    }
    const plan = plans.find(p => p.id === selectedPlan)
    if (!plan?.is_active) {
      toast({ title: 'Dooro plan shaqaynaya', variant: 'destructive' })
      return
    }
    const action = nextEnabled ? 'ON' : 'OFF'
    if (!window.confirm('Ma hubtaa inaad eCommerce ' + action + ' uga dhigeyso ' + tenant.name +
      '?\nPlan: ' + plan.name + '\nBilling-kii tenant-ka lama beddelayo.')) return
    setBusy(true)
    try {
      const { data, error: saveError } = await (supabase as any)
        .from('tenant_shop_features')
        .upsert({ tenant_id: tenant.id, enabled: nextEnabled, plan_id: selectedPlan }, { onConflict: 'tenant_id' })
        .select('tenant_id,enabled,plan_id')
        .single()
      if (saveError) throw saveError
      setFeatures(old => [...old.filter(f => f.tenant_id !== tenant.id), data as Feature])
      toast({ title: 'eCommerce ' + action + ' — ' + tenant.name, description: 'Plan: ' + plan.name })
    } catch (e: unknown) {
      toast({ title: 'Lama kaydin', description: e instanceof Error ? e.message : 'Hubi database-ka', variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-full px-4 py-6 sm:px-7 lg:px-8 lg:py-8">
      <div className="mx-auto max-w-[1300px] space-y-6">
        <div>
          <h1 className="text-[30px] font-bold tracking-tight text-[#0c1220]">Features</h1>
          <p className="mt-1 text-sm text-slate-500">Super Admin oo keliya ayaa feature tenant u furi kara ama ka xiri kara.</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Card className="rounded-2xl border-slate-200 bg-white shadow-sm"><CardContent className="flex items-center gap-4 p-5"><span className="rounded-xl bg-blue-50 p-3 text-blue-600"><Users className="h-5 w-5" /></span>
            <div><p className="text-xs text-slate-500">Tenants</p><strong className="text-2xl">{tenants.length}</strong></div>
          </CardContent></Card>
          <Card className="rounded-2xl border-slate-200 bg-white shadow-sm"><CardContent className="flex items-center gap-3 p-4"><span className="rounded-xl bg-emerald-50 p-3 text-emerald-600"><Store className="h-5 w-5" /></span>
            <div><p className="text-xs text-slate-500">eCommerce ON</p><strong className="text-2xl">{enabledCount}</strong></div>
          </CardContent></Card>
          <Card className="rounded-2xl border-slate-200 bg-white shadow-sm"><CardContent className="flex items-center gap-3 p-4"><span className="rounded-xl bg-slate-100 p-3 text-slate-600"><ShoppingBag className="h-5 w-5" /></span>
            <div><p className="text-xs text-slate-500">eCommerce OFF</p><strong className="text-2xl">{Math.max(0, tenants.length - enabledCount)}</strong></div>
          </CardContent></Card>
        </div>
        <div className="border-b"><span className="inline-flex items-center gap-2 border-b-[3px] border-blue-600 px-3 py-3 text-sm font-semibold">
          <ShoppingBag className="h-4 w-4" /> eCommerce
        </span></div>

        {loading && <p className="py-6 text-sm text-slate-500">Features waa la soo akhrinayaa...</p>}
        {error && <p role="alert" className="rounded-lg bg-red-50 p-4 text-sm text-red-700">{error}</p>}

        {!loading && !error && (
          <div className="grid gap-5 lg:grid-cols-2">
            <Card className="rounded-2xl border-slate-200 bg-white shadow-sm">
              <CardHeader><CardTitle className="text-base">1. Dooro tenant-ka</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <label className="block space-y-1 text-sm font-medium">Tenant
                  <select
                    aria-label="Dooro tenant"
                    className="w-full rounded-md border bg-background p-3"
                    value={selectedId}
                    disabled={busy}
                    onChange={e => setSelectedId(e.target.value)}
                  >
                    <option value="">Dooro tenant...</option>
                    {tenants.map(t => <option key={t.id} value={t.id}>{t.name} — {t.slug}</option>)}
                  </select>
                </label>
                <Input aria-label="Raadi tenant" placeholder="Raadi tenant..." value={search} onChange={e => setSearch(e.target.value)} />
                <div className="max-h-96 space-y-1 overflow-y-auto rounded-xl border border-slate-100 p-2">
                  {matches.map(t => {
                    const on = features.some(f => f.tenant_id === t.id && f.enabled)
                    return <button type="button" key={t.id} disabled={busy} onClick={() => setSelectedId(t.id)}
                      className={'flex w-full justify-between rounded-xl border px-4 py-3 text-left text-sm ' +
                        (selectedId === t.id ? 'border-blue-600 bg-blue-50' : 'border-transparent hover:bg-slate-50')}>
                      <span>{t.name}</span><span className={on ? 'font-bold text-emerald-700' : 'text-slate-400'}>{on ? 'ON' : 'OFF'}</span>
                    </button>
                  })}
                  {!matches.length && <p className="p-3 text-sm text-slate-500">Tenant lama helin.</p>}
                </div>
              </CardContent>
            </Card>

            <div className="space-y-5">
              <Card className="rounded-2xl border-slate-200 bg-white shadow-sm">
                <CardHeader><CardTitle className="text-base">2. Xogta tenant-ka</CardTitle></CardHeader>
                <CardContent>
                  {!tenant ? <p className="text-sm text-slate-500">Marka hore tenant dooro.</p> :
                    <div className="space-y-4">
                      <div className="flex items-center justify-between gap-3">
                        <div><strong className="block">{tenant.name}</strong><span className="text-xs text-slate-500">/{tenant.slug}</span></div>
                        <Badge variant={isOn ? 'default' : 'secondary'}>{isOn ? 'eCommerce ON' : 'eCommerce OFF'}</Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div><span className="block text-xs text-slate-500">Status</span><strong>{tenant.status}</strong></div>
                        <div><span className="block text-xs text-slate-500">Tenant plan</span>
                          <strong>{plans.find(p => p.id === tenant.plan_id)?.name ?? tenant.billing_cycle ?? '—'}</strong></div>
                        <div><span className="block text-xs text-slate-500">Billing cycle</span><strong>{tenant.billing_cycle ?? '—'}</strong></div>
                        <div><span className="block text-xs text-slate-500">Expiry</span>
                          <strong>{formattedDate(tenant.status === 'trial' ? tenant.trial_ends_at : tenant.current_period_end)}</strong></div>
                        <div><span className="block text-xs text-slate-500">Delivery</span><strong>{tenant.delivery_mode ?? '—'}</strong></div>
                        <div><span className="block text-xs text-slate-500">Support</span><strong>{tenant.support_phone ?? '—'}</strong></div>
                      </div>
                      <Link to={'/admin/resellers/' + tenant.id} className="text-sm font-medium text-blue-600 underline">
                        Faahfaahinta tenant-ka
                      </Link>
                    </div>}
                </CardContent>
              </Card>

              <Card className="rounded-2xl border-slate-200 bg-white shadow-sm">
                <CardHeader><CardTitle className="text-base">3. Plan-ka eCommerce & ON/OFF</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <label className="block space-y-1 text-sm font-medium">Dooro plan-ka
                    <select aria-label="Plan-ka eCommerce" value={selectedPlan}
                      disabled={!tenant || busy}
                      onChange={e => setSelectedPlan(e.target.value)}
                      className="w-full rounded-md border bg-background p-3">
                      <option value="">Dooro plan...</option>
                      {displayedPlans.map(p => <option key={p.id} value={p.id}>{p.name}{p.is_active ? '' : ' (inactive)'}</option>)}
                    </select>
                  </label>
                  <p className="text-xs text-slate-500">
                    Doorashadani waa plan-ka eCommerce feature-ka; ma beddesho billing-ka iyo subscription-ka tenant-ka.
                  </p>
                  {tenant && !canActivateShop(tenant) &&
                    <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
                      Tenant-kan ma aha active/trial shaqaynaya. Sax subscription-ka ka hor ON.
                    </p>}
                  {tenant && selectedPlan !== feature?.plan_id &&
                    <p className="text-xs text-amber-700">Riix ON ama OFF si plan-ka aad dooratay loo kaydiyo.</p>}
                  <div className="grid grid-cols-2 gap-3">
                    <Button type="button" disabled={busy || !tenant || !selectedPlan || !canActivateShop(tenant)}
                      variant={isOn ? 'default' : 'outline'} onClick={() => void save(true)}>
                      {busy ? 'Kaydin...' : 'ON — Fur eCommerce'}
                    </Button>
                    <Button type="button" disabled={busy || !tenant || !selectedPlan}
                      variant={!isOn ? 'secondary' : 'outline'} onClick={() => void save(false)}>
                      {busy ? 'Kaydin...' : 'OFF — Xir eCommerce'}
                    </Button>
                  </div>
                  <p className="text-sm text-slate-500">
                    {isOn ? 'eCommerce wuu u furan yahay tenant-kan.' : 'eCommerce wuu ka xiran yahay tenant-kan.'}
                    {' '}OFF ma tirtiro categories, alaab, stock ama dalabyadii hore.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
