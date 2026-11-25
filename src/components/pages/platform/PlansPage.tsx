import { useEffect, useState } from 'react'
import { platformSupabase as supabase } from '@/integrations/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CheckCircle2, Package } from 'lucide-react'
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
      <h1 className="text-[30px] font-bold tracking-tight text-[#0c1220]">Plans</h1>
      <p className="text-sm text-slate-500">Labada qorshe ganacsi ee Iftin Resellers. Trial waa 3 maalmood bilaash ah.</p>
      <div className="flex max-w-[1100px] items-center gap-3 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-800"><CheckCircle2 className="h-5 w-5 shrink-0" /><span><strong>3-day free trial</strong> · Resellers cusub waxay helayaan tijaabo 3 maalmood ah.</span></div>
      <div className="grid max-w-[1100px] grid-cols-1 gap-5 md:grid-cols-2">
        {plans.map(p => (
          <Card key={p.id} className="overflow-hidden rounded-2xl border-slate-200 bg-white shadow-sm">
            <CardHeader className="border-b border-slate-100"><div className="flex items-center justify-between"><span className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-600"><Package className="h-6 w-6" /></span><span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" /> Active</span></div><CardTitle className="pt-3 text-xl font-bold">{p.name}</CardTitle></CardHeader>
            <CardContent className="space-y-5 pt-5 text-sm">
              <div className="rounded-xl bg-blue-50 p-5 text-sm">
                <span className="block text-xs text-muted-foreground">Qiimaha</span>
                {p.name === 'Monthly $15' ? (
                  <strong className="text-3xl font-bold text-blue-700">$15 <span className="text-sm font-medium">/ bishii</span></strong>
                ) : (
                  <div><strong className="text-3xl font-bold text-blue-700">$50 <span className="text-sm font-medium">/ sanadka koowaad</span></strong><p className="text-xs text-slate-500">$150–$200 / sanadkii marka la cusboonaysiinayo (tenant kasta qiimihiisa)</p></div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs">
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
