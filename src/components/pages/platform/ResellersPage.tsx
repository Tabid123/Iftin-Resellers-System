import { useEffect, useState } from 'react'
import { Link } from "@/lib/router-compat"
import { platformSupabase as supabase } from '@/integrations/supabase/client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Plus, ExternalLink, Search, Users, CalendarDays } from 'lucide-react'
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
  renewal_yearly_price: number | null
  created_at: string
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

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('tenants')
        .select('id, slug, name, status, logo_url, current_period_end, trial_ends_at, first_year_price, renewal_yearly_price, created_at, subscription_plans(name)')
        .order('created_at', { ascending: false })
      setRows((data ?? []) as any)
      setLoading(false)
    })()
  }, [])

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

  return (
    <div className="min-h-full px-4 py-6 sm:px-7 lg:px-8 lg:py-8">
      <div className="mx-auto w-full max-w-[1500px]">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-[26px] font-semibold tracking-tight text-[#0c1220]">Resellers</h1>
            <p className="mt-1 text-sm text-slate-500">
              Reseller-yada ka maamul, status-kooda, yearly pricing-kooda iyo waqtiga ay dhacayaan eeg.
            </p>
          </div>

          <Button
            asChild
            size="sm"
            className="h-9 rounded-full bg-[#0b5ed7] px-5 text-sm font-semibold text-white hover:bg-[#094fb6]"
          >
            <Link to="/admin/resellers/new">
              <Plus className="mr-2 h-4 w-4" />
              New Reseller
            </Link>
          </Button>
        </div>

        <div className="mb-7 border-b border-black/10">
          <div className="flex min-w-0 flex-wrap items-end justify-between gap-4">
            <div className="flex gap-7">
              <button type="button" className="relative pb-3 text-sm font-semibold text-[#0c1220]">
                Resellers
                <span className="ml-1.5 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] text-slate-600">
                  {rows.length}
                </span>
                <span className="absolute inset-x-0 bottom-0 h-[3px] rounded-t-full bg-[#ff7a00]" />
              </button>
            </div>

            <div className="flex flex-1 flex-wrap items-center justify-end gap-3 pb-3">
              <div className="relative w-full max-w-[320px]">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by name, slug or plan"
                  className="h-9 border-0 bg-transparent pl-9 shadow-none focus-visible:ring-0"
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
                    onClick={() => setStatusFilter(value)}
                    className={
                      'rounded px-3 py-1.5 text-xs font-medium transition ' +
                      (statusFilter === value
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
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((item) => (
              <div
                key={item}
                className="h-[190px] animate-pulse rounded-xl border border-black/10 bg-white/70"
              />
            ))}
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-black/15 bg-white/60 px-6 py-14 text-center">
            <Users className="mx-auto mb-3 h-8 w-8 text-slate-300" />
            <div className="text-sm font-medium text-slate-700">Reseller lama helin.</div>
            <div className="mt-1 text-xs text-slate-500">
              Search/filter-ka beddel ama reseller cusub samee.
            </div>
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
