import { useEffect, useState } from 'react'
import { supabase, supabaseAllTenants } from '@/integrations/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Loader2, Trash2, Upload, Smartphone, Eye, EyeOff, Plus, CheckCircle2, Search, Share2 } from 'lucide-react'
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
  const [searchQuery, setSearchQuery] = useState('')
  const [platformFilter, setPlatformFilter] = useState('all')
  const [showUpload, setShowUpload] = useState(false)

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
      setShowUpload(false)
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

  const filteredGroups = groups.filter((group) => {
    const q = searchQuery.trim().toLowerCase()
    const matchesSearch = !q || [group.name, group.version ?? '', group.platform]
      .some((value) => value.toLowerCase().includes(q))
    const matchesPlatform = platformFilter === 'all' || group.platform === platformFilter
    return matchesSearch && matchesPlatform
  })

  const relativeUpdated = (value?: string | null) => {
    if (!value) return 'Updated recently'
    const diffMs = Math.max(0, Date.now() - new Date(value).getTime())
    const minutes = Math.floor(diffMs / 60000)
    if (minutes < 60) return 'Updated ' + Math.max(1, minutes) + ' min ago'
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return 'Updated ' + hours + ' hr ago'
    const days = Math.floor(hours / 24)
    return 'Updated ' + days + ' day' + (days === 1 ? '' : 's') + ' ago'
  }

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
    <div className="min-h-full px-4 py-6 sm:px-7 lg:px-8 lg:py-8">
      <div className="mx-auto w-full max-w-[1500px]">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-[26px] font-semibold tracking-tight text-[#0c1220]">Apps</h1>
            <p className="mt-1 text-sm text-slate-500">
              Apps-ka reseller-yada ka maamul, daabac ama APK-ga cusub ku beddel.
            </p>
          </div>
          <Button
            type="button"
            onClick={() => setShowUpload((value) => !value)}
            className="h-9 rounded-full bg-[#0c1220] px-5 text-sm font-semibold text-white hover:bg-[#172033]"
          >
            <Plus className="mr-2 h-4 w-4" />
            Upload App
          </Button>
        </div>

        {showUpload ? (
          <form
            onSubmit={submit}
            className="mb-7 rounded-xl border border-black/10 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.03)]"
          >
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-slate-950">Upload app</h2>
                <p className="mt-1 text-xs text-slate-500">Xogtii iyo logic-gii hore sidii ayay u shaqaynayaan.</p>
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={() => setShowUpload(false)}>
                Xir
              </Button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Magaca app-ka</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Iftin Delivery" className="bg-white" />
              </div>
              <div className="space-y-1.5">
                <Label>Version</Label>
                <Input value={version} onChange={(e) => setVersion(e.target.value)} placeholder="2.4" className="bg-white" />
              </div>
              <div className="space-y-1.5">
                <Label>Nooca</Label>
                <select
                  className="h-10 w-full rounded-md border border-input bg-white px-3 text-sm"
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
                <div className="max-h-48 space-y-2 overflow-y-auto rounded-md border bg-[#fafafa] p-3">
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

            <div className="mt-4 space-y-1.5">
              <Label>Sharaxaad</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="bg-white" />
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>File (APK)</Label>
                <Input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="bg-white" />
              </div>
              <div className="space-y-1.5">
                <Label>Ama link dibadeed</Label>
                <Input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://…" className="bg-white" />
              </div>
            </div>

            <div className="mt-5">
              <Button type="submit" disabled={saving} className="bg-[#0c1220] text-white hover:bg-[#172033]">
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                Daabac
              </Button>
            </div>
          </form>
        ) : null}

        <div className="mb-7 border-b border-black/10">
          <div className="flex min-w-0 flex-wrap items-end justify-between gap-4">
            <div className="flex gap-7">
              <button
                type="button"
                className="relative pb-3 text-sm font-semibold text-[#0c1220]"
                onClick={() => setPlatformFilter('all')}
              >
                Apps
                <span className="ml-1.5 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] text-slate-600">{groups.length}</span>
                <span className="absolute inset-x-0 bottom-0 h-[3px] rounded-t-full bg-[#ff3366]" />
              </button>
            </div>

            <div className="flex flex-1 flex-wrap items-center justify-end gap-3 pb-3">
              <div className="relative w-full max-w-[320px]">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by name, version, or platform"
                  className="h-9 border-0 bg-transparent pl-9 shadow-none focus-visible:ring-0"
                />
              </div>
              <div className="flex rounded-md bg-white p-1 shadow-[inset_0_0_0_1px_rgba(15,23,42,0.06)]">
                {[
                  ['all', 'All'],
                  ['android', 'Android'],
                  ['ios', 'iOS'],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setPlatformFilter(value)}
                    className={
                      'rounded px-3 py-1.5 text-xs font-medium transition ' +
                      (platformFilter === value
                        ? 'bg-[#efefef] text-slate-950 shadow-sm'
                        : 'text-slate-500 hover:text-slate-900')
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex min-h-[260px] items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          </div>
        ) : filteredGroups.length === 0 ? (
          <div className="rounded-xl border border-dashed border-black/15 bg-white/60 px-6 py-14 text-center">
            <Smartphone className="mx-auto mb-3 h-8 w-8 text-slate-300" />
            <div className="text-sm font-medium text-slate-700">App lama helin.</div>
            <div className="mt-1 text-xs text-slate-500">Search/filter-ka beddel ama app cusub soo geli.</div>
          </div>
        ) : (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {filteredGroups.map((group) => {
              const remaining = tenants.filter((t) => !group.rows.some((r) => r.tenant_id === t.id))
              const sample = group.rows[0]
              const updatedAt = group.apk_updated_at || sample.created_at

              return (
                <div
                  key={group.key}
                  className="overflow-hidden rounded-xl border border-black/10 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.035)]"
                >
                  <div className="flex min-h-[132px] gap-4 p-4">
                    <div className="flex h-[92px] w-[92px] shrink-0 items-center justify-center overflow-hidden rounded-lg border border-black/10 bg-[#f6f6f4]">
                      {sample.icon_url ? (
                        <img src={sample.icon_url} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <Smartphone className="h-9 w-9 text-slate-300" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-[14px] font-semibold text-[#0c1220]">{group.name}</div>
                          <div className="mt-0.5 truncate text-[11px] text-slate-500">
                            {group.platform}{group.version ? ' · v' + group.version : ''}
                          </div>
                        </div>
                        <span
                          className={
                            'mt-0.5 h-2 w-2 shrink-0 rounded-full ' +
                            (group.anyActive ? 'bg-emerald-500' : 'bg-slate-300')
                          }
                          title={group.anyActive ? 'Active' : 'Hidden'}
                        />
                      </div>

                      <div className="mt-3 space-y-1 text-[11px] text-slate-500">
                        <div>{relativeUpdated(updatedAt)}</div>
                        <div>
                          {group.isAllTenants
                            ? 'Dhammaan resellers-ka'
                            : group.rows.filter((r) => r.tenant_id).length + ' reseller'}
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-1.5">
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          className="h-7 rounded-full px-3 text-[11px]"
                          onClick={() => toggle(group)}
                        >
                          {group.anyActive ? <EyeOff className="mr-1 h-3.5 w-3.5" /> : <Eye className="mr-1 h-3.5 w-3.5" />}
                          {group.anyActive ? 'Hide' : 'Show'}
                        </Button>

                        {!group.isAllTenants && remaining.length > 0 ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 rounded-full p-0"
                            onClick={() => openShare(group)}
                            aria-label="Resellers ku dar"
                          >
                            <Share2 className="h-3.5 w-3.5" />
                          </Button>
                        ) : null}

                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 rounded-full p-0 text-red-500 hover:text-red-600"
                          onClick={() => remove(group)}
                          aria-label="Tirtir app"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>

                  {group.platform === 'android' ? (
                    <div className="border-t border-black/5 px-4 py-3">
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
                          className="inline-flex h-8 cursor-pointer items-center justify-center rounded-md border border-black/10 bg-white px-3 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                          aria-disabled={replacingKey === group.key}
                        >
                          {replacingKey === group.key ? (
                            <>
                              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                              Waa la rarayaa...
                            </>
                          ) : recentlyReplacedKey === group.key ? (
                            <>
                              <CheckCircle2 className="mr-1.5 h-3.5 w-3.5 text-emerald-600" />
                              APK waa la beddelay
                            </>
                          ) : (
                            <>
                              <Upload className="mr-1.5 h-3.5 w-3.5" />
                              APK beddel
                            </>
                          )}
                        </span>
                      </label>
                    </div>
                  ) : null}

                  {shareKey === group.key ? (
                    <div className="border-t border-black/5 bg-[#fafafa] p-4">
                      <div className="mb-2 text-xs font-medium text-slate-700">Resellers cusub ku dar</div>
                      <div className="max-h-36 space-y-1 overflow-y-auto">
                        {remaining.map((t) => (
                          <label key={t.id} className="flex items-center gap-2 text-xs text-slate-700">
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
                      <Button size="sm" className="mt-3 h-8 bg-[#0c1220] text-xs text-white" disabled={sharing} onClick={() => saveShare(group)}>
                        {sharing ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                        Kaydi
                      </Button>
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
