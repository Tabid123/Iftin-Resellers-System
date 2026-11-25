import { useEffect, useState } from 'react'
import { Link } from "@/lib/router-compat"
import { platformSupabase as supabase } from '@/integrations/supabase/client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Plus, ExternalLink, Search, Users, CalendarDays, CheckCircle2, Clock3, AlertCircle, PauseCircle, LayoutGrid, List } from 'lucide-react'
import CachedImage from '@/components/CachedImage'

interface Row {
  id: string
  slug: string
  name: string
  status: string
  logo_url: string | null
  current_period_end: string | null
  trial_ends_at: string | null
  first_year_price: number | null
  billing_cycle: 'monthly' | 'yearly'
  monthly_price: number | null
  renewal_yearly_price: number | null
  created_at: string
  updated_at: string
  subscription_plans?: { name: string } | null
}

const effectiveStatus = (r: Row) => {
  if (r.status === 'trial') {
    if (r.trial_ends_at && new Date(r.trial_ends_at).getTime() <= Date.now()) return 'expired'
    return 'trial'
  }
  if (r.status !== 'active') return r.status
  if (r.current_period_end && new Date(r.current_period_end).getTime() <= Date.now()) return 'expired'
  return 'active'
}

const statusVariant = (s: string): any =>
  s === 'active' ? 'default' : s === 'trial' ? 'secondary' : 'destructive'

const money = (value: number | null | undefined) =>
  value == null ? null : new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(Number(value))

const daysLeft = (endDate: string | null | undefined) => {
  if (!endDate) return null
  const diff = new Date(endDate).getTime() - Date.now()
  return Math.max(0, Math.ceil(diff / 86400000))
}

export default function ResellersPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [view, setView] = useState<'table' | 'grid'>('table')
  const [page, setPage] = useState(1)

  const [loadError, setLoadError] = useState(false)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let active = true
    const controller = new AbortController()
    const timeout = window.setTimeout(() => {
      controller.abort()
      if (active) {
        setLoadError(true)
        setLoading(false)
      }
    }, 12000)
    setLoading(true)
    setLoadError(false)

    void (async () => {
      try {
        // Render the reseller list first. Embedded logos can add several MB
        // to the response; use independent browser image requests for public logos.
        const { data, error } = await supabase
          .from('tenants')
          .select('id, slug, name, status, current_period_end, trial_ends_at, first_year_price, renewal_yearly_price, billing_cycle, monthly_price, created_at, updated_at, subscription_plans(name)')
          .order('created_at', { ascending: false })
          .abortSignal(controller.signal)
        if (error) throw error
        if (!active || controller.signal.aborted) return
        const list = ((data ?? []) as unknown as Omit<Row, 'logo_url'>[]).map(row => ({ ...row, logo_url: `/api/public/tenant-icon?tenant=${encodeURIComponent(row.slug)}&v=${encodeURIComponent(row.updated_at || '')}&strict=1` }))
        setRows(list)
        setLoading(false)
        window.clearTimeout(timeout)


      } catch (error) {
        if (active && !controller.signal.aborted) {
          console.warn('[platform/resellers] Could not load reseller list', error)
          setLoadError(true)
        }
      } finally {
        window.clearTimeout(timeout)
        if (active) setLoading(false)
      }
    })()

    return () => {
      active = false
      window.clearTimeout(timeout)
      controller.abort()
    }
  }, [reload])

  const filteredRows = rows.filter((row) => {
    const q = searchQuery.trim().toLowerCase()
    const matchesSearch = !q || [
      row.name,
      row.slug,
      row.subscription_plans?.name ?? '',
      new Date(row.created_at).toLocaleString(),
    ].some((value) => value.toLowerCase().includes(q))
    const status = effectiveStatus(row)
    const matchesStatus = statusFilter === 'all' || status === statusFilter
    return matchesSearch && matchesStatus
  })

  const stats = [
    { key: 'all', label: 'Total Resellers', icon: Users, tone: 'bg-white/20 text-white', surface: 'bg-gradient-to-br from-blue-600 to-blue-800 text-white' },
    { key: 'active', label: 'Active', icon: CheckCircle2, tone: 'bg-white/20 text-white', surface: 'bg-gradient-to-br from-emerald-500 to-emerald-700 text-white' },
    { key: 'trial', label: 'Trial', icon: Clock3, tone: 'bg-white/20 text-white', surface: 'bg-gradient-to-br from-orange-400 to-orange-600 text-white' },
    { key: 'expired', label: 'Expired', icon: AlertCircle, tone: 'bg-white/20 text-white', surface: 'bg-gradient-to-br from-rose-500 to-rose-700 text-white' },
    { key: 'suspended', label: 'Suspended', icon: PauseCircle, tone: 'bg-white/20 text-white', surface: 'bg-gradient-to-br from-slate-500 to-slate-700 text-white' },
  ].map(stat => ({ ...stat, count: stat.key === 'all' ? rows.length : rows.filter(row => effectiveStatus(row) === stat.key).length }))
  const pageSize = 10
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize))
  const currentPage = Math.min(page, pageCount)
  const visibleRows = filteredRows.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  const statusTone = (status: string) => status === 'active' ? 'bg-emerald-100 text-emerald-800' : status === 'trial' ? 'bg-amber-100 text-amber-800' : status === 'expired' ? 'bg-rose-100 text-rose-800' : 'bg-slate-100 text-slate-700'
  const formatDate = (value: string | null) => value ? new Date(value).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

  return (
    <div className="min-h-full px-4 py-6 sm:px-7 lg:px-8 lg:py-8">
      <div className="mx-auto w-full max-w-[1500px]">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-[30px] font-bold tracking-tight text-[#0c1220]">Resellers</h1>
            <p className="mt-1 text-sm text-slate-500">
              Reseller-yada ka maamul, qorshahooda Monthly/Yearly, status-kooda iyo waqtiga ay dhacayaan eeg.
            </p>
          </div>

          <Button
            asChild
            size="sm"
            className="h-10 rounded-xl bg-[#0758ed] px-5 text-sm font-semibold text-white hover:bg-[#094fb6]"
          >
            <Link to="/admin/resellers/new">
              <Plus className="mr-2 h-4 w-4" />
              New Reseller
            </Link>
          </Button>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          {stats.map(stat => (
            <button key={stat.key} type="button" onClick={() => { setStatusFilter(stat.key); setPage(1) }} aria-pressed={statusFilter === stat.key} className={`flex min-w-0 items-center gap-3 rounded-2xl p-5 text-left shadow-sm transition hover:brightness-105 focus-visible:ring-2 focus-visible:ring-blue-500 ${stat.surface}`}>
              <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${stat.tone}`}><stat.icon className="h-5 w-5" /></span>
              <span className="min-w-0"><span className="block text-xs font-medium text-white/90">{stat.label}</span><span className="mt-1 block text-3xl font-bold tracking-tight text-white">{loading || loadError ? '—' : stat.count}</span></span>
            </button>
          ))}
        </div>
        <div className="mb-5 rounded-2xl border border-slate-200 bg-white px-4 pt-4 shadow-sm">
          <div className="flex min-w-0 flex-wrap items-end justify-between gap-4">
            <div className="flex gap-7">
              <button type="button" className="relative pb-3 text-sm font-semibold text-[#0c1220]">
                Resellers
                <span className="ml-1.5 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] text-slate-600">
                  {loading || loadError ? '—' : rows.length}
                </span>
                <span className="absolute inset-x-0 bottom-0 h-[3px] rounded-t-full bg-[#ff7a00]" />
              </button>
            </div>

            <div className="flex flex-1 flex-wrap items-center justify-end gap-3 pb-3">
              <div className="relative w-full max-w-[320px]">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <Input
                  value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value); setPage(1) }}
                  placeholder="Search by name, slug or plan"
                  className="h-10 rounded-xl border-slate-200 bg-slate-50 pl-9 shadow-none"
                />
              </div>

              <div className="flex rounded-md bg-white p-1 shadow-[inset_0_0_0_1px_rgba(15,23,42,0.06)]">
                {[
                  ['all', 'All'],
                  ['active', 'Active'],
                  ['trial', 'Trial'],
                  ['expired', 'Expired'],
                  ['suspended', 'Suspended'],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => { setStatusFilter(value); setPage(1) }}
                    className={
                      'rounded px-3 py-1.5 text-xs font-medium transition ' +
                      (statusFilter === value
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'text-slate-500 hover:text-slate-900')
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="flex gap-1 rounded-lg border border-slate-200 p-1">
                <Button size="icon" variant={view === 'table' ? 'default' : 'ghost'} className="h-8 w-8" aria-label="Table view" aria-pressed={view === 'table'} onClick={() => setView('table')}><List className="h-4 w-4" /></Button>
                <Button size="icon" variant={view === 'grid' ? 'default' : 'ghost'} className="h-8 w-8" aria-label="Grid view" aria-pressed={view === 'grid'} onClick={() => setView('grid')}><LayoutGrid className="h-4 w-4" /></Button>
              </div>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((item) => (
              <div
                key={item}
                className="h-[190px] animate-pulse rounded-xl border border-black/10 bg-white/70"
              />
            ))}
          </div>
        ) : loadError ? (
          <div role="alert" className="rounded-xl border border-black/10 bg-white/60 px-6 py-10 text-center">
            <div className="text-sm font-medium text-slate-700">Reseller-yada lama soo akhrin karin.</div>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => setReload(value => value + 1)}>Dib u isku day</Button>
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-black/15 bg-white/60 px-6 py-14 text-center">
            <Users className="mx-auto mb-3 h-8 w-8 text-slate-300" />
            <div className="text-sm font-medium text-slate-700">Reseller lama helin.</div>
            <div className="mt-1 text-xs text-slate-500">
              Search/filter-ka beddel ama reseller cusub samee.
            </div>
          </div>
        ) : view === 'table' ? (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[780px] text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-500"><tr>{['Reseller', 'Slug', 'Plan', 'Billing', 'Status', 'Period end', 'Actions'].map(label => <th key={label} className="whitespace-nowrap px-4 py-4">{label}</th>)}</tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {visibleRows.map(row => {
                    const status = effectiveStatus(row)
                    return <tr key={row.id} className="transition hover:bg-blue-50/50">
                      <td className="px-4 py-3"><div className="flex items-center gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50">{row.logo_url ? <CachedImage src={row.logo_url} alt={row.name} bundledName={null} loading="lazy" className="h-full w-full object-contain" fallback={<span className="text-xs font-bold text-slate-500">{row.name.slice(0, 2).toUpperCase()}</span>} /> : <span className="text-xs font-bold text-slate-500">{row.name.slice(0, 2).toUpperCase()}</span>}</div><div><div className="font-semibold text-slate-900">{row.name}</div><div className="text-xs text-slate-500">{formatDate(row.created_at)}</div></div></div></td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-500">/{row.slug}</td>
                      <td className="px-4 py-3 text-xs font-medium">{row.subscription_plans?.name || '—'}</td>
                      <td className="px-4 py-3 capitalize">{row.billing_cycle || '—'}</td>
                      <td className="px-4 py-3"><span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${statusTone(status)}`}><span className="h-1.5 w-1.5 rounded-full bg-current" />{status}</span></td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatDate(row.status === 'trial' ? row.trial_ends_at : row.current_period_end)}</td>
                      <td className="px-4 py-3"><Button asChild variant="outline" size="sm" className="rounded-lg"><Link to={`/admin/resellers/${row.id}`}>Maamul <ExternalLink className="ml-2 h-3.5 w-3.5" /></Link></Button></td>
                    </tr>
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-4 text-xs text-slate-500"><span>Showing {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filteredRows.length)} of {filteredRows.length} resellers</span><div className="flex items-center gap-2"><Button size="sm" variant="outline" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Previous</Button><span className="font-semibold">{currentPage} / {pageCount}</span><Button size="sm" variant="outline" disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)}>Next</Button></div></div>
          </div>
        ) : (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {filteredRows.map((r) => {
              const status = effectiveStatus(r)
              const endDate = r.status === 'trial' ? r.trial_ends_at : r.current_period_end
              const remainingDays = daysLeft(endDate)
              const firstYear = money(r.first_year_price)
              const renewal = money(r.renewal_yearly_price)

              return (
                <div
                  key={r.id}
                  className="overflow-hidden rounded-xl border border-black/10 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.035)]"
                >
                  <div className="p-4">
                    <div className="flex items-start gap-4">
                      <div className="flex h-[72px] w-[72px] shrink-0 items-center justify-center overflow-hidden rounded-xl border border-black/10 bg-[#f6f6f4]">
                        {r.logo_url ? (
                          <CachedImage
                            src={r.logo_url}
                            bundledName={null}
                            loading="lazy"
                            fallback={<span className="text-xl font-semibold uppercase text-slate-500">{r.name.slice(0, 2)}</span>}
                            alt={`${r.name} logo`}
                            className="h-full w-full object-contain"
                          />
                        ) : (
                          <span className="text-xl font-semibold uppercase text-slate-500">
                            {r.name.trim().slice(0, 2) || 'R'}
                          </span>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="truncate text-[14px] font-semibold text-[#0c1220]">
                              {r.name}
                            </div>
                            <div className="mt-0.5 truncate text-[11px] text-slate-500">
                              /{r.slug}
                            </div>
                          </div>

                          <Badge
                            variant={statusVariant(status)}
                            className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium"
                          >
                            {status}
                          </Badge>
                        </div>

                        <div className="mt-3 space-y-1.5 text-[11px] text-slate-500">
                          <div className="flex items-center gap-1.5">
                            <Users className="h-3.5 w-3.5 text-slate-400" />
                            <span>
                              Created: {new Date(r.created_at).toLocaleString('en-GB', {
                                day: '2-digit',
                                month: '2-digit',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <CalendarDays className="h-3.5 w-3.5 text-slate-400" />
                            <span>
                              {endDate
                                ? `${r.status === 'trial' ? 'Trial end' : 'Period end'}: ${new Date(endDate).toLocaleDateString()}`
                                : 'Period end: —'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-end justify-between gap-3 border-t border-black/5 px-4 py-3">
                    <div className="space-y-0.5 text-[11px]">
                      {r.status === 'trial' ? (
                        <div className="font-medium text-slate-500">3-day trial</div>
                      ) : r.billing_cycle === 'monthly' ? (
                        <div className="font-medium text-emerald-700">$15 / bil — Monthly</div>
                      ) : (
                        <>
                          <div className="font-medium text-slate-700">
                            Year 1: {firstYear ? `$${firstYear} / yearly` : '$50 / yearly'}
                          </div>
                          <div className="text-slate-400">
                            Next year: {renewal ? `$${renewal} / yearly` : '$150–$200 / yearly'}
                          </div>
                        </>
                      )}
                    </div>

                    <Button asChild variant="outline" size="sm" className="h-8 rounded-md px-3 text-xs">
                      <Link to={`/admin/resellers/${r.id}`}>
                        Maamul
                        <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
