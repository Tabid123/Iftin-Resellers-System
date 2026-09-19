import { useEffect, useState } from 'react'
import { Link } from "@/lib/router-compat"
import { supabase } from '@/integrations/supabase/client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Plus, ExternalLink, Copy } from 'lucide-react'
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

  const LinksBlock = ({ r }: { r: Row }) => (
    <div className="space-y-1 text-xs">
      <div className="flex items-center gap-1 min-w-0">
        <span className="font-mono truncate">{emails[r.id] ?? '—'}</span>
        {emails[r.id] && (
          <Button variant="ghost" size="sm" className="h-6 shrink-0 px-1"
            onClick={() => copyText(emails[r.id], 'Email')}>
            <Copy className="h-3 w-3" />
          </Button>
        )}
      </div>
      <div className="flex items-center gap-1 min-w-0">
        <a href={`/t/${r.slug}/providers`} target="_blank" rel="noreferrer"
          className="text-primary hover:underline font-mono truncate">
          iftinagents.com/t/{r.slug}
        </a>
        <Button variant="ghost" size="sm" className="h-6 shrink-0 px-1"
          onClick={() => copyText(`https://iftinagents.com/t/${r.slug}`, 'Link-ga macaamiisha')}>
          <Copy className="h-3 w-3" />
        </Button>
      </div>
      <div className="flex items-center gap-1 min-w-0">
        <span className="font-mono text-muted-foreground truncate">
          iftinagents.com/t/{r.slug}/dashboard/login
        </span>
        <Button variant="ghost" size="sm" className="h-6 shrink-0 px-1"
          onClick={() => copyText(`https://iftinagents.com/t/${r.slug}/dashboard/login`, 'Admin link')}>
          <Copy className="h-3 w-3" />
        </Button>
      </div>
    </div>
  )

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl sm:text-2xl font-bold">Resellers</h1>
        <Button asChild size="sm" className="shrink-0">
          <Link to="/admin/resellers/new"><Plus className="h-4 w-4 mr-1" /> Cusub</Link>
        </Button>
      </div>

      {/* Mobile: cards */}
      <div className="space-y-3 lg:hidden">
        {loading && <div className="rounded-lg border p-6 text-center text-sm">Loading…</div>}
        {!loading && rows.length === 0 && (
          <div className="rounded-lg border p-6 text-center text-sm text-muted-foreground">
            Reseller weli ma jirto. Bilow "Cusub".
          </div>
        )}
        {rows.map(r => (
          <div key={r.id} className="rounded-lg border bg-card p-3 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-medium break-words">{r.name}</div>
                <div className="text-xs text-muted-foreground">
                  {r.subscription_plans?.name ?? '—'}
                  {r.current_period_end
                    ? ` · ${new Date(r.current_period_end).toLocaleDateString()}`
                    : ''}
                </div>
              </div>
              <Badge variant={statusVariant(effectiveStatus(r))} className="shrink-0">{effectiveStatus(r)}</Badge>
            </div>
            <LinksBlock r={r} />
            <Button asChild variant="outline" size="sm" className="w-full">
              <Link to={`/admin/resellers/${r.id}`}>
                Maamul <ExternalLink className="h-3 w-3 ml-1" />
              </Link>
            </Button>
          </div>
        ))}
      </div>

      {/* Desktop: table */}
      <div className="hidden lg:block border rounded-lg overflow-hidden">
        <div className="w-full overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr className="text-left">
                <th className="p-3">Name</th>
                <th className="p-3">Email &amp; Links</th>
                <th className="p-3">Plan</th>
                <th className="p-3">Status</th>
                <th className="p-3">Period end</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={6} className="p-6 text-center">Loading…</td></tr>}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">
                  Reseller weli ma jirto. Bilow "Cusub".
                </td></tr>
              )}
              {rows.map(r => (
                <tr key={r.id} className="border-t">
                  <td className="p-3 font-medium">{r.name}</td>
                  <td className="p-3"><LinksBlock r={r} /></td>
                  <td className="p-3">{r.subscription_plans?.name ?? '—'}</td>
                  <td className="p-3"><Badge variant={statusVariant(effectiveStatus(r))}>{effectiveStatus(r)}</Badge></td>
                  <td className="p-3 text-xs">
                    {r.current_period_end ? new Date(r.current_period_end).toLocaleDateString() : '—'}
                  </td>
                  <td className="p-3 text-right">
                    <Button asChild variant="ghost" size="sm">
                      <Link to={`/admin/resellers/${r.id}`}>
                        Maamul <ExternalLink className="h-3 w-3 ml-1" />
                      </Link>
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
