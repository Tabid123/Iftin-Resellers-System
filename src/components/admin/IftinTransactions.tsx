import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, Loader2, RefreshCw } from 'lucide-react';
import {
  StatCardsRow, FilterRow, SearchInput, InvoiceAccordionContent, LazyFallback, EmptyState,
  Package, DollarSign, CheckCircle, XCircle, Clock, Calendar, Phone, Hash, User,
} from './simple/shared';
import { resolveTenantId } from '@/lib/iftinCatalog';
import { listPartnerIntents, type PartnerIntent, type PartnerIntentsData } from '@/lib/iftinIntents.functions';

const TZ = 'Africa/Mogadishu';
const timeFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });
const dateFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' });
const isoDayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });

const dayKey = (iso?: string | null) => (iso ? isoDayFmt.format(new Date(iso)) : '');
const todayKey = () => isoDayFmt.format(new Date());
const time = (iso?: string | null) => (iso ? timeFmt.format(new Date(iso)) : '—');
const date = (iso?: string | null) => (iso ? dateFmt.format(new Date(iso)) : '—');
const money = (n: number | null | undefined) => `$${Number(n ?? 0).toFixed(2)}`;

const statusColor = (result: string) =>
  result === 'delivered' ? 'bg-green-100 text-green-700'
    : result === 'delivering' ? 'bg-yellow-100 text-yellow-700'
      : result === 'failed' ? 'bg-red-100 text-red-700'
        : 'bg-gray-100 text-gray-600';

const RANGES = ['today', '7d', '30d', 'all'] as const;
type RangeKey = typeof RANGES[number];

const rangeLabel = (k: RangeKey, isSo: boolean) => {
  switch (k) {
    case 'today': return isSo ? 'Maanta' : 'Today';
    case '7d': return isSo ? '7 maalmood' : 'Last 7 days';
    case '30d': return isSo ? '30 maalmood' : 'Last 30 days';
    default: return isSo ? 'Dhammaan' : 'All';
  }
};

const withinRange = (iso: string | null | undefined, range: RangeKey) => {
  if (range === 'all') return true;
  if (!iso) return false;
  if (range === 'today') return dayKey(iso) === todayKey();
  const days = range === '7d' ? 7 : 30;
  return new Date(iso).getTime() >= Date.now() - days * 86_400_000;
};

const IftinTransactions: React.FC<{ isSo?: boolean }> = ({ isSo = true }) => {
  const [data, setData] = useState<PartnerIntentsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [range, setRange] = useState<RangeKey>('7d');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const tenantId = await resolveTenantId();
      if (!tenantId) throw new Error(isSo ? 'Reseller-ka lama garanayo' : 'Tenant not resolved');
      const res = await listPartnerIntents({ data: { tenantId, limit: 200, includeUnpaid: false } });
      setData(res);
    } catch (e: any) {
      setError(e?.message ?? (isSo ? 'Xogta lama soo dejin' : 'Failed to load'));
    } finally {
      setLoading(false);
    }
  }, [isSo]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const t = setInterval(() => void load(true), 30_000);
    return () => clearInterval(t);
  }, [load]);

  const scoped = useMemo(
    () => (data?.intents ?? []).filter((i) => i.counts_as_order === true && withinRange(i.created_at, range)),
    [data, range],
  );

  const deliveredRows = useMemo(() => scoped.filter((i) => i.result === 'delivered'), [scoped]);
  const delivered = deliveredRows.length;
  const delivering = scoped.filter((i) => i.result === 'delivering').length;
  const failed = scoped.filter((i) => i.result === 'failed').length;

  // Iftin Internet accounting: revenue/cost/profit are realized only after delivery.
  // `your_profit` comes from the Iftin API and is already the reseller's USD profit.
  const sales = deliveredRows.reduce((s, i) => s + Number(i.amount ?? 0), 0);
  const cost = deliveredRows.reduce((s, i) => s + Number(i.base_price ?? 0), 0);
  const profit = deliveredRows.reduce((s, i) => s + Number(i.your_profit ?? 0), 0);

  const rows = useMemo(() => {
    const q = search.replace(/\D/g, '');
    return scoped
      .filter((i) => (statusFilter === 'all' ? true : i.result === statusFilter))
      .filter((i) => {
        if (!search) return true;
        if (q && ((i.receiver_phone ?? '').includes(q) || (i.sender_phone ?? '').includes(q))) return true;
        return (i.package_name ?? '').toLowerCase().includes(search.toLowerCase());
      });
  }, [scoped, statusFilter, search]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-1.5 overflow-x-auto">
          {RANGES.map((k) => (
            <button
              key={k}
              onClick={() => setRange(k)}
              className={`shrink-0 text-xs px-2.5 py-1.5 rounded-lg font-medium border ${
                range === k ? 'bg-purple-600 text-white border-purple-600' : 'bg-white dark:bg-gray-800'
              }`}
            >
              {rangeLabel(k, isSo)}
            </button>
          ))}
        </div>
        <button
          onClick={() => void load()}
          className="shrink-0 w-8 h-8 rounded-lg bg-accent flex items-center justify-center"
          disabled={loading}
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
        </button>
      </div>

      <StatCardsRow cards={[
        { label: isSo ? 'Wadarta' : 'Transactions', value: scoped.length, icon: Package, color: 'bg-blue-500' },
        { label: isSo ? 'Iibka' : 'Sales', value: `$${sales.toFixed(2)}`, icon: DollarSign, color: 'bg-purple-500' },
        { label: isSo ? 'Kharash' : 'Cost', value: `$${cost.toFixed(2)}`, icon: DollarSign, color: 'bg-gray-600' },
        { label: isSo ? 'Faaiido' : 'Profit', value: `$${profit.toFixed(2)}`, icon: DollarSign, color: 'bg-emerald-500' },
      ]} />

      <FilterRow
        filters={[
          { key: 'all', label: isSo ? 'Dhammaan' : 'All', count: scoped.length },
          { key: 'delivered', label: isSo ? 'La diray' : 'Delivered', count: delivered },
          { key: 'delivering', label: isSo ? 'Sugaya' : 'Pending', count: delivering },
          { key: 'failed', label: isSo ? 'Guuldaraystay' : 'Failed', count: failed },
        ]}
        activeKey={statusFilter}
        onSelect={setStatusFilter}
      />

      <SearchInput value={search} onChange={setSearch} placeholder={isSo ? 'Raadi lambar/xirmo...' : 'Search phone/package...'} />

      {error && (
        <div className="rounded-lg bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 p-3 text-sm">{error}</div>
      )}

      {loading && !data ? <LazyFallback /> : rows.length === 0 ? (
        <EmptyState message={isSo ? 'Wax transaction ah lama helin' : 'No transactions found'} />
      ) : (
        <div className="space-y-2">
          {rows.map((item: PartnerIntent, idx) => {
            const isExpanded = expandedId === item.intent_id;
            const label = (isSo ? item.result_label : item.result_label_en) ?? item.result_label ?? item.result;
            return (
              <div key={item.intent_id} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-purple-100/50 dark:border-purple-900/20 overflow-hidden">
                <button
                  onClick={() => setExpandedId(isExpanded ? null : item.intent_id)}
                  className="w-full px-3 py-2.5 flex items-center justify-between text-left active:bg-purple-50/50 dark:active:bg-purple-950/20"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span className="text-[10px] font-bold text-purple-400 w-5">#{idx + 1}</span>
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-sm text-gray-800 dark:text-white truncate">{item.package_name ?? '—'}</div>
                      <div className="text-[11px] text-gray-400 truncate">
                        {item.receiver_phone ?? '—'} · {date(item.created_at)} {time(item.created_at)}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="font-bold text-sm">{money(item.amount)}</span>
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${statusColor(item.result)}`}>{label}</span>
                    <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                  </div>
                </button>
                {isExpanded && (
                  <InvoiceAccordionContent
                    isSo={isSo}
                    id={item.intent_id}
                    notes={item.result === 'failed' ? item.reason : null}
                    rows={[
                      { icon: Package, label: 'Package', value: item.package_name ?? '—', color: 'text-purple-500' },
                      { icon: Hash, label: 'Data', value: item.data_amount ?? '—', color: 'text-cyan-500' },
                      { icon: Phone, label: isSo ? 'Qaataha' : 'Receiver', value: item.receiver_phone ? `+252${item.receiver_phone}` : '—', color: 'text-green-500' },
                      { icon: User, label: isSo ? 'Diraha' : 'Sender', value: item.sender_phone ? `+252${item.sender_phone}` : '—', color: 'text-orange-500' },
                      { icon: DollarSign, label: isSo ? 'Iibka' : 'Price', value: money(item.amount), color: 'text-emerald-500' },
                      { icon: DollarSign, label: isSo ? 'Kharash' : 'Cost', value: money(item.base_price), color: 'text-red-500' },
                      { icon: DollarSign, label: isSo ? 'Faaiido' : 'Profit', value: money(item.your_profit), color: 'text-teal-500' },
                      { icon: Calendar, label: isSo ? 'Taariikhda' : 'Date', value: `${date(item.created_at)} ${time(item.created_at)}`, color: 'text-teal-500' },
                      ...(item.delivered_at
                        ? [{ icon: CheckCircle, label: isSo ? 'La gaarsiiyay' : 'Delivered', value: `${date(item.delivered_at)} ${time(item.delivered_at)}`, color: 'text-green-600' }]
                        : []),
                    ]}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="flex gap-2 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" />{isSo ? 'Isku cusboonaysiin 30s' : 'Auto refresh 30s'}</span>
        <span className="inline-flex items-center gap-1"><XCircle className="w-3 h-3" />{isSo ? 'Kuwii aan la bixin lama tirinayo' : 'Unpaid excluded'}</span>
      </div>
    </div>
  );
};

export default IftinTransactions;
