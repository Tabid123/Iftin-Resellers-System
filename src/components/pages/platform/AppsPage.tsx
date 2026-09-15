import { useEffect, useState } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Loader2, Trash2, Upload, Smartphone, Eye, EyeOff } from 'lucide-react'
import { toast } from 'sonner'

type AppRow = {
  id: string
  name: string
  description: string | null
  platform: string
  version: string | null
  file_url: string
  icon_url: string | null
  is_active: boolean
  display_order: number
  tenant_id: string | null
  created_at: string
}

type TenantRow = { id: string; name: string }

const db = supabase as any

export default function AppsPage() {
  const [apps, setApps] = useState<AppRow[]>([])
  const [tenants, setTenants] = useState<TenantRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [name, setName] = useState('')
  const [version, setVersion] = useState('')
  const [platform, setPlatform] = useState('android')
  const [description, setDescription] = useState('')
  const [allTenants, setAllTenants] = useState(true)
  const [tenantIds, setTenantIds] = useState<string[]>([])

  const toggleTenantId = (id: string) =>
    setTenantIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  const [file, setFile] = useState<File | null>(null)
  const [linkUrl, setLinkUrl] = useState('')

  const load = async () => {
    setLoading(true)
    const [{ data: appData }, { data: tenantData }] = await Promise.all([
      db.from('platform_apps').select('*').order('display_order').order('created_at', { ascending: false }),
      supabase.from('tenants').select('id, name').order('name'),
    ])
    setApps((appData ?? []) as AppRow[])
    setTenants((tenantData ?? []) as TenantRow[])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return toast.error('Magaca app-ka gali')
    if (!file && !linkUrl.trim()) return toast.error('File soo rar ama link gali')
    setSaving(true)
    try {
      let fileUrl = linkUrl.trim()
      if (file) {
        const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
        const path = `platform/${Date.now()}-${safe}`
        const { error: upErr } = await supabase.storage.from('apks').upload(path, file, {
          upsert: true,
          contentType: file.type || 'application/vnd.android.package-archive',
        })
        if (upErr) throw upErr
        fileUrl = path
      }
      const base = {
        name: name.trim(),
        description: description.trim() || null,
        platform,
        version: version.trim() || null,
        file_url: fileUrl,
        display_order: apps.length,
      }
      // Reseller kasta oo la doortay saf u gaar ah — sidaas kuwa aan la dooran ma arkaan.
      const targets = allTenants ? [null] : tenantIds
      if (!allTenants && targets.length === 0) {
        toast.error('Dooro ugu yaraan hal reseller')
        setSaving(false)
        return
      }
      const { error } = await db
        .from('platform_apps')
        .insert(targets.map((tid) => ({ ...base, tenant_id: tid })))
      if (error) throw error
      toast.success('App-ka waa la daabacay')
      setName(''); setVersion(''); setDescription(''); setAllTenants(true); setTenantIds([]); setFile(null); setLinkUrl('')
      await load()
    } catch (err: any) {
      toast.error(err?.message || 'Khalad ayaa dhacay')
    } finally {
      setSaving(false)
    }
  }

  const toggle = async (app: AppRow) => {
    const { error } = await db.from('platform_apps').update({ is_active: !app.is_active }).eq('id', app.id)
    if (error) return toast.error(error.message)
    load()
  }

  const remove = async (app: AppRow) => {
    if (!confirm(`Tirtir "${app.name}"?`)) return
    const { error } = await db.from('platform_apps').delete().eq('id', app.id)
    if (error) return toast.error(error.message)
    if (!/^https?:\/\//i.test(app.file_url)) {
      await supabase.storage.from('apks').remove([app.file_url])
    }
    toast.success('Waa la tirtiray')
    load()
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-5xl">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold">Apps</h1>
        <p className="text-sm text-muted-foreground">
          Apps-ka aad halkan ku daabacdo waxay ka muuqdaan tab-ka "Apps" ee dashboard-ka reseller-ka.
        </p>
      </div>

      <form onSubmit={submit} className="rounded-lg border bg-card p-4 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <Label>Magaca app-ka</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Iftin Delivery" />
          </div>
          <div className="space-y-1">
            <Label>Version</Label>
            <Input value={version} onChange={(e) => setVersion(e.target.value)} placeholder="2.4" />
          </div>
          <div className="space-y-1">
            <Label>Nooca</Label>
            <select
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
            >
              <option value="android">Android (APK)</option>
              <option value="ios">iOS</option>
              <option value="windows">Windows</option>
              <option value="other">Kale</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label>Resellers-ka arki kara</Label>
            <div className="rounded-md border bg-background p-3 space-y-2 max-h-48 overflow-y-auto">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={allTenants}
                  onChange={(e) => { setAllTenants(e.target.checked); if (e.target.checked) setTenantIds([]) }}
                />
                Dhammaan resellers-ka
              </label>
              {tenants.map((t) => (
                <label key={t.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    disabled={allTenants}
                    checked={tenantIds.includes(t.id)}
                    onChange={() => toggleTenantId(t.id)}
                  />
                  {t.name}
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-1">
          <Label>Sharaxaad</Label>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <Label>File (APK)</Label>
            <Input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </div>
          <div className="space-y-1">
            <Label>Ama link dibadeed</Label>
            <Input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://…" />
          </div>
        </div>

        <Button type="submit" disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Upload className="h-4 w-4 mr-1" />}
          Daabac
        </Button>
      </form>

      <div className="rounded-lg border bg-card divide-y">
        {loading && (
          <div className="p-6 flex justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>
        )}
        {!loading && apps.length === 0 && (
          <div className="p-6 text-sm text-muted-foreground">Wali app lama daabicin.</div>
        )}
        {apps.map((app) => (
          <div key={app.id} className="p-4 flex flex-wrap items-center gap-3">
            <Smartphone className="h-5 w-5 text-muted-foreground shrink-0" />
            <div className="min-w-0 flex-1 basis-[60%]">
              <div className="font-medium truncate">
                {app.name} {app.version ? <span className="text-xs text-muted-foreground">v{app.version}</span> : null}
              </div>
              <div className="text-xs text-muted-foreground truncate">
                {app.platform} · {app.tenant_id ? (tenants.find(t => t.id === app.tenant_id)?.name ?? 'Reseller') : 'Dhammaan resellers-ka'}
                {app.is_active ? '' : ' · qarsoon'}
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => toggle(app)}>
              {app.is_active ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
            <Button variant="outline" size="sm" onClick={() => remove(app)}>
              <Trash2 className="h-4 w-4 text-red-600" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  )
}
