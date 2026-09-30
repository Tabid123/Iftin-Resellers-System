import { useEffect, useState } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Users, DollarSign, Activity, AlertCircle } from 'lucide-react'

export default function PlatformDashboard() {
  const [stats, setStats] = useState({
    total: 0, active: 0, suspended: 0, firstYearTotal: 0,
  })

  useEffect(() => {
    (async () => {
      const { data: tenants } = await supabase
        .from('tenants')
        .select('status, first_year_price')
      const list = (tenants ?? []) as any[]
      const active = list.filter(t => t.status === 'active').length
      const suspended = list.filter(t => t.status === 'suspended' || t.status === 'cancelled').length
      const firstYearTotal = list
        .filter(t => t.status !== 'trial')
        .reduce((s, t) => s + Number(t.first_year_price ?? 0), 0)
      setStats({ total: list.length, active, suspended, firstYearTotal })
    })()
  }, [])

  const cards = [
    { label: 'Total Resellers', value: stats.total, icon: Users },
    { label: 'Active', value: stats.active, icon: Activity },
    { label: 'Suspended', value: stats.suspended, icon: AlertCircle },
    { label: 'Year 1 Pricing Total ($)', value: stats.firstYearTotal, icon: DollarSign },
  ]

  return (
    <div className="min-h-full px-4 py-6 sm:px-7 lg:px-8 lg:py-8">
      <div className="mx-auto w-full max-w-[1500px]">
        <div className="mb-8">
          <h1 className="text-[26px] font-semibold tracking-tight text-[#0c1220]">Overview</h1>
          <p className="mt-1 text-sm text-slate-500">
            Iftin Agents — dhammaan resellers-ka iyo xaaladda platform-ka halkaan ka eeg.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {cards.map(c => (
            <Card key={c.label} className="rounded-xl border-black/10 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.035)]">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                <CardTitle className="text-xs font-medium text-slate-500">{c.label}</CardTitle>
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#f5f5f3]">
                  <c.icon className="h-4 w-4 text-slate-600" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-semibold tracking-tight text-[#0c1220]">{c.value}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}
