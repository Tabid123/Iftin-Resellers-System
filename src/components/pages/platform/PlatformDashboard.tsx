import { useEffect, useState } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Users, DollarSign, Activity, AlertCircle } from 'lucide-react'

export default function PlatformDashboard() {
  const [stats, setStats] = useState({
    total: 0, active: 0, suspended: 0, mrr: 0,
  })

  useEffect(() => {
    (async () => {
      const { data: tenants } = await supabase
        .from('tenants')
        .select('status, plan_id, subscription_plans(price_monthly)')
      const list = (tenants ?? []) as any[]
      const active = list.filter(t => t.status === 'active').length
      const suspended = list.filter(t => t.status === 'suspended' || t.status === 'cancelled').length
      const mrr = list
        .filter(t => t.status === 'active')
        .reduce((s, t) => s + (t.subscription_plans?.price_monthly ?? 0), 0)
      setStats({ total: list.length, active, suspended, mrr })
    })()
  }, [])

  const cards = [
    { label: 'Total Resellers', value: stats.total, icon: Users },
    { label: 'Active', value: stats.active, icon: Activity },
    { label: 'Suspended', value: stats.suspended, icon: AlertCircle },
    { label: 'MRR ($)', value: stats.mrr, icon: DollarSign },
  ]

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold">Admin Overview</h1>
        <p className="text-sm text-muted-foreground">
          Najax Data SaaS — dhammaan resellers waxa la maamulayaa halkan.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {cards.map(c => (
          <Card key={c.label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">{c.label}</CardTitle>
              <c.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{c.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
