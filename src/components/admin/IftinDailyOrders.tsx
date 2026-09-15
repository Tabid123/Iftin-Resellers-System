import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ChevronDown } from 'lucide-react';
import {
  StatCardsRow, FilterRow, SearchInput, InvoiceAccordionContent, LazyFallback, EmptyState,
  Package, DollarSign, CheckCircle, XCircle, Clock, Calendar, Phone, Hash, User,
} from './simple/shared';
import { resolveTenantId } from '@/lib/iftinCatalog';
import {
  listPartnerIntents,
  type PartnerIntent,
  type PartnerIntentsData,
} from '@/lib/iftinIntents.functions';

const TZ = 'Africa/Mogadishu';
const timeFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false,
});
const dateFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric',
});
const isoDayFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
});

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

const IntentAccordionItem: React.FC<{
  item: PartnerIntent; idx: number; isSo: boolean;
  expandedId: string | null; setExpandedId: (id: string | null) => void;
}> = ({ item, idx, isSo, expandedId, setExpandedId }) => {
  const isExpanded = expandedId === item.intent_id;
  const label = (isSo ? item.result_label : item.result_label_en) ?? item.result_label ?? item.result;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-purple-100/50 dark:border-purple-900/20 overflow-hidden">
      <button
        onClick={() => setExpandedId(isExpanded ? null : item.intent_id)}
        className="w-full px-3 py-2.5 flex items-center justify-between text-left active:bg-purple-50/50 dark:active:bg-purple-950/20"
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="text-[10px] font-bold text-purple-400 w-5">#{idx + 1}</span>
          <div className="min-w-0 flex-1">
            <div className="font-bold text-sm text-gray-800 dark:text-white truncate">
              {item.package_name ?? '—'}
            </div>
            <div className="text-[11px] text-gray-400 truncate">
              {item.receiver_phone ?? '—'} · {time(item.created_at)}
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
};

const IftinDailyOrders: React.FC<{ isSo?: boolean }> = ({ isSo = true }) => {
  const [data, setData] = useState<PartnerIntentsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedDate, setSelectedDate] = useState<string>(() => todayKey());
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const tenantId = await resolveTenantId();
      if (!tenantId) throw new Error('Reseller-ka lama garanayo');
      const res = await listPartnerIntents({ data: { tenantId, limit: 200, includeUnpaid: false } });
      setData(res);
    } catch (e: any) {
      setError(e?.message ?? 'Dalabyada lama soo dejin');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const t = setInterval(() => void load(true), 30_000);
    return () => clearInterval(t);
  }, [load]);

  const dayOrders = useMemo(
    () => (data?.intents ?? [])
      .filter((i) => i.counts_as_order === true)
      .filter((i) => dayKey(i.created_at) === selectedDate),
    [data, selectedDate],
  );

  const delivered = dayOrders.filter((i) => i.result === 'delivered').length;
  const delivering = dayOrders.filter((i) => i.result === 'delivering').length;
  const failed = dayOrders.filter((i) => i.result === 'failed').length;
  const revenue = dayOrders.reduce((s, i) => s + Number(i.amount ?? 0), 0);

  const rows = useMemo(() => {
    const q = search.replace(/\D/g, '');
    return dayOrders
      .filter((i) => (statusFilter === 'all' ? true : i.result === statusFilter))
      .filter((i) => {
        if (!search) return true;
        if (q && ((i.receiver_phone ?? '').includes(q) || (i.sender_phone ?? '').includes(q))) return true;
        return (i.package_name ?? '').toLowerCase().includes(search.toLowerCase());
      });
  }, [dayOrders, statusFilter, search]);

  const navigateDate = (dir: number) => {
    const d = new Date(`${selectedDate}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + dir);
    setSelectedDate(d.toISOString().split('T')[0]);
  };
  const isToday = selectedDate === todayKey();

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button onClick={() => navigateDate(-1)} className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 flex items-center gap-2 bg-white dark:bg-gray-800 rounded-lg px-3 py-2 border">
          <Calendar className="w-4 h-4 text-gray-400" />
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="flex-1 bg-transparent text-sm font-medium outline-none"
          />
        </div>
        <button onClick={() => navigateDate(1)} className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center rotate-180">
          <ArrowLeft className="w-4 h-4" />
        </button>
        {!isToday && (
          <button onClick={() => setSelectedDate(todayKey())} className="text-xs px-2 py-1.5 bg-purple-600 text-white rounded-lg font-medium">
            {isSo ? 'Maanta' : 'Today'}
          </button>
        )}
      </div>

      <StatCardsRow cards={[
        { label: isSo ? 'Wadarta' : 'Total', value: dayOrders.length, icon: Package, color: 'bg-purple-500' },
        { label: isSo ? 'La diray' : 'Delivered', value: delivered, icon: CheckCircle, color: 'bg-green-500' },
        { label: isSo ? 'Sugaya' : 'Pending', value: delivering, icon: Clock, color: 'bg-yellow-500' },
        { label: isSo ? 'Guuldaraystay' : 'Failed', value: failed, icon: XCircle, color: 'bg-red-500' },
        { label: isSo ? 'Dakhli' : 'Revenue', value: `$${revenue.toFixed(0)}`, icon: DollarSign, color: 'bg-emerald-500' },
      ]} />

      <FilterRow
        filters={[
          { key: 'all', label: isSo ? 'Dhammaan' : 'All', count: dayOrders.length },
          { key: 'delivering', label: isSo ? 'Sugaya' : 'Pending', count: delivering },
          { key: 'delivered', label: isSo ? 'La diray' : 'Delivered', count: delivered },
          { key: 'failed', label: isSo ? 'Guuldaraystay' : 'Failed', count: failed },
        ]}
        activeKey={statusFilter}
        onSelect={setStatusFilter}
      />

      <SearchInput value={search} onChange={setSearch} placeholder={isSo ? 'Raadi...' : 'Search...'} />

      {error && (
        <div className="rounded-lg bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 p-3 text-sm">{error}</div>
      )}

      {loading && !data ? <LazyFallback /> : rows.length === 0 ? (
        <EmptyState message={isSo ? 'Wax dalab ah lama helin' : 'No orders found'} />
      ) : (
        <div className="space-y-2">
          {rows.map((item, idx) => (
            <IntentAccordionItem
              key={item.intent_id}
              item={item}
              idx={idx}
              isSo={isSo}
              expandedId={expandedId}
              setExpandedId={setExpandedId}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default IftinDailyOrders;
