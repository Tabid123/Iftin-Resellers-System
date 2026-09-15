import { useState, useEffect, useCallback } from 'react';
import { supabase, getTenantId } from '@/integrations/supabase/client';
import { startOfDay, endOfDay } from 'date-fns';
import { toast } from 'sonner';
import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';
import {
  StatCardsRow, FilterRow, SearchInput, InvoiceAccordionContent,
  ActionBtn, LazyFallback, EmptyState, useOrderActions,
  formatPhone, formatDate, formatTime,
  Package, DollarSign, CheckCircle, XCircle, Clock, Calendar, Phone, Hash, User, CreditCard, RotateCcw, ChevronDown, Code,
} from './shared';
import { ArrowLeft, Send } from 'lucide-react';
import { ResendOrderPrompt } from './ResendOrderPrompt';
import { effectiveOrderCost } from '@/lib/iftinProfit';

const orderDisplayCost = (item: any) => effectiveOrderCost(item.cost_price, item.data_packages_config?.cost_price);

// orders → data_packages_config ma laha foreign key, sidaa darteed embed lama sameyn karo.
// Kharashka xirmada si gooni ah ayaa loo soo qaadayaa, kadibna dalabka lagu dhejinayaa.
const attachPackageCosts = async (rows: any[]): Promise<any[]> => {
  const ids = Array.from(new Set(rows.map(r => r.package_id).filter(Boolean)));
  if (!ids.length) return rows;
  const { data } = await supabase.from('data_packages_config').select('id, cost_price').in('id', ids);
  const costs = new Map((data || []).map((p: any) => [p.id, p.cost_price]));
  return rows.map(r => ({
    ...r,
    data_packages_config: costs.has(r.package_id) ? { cost_price: costs.get(r.package_id) } : null,
  }));
};

// ========== ORDER ACCORDION ITEM ==========
const OrderAccordionItem = ({ item, idx, expandedId, setExpandedId, isSo, actions, onReload }: {
  item: any; idx: number; expandedId: string | null; setExpandedId: (id: string | null) => void;
  isSo: boolean; actions: ReturnType<typeof useOrderActions>; onReload?: () => void;
}) => {
  const [resendOpen, setResendOpen] = useState(false);
  const isExpanded = expandedId === item.id;
  const statusColor = item.delivery_status === 'delivered' ? 'bg-green-100 text-green-700' : item.delivery_status === 'failed' ? 'bg-red-100 text-red-700' : item.delivery_status === 'pending' ? 'bg-yellow-100 text-yellow-700' : item.status === 'cancelled' ? 'bg-gray-200 text-gray-600' : 'bg-gray-100 text-gray-600';
  const isCancellable = item.status !== 'cancelled' && item.delivery_status !== 'delivered';
  const isRetryable = item.delivery_status === 'failed';
  const isMarkable = item.delivery_status === 'pending';
  // Dalab kasta oo la diray ama fashilmay waa la dib u diri karaa (lambar cusub).
  const isResendable = true; // dalab kasta waa la dib u diri karaa

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-purple-100/50 dark:border-purple-900/20 overflow-hidden">
      <button onClick={() => setExpandedId(isExpanded ? null : item.id)}
        className="w-full px-3 py-2.5 flex items-center justify-between text-left active:bg-purple-50/50 dark:active:bg-purple-950/20">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="text-[10px] font-bold text-purple-400 w-5">#{idx + 1}</span>
          <div className="min-w-0 flex-1">
            <div className="font-bold text-sm text-gray-800 dark:text-white truncate">{item.package_name}</div>
            <div className="text-[11px] text-gray-400">{formatPhone(item.receiver_phone)} · {formatTime(item.created_at)}</div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="font-bold text-sm">${Number(item.selling_price).toFixed(2)}</span>
          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${statusColor}`}>{item.delivery_status || item.status}</span>
          {item.payment_source && <span className={`text-[8px] px-1 py-0.5 rounded font-bold ${
            item.payment_source === 'ussd_online' ? 'bg-blue-100 text-blue-700' :
            item.payment_source === 'sms_offline' ? 'bg-orange-100 text-orange-700' :
            item.payment_source === 'auto_topup' ? 'bg-cyan-100 text-cyan-700' :
            item.payment_source === 'manual' ? 'bg-purple-100 text-purple-700' :
            'bg-gray-100 text-gray-600'
          }`}>{
            item.payment_source === 'ussd_online' ? 'Online' :
            item.payment_source === 'sms_offline' ? 'Offline' :
            item.payment_source === 'auto_topup' ? 'AutoTop' :
            item.payment_source === 'manual' ? 'Manual' :
            item.payment_source
          }</span>}
          <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
        </div>
      </button>
      {isExpanded && (
        <InvoiceAccordionContent
          isSo={isSo} id={item.id} notes={item.delivery_notes}
          rows={[
            { icon: Package, label: isSo ? 'Package' : 'Package', value: item.package_name, color: 'text-purple-500' },
            { icon: Hash, label: 'Data', value: item.data_amount, color: 'text-cyan-500' },
            { icon: Phone, label: isSo ? 'Qaataha' : 'Receiver', value: `+252${formatPhone(item.receiver_phone)}`, color: 'text-green-500' },
            { icon: User, label: isSo ? 'Macmiilka' : 'Customer', value: `+252${formatPhone(item.customer_phone)}`, color: 'text-purple-500' },
            ...(item.sender_phone ? [{ icon: Phone, label: isSo ? 'Diraha' : 'Sender', value: `+252${formatPhone(item.sender_phone)}`, color: 'text-orange-500' }] : []),
            { icon: DollarSign, label: isSo ? 'Iibka' : 'Price', value: `$${Number(item.selling_price).toFixed(2)}`, color: 'text-emerald-500' },
            { icon: DollarSign, label: isSo ? 'Kharash' : 'Cost', value: `$${orderDisplayCost(item).toFixed(2)}`, color: 'text-red-500' },
            { icon: Calendar, label: isSo ? 'Taariikhda' : 'Date', value: `${formatDate(item.created_at)} ${formatTime(item.created_at)}`, color: 'text-teal-500' },
            ...(item.delivered_at ? [{ icon: CheckCircle, label: isSo ? 'La gaarsiiyay' : 'Delivered', value: `${formatDate(item.delivered_at)} ${formatTime(item.delivered_at)}`, color: 'text-green-600' }] : []),
            ...(item.payment_source ? [{ icon: CreditCard, label: isSo ? 'Nooca' : 'Type', value: 
              item.payment_source === 'ussd_online' ? 'Online' :
              item.payment_source === 'sms_offline' ? 'Offline (SMS)' :
              item.payment_source === 'auto_topup' ? 'Auto Top-Up' :
              item.payment_source === 'manual' ? 'Manual' :
              item.payment_source, color: 'text-indigo-500' }] : []),
          ]}
          actions={
            <>
              {isResendable && <ActionBtn onClick={() => setResendOpen(true)} icon={Send} label={isSo ? 'Dib u dir' : 'Resend'} />}
              {isRetryable && <ActionBtn onClick={() => actions.retryDelivery(item.id)} icon={RotateCcw} label={isSo ? 'Dib u Dir' : 'Retry'} variant="warning" />}
              {isMarkable && <ActionBtn onClick={() => actions.markDelivered(item.id)} icon={CheckCircle} label={isSo ? 'Dhamee' : 'Deliver'} variant="success" />}
              {isCancellable && <ActionBtn onClick={() => actions.cancelOrder(item.id)} icon={XCircle} label={isSo ? 'Kansal' : 'Cancel'} variant="danger" />}
            </>
          }
        />
      )}
      {resendOpen && (
        <ResendOrderPrompt order={item} isSo={isSo} onClose={() => setResendOpen(false)} onDone={onReload} />
      )}
    </div>
  );
};

// ========== DAILY ORDERS ==========
export const DailyOrdersCustomView = ({ isSo }: { isSo: boolean }) => {
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const actions = useOrderActions(setOrders, isSo);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    try {
      const date = new Date(selectedDate);
      const tid = getTenantId();
      let dayQuery = supabase.from('orders').select('*, data_packages_config(cost_price)')
        .gte('created_at', startOfDay(date).toISOString()).lte('created_at', endOfDay(date).toISOString())
        .order('created_at', { ascending: false });
      if (tid) dayQuery = dayQuery.eq('tenant_id', tid);
      const { data, error } = await dayQuery;
      if (error) throw error;
      setOrders(data || []);
    } catch { toast.error('Failed to load orders'); }
    finally { setLoading(false); }
  }, [selectedDate]);

  useEffect(() => { loadOrders(); }, [loadOrders]);
  useRealtimeRefresh(['orders'], loadOrders, 800, { notify: true, lang: isSo ? 'so' : 'en' });

  // Dalab kastaa waa inuu hal kaydis oo cad galo — si tirooyinku isugu dhamaystiraan.
  const classify = (o: any): 'delivered' | 'failed' | 'cancelled' | 'pending' | 'unpaid' => {
    if (o.status === 'cancelled') return 'cancelled';
    if (o.delivery_status === 'delivered') return 'delivered';
    if (o.delivery_status === 'failed' || o.delivery_status === 'blocked') return 'failed';
    if (o.status === 'paid' || o.status === 'completed') return 'pending';
    return 'unpaid';
  };

  const filtered = orders.filter(o => statusFilter === 'all' || classify(o) === statusFilter)
    .filter(o => !searchQuery || o.receiver_phone?.includes(searchQuery) || o.customer_phone?.includes(searchQuery) || o.package_name?.toLowerCase().includes(searchQuery.toLowerCase()));

  const countOf = (key: string) => orders.filter(o => classify(o) === key).length;
  const deliveredCount = countOf('delivered');
  const pendingCount = countOf('pending');
  const failedCount = countOf('failed');
  const unpaidCount = countOf('unpaid');
  const totalRevenue = orders.filter(o => o.status === 'paid' || o.status === 'completed').reduce((s, o) => s + Number(o.selling_price || 0), 0);
  const navigateDate = (dir: number) => { const d = new Date(selectedDate); d.setDate(d.getDate() + dir); setSelectedDate(d.toISOString().split('T')[0]); };
  const isToday = selectedDate === new Date().toISOString().split('T')[0];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button onClick={() => navigateDate(-1)} className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center"><ArrowLeft className="w-4 h-4" /></button>
        <div className="flex-1 flex items-center gap-2 bg-white dark:bg-gray-800 rounded-lg px-3 py-2 border">
          <Calendar className="w-4 h-4 text-gray-400" />
          <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="flex-1 bg-transparent text-sm font-medium outline-none" />
        </div>
        <button onClick={() => navigateDate(1)} className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center rotate-180"><ArrowLeft className="w-4 h-4" /></button>
        {!isToday && <button onClick={() => setSelectedDate(new Date().toISOString().split('T')[0])} className="text-xs px-2 py-1.5 bg-purple-600 text-white rounded-lg font-medium">{isSo ? 'Maanta' : 'Today'}</button>}
      </div>
      <StatCardsRow cards={[
        { label: isSo ? 'Wadarta' : 'Total', value: orders.length, icon: Package, color: 'bg-purple-500' },
        { label: isSo ? 'La diray' : 'Delivered', value: deliveredCount, icon: CheckCircle, color: 'bg-green-500' },
        { label: isSo ? 'Sugaya' : 'Pending', value: pendingCount, icon: Clock, color: 'bg-yellow-500' },
        { label: isSo ? 'Guuldaraystay' : 'Failed', value: failedCount, icon: XCircle, color: 'bg-red-500' },
        { label: isSo ? 'Dakhli' : 'Revenue', value: `$${totalRevenue.toFixed(0)}`, icon: DollarSign, color: 'bg-emerald-500' },
      ]} />
      <FilterRow filters={[
        { key: 'all', label: isSo ? 'Dhammaan' : 'All', count: orders.length },
        { key: 'pending', label: isSo ? 'Sugaya' : 'Pending', count: pendingCount },
        { key: 'delivered', label: isSo ? 'La diray' : 'Delivered', count: deliveredCount },
        { key: 'failed', label: isSo ? 'Guuldaraystay' : 'Failed', count: failedCount },
        { key: 'cancelled', label: isSo ? 'Kanselay' : 'Cancelled', count: countOf('cancelled') },
        { key: 'unpaid', label: isSo ? 'Lacag sugaya' : 'Unpaid', count: unpaidCount },
      ]} activeKey={statusFilter} onSelect={setStatusFilter} />
      <SearchInput value={searchQuery} onChange={setSearchQuery} placeholder={isSo ? 'Raadi...' : 'Search...'} />
      {loading ? <LazyFallback /> : filtered.length === 0 ? <EmptyState message={isSo ? 'Wax dalab ah lama helin' : 'No orders found'} /> : (
        <div className="space-y-2">{filtered.map((item, idx) => <OrderAccordionItem key={item.id} item={item} idx={idx} expandedId={expandedId} setExpandedId={setExpandedId} isSo={isSo} actions={actions} onReload={loadOrders} />)}</div>
      )}
    </div>
  );
};

// ========== GENERIC ORDER LIST ==========
export const OrdersListView = ({ isSo, type }: { isSo: boolean; type: string }) => {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const actions = useOrderActions(setOrders, isSo);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const tid = getTenantId();
    let query = supabase.from('orders').select('*, data_packages_config(cost_price)').order('created_at', { ascending: false }).limit(200);
    if (tid) query = query.eq('tenant_id', tid);
    switch (type) {
      case 'sales': query = query.gte('created_at', today.toISOString()).in('status', ['paid', 'completed']); break;
      case 'failed': query = query.eq('delivery_status', 'failed'); break;
      case 'pending': query = query.eq('delivery_status', 'pending').in('status', ['paid', 'completed']); break;
      case 'delivered': query = query.eq('delivery_status', 'delivered'); break;
    }
    const { data } = await query;
    setOrders(data || []);
    setLoading(false);
  }, [type]);

  useEffect(() => { loadOrders(); }, [loadOrders]);
  useRealtimeRefresh(['orders'], loadOrders, 800, { notify: true, lang: isSo ? 'so' : 'en' });

  const filtered = search ? orders.filter(o => o.receiver_phone?.includes(search) || o.customer_phone?.includes(search) || o.package_name?.toLowerCase().includes(search.toLowerCase())) : orders;
  const totalRev = orders.reduce((s, o) => s + Number(o.selling_price || 0), 0);
  const deliveredC = orders.filter(o => o.delivery_status === 'delivered').length;
  const failedC = orders.filter(o => o.delivery_status === 'failed').length;

  return (
    <div className="space-y-3">
      <StatCardsRow cards={[
        { label: isSo ? 'Wadarta' : 'Total', value: orders.length, icon: Package, color: 'bg-purple-500' },
        { label: isSo ? 'Dakhli' : 'Revenue', value: `$${totalRev.toFixed(0)}`, icon: DollarSign, color: 'bg-emerald-500' },
        { label: isSo ? 'Guulaystay' : 'Delivered', value: deliveredC, icon: CheckCircle, color: 'bg-green-500' },
        { label: isSo ? 'Guuldaraystay' : 'Failed', value: failedC, icon: XCircle, color: 'bg-red-500' },
      ]} />
      <SearchInput value={search} onChange={setSearch} placeholder={isSo ? 'Raadi lambarka ama package...' : 'Search phone or package...'} />
      {loading ? <LazyFallback /> : filtered.length === 0 ? <EmptyState message={isSo ? 'Wax dalab ah lama helin' : 'No orders found'} /> : (
        <div className="space-y-2">{filtered.map((item, idx) => <OrderAccordionItem key={item.id} item={item} idx={idx} expandedId={expandedId} setExpandedId={setExpandedId} isSo={isSo} actions={actions} onReload={loadOrders} />)}</div>
      )}
    </div>
  );
};

// ========== AUTO TOP-UP (moved to AutoTopUpView.tsx) ==========
export { AutoTopUpCustomView } from './AutoTopUpView';
