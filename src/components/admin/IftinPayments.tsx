import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, Loader2, RefreshCw, Search, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { toast } from '@/hooks/use-toast';
import { resolveTenantId } from '@/lib/iftinCatalog';
import ResendOrderDialog from '@/components/admin/ResendOrderDialog';
import {
  listPartnerPayments,
  resolvePartnerPayment,
  type PartnerPayment,
  type PartnerPaymentsData,
} from '@/lib/iftinPayments.functions';

const PAGE_SIZE = 50;

const FILTERS: { key: string; label: string; color: string }[] = [
  { key: 'all', label: 'Total', color: 'from-slate-500 to-slate-700' },
  { key: 'matched', label: 'Matched', color: 'from-green-500 to-green-700' },
  { key: 'pending', label: 'Pending', color: 'from-yellow-500 to-amber-600' },
  { key: 'unmatched', label: 'Unmatched', color: 'from-red-500 to-red-700' },
  { key: 'blocked', label: 'Blocked', color: 'from-gray-700 to-gray-900' },
];

const badgeClass = (status: string) => {
  switch (status) {
    case 'matched':
      return 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300';
    case 'pending':
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300';
    case 'unmatched':
      return 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300';
    case 'blocked':
      return 'bg-gray-900 text-white';
    default:
      return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
  }
};

const timeFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Africa/Mogadishu',
  day: '2-digit',
  month: '2-digit',
  year: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const when = (iso?: string | null) => (iso ? timeFmt.format(new Date(iso)) : '—');
const money = (n: number | null | undefined) => `$${Number(n ?? 0).toFixed(2)}`;

const IftinPayments: React.FC = () => {
  const [data, setData] = useState<PartnerPaymentsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const [resolving, setResolving] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [resendFor, setResendFor] = useState<PartnerPayment | null>(null);

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      setError(null);
      try {
        const tenantId = await resolveTenantId();
        if (!tenantId) throw new Error('Reseller-ka lama garanayo');
        const res = await listPartnerPayments({
          data: { tenantId, status, limit: PAGE_SIZE, offset },
        });
        setData(res);
      } catch (e: any) {
        setError(e?.message ?? 'Lacagaha lama soo dejin');
      } finally {
        setLoading(false);
      }
    },
    [status, offset],
  );

  useEffect(() => {
    void load();
  }, [load]);

  // Auto-refresh 30 sekan
  useEffect(() => {
    const t = setInterval(() => void load(true), 30_000);
    return () => clearInterval(t);
  }, [load]);

  const rows = useMemo(() => {
    const list = data?.payments ?? [];
    const q = search.replace(/\D/g, '');
    if (!q) return list;
    return list.filter(
      (p) =>
        (p.sender_phone ?? '').includes(q) || (p.receiver_phone ?? '').includes(q),
    );
  }, [data, search]);

  const handleResolve = async (payment: PartnerPayment) => {
    setResolving(payment.receipt_id);
    try {
      const tenantId = await resolveTenantId();
      if (!tenantId) throw new Error('Reseller-ka lama garanayo');
      const res = await resolvePartnerPayment({ data: { tenantId, receiptId: payment.receipt_id } });
      toast({
        title: res.ok ? 'Waa la xallilay' : 'Lama xallilin',
        description: res.message,
        variant: res.ok ? undefined : 'destructive',
      });
      if (res.ok) await load(true);
    } catch (e: any) {
      toast({ title: 'Khalad', description: e?.message ?? 'Isku day mar kale', variant: 'destructive' });
    } finally {
      setResolving(null);
    }
  };

  const summary = data?.summary;
  const summaryValue = (key: string) =>
    key === 'all' ? (summary?.total ?? 0) : ((summary as any)?.[key] ?? 0);

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-bold">Lacagaha SMS-ka</h2>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          <span className="ml-1">Cusboonaysii</span>
        </Button>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 md:mx-0 md:px-0 md:grid md:grid-cols-5">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => {
              setStatus(f.key);
              setOffset(0);
            }}
            className={`shrink-0 min-w-[86px] rounded-lg px-2.5 py-2 text-left text-white bg-gradient-to-br ${f.color} ${
              status === f.key ? 'ring-2 ring-offset-1 ring-primary' : 'opacity-90'
            }`}
          >
            <div className="text-[10px] uppercase tracking-wide opacity-90">{f.label}</div>
            <div className="text-lg font-bold leading-tight">{summaryValue(f.key)}</div>
          </button>
        ))}
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Raadi lambar (diray ama helaya)"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 p-3 text-sm">
          {error}
        </div>
      )}

      {/* Mobile list */}
      <div className="space-y-2 md:hidden">
        {loading && !data ? (
          <Card className="p-6 text-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin inline" />
          </Card>
        ) : rows.length === 0 ? (
          <Card className="p-6 text-center text-muted-foreground text-sm">Lacag lama helin</Card>
        ) : (
          rows.map((p) => {
            const open = expanded === p.receipt_id;
            return (
            <Card
              key={p.receipt_id}
              className="p-3 space-y-1.5 cursor-pointer active:opacity-80"
              onClick={() => setExpanded(open ? null : p.receipt_id)}
            >
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
                <div className="min-w-0">
                  <div className="font-semibold truncate">{money(p.amount)}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {p.sender_phone ?? '—'} → {p.receiver_phone ?? '—'}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${badgeClass(p.status)}`}>
                    {p.status}
                  </span>
                  <ChevronDown
                    className={`h-4 w-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span>{when(p.created_at)}</span>
                <span className="capitalize">{p.provider ?? '—'}</span>
                <span className="truncate max-w-full">{p.package_name ?? '—'}</span>
              </div>
              {open && (
                <div className="mt-2 space-y-1.5 border-t pt-2 text-xs">
                  {[
                    ['Waqti', when(p.created_at)],
                    ['Lambarka diray', p.sender_phone ?? '—'],
                    ['Lambarka helaya', p.receiver_phone ?? '—'],
                    ['Lacagta', money(p.amount)],
                    ['Shirkadda', p.provider ?? '—'],
                    ['Xirmada', p.package_name ?? '—'],
                    ['Xaaladda', p.status],
                    ['Gaarsiinta', p.delivery_status ?? '—'],
                  ].map(([k, v]) => (
                    <div key={k as string} className="flex justify-between gap-3">
                      <span className="text-muted-foreground">{k}</span>
                      <span className="text-right font-medium break-all">{v}</span>
                    </div>
                  ))}
                  {p.hint && <div className="text-muted-foreground">{p.hint}</div>}
                </div>
              )}
              {open && p.can_resolve && (
                <Button
                  size="sm"
                  className="w-full"
                  onClick={(e) => {
                    e.stopPropagation();
                    setResendFor(p);
                  }}
                  disabled={resolving === p.receipt_id}
                >
                  {resolving === p.receipt_id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  <span className="ml-1">Dib u dir</span>
                </Button>
              )}
            </Card>
            );
          })
        )}
      </div>

      <Card className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/60">
            <tr className="text-left">
              <th className="p-2">Waqti</th>
              <th className="p-2">Lambarka diray</th>
              <th className="p-2">Lacagta</th>
              <th className="p-2">Shirkadda</th>
              <th className="p-2">Xirmada</th>
              <th className="p-2">Lambarka helaya</th>
              <th className="p-2">Xaaladda</th>
              <th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {loading && !data ? (
              <tr>
                <td colSpan={8} className="p-6 text-center text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin inline" />
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-6 text-center text-muted-foreground">
                  Lacag lama helin
                </td>
              </tr>
            ) : (
              rows.map((p) => (
                <tr key={p.receipt_id} className="border-t align-top">
                  <td className="p-2 whitespace-nowrap">{when(p.created_at)}</td>
                  <td className="p-2 whitespace-nowrap">{p.sender_phone ?? '—'}</td>
                  <td className="p-2 whitespace-nowrap font-medium">{money(p.amount)}</td>
                  <td className="p-2 capitalize">{p.provider ?? '—'}</td>
                  <td className="p-2">{p.package_name ?? '—'}</td>
                  <td className="p-2 whitespace-nowrap">{p.receiver_phone ?? '—'}</td>
                  <td className="p-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${badgeClass(p.status)}`}>
                      {p.status}
                    </span>
                    {p.delivery_status && (
                      <div className="text-xs text-muted-foreground mt-1">{p.delivery_status}</div>
                    )}
                    {p.hint && <div className="text-xs text-muted-foreground mt-1 max-w-[220px]">{p.hint}</div>}
                  </td>
                  <td className="p-2">
                    {p.can_resolve && (
                      <Button
                        size="sm"
                        onClick={() => setResendFor(p)}
                        disabled={resolving === p.receipt_id}
                      >
                        {resolving === p.receipt_id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Send className="h-4 w-4" />
                        )}
                        <span className="ml-1">Dib u dir</span>
                      </Button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>

      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          size="sm"
          disabled={offset === 0 || loading}
          onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
        >
          Hore
        </Button>
        <span className="text-xs text-muted-foreground">
          {offset + 1}–{offset + (data?.payments.length ?? 0)}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={loading || (data?.payments.length ?? 0) < PAGE_SIZE}
          onClick={() => setOffset(offset + PAGE_SIZE)}
        >
          Xiga
        </Button>
      </div>

      <ResendOrderDialog
        payment={resendFor}
        open={Boolean(resendFor)}
        onOpenChange={(o) => !o && setResendFor(null)}
        onResolve={handleResolve}
      />
    </div>
  );
};

export default IftinPayments;