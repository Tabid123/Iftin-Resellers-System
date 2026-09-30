import { useEffect, useState } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from '@/hooks/use-toast'

export default function PlansPage() {
  const [plans, setPlans] = useState<any[]>([])

  const load = async () => {
    const { data } = await supabase.from('subscription_plans').select('*').order('price_monthly')
    setPlans(data ?? [])
  }
  useEffect(() => { load() }, [])

  const save = async (id: string, patch: any) => {
    const { error } = await supabase.from('subscription_plans').update(patch).eq('id', id)
    if (error) toast({ title: 'Khalad', description: error.message, variant: 'destructive' })
    else { toast({ title: 'La keydiyay' }); load() }
  }

  return (
    <div className="min-h-full space-y-6 px-4 py-6 sm:px-7 lg:px-8 lg:py-8">
      <h1 className="text-[26px] font-semibold tracking-tight text-[#0c1220]">Plans</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {plans.map(p => (
          <Card key={p.id} className="rounded-xl border-black/10 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.035)]">
            <CardHeader><CardTitle>{p.name}</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div><label className="text-xs text-muted-foreground">Price/month ($)</label>
                <Input type="number" defaultValue={p.price_monthly}
                  onBlur={e => +e.target.value !== p.price_monthly && save(p.id, { price_monthly: +e.target.value })} />
              </div>
              <div><label className="text-xs text-muted-foreground">Max devices</label>
                <Input type="number" defaultValue={p.max_devices}
                  onBlur={e => +e.target.value !== p.max_devices && save(p.id, { max_devices: +e.target.value })} />
              </div>
              <div><label className="text-xs text-muted-foreground">Max orders/mo</label>
                <Input type="number" defaultValue={p.max_orders_monthly}
                  onBlur={e => +e.target.value !== p.max_orders_monthly && save(p.id, { max_orders_monthly: +e.target.value })} />
              </div>
              <div><label className="text-xs text-muted-foreground">Max admins</label>
                <Input type="number" defaultValue={p.max_admins}
                  onBlur={e => +e.target.value !== p.max_admins && save(p.id, { max_admins: +e.target.value })} />
              </div>
              <Button size="sm" variant={p.is_active ? 'destructive' : 'default'}
                onClick={() => save(p.id, { is_active: !p.is_active })}>
                {p.is_active ? 'Deactivate' : 'Activate'}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
