import { useEffect, useMemo, useState } from 'react'
import { Link } from '@/lib/router-compat'
import { platformSupabase as supabase } from '@/integrations/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import {
  Users,
  DollarSign,
  Activity,
  AlertCircle,
  CalendarDays,
  Clock3,
  TrendingUp,
  WalletCards,
  ArrowUpRight,
} from 'lucide-react'

type TenantRow = {
  id: string
  name: string
  slug: string
  status: string
  created_at: string
  current_period_end: string | null
  trial_ends_at: string | null
  first_year_price: number | null
  renewal_yearly_price: number | null
}

type RevenueEvent = {
  id: string
  tenantId: string
  name: string
  slug: string
  date: Date
  type: 'first_year' | 'renewal'
  min: number
  max: number
}

type MonthForecast = {
  key: string
  date: Date
  events: RevenueEvent[]
  min: number
  max: number
}

const money = (value: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: value % 1 === 0 ? 0 : 2,
  }).format(value)

const rangeMoney = (min: number, max: number) =>
  min === max ? money(min) : `${money(min)}–${money(max)}`

const monthKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`

const monthLabel = (date: Date) =>
  date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

const shortDate = (date: Date) =>
  date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })

function isExpired(tenant: TenantRow, nowMs: number) {
  if (tenant.status === 'trial') {
    return Boolean(
      tenant.trial_ends_at &&
      new Date(tenant.trial_ends_at).getTime() <= nowMs,
    )
  }
  if (tenant.status === 'active') {
    return Boolean(
      tenant.current_period_end &&
      new Date(tenant.current_period_end).getTime() <= nowMs,
    )
  }
  return false
}

export default function PlatformDashboard() {
  const [tenants, setTenants] = useState<TenantRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      const { data } = await supabase
        .from('tenants')
        .select(
          'id, name, slug, status, created_at, current_period_end, trial_ends_at, first_year_price, renewal_yearly_price',
        )
        .order('created_at', { ascending: false })

      if (!mounted) return
      setTenants((data ?? []) as TenantRow[])
      setLoading(false)
    })()

    return () => {
      mounted = false
    }
  }, [])

  const dashboard = useMemo(() => {
    const now = new Date()
    const nowMs = now.getTime()

    // Business year starts from the month we are currently in.
    // Example: Sep 2026 -> Aug 2027.
    const startMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const endExclusive = new Date(
      startMonth.getFullYear(),
      startMonth.getMonth() + 12,
      1,
    )

    const activePaid = tenants.filter(
      (tenant) =>
        tenant.status === 'active' &&
        !isExpired(tenant, nowMs) &&
        Boolean(tenant.current_period_end),
    )

    const expired = tenants.filter((tenant) => isExpired(tenant, nowMs)).length
    const suspended = tenants.filter(
      (tenant) =>
        tenant.status === 'suspended' || tenant.status === 'cancelled',
    ).length

    const events: RevenueEvent[] = []

    for (const tenant of activePaid) {
      const createdAt = new Date(tenant.created_at)
      if (
        !Number.isNaN(createdAt.getTime()) &&
        createdAt >= startMonth &&
        createdAt < endExclusive
      ) {
        const amount = Number(tenant.first_year_price ?? 0)
        if (amount > 0) {
          events.push({
            id: `first-${tenant.id}`,
            tenantId: tenant.id,
            name: tenant.name,
            slug: tenant.slug,
            date: createdAt,
            type: 'first_year',
            min: amount,
            max: amount,
          })
        }
      }

      if (tenant.current_period_end) {
        const dueAt = new Date(tenant.current_period_end)
        if (
          !Number.isNaN(dueAt.getTime()) &&
          dueAt >= startMonth &&
          dueAt < endExclusive
        ) {
          const exact =
            tenant.renewal_yearly_price != null
              ? Number(tenant.renewal_yearly_price)
              : null

          events.push({
            id: `renewal-${tenant.id}`,
            tenantId: tenant.id,
            name: tenant.name,
            slug: tenant.slug,
            date: dueAt,
            type: 'renewal',
            min: exact ?? 150,
            max: exact ?? 200,
          })
        }
      }
    }

    const months: MonthForecast[] = Array.from({ length: 12 }, (_, index) => {
      const date = new Date(
        startMonth.getFullYear(),
        startMonth.getMonth() + index,
        1,
      )
      const key = monthKey(date)
      const monthEvents = events
        .filter((event) => monthKey(event.date) === key)
        .sort((a, b) => a.date.getTime() - b.date.getTime())

      return {
        key,
        date,
        events: monthEvents,
        min: monthEvents.reduce((sum, event) => sum + event.min, 0),
        max: monthEvents.reduce((sum, event) => sum + event.max, 0),
      }
    })

    const yearMin = events.reduce((sum, event) => sum + event.min, 0)
    const yearMax = events.reduce((sum, event) => sum + event.max, 0)
    const renewalEvents = events.filter((event) => event.type === 'renewal')
    const firstYearEvents = events.filter((event) => event.type === 'first_year')
    const thisMonth = months[0]

    const next30Days = renewalEvents.filter((event) => {
      const days = (event.date.getTime() - nowMs) / 86400000
      return days >= 0 && days <= 30
    }).length

    const currentMonthFirstYear = firstYearEvents
      .filter((event) => monthKey(event.date) === monthKey(startMonth))
      .reduce((sum, event) => sum + event.min, 0)

    return {
      total: tenants.length,
      active: activePaid.length,
      expired,
      suspended,
      yearMin,
      yearMax,
      renewalCount: renewalEvents.length,
      firstYearCount: firstYearEvents.length,
      thisMonth,
      currentMonthFirstYear,
      next30Days,
      months,
      startMonth,
      endMonth: new Date(
        startMonth.getFullYear(),
        startMonth.getMonth() + 11,
        1,
      ),
    }
  }, [tenants])

  const cards = [
    {
      label: 'Total Resellers',
      value: dashboard.total,
      note: 'Dhammaan tenants',
      icon: Users,
      wrap: 'bg-blue-50 border-blue-100',
      iconBox: 'bg-blue-600 text-white',
      valueClass: 'text-blue-950',
    },
    {
      label: 'Active Paid',
      value: dashboard.active,
      note: 'Paid + period valid',
      icon: Activity,
      wrap: 'bg-emerald-50 border-emerald-100',
      iconBox: 'bg-emerald-600 text-white',
      valueClass: 'text-emerald-950',
    },
    {
      label: 'Expired / Suspended',
      value: dashboard.expired + dashboard.suspended,
      note: `${dashboard.expired} expired · ${dashboard.suspended} suspended`,
      icon: AlertCircle,
      wrap: 'bg-red-50 border-red-100',
      iconBox: 'bg-red-600 text-white',
      valueClass: 'text-red-950',
    },
    {
      label: 'This Month Expected',
      value: rangeMoney(
        dashboard.thisMonth?.min ?? 0,
        dashboard.thisMonth?.max ?? 0,
      ),
      note: `${dashboard.thisMonth?.events.length ?? 0} payment events`,
      icon: DollarSign,
      wrap: 'bg-amber-50 border-amber-100',
      iconBox: 'bg-amber-500 text-white',
      valueClass: 'text-amber-950',
    },
    {
      label: 'First-Year This Month',
      value: money(dashboard.currentMonthFirstYear),
      note: `${dashboard.firstYearCount} first-year entries in this business year`,
      icon: WalletCards,
      wrap: 'bg-orange-50 border-orange-100',
      iconBox: 'bg-orange-500 text-white',
      valueClass: 'text-orange-950',
    },
    {
      label: 'Renewals This Year',
      value: dashboard.renewalCount,
      note: 'Paid tenants due inside 12 months',
      icon: Clock3,
      wrap: 'bg-cyan-50 border-cyan-100',
      iconBox: 'bg-cyan-600 text-white',
      valueClass: 'text-cyan-950',
    },
    {
      label: '12-Month Expected',
      value: rangeMoney(dashboard.yearMin, dashboard.yearMax),
      note: `${monthLabel(dashboard.startMonth)} → ${monthLabel(dashboard.endMonth)}`,
      icon: TrendingUp,
      wrap: 'bg-indigo-50 border-indigo-100',
      iconBox: 'bg-indigo-600 text-white',
      valueClass: 'text-indigo-950',
    },
    {
      label: 'Due Next 30 Days',
      value: dashboard.next30Days,
      note: 'Renewals u baahan follow-up',
      icon: CalendarDays,
      wrap: 'bg-violet-50 border-violet-100',
      iconBox: 'bg-violet-600 text-white',
      valueClass: 'text-violet-950',
    },
  ]

  const trialCount = tenants.filter(tenant => tenant.status === 'trial' && !isExpired(tenant, Date.now())).length
  const activeCount = tenants.filter(tenant => tenant.status === 'active' && !isExpired(tenant, Date.now())).length
  const otherCount = Math.max(0, tenants.length - activeCount - trialCount - dashboard.expired - dashboard.suspended)
  const breakdown = [
    { label: 'Active', count: activeCount, color: '#10b981' },
    { label: 'Trial', count: trialCount, color: '#3b82f6' },
    { label: 'Expired', count: dashboard.expired, color: '#f59e0b' },
    { label: 'Suspended / cancelled', count: dashboard.suspended, color: '#ef4444' },
    { label: 'Other', count: otherCount, color: '#94a3b8' },
  ].filter(item => item.count > 0 || item.label !== 'Other')
  let offset = 0
  const ring = breakdown.map(item => {
    const start = offset
    offset += tenants.length ? item.count / tenants.length * 100 : 0
    return `${item.color} ${start}% ${offset}%`
  }).join(', ')
  const chartMax = Math.max(1, ...dashboard.months.map(month => month.max))

  return (
    <div className="min-h-full px-4 py-6 sm:px-7 lg:px-8 lg:py-8">
      <div className="mx-auto w-full max-w-[1500px]">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-[30px] font-bold tracking-tight text-[#0c1220]">
              Overview
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Ku soo dhawoow, Super Admin. La soco resellers-ka, renewals iyo dakhliga la filayo.
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-semibold text-slate-600">
            Business year: {monthLabel(dashboard.startMonth)} → {monthLabel(dashboard.endMonth)}
          </div>
        </div>

        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 8 }, (_, index) => (
              <div
                key={index}
                className="h-[132px] animate-pulse rounded-2xl border border-black/5 bg-white/70"
              />
            ))}
          </div>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {cards.map((card) => (
                <Card
                  key={card.label}
                  className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
                >
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                          {card.label}
                        </p>
                        <div
                          className={`mt-3 truncate text-[30px] font-semibold tracking-tight ${card.valueClass}`}
                        >
                          {card.value}
                        </div>
                        <p className="mt-1 text-xs text-slate-500">{card.note}</p>
                      </div>
                      <div
                        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl shadow-sm ${card.iconBox}`}
                      >
                        <card.icon className="h-5 w-5" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="mt-6 grid gap-5 xl:grid-cols-[1.7fr_1fr]">
              <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-2"><div><h2 className="text-lg font-bold text-slate-900">Revenue forecast</h2><p className="mt-1 text-xs text-slate-500">12-month expected subscription revenue · not collected payments</p></div><span className="text-lg font-bold text-blue-600">{rangeMoney(dashboard.yearMin, dashboard.yearMax)}</span></div>
                <div className="mt-6 overflow-x-auto"><div className="flex min-w-[460px] items-end gap-2 border-b border-slate-200 pb-2 sm:gap-3">
                  {dashboard.months.map(month => <div key={month.key} className="flex min-w-0 flex-1 flex-col items-center gap-2"><div className="flex h-36 w-full items-end justify-center"><div title={rangeMoney(month.min, month.max)} aria-label={monthLabel(month.date) + ': ' + rangeMoney(month.min, month.max)} className="w-full max-w-[38px] rounded-t-md bg-gradient-to-t from-blue-700 to-blue-400" style={{ height: month.max ? Math.max(4, month.max / chartMax * 100) + '%' : '2px' }} /></div><span className="text-[10px] font-medium text-slate-500">{month.date.toLocaleDateString('en-US', { month: 'short' })}</span></div>)}
                </div></div>
              </section>
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                <h2 className="text-lg font-bold text-slate-900">Reseller status</h2><p className="mt-1 text-xs text-slate-500">Current subscription status</p>
                <div className="mt-5 flex flex-wrap items-center justify-center gap-6"><div className="flex h-36 w-36 shrink-0 items-center justify-center rounded-full" style={{ background: tenants.length ? `conic-gradient(${ring})` : '#e2e8f0' }}><div className="flex h-[108px] w-[108px] flex-col items-center justify-center rounded-full bg-white"><strong className="text-3xl text-slate-900">{tenants.length}</strong><span className="text-xs text-slate-500">Total</span></div></div><div className="min-w-[130px] flex-1 space-y-3">{breakdown.map(item => <div key={item.label} className="flex items-center gap-2 text-xs text-slate-600"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{background: item.color}} /><span className="flex-1">{item.label}</span><strong className="text-slate-900">{item.count}</strong></div>)}</div></div>
              </section>
            </div>
            <section className="mt-6 rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="flex items-center justify-between border-b border-slate-100 p-5"><h2 className="text-lg font-bold">Recent resellers</h2><Link to="/admin/resellers" className="text-sm font-semibold text-blue-600">View all</Link></div><div className="overflow-x-auto"><table className="w-full min-w-[520px] text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="px-5 py-3">Reseller</th><th className="px-5 py-3">Created</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Manage</th></tr></thead><tbody className="divide-y divide-slate-100">{tenants.slice(0,5).map(tenant => <tr key={tenant.id}><td className="px-5 py-3 font-medium">{tenant.name}<span className="block text-xs font-normal text-slate-500">/{tenant.slug}</span></td><td className="px-5 py-3">{new Date(tenant.created_at).toLocaleDateString('en-GB')}</td><td className="px-5 py-3 capitalize">{isExpired(tenant,Date.now()) ? 'expired' : tenant.status}</td><td className="px-5 py-3"><Link to={`/admin/resellers/${tenant.id}`} className="font-semibold text-blue-600">Maamul</Link></td></tr>)}</tbody></table></div></section>

            <div className="mt-8 overflow-hidden rounded-2xl border border-black/10 bg-white shadow-[0_8px_30px_rgba(15,23,42,0.04)]">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-black/5 px-5 py-5 sm:px-6">
                <div>
                  <div className="flex items-center gap-2">
                    <CalendarDays className="h-5 w-5 text-[#0b5ed7]" />
                    <h2 className="text-lg font-semibold text-[#0c1220]">
                      12-Month Revenue Calendar
                    </h2>
                  </div>
                  <p className="mt-1 text-sm text-slate-500">
                    Waxay ka bilaabataa bishan hadda lagu jiro. First-year lacagaha tenants-ka cusub iyo renewals-ka ayaa lagu kala muujinayaa.
                  </p>
                </div>

                <div className="rounded-xl bg-[#f6f8fb] px-4 py-3 text-right">
                  <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-slate-500">
                    12-month expected
                  </div>
                  <div className="mt-1 text-lg font-semibold text-[#0b5ed7]">
                    {rangeMoney(dashboard.yearMin, dashboard.yearMax)}
                  </div>
                </div>
              </div>

              <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 sm:p-6">
                {dashboard.months.map((month, index) => {
                  const monthTone = [
                    'border-blue-100 bg-blue-50/60',
                    'border-orange-100 bg-orange-50/60',
                    'border-emerald-100 bg-emerald-50/60',
                    'border-violet-100 bg-violet-50/60',
                  ][index % 4]

                  return (
                    <div
                      key={month.key}
                      className={`min-h-[190px] rounded-2xl border p-4 ${monthTone}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-slate-950">
                            {monthLabel(month.date)}
                          </div>
                          <div className="mt-1 text-xs text-slate-500">
                            {month.events.length} payment
                            {month.events.length === 1 ? '' : 's'}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-semibold text-slate-950">
                            {rangeMoney(month.min, month.max)}
                          </div>
                          <div className="text-[10px] uppercase tracking-wide text-slate-400">
                            expected
                          </div>
                        </div>
                      </div>

                      {month.events.length === 0 ? (
                        <div className="mt-8 rounded-xl border border-dashed border-slate-200 bg-white/60 px-3 py-4 text-center text-xs text-slate-400">
                          Payment ma jiro
                        </div>
                      ) : (
                        <div className="mt-4 space-y-2">
                          {month.events.map((event) => (
                            <Link
                              key={event.id}
                              to={`/admin/resellers/${event.tenantId}`}
                              className="flex items-center justify-between gap-3 rounded-xl border border-white/80 bg-white/80 px-3 py-2.5 transition hover:bg-white"
                            >
                              <div className="min-w-0">
                                <div className="truncate text-xs font-semibold text-slate-800">
                                  {event.name}
                                </div>
                                <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-slate-400">
                                  <span>{shortDate(event.date)}</span>
                                  <span>·</span>
                                  <span
                                    className={
                                      event.type === 'first_year'
                                        ? 'font-semibold text-orange-600'
                                        : 'font-semibold text-blue-600'
                                    }
                                  >
                                    {event.type === 'first_year' ? 'Year 1' : 'Renewal'}
                                  </span>
                                </div>
                              </div>
                              <div className="flex shrink-0 items-center gap-1.5">
                                <span className="text-xs font-semibold text-[#0b5ed7]">
                                  {rangeMoney(event.min, event.max)}
                                </span>
                                <ArrowUpRight className="h-3.5 w-3.5 text-slate-400" />
                              </div>
                            </Link>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              <div className="border-t border-black/5 bg-[#fafafa] px-5 py-4 text-xs text-slate-500 sm:px-6">
                Sanadku wuxuu ka bilaabmaa bishan hadda lagu jiro. Tenant cusub first-year price-kiisa waxaa lagu daraa bisha la sameeyay.
                Renewal exact price haddii la hayo waa la isticmaalaa; haddii uu madhan yahay waxaa la isticmaalaa range-ka <strong>$150–$200 yearly</strong>.
                Trial, expired, suspended iyo cancelled laguma darin.
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
