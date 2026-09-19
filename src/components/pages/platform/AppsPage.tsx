import { useEffect, useState } from 'react'
import { supabase, supabaseAllTenants } from '@/integrations/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Loader2, Trash2, Upload, Smartphone, Eye, EyeOff, Plus, CheckCircle2 } from 'lucide-react'
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
  apk_updated_at?: string | null
}

type TenantRow = { id: string; name: string }

const db = supabase as any
const platformStorage = supabaseAllTenants.storage

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

  // Hal app oo la siiyay resellers badan waxuu leeyahay saf kasta reseller — halkan
  // waxaa lagu soo koobaa hal kaar si liisku u nadiifto.
  type AppGroup = {
    key: string
    rows: AppRow[]
    name: string
    version: string | null
    platform: string
    description: string | null
    file_url: string
    isAllTenants: boolean
    anyActive: boolean
    apk_updated_at: string | null
  }

  const groups: AppGroup[] = (() => {
    const map = new Map<string, AppGroup>()
    for (const app of apps) {
      const key = `${app.name}|${app.version ?? ''}|${app.platform}|${app.file_url}`
      const g = map.get(key)
      if (g) {
        g.rows.push(app)
        g.isAllTenants = g.isAllTenants || app.tenant_id === null
        g.anyActive = g.anyActive || app.is_active
        if (app.apk_updated_at && (!g.apk_updated_at || app.apk_updated_at > g.apk_updated_at)) g.apk_updated_at = app.apk_updated_at
      } else {
        map.set(key, {
          key,
          rows: [app],
          name: app.name,
          version: app.version,
          platform: app.platform,
          description: app.description,
          file_url: app.file_url,
          isAllTenants: app.tenant_id === null,
          anyActive: app.is_active,
          apk_updated_at: app.apk_updated_at ?? null,
        })
      }
    }
    return [...map.values()]
  })()

  const toggle = async (group: AppGroup) => {
    const next = !group.anyActive
    const { error } = await db
      .from('platform_apps')
      .update({ is_active: next })
      .in('id', group.rows.map((r) => r.id))
    if (error) return toast.error(error.message)
    load()
  }

  const remove = async (group: AppGroup) => {
    if (!confirm(`Tirtir "${group.name}"?`)) return
    const { error } = await db.from('platform_apps').delete().in('id', group.rows.map((r) => r.id))
    if (error) return toast.error(error.message)
    if (!/^https?:\/\//i.test(group.file_url)) {
      await supabase.storage.from('apks').remove([group.file_url])
    }
    toast.success('Waa la tirtiray')
    load()
  }

  // Hal reseller ka saar app-ka — kaliya safkiisa ayaa la tirtiraa, kuwa kale waa haraan.
  const removeTenant = async (row: AppRow, tenantName: string) => {
    if (!confirm(`Ka saar "${tenantName}" app-kan?`)) return
    const { error } = await db.from('platform_apps').delete().eq('id', row.id)
    if (error) return toast.error(error.message)
    toast.success(`${tenantName} waa laga saaray`)
    load()
  }

  // Resellers cusub ku dar app horey loo daabacay — file-ka dib looma raro.
  const [shareKey, setShareKey] = useState<string | null>(null)
  const [shareIds, setShareIds] = useState<string[]>([])
  const [sharing, setSharing] = useState(false)
  const [replacingKey, setReplacingKey] = useState<string | null>(null)
  const [recentlyReplacedKey, setRecentlyReplacedKey] = useState<string | null>(null)

  const openShare = (group: AppGroup) => {
    setShareKey(shareKey === group.key ? null : group.key)
    setShareIds([])
  }

  const saveShare = async (group: AppGroup) => {
    if (shareIds.length === 0) return toast.error('Dooro ugu yaraan hal reseller')
    setSharing(true)
    try {
      const sample = group.rows[0]
      const { error } = await db.from('platform_apps').insert(
        shareIds.map((tid) => ({
          name: group.name,
          description: group.description,
          platform: group.platform,
          version: group.version,
          file_url: group.file_url,
          icon_url: sample.icon_url,
          display_order: sample.display_order,
          tenant_id: tid,
        })),
      )
      if (error) throw error
      toast.success('Resellers-ka waa lagu daray')
      setShareKey(null)
      setShareIds([])
      await load()
    } catch (err: any) {
      toast.error(err?.message || 'Khalad ayaa dhacay')
    } finally {
      setSharing(false)
    }
  }

  const replaceApkOnly = async (group: AppGroup, file: File | null) => {
    if (!file) return
    if (group.platform !== 'android') {
      toast.error('APK beddel waxaa loogu talagalay Android app-ka oo keliya')
      return
    }

    const nextVersion = window.prompt('Version-ka cusub geli', group.version ?? '')
    if (nextVersion === null) return
    const normalizedVersion = nextVersion.trim()
    if (!normalizedVersion) {
      toast.error('Version-ka cusub geli')
      return
    }

    setReplacingKey(group.key)
    try {
      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const path = `platform/${Date.now()}-${safe}`
      const uploadPromise = platformStorage.from('apks').upload(path, file, {
        upsert: false,
        contentType: file.type || 'application/vnd.android.package-archive',
      })

      const uploadResult = await Promise.race([
        uploadPromise,
        new Promise<never>((_, reject) => {
          window.setTimeout(
            () => reject(new Error('APK upload-ku wuu dheeraaday. Fadlan internet-ka hubi oo mar kale isku day.')),
            90_000,
          )
        }),
      ])

      if (uploadResult.error) throw uploadResult.error

      const rowIds = group.rows.map((row) => row.id)
      const replacedAt = new Date().toISOString()
      const { error: updateError } = await db
        .from('platform_apps')
        .update({ file_url: path, version: normalizedVersion, apk_updated_at: replacedAt })
        .in('id', rowIds)

      if (updateError) {
        await platformStorage.from('apks').remove([path]).catch(() => undefined)
        throw updateError
      }

      setRecentlyReplacedKey(group.key)
      toast.success(`APK-ga cusub waa la beddelay — version ${normalizedVersion}. Resellers-kii hore sidii ayay u joogaan.`)
      await load()
      window.setTimeout(() => setRecentlyReplacedKey((key) => key === group.key ? null : key), 3500)
    } catch (err: any) {
      toast.error(err?.message || 'APK-ga lama beddeli karin')
    } finally {
      setReplacingKey(null)
    }
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
        {groups.map((group) => {
          const remaining = tenants.filter((t) => !group.rows.some((r) => r.tenant_id === t.id))
          return (
            <div key={group.key} className="p-4 space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <Smartphone className="h-5 w-5 text-muted-foreground shrink-0" />
                <div className="min-w-0 flex-1 basis-[55%]">
                  <div className="font-medium truncate">
                    {group.name} {group.version ? <span className="text-xs text-muted-foreground">v{group.version}</span> : null}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {group.platform}
                    {group.anyActive ? '' : ' · qarsoon'}
                  </div>
                  {group.apk_updated_at && (
                    <div className="mt-1 text-[11px] font-medium text-emerald-700">
                      APK la beddelay: {new Date(group.rows[0].apk_updated_at).toLocaleString()}
                    </div>
                  )}
                  {!group.isAllTenants && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {group.rows
                        .filter((r) => r.tenant_id)
                        .map((r) => {
                          const tName = tenants.find((t) => t.id === r.tenant_id)?.name ?? 'Reseller'
                          return (
                            <span
                              key={r.id}
                              className="inline-flex items-center gap-1 rounded-full border bg-background px-2 py-0.5 text-xs"
                            >
                              {tName}
                              <button
                                type="button"
                                onClick={() => removeTenant(r, tName)}
                                className="text-red-600 hover:text-red-800"
                                aria-label={`Ka saar ${tName}`}
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </span>
                          )
                        })}
                    </div>
                  )}
                  {group.isAllTenants && (
                    <div className="text-xs text-muted-foreground mt-1">Dhammaan resellers-ka</div>
                  )}
                </div>
                {!group.isAllTenants && remaining.length > 0 && (
                  <Button variant="outline" size="sm" onClick={() => openShare(group)}>
                    <Plus className="h-4 w-4 mr-1" /> Resellers ku dar
                  </Button>
                )}

                {group.platform === 'android' && (
                  <label className="inline-flex">
                    <input
                      type="file"
                      accept=".apk,application/vnd.android.package-archive"
                      className="hidden"
                      disabled={replacingKey === group.key}
                      onChange={(e) => {
                        const nextFile = e.target.files?.[0] ?? null
                        void replaceApkOnly(group, nextFile)
                        e.currentTarget.value = ''
                      }}
                    />
                    <span
                      className="inline-flex h-9 cursor-pointer items-center justify-center rounded-md border border-input bg-background px-3 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground"
                      aria-disabled={replacingKey === group.key}
                    >
                      {replacingKey === group.key ? (
                        <>
                          <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                          Waa la rarayaa...
                        </>
                      ) : recentlyReplacedKey === group.key ? (
                        <>
                          <CheckCircle2 className="mr-1 h-4 w-4 text-emerald-600" />
                          APK waa la beddelay
                        </>
                      ) : (
                        <>
                          <Upload className="mr-1 h-4 w-4" />
                          APK beddel
                        </>
                      )}
                    </span>
                  </label>
                )}

                <Button variant="outline" size="sm" onClick={() => toggle(group)}>
                  {group.anyActive ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
                <Button variant="outline" size="sm" onClick={() => remove(group)}>
                  <Trash2 className="h-4 w-4 text-red-600" />
                </Button>
              </div>

              {shareKey === group.key && (
                <div className="rounded-md border bg-background p-3 space-y-2">
                  <div className="text-xs text-muted-foreground">
                    Resellers cusub dooro — file-ka dib looma rarayo.
                  </div>
                  <div className="max-h-40 overflow-y-auto space-y-1">
                    {remaining.map((t) => (
                      <label key={t.id} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="h-4 w-4"
                          checked={shareIds.includes(t.id)}
                          onChange={() =>
                            setShareIds((prev) =>
                              prev.includes(t.id) ? prev.filter((x) => x !== t.id) : [...prev, t.id],
                            )
                          }
                        />
                        {t.name}
                      </label>
                    ))}
                  </div>
                  <Button size="sm" disabled={sharing} onClick={() => saveShare(group)}>
                    {sharing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
                    Kaydi
                  </Button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
