import { useEffect, useState } from 'react'
import { Link } from "@/lib/router-compat"
import { supabase } from '@/integrations/supabase/client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Plus, ExternalLink, Copy, Search, Users, CalendarDays } from 'lucide-react'
import { toast } from '@/hooks/use-toast'

interface Row {
  id: string; slug: string; name: string; status: string;
  current_period_end: string | null;
  subscription_plans?: { name: string; price_monthly: number } | null;
}

const effectiveStatus = (r: Row) => {
  if (r.status !== 'active') return r.status
  if (r.current_period_end && new Date(r.current_period_end).getTime() <= Date.now()) return 'expired'
  return 'active'
}

const statusVariant = (s: string): any =>
  s === 'active' ? 'default' : s === 'trial' ? 'secondary' : 'destructive'

export default function ResellersPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [emails, setEmails] = useState<Record<string, string>>({})
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  const copyText = async (text: string, label: string) => {
    await navigator.clipboard.writeText(text)
    toast({ title: `✅ ${label} waa la copy gareeyay` })
  }

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('tenants')
        .select('id, slug, name, status, current_period_end, subscription_plans(name, price_monthly)')
        .order('created_at', { ascending: false })
      setRows((data ?? []) as any); setLoading(false)
      const { data: em } = await supabase.rpc('get_tenant_owner_emails')
      const map: Record<string, string> = {}
      for (const r of (em ?? []) as any[]) if (r.owner_email) map[r.tenant_id] = r.owner_email
      setEmails(map)
    })()
  }, [])

  const filteredRows = rows.filter((row) => {
    const q = searchQuery.trim().toLowerCase()
    const email = emails[row.id] ?? ''
    const matchesSearch = !q || [
      row.name,
      row.slug,
      row.subscription_plans?.name ?? '',
      email,
    ].some((value) => value.toLowerCase().includes(q))
    const status = effectiveStatus(row)
    const matchesStatus = statusFilter === 'all' || status === statusFilter
    return matchesSearch && matchesStatus
  })

  const LinksBlock = ({ r }: { r: Row }) => (
    <div className="space-y-1.5 text-[11px]">
      <div className="flex min-w-0 items-center gap-1">
        <span className="truncate text-slate-600">{emails[r.id] ?? 'Email lama hayo'}</span>
        {emails[r.id] && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 shrink-0 rounded-full p-0 text-slate-400 hover:text-slate-800"
            onClick={() => copyText(emails[r.id], 'Email')}
            aria-label="Copy email"
          >
            <Copy className="h-3 w-3" />
          </Button>
        )}
      </div>

      <div className="flex min-w-0 items-center gap-1">
        <a
          href={`/t/${r.slug}/providers`}
          target="_blank"
          rel="noreferrer"
          className="truncate font-mono text-slate-500 hover:text-slate-900 hover:underline"
        >
          iftinagents.com/t/{r.slug}
        </a>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 shrink-0 rounded-full p-0 text-slate-400 hover:text-slate-800"
          onClick={() => copyText(`https://iftinagents.com/t/${r.slug}`, 'Link-ga macaamiisha')}
          aria-label="Copy customer link"
        >
          <Copy className="h-3 w-3" />
        </Button>
      </div>

      <div className="flex min-w-0 items-center gap-1">
        <span className="truncate font-mono text-slate-400">
          iftinagents.com/t/{r.slug}/dashboard/login
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 shrink-0 rounded-full p-0 text-slate-400 hover:text-slate-800"
          onClick={() => copyText(`https://iftinagents.com/t/${r.slug}/dashboard/login`, 'Admin link')}
          aria-label="Copy admin link"
        >
          <Copy className="h-3 w-3" />
        </Button>
      </div>
    </div>
  )

  return (
    <div className="min-h-full px-4 py-6 sm:px-7 lg:px-8 lg:py-8">
      <div className="mx-auto w-full max-w-[1500px]">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-[26px] font-semibold tracking-tight text-[#0c1220]">Resellers</h1>
            <p className="mt-1 text-sm text-slate-500">
              Reseller-yada ka maamul, status-kooda eeg, links-kooda fur ama xogtooda wax ka beddel.
            </p>
          </div>

          <Button
            asChild
            size="sm"
            className="h-9 rounded-full bg-[#0c1220] px-5 text-sm font-semibold text-white hover:bg-[#172033]"
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
                <span className="absolute inset-x-0 bottom-0 h-[3px] rounded-t-full bg-[#ff3366]" />
              </button>
            </div>

            <div className="flex flex-1 flex-wrap items-center justify-end gap-3 pb-3">
              <div className="relative w-full max-w-[320px]">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by name, slug, email or plan"
                  className="h-9 border-0 bg-transparent pl-9 shadow-none focus-visible:ring-0"
                />
              </div>

              <div className="flex rounded-md bg-white p-1 shadow-[inset_0_0_0_1px_rgba(15,23,42,0.06)]">
                {[
                  ['all', 'All'],
                  ['active', 'Active'],
                  ['trial', 'Trial'],
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
                className="h-[220px] animate-pulse rounded-xl border border-black/10 bg-white/70"
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
              return (
                <div
                  key={r.id}
                  className="overflow-hidden rounded-xl border border-black/10 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.035)]"
                >
                  <div className="p-4">
                    <div className="flex items-start gap-4">
                      <div className="flex h-[68px] w-[68px] shrink-0 items-center justify-center rounded-xl border border-black/10 bg-[#f6f6f4]">
                        <span className="text-xl font-semibold uppercase text-slate-500">
                          {r.name.trim().slice(0, 2) || 'R'}
                        </span>
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
                            <span>{r.subscription_plans?.name ?? 'No plan'}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <CalendarDays className="h-3.5 w-3.5 text-slate-400" />
                            <span>
                              {r.current_period_end
                                ? `Period end: ${new Date(r.current_period_end).toLocaleDateString()}`
                                : 'Period end: —'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 rounded-lg bg-[#fafafa] p-3">
                      <LinksBlock r={r} />
                    </div>
                  </div>

                  <div className="flex items-center justify-between border-t border-black/5 px-4 py-3">
                    <span className="text-[11px] text-slate-400">
                      {r.subscription_plans?.price_monthly != null
                        ? `$${r.subscription_plans.price_monthly}/month`
                        : 'Plan price —'}
                    </span>

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
