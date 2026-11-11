import { useEffect, useState } from 'react'
import { platformSupabase as supabase } from '@/integrations/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from '@/hooks/use-toast'

export default function PlansPage() {
  const [plans, setPlans] = useState<any[]>([])

  const load = async () => {
    const { data } = await supabase.from('subscription_plans').select('*').eq('is_active', true).order('display_order')
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
      <p className="text-sm text-slate-500">Labada qorshe ganacsi ee Iftin Resellers. Trial waa 3 maalmood bilaash ah.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {plans.map(p => (
          <Card key={p.id} className="rounded-xl border-black/10 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.035)]">
            <CardHeader><CardTitle>{p.name}</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="rounded-lg bg-slate-50 px-3 py-3 text-sm">
                <span className="block text-xs text-muted-foreground">Qiimaha</span>
                {p.name === 'Monthly $15' ? (
                  <strong>$15 / bishii</strong>
                ) : (
                  <div><strong>$50 / sanadka koowaad</strong><p className="text-xs text-slate-500">$150–$200 / sanadkii marka la cusboonaysiinayo (tenant kasta qiimihiisa)</p></div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3 rounded-lg border bg-slate-50 p-3 text-xs">
                <div><span className="block text-muted-foreground">Qalabka</span><span className="font-semibold">Xad ma leh</span></div>
                <div><span className="block text-muted-foreground">Dalabyada bishii</span><span className="font-semibold">Xad ma leh</span></div>
              </div>
              <div><label className="text-xs text-muted-foreground">Max admins</label>
                <Input type="number" defaultValue={p.max_admins}
                  onBlur={e => +e.target.value !== p.max_admins && save(p.id, { max_admins: +e.target.value })} />
              </div>
              <p className="text-xs text-muted-foreground">Plan-kan waa active. Qorshayaashii hore waxaa loo hayaa taariikh ahaan.</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
