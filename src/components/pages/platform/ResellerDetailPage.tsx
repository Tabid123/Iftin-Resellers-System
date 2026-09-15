import { useEffect, useRef, useState } from 'react'
import { useParams, Link, useNavigate } from "@/lib/router-compat"
import { supabase } from '@/integrations/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { toast } from '@/hooks/use-toast'
import { ArrowLeft, Loader2, Upload, X, KeyRound, Copy, Check, UserCog, Trash2 } from 'lucide-react'
import ThemePreview from '@/components/platform/ThemePreview'
import PartnerApiTab from '@/components/platform/PartnerApiTab'
import CachedImage from '@/components/CachedImage'


const toDateInput = (v: string | null | undefined) => (v ? new Date(v).toISOString().slice(0, 10) : '')

export default function ResellerDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [periodEnd, setPeriodEnd] = useState('')
  const [trialEnds, setTrialEnds] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [tenant, setTenant] = useState<any>(null)
  const [plans, setPlans] = useState<any[]>([])
  const [payments, setPayments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [payForm, setPayForm] = useState({
    amount: 0, payment_method: 'EVC', period_days: 30, notes: '',
  })
  const [saving, setSaving] = useState(false)

  const [applyingTemplate, setApplyingTemplate] = useState(false)
  const [sourceTenants, setSourceTenants] = useState<any[]>([])
  const [sourceId, setSourceId] = useState('')
  const [seeding, setSeeding] = useState(false)

  useEffect(() => {
    supabase.from('tenants').select('id, name, slug').order('name').then(({ data }) => {
      const list = (data ?? []).filter((t: any) => t.id !== id)
      setSourceTenants(list)
      const demo = list.find((t: any) => t.slug === 'demo')
      setSourceId((demo ?? list[0])?.id ?? '')
    })
  }, [id])

  const seedFromTenant = async () => {
    if (!sourceId) return
    const src = sourceTenants.find(t => t.id === sourceId)
    if (!confirm(`Xogta "${src?.name}" ma ku koobiyeeyaa tenant-kan? Waxa jira lama beddelayo.`)) return
    setSeeding(true)
    try {
      const { data, error } = await (supabase as any).rpc('seed_tenant_from_template', {
        p_target: id, p_source: sourceId,
      })
      if (error) throw error
      const r = (data ?? {}) as any
      toast({
        title: '✅ Xog dhameystiran waa la buuxiyay',
        description: `Shirkado ${r.providers ?? 0} · Categories ${r.categories ?? 0} · Packages ${r.packages ?? 0} · Lacag-bixin ${r.payment_providers ?? 0}`,
      })
    } catch (e: any) {
      toast({ title: 'Khalad', description: e.message, variant: 'destructive' })
    } finally { setSeeding(false) }
  }


  const applyMasterTemplate = async () => {
    if (!confirm('Xogta cusub ee Master Template-ka ma ugu dartaa tenant-kan? Xogta jirta lama overwrite-gareynayo.')) return
    setApplyingTemplate(true)
    try {
      const { data, error } = await supabase.functions.invoke('platform-apply-template', {
        body: { tenant_id: id, template_key: 'xog-dhameystiran-iftin' },
      })
      if (error || (data as any)?.error) throw new Error((data as any)?.error ?? error?.message)
      const inserted = (data as any)?.result?.inserted
      toast({
        title: '✅ Xogta cusub waa lagu daray',
        description: inserted
          ? `Providers ${inserted.providers}, Categories ${inserted.categories}, Packages ${inserted.packages}, Delivery ${inserted.delivery_instructions}`
          : undefined,
      })
    } catch (e: any) {
      toast({ title: 'Khalad', description: e.message, variant: 'destructive' })
    } finally { setApplyingTemplate(false) }
  }


  // Live preview state — controlled while typing
  const [name, setName] = useState('')
  const [primary, setPrimary] = useState('')
  const [accent, setAccent] = useState('')
  const [supportPhone, setSupportPhone] = useState('')
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // Reset password state
  const [resetting, setResetting] = useState(false)
  const [newCreds, setNewCreds] = useState<{ email: string | null; password: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const [impersonating, setImpersonating] = useState(false)
  const [ownerEmail, setOwnerEmail] = useState<string | null>(null)

  useEffect(() => {
    (async () => {
      const { data } = await supabase.rpc('get_tenant_owner_emails')
      const row = (data ?? []).find((r: any) => r.tenant_id === id)
      setOwnerEmail(row?.owner_email ?? null)
    })()
  }, [id])


  const impersonate = async () => {
    setImpersonating(true)
    try {
      const { data, error } = await supabase.functions.invoke('platform-impersonate-tenant', {
        body: { tenant_id: id },
      })
      if (error || (data as any)?.error) throw new Error((data as any)?.error ?? error?.message)
      const link = (data as any).action_link
      if (!link) throw new Error('Link lama helin')
      window.open(link, '_blank', 'noopener')
      toast({ title: '✅ Impersonation link la furay', description: (data as any).owner_email })
    } catch (e: any) {
      toast({ title: 'Khalad', description: e.message, variant: 'destructive' })
    } finally { setImpersonating(false) }
  }

  const resetPassword = async () => {
    if (!confirm('Ma hubtaa inaad password cusub u abuurto reseller-kan? Password-kii hore wuu shaqayn doonin.')) return
    setResetting(true)
    try {
      const { data, error } = await supabase.functions.invoke('platform-reset-tenant-password', {
        body: { tenant_id: id },
      })
      if (error || (data as any)?.error) throw new Error((data as any)?.error ?? error?.message)
      setNewCreds({ email: data.email, password: data.password })
      setCopied(false)
      toast({ title: '✅ Password cusub waa la abuuray' })
    } catch (e: any) {
      toast({ title: 'Khalad', description: e.message, variant: 'destructive' })
    } finally { setResetting(false) }
  }

  const copyCreds = async () => {
    if (!newCreds) return
    const text = `Email: ${newCreds.email}\nPassword: ${newCreds.password}`
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const load = async () => {
    const [{ data: t }, { data: pl }, { data: ps }] = await Promise.all([
      supabase.from('tenants').select('*').eq('id', id).single(),
      supabase.from('subscription_plans').select('*').eq('is_active', true),
      supabase.from('tenant_subscriptions').select('*')
        .eq('tenant_id', id).order('paid_at', { ascending: false }).limit(20),
    ])
    setTenant(t); setPlans(pl ?? []); setPayments(ps ?? []); setLoading(false)
    if (t) {
      setName(t.name ?? '')
      setPrimary(t.primary_color ?? '')
      setAccent((t as any).accent_color ?? '')
      setSupportPhone(t.support_phone ?? '')
      setLogoUrl(t.logo_url ?? null)
      setPeriodEnd(toDateInput(t.current_period_end))
      setTrialEnds(toDateInput((t as any).trial_ends_at))
    }
  }
  useEffect(() => { load() }, [id])

  const update = async (patch: any) => {
    setSaving(true)
    const { error } = await supabase.from('tenants').update(patch).eq('id', id)
    setSaving(false)
    if (error) { toast({ title: 'Khalad', description: error.message, variant: 'destructive' }); return false }
    toast({ title: 'La cusboonaysiiyay' })
    load()
    return true
  }

  const saveDates = async () => {
    await update({
      current_period_end: periodEnd ? new Date(`${periodEnd}T23:59:59`).toISOString() : null,
      trial_ends_at: trialEnds ? new Date(`${trialEnds}T23:59:59`).toISOString() : null,
    })
  }

  const extendDays = async (days: number) => {
    const base = tenant?.current_period_end && new Date(tenant.current_period_end) > new Date()
      ? new Date(tenant.current_period_end)
      : new Date()
    base.setDate(base.getDate() + days)
    await update({ current_period_end: base.toISOString(), status: 'active' })
  }

  const giveTrial3 = async () => {
    const end = new Date()
    end.setDate(end.getDate() + 3)
    await update({
      trial_ends_at: end.toISOString(),
      current_period_end: end.toISOString(),
      status: 'active',
    })
  }

  const deleteTenant = async () => {
    if (!confirm('Ma hubtaa? Dhammaan xogta reseller-kan waa la tirtirayaa.')) return
    setDeleting(true)
    const { error } = await supabase.from('tenants').delete().eq('id', id)
    setDeleting(false)
    if (error) { toast({ title: 'Khalad', description: error.message, variant: 'destructive' }); return }
    toast({ title: '✅ Reseller-ka waa la tirtiray' })
    navigate('/admin/resellers')
  }

  const handleLogoFile = (file: File) => {
    if (file.size > 500 * 1024) {
      toast({ title: 'Sawirka aad buu u weyn yahay', description: 'Max 500KB', variant: 'destructive' })
      return
    }
    setUploading(true)
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      setLogoUrl(dataUrl) // instant preview
      setUploading(false)
    }
    reader.readAsDataURL(file)
  }

  const recordPayment = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true)
    try {
      const { data, error } = await supabase.functions.invoke('platform-record-payment', {
        body: { tenant_id: id, ...payForm },
      })
      if (error || (data as any)?.error) throw new Error((data as any)?.error ?? error?.message)
      toast({ title: '✅ Lacag waa la qoray' })
      setPayForm({ amount: 0, payment_method: 'EVC', period_days: 30, notes: '' })
      load()
    } catch (e: any) {
      toast({ title: 'Khalad', description: e.message, variant: 'destructive' })
    } finally { setSaving(false) }
  }

  if (loading || !tenant) {
    return <div className="p-8 flex items-center gap-2"><Loader2 className="h-5 w-5 animate-spin" /> Loading…</div>
  }

  const brandingDirty =
    name !== (tenant.name ?? '') ||
    primary !== (tenant.primary_color ?? '') ||
    accent !== ((tenant as any).accent_color ?? '') ||
    supportPhone !== (tenant.support_phone ?? '') ||
    logoUrl !== (tenant.logo_url ?? null)

  const saveBranding = async () => {
    await update({
      name: name.trim() || tenant.name,
      primary_color: primary.trim() || null,
      accent_color: accent.trim() || null,
      support_phone: supportPhone.replace(/\D/g, '').slice(0, 9) || null,
      logo_url: logoUrl,
    })
  }

  const publicUrl = `https://iftinagents.com/t/${tenant.slug}`
  const adminUrl = `https://iftinagents.com/t/${tenant.slug}/dashboard/login`

  const copyText = async (text: string, label: string) => {
    await navigator.clipboard.writeText(text)
    toast({ title: `✅ ${label} waa la copy gareeyay` })
  }

  const copyAll = () =>
    copyText(
      `${tenant.name}\nEmail: ${ownerEmail ?? '—'}\nAdmin dashboard: ${adminUrl}\nApp-ka macaamiisha: ${publicUrl}`,
      'Xogta oo dhan',
    )

  const LinkRow = ({ label, value }: { label: string; value: string }) => (
    <div className="flex items-center justify-between gap-2 border rounded-md px-3 py-2">
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-sm font-mono truncate">{value}</div>
      </div>
      <Button variant="outline" size="sm" onClick={() => copyText(value, label)}>
        <Copy className="h-3.5 w-3.5 mr-1" /> Copy
      </Button>
    </div>
  )

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-6xl">
      <Button asChild variant="ghost" size="sm">
        <Link to="/admin/resellers"><ArrowLeft className="h-4 w-4 mr-1" /> Dib u noqo</Link>
      </Button>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold break-words">{tenant.name}</h1>
          <a
            href={`/t/${tenant.slug}/providers`}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-primary underline mt-1 inline-block"
          >
            Fur app-ka reseller-kan →
          </a>
        </div>

        <Badge>{tenant.status}</Badge>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
          <CardTitle className="text-base">Xogta gelitaanka & Links</CardTitle>
          <Button size="sm" variant="secondary" onClick={copyAll}>
            <Copy className="h-3.5 w-3.5 mr-1" /> Copy dhammaan
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          <LinkRow label="Email (owner)" value={ownerEmail ?? 'Lama helin'} />
          <LinkRow label="Admin dashboard link" value={adminUrl} />
          <LinkRow label="Link-ga macaamiisha (public)" value={publicUrl} />
        </CardContent>
      </Card>




      {/* Live theme preview */}
      <Card>
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
          <CardTitle>Theme Preview (live)</CardTitle>
          {brandingDirty && (
            <Button size="sm" onClick={saveBranding} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Keydi isbeddelka
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <ThemePreview name={name} logoUrl={logoUrl} primary={primary} accent={accent} />
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle>Branding</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Magaca</Label>
              <Input value={name} onChange={e => setName(e.target.value)} />
            </div>

            <div>
              <Label>Logo</Label>
              <div className="flex items-center gap-3 mt-1">
                <div className="h-14 w-14 rounded-lg border bg-white grid place-items-center overflow-hidden">
                  {logoUrl ? (
                    <CachedImage src={logoUrl} alt={`${name || 'Reseller'} logo`} className="h-full w-full object-contain" />
                  ) : (
                    <span className="text-xs text-muted-foreground">none</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm"
                    onClick={() => fileRef.current?.click()} disabled={uploading}>
                    {uploading
                      ? <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                      : <Upload className="h-4 w-4 mr-1" />}
                    Upload
                  </Button>
                  {logoUrl && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => setLogoUrl(null)}>
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                <input ref={fileRef} type="file" accept="image/*" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleLogoFile(f); e.target.value = '' }} />
              </div>
              <p className="text-xs text-muted-foreground mt-1">PNG/JPG/SVG · max 500KB</p>
              <Input className="mt-2" placeholder="Ama geli URL: https://..."
                value={logoUrl?.startsWith('data:') ? '' : (logoUrl ?? '')}
                onChange={e => setLogoUrl(e.target.value || null)} />
            </div>

            <ColorField label="Primary color" value={primary} onChange={setPrimary}
              placeholder="#3D0066 ama 276 100% 20%" />

            <ColorField label="Accent color" value={accent} onChange={setAccent}
              placeholder="#C5F82A ama 76 94% 57%" />

            <div>
              <Label>Lambarka customer support (9 god)</Label>
              <Input type="tel" inputMode="numeric" maxLength={9} placeholder="615555495"
                value={supportPhone}
                onChange={e => setSupportPhone(e.target.value.replace(/\D/g, '').slice(0, 9))} />
              <p className="text-xs text-muted-foreground mt-1">Lambarkan ayaa ka muuqanaya app-ka reseller-kan.</p>
            </div>

            <div className="flex gap-2 pt-2 border-t flex-wrap">
              {tenant.status !== 'active' && (
                <Button size="sm" onClick={() => update({ status: 'active' })} disabled={saving}>
                  Activate
                </Button>
              )}
              {tenant.status === 'active' && (
                <Button size="sm" variant="destructive"
                  onClick={() => update({ status: 'suspended' })} disabled={saving}>
                  Suspend
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={resetPassword} disabled={resetting}>
                {resetting
                  ? <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  : <KeyRound className="h-4 w-4 mr-1" />}
                Generate Password
              </Button>
              <Button size="sm" variant="secondary" onClick={impersonate} disabled={impersonating}>
                {impersonating
                  ? <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  : <UserCog className="h-4 w-4 mr-1" />}
                Impersonate
              </Button>
              <div className="flex-1" />
              <select className="h-9 rounded-md border bg-background px-3 text-sm"
                value={tenant.plan_id ?? ''}
                onChange={e => update({ plan_id: e.target.value })}>
                {plans.map(p => (
                  <option key={p.id} value={p.id}>{p.name} — ${p.price_monthly}</option>
                ))}
              </select>
            </div>

            {newCreds && (
              <div className="rounded-lg border bg-muted/40 p-3 space-y-2">
                <div className="text-xs font-medium text-muted-foreground uppercase">
                  Password cusub — copy garee hadda
                </div>
                <div className="font-mono text-sm">
                  <div><span className="text-muted-foreground">Email:</span> {newCreds.email}</div>
                  <div><span className="text-muted-foreground">Password:</span> <span className="font-bold">{newCreds.password}</span></div>
                </div>
                <Button size="sm" variant="outline" onClick={copyCreds}>
                  {copied
                    ? <><Check className="h-4 w-4 mr-1" /> La copy gareeyay</>
                    : <><Copy className="h-4 w-4 mr-1" /> Copy</>}
                </Button>
                <p className="text-xs text-amber-600">
                  ⚠️ Markaad page-ka ka tagto password-kan mar dambe lama tusi doono.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Qor lacag-bixin</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={recordPayment} className="space-y-3">
              <div>
                <Label>Amount ($)</Label>
                <Input type="number" required min={0} step="0.01"
                  value={payForm.amount}
                  onChange={e => setPayForm({ ...payForm, amount: +e.target.value })} />
              </div>
              <div>
                <Label>Habka bixinta</Label>
                <Input value={payForm.payment_method}
                  onChange={e => setPayForm({ ...payForm, payment_method: e.target.value })} />
              </div>
              <div>
                <Label>Period (maalmood)</Label>
                <Input type="number" min={1} value={payForm.period_days}
                  onChange={e => setPayForm({ ...payForm, period_days: +e.target.value })} />
              </div>
              <div>
                <Label>Notes</Label>
                <Input value={payForm.notes}
                  onChange={e => setPayForm({ ...payForm, notes: e.target.value })} />
              </div>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Qor & kordhi period
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Taariikhda Lacagaha</CardTitle></CardHeader>
        <CardContent>
          {payments.length === 0
            ? <p className="text-sm text-muted-foreground">Wax lacag ah weli lama qorin.</p>
            : (
              <div className="w-full overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead className="text-left text-xs uppercase text-muted-foreground">
                  <tr><th className="py-2">Paid</th><th>Amount</th><th>Method</th><th>Period</th><th>Notes</th></tr>
                </thead>
                <tbody>
                  {payments.map(p => (
                    <tr key={p.id} className="border-t">
                      <td className="py-2">{p.paid_at ? new Date(p.paid_at).toLocaleDateString() : '—'}</td>
                      <td>${p.amount}</td>
                      <td>{p.payment_method}</td>
                      <td className="text-xs">
                        {p.period_start && p.period_end
                          ? `${new Date(p.period_start).toLocaleDateString()} → ${new Date(p.period_end).toLocaleDateString()}`
                          : '—'}
                      </td>
                      <td className="text-xs">{p.notes ?? ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            )}
        </CardContent>
      </Card>

      {/* Waqtiga isticmaalka */}
      <Card>
        <CardHeader><CardTitle>Waqtiga isticmaalka</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <Label>Taariikhda dhammaadka (subscription)</Label>
              <Input type="date" value={periodEnd} onChange={e => setPeriodEnd(e.target.value)} />
            </div>
            <div>
              <Label>Taariikhda dhammaadka trial-ka</Label>
              <Input type="date" value={trialEnds} onChange={e => setTrialEnds(e.target.value)} />
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" onClick={saveDates} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Keydi taariikhaha
            </Button>
            <Button size="sm" variant="outline" onClick={() => extendDays(30)} disabled={saving}>+30 maalmood</Button>
            <Button size="sm" variant="outline" onClick={() => extendDays(7)} disabled={saving}>+7 maalmood</Button>
            <Button size="sm" variant="secondary" onClick={giveTrial3} disabled={saving}>
              Sii 3 maalmood trial
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Hadda: {tenant.current_period_end ? new Date(tenant.current_period_end).toLocaleString() : '—'}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Master Template</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Xogta cusub ee “Xog Dhameystiran – Iftin Internet” ku dar tenant-kan.
            Xogta tenant-ka jirta lama beddelayo ama lama tirtirayo.
          </p>
          <Button variant="outline" onClick={applyMasterTemplate} disabled={applyingTemplate}>
            {applyingTemplate && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Ku dar xogta cusub
          </Button>

          <div className="pt-3 border-t space-y-2">
            <Label>Xog dhameystiran — ka koobi tenant kale</Label>
            <div className="flex flex-col sm:flex-row gap-2">
              <select className="h-10 rounded-md border bg-background px-3 text-sm flex-1 min-w-0"
                value={sourceId} onChange={e => setSourceId(e.target.value)}>
                {sourceTenants.map(t => (
                  <option key={t.id} value={t.id}>{t.name} ({t.slug})</option>
                ))}
              </select>
              <Button onClick={seedFromTenant} disabled={seeding || !sourceId} className="shrink-0">
                {seeding && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Xog dhameystiran
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Waxaa la koobiyeeyaa shirkadaha, categories, packages (USSD code-yada la socda),
              hab-lacag-bixinta iyo featured. Lambarka lacag-bixinta wuu bannaanaanayaa.
              Dalabyada iyo macaamiisha lama koobiyeeyo.
            </p>
          </div>

        </CardContent>
      </Card>

      {tenant && <PartnerApiTab tenant={tenant} onRefresh={load} />}

      {/* Halis — tirtir reseller-ka */}
      <Card className="border-destructive/40">
        <CardHeader><CardTitle className="text-destructive">Tirtir reseller-ka</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Tirtiridda waxay baabi'inaysaa dhammaan xogta reseller-kan (dalabyada, macaamiisha,
            xirmooyinka, aaladaha, iwm). Tallaabadan dib looma celin karo.
          </p>
          <div className="max-w-xs">
            <Label>Ku qor <code>{tenant.slug}</code> si aad u xaqiijiso</Label>
            <Input value={deleteConfirm} onChange={e => setDeleteConfirm(e.target.value)} placeholder={tenant.slug} />
          </div>
          <Button
            variant="destructive"
            size="sm"
            disabled={deleteConfirm.trim() !== tenant.slug || deleting}
            onClick={deleteTenant}
          >
            {deleting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Trash2 className="h-4 w-4 mr-1" />}
            Tirtir gebi ahaanba
          </Button>
        </CardContent>
      </Card>

    </div>
  )
}

function ColorField({
  label, value, onChange, placeholder,
}: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  // Show a live swatch as the user types
  const swatch = value.trim()
    ? (value.trim().startsWith('#') ? value.trim() : `hsl(${value.trim()})`)
    : 'transparent'
  const isHex = value.trim().startsWith('#')
  return (
    <div>
      <Label>{label}</Label>
      <div className="flex gap-2 items-center mt-1">
        <div className="h-10 w-10 rounded border shrink-0"
          style={{ background: swatch }} />
        {/* Native color picker for hex */}
        <input
          type="color"
          value={isHex && /^#[0-9a-f]{6}$/i.test(value.trim()) ? value.trim() : '#3d0066'}
          onChange={e => onChange(e.target.value)}
          className="h-10 w-10 rounded border cursor-pointer bg-transparent shrink-0"
          aria-label={`${label} picker`}
        />
        <Input value={value} placeholder={placeholder}
          onChange={e => onChange(e.target.value)} />
      </div>
      <p className="text-xs text-muted-foreground mt-1">
        Geli HEX (<code>#3D0066</code>) ama HSL (<code>276 100% 20%</code>).
      </p>
    </div>
  )
}
