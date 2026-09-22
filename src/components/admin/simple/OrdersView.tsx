import { useState, useEffect, useCallback } from 'react';
import { supabase, getTenantId } from '@/integrations/supabase/client';
import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';
import { LazyFallback, EmptyState, SearchInput, formatPhone, formatDate, formatTime } from './shared';
import { CheckCircle, XCircle, RotateCcw, Clock, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { ResendOrderPrompt } from './ResendOrderPrompt';
import { calculateOrderProfit, effectiveOrderCost, isDirectFlowCode } from '@/lib/iftinProfit';

interface DeliveryQueueItem {
  id: string;
  order_id: string;
  ussd_code: string;
  provider_response: string | null;
  sim_slot: number | null;
  android_device_id: string | null;
  status: string;
  created_at: string;
}

interface OrderDetail {
  id: string;
  sender_phone: string;
  receiver_phone: string;
  customer_phone: string;
  package_name: string;
  data_amount: string;
  selling_price: number;
  cost_price: number;
  status: string;
  delivery_status: string;
  delivery_notes: string | null;
  created_at: string;
  delivered_at: string | null;
  provider_id: string;
  package_id: string;
  provider_name?: string;
  evoucher_rate?: number;
  is_direct_flow?: boolean;
  bundle_profit?: number | null;
  // All delivery queue entries for this order
  deliveries: DeliveryQueueItem[];
  device_name?: string;
  sim_number?: string;
}

const DetailRow = ({ label, value, bold }: { label: string; value: string; bold?: boolean }) => (
  <div className="flex items-start justify-between py-2 border-b border-gray-100 dark:border-gray-700 last:border-0">
    <span className="text-[11px] font-bold text-gray-600 dark:text-gray-400 min-w-[100px]">{label}</span>
    <span className={`text-[11px] text-right flex-1 ml-2 ${bold ? 'font-bold text-gray-900 dark:text-white' : 'text-gray-700 dark:text-gray-300'}`}>{value}</span>
  </div>
);

const StatusBadge = ({ status }: { status: string }) => {
  const colors = status === 'delivered' ? 'bg-green-500 text-white' :
    status === 'failed' || status === 'timeout' ? 'bg-red-500 text-white' :
    status === 'pending' ? 'bg-yellow-400 text-yellow-900' :
    status === 'processing' ? 'bg-blue-500 text-white' : 'bg-gray-400 text-white';
  const label = status === 'delivered' ? 'Successfully' : status === 'failed' ? 'Failed' :
    status === 'timeout' ? 'Timeout' : status === 'pending' ? 'Pending' :
    status === 'processing' ? 'Processing' : status;
  return <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${colors}`}>{label}</span>;
};

export const OrdersView = ({ isSo }: { isSo: boolean }) => {
  const [orders, setOrders] = useState<OrderDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'pending' | 'delivered' | 'failed'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [resendItem, setResendItem] = useState<any | null>(null);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    try {
      // Get today's orders with delivery queue info
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Sug in tenant kasta uu arko dalabkiisa oo keliya (super admin-ku RLS wuu dhaafaa).
      const tid = getTenantId();
      const scoped = (q: any) => (tid ? q.eq('tenant_id', tid) : q);

      const [ordersRes, deliveryRes, providersRes, devicesRes, packagesRes, instructionsRes, bundleRulesRes] = await Promise.all([
        scoped(supabase.from('orders').select('*').gte('created_at', today.toISOString()).order('created_at', { ascending: false }).limit(200)),
        scoped(supabase.from('delivery_queue').select('order_id, ussd_code, provider_response, sim_slot, android_device_id, status').gte('created_at', today.toISOString())),
        scoped(supabase.from('providers_config').select('id, provider_name, evoucher_rate')),
        scoped(supabase.from('android_devices').select('device_id, device_name, sim_number, sim2_number')),
        scoped(supabase.from('data_packages_config').select('id, selling_price, cost_price, provider_id, category_id, ussd_code, is_discovery_root')),
        scoped(supabase.from('delivery_instructions').select('package_id, category_id, provider_id, code_template')),
        scoped(supabase.from('package_delivery_rules').select('source_package_id, target_package_id, delivery_count, is_active').eq('is_active', true)),
      ]);

      const deliveries = (deliveryRes.data || []) as DeliveryQueueItem[];
      const providers = providersRes.data || [];
      const devices = devicesRes.data || [];
      const packages = packagesRes.data || [];
      const instructions = instructionsRes.data || [];
      const packageMap = new Map(packages.map((p: any) => [p.id, p]));
      const bundleProfitBySource = new Map<string, number>();
      for (const rule of (bundleRulesRes.data || []) as any[]) {
        const target: any = packageMap.get(rule.target_package_id);
        if (!target) continue;
        const count = Math.max(1, Number(rule.delivery_count || 1));
        const perDeliveryProfit = Number(target.selling_price || 0) - Number(target.cost_price || 0);
        bundleProfitBySource.set(
          rule.source_package_id,
          (bundleProfitBySource.get(rule.source_package_id) || 0) + (perDeliveryProfit * count),
        );
      }

      const enriched: OrderDetail[] = (ordersRes.data || []).map((o: any) => {
        // Get ALL delivery queue entries for this order (not just first)
        const orderDeliveries = deliveries.filter(d => d.order_id === o.id);
        const firstDq = orderDeliveries[0];
        const prov = providers.find(p => p.id === o.provider_id);
        const dev = firstDq ? devices.find(d => d.device_id === firstDq.android_device_id) : null;
        const pkg: any = packageMap.get(o.package_id);
        const costPrice = effectiveOrderCost(o.cost_price, pkg?.cost_price);
        const isDirectFlow = Boolean(
          pkg && (
            pkg.is_discovery_root ||
            isDirectFlowCode(pkg.ussd_code) ||
            instructions.some((ins: any) =>
              isDirectFlowCode(ins.code_template) && (
                ins.package_id ? ins.package_id === pkg.id
                  : ins.category_id ? ins.category_id === pkg.category_id
                  : ins.provider_id ? ins.provider_id === pkg.provider_id
                  : false
              ))
          )
        );
        return {
          ...o,
          cost_price: costPrice,
          provider_name: prov?.provider_name || 'Unknown',
          evoucher_rate: prov?.evoucher_rate || 0,
          is_direct_flow: isDirectFlow,
          bundle_profit: bundleProfitBySource.has(o.package_id)
            ? bundleProfitBySource.get(o.package_id)!
            : null,
          deliveries: orderDeliveries,
          device_name: dev?.device_name,
          sim_number: firstDq?.sim_slot === 2 ? dev?.sim2_number : dev?.sim_number,
        };
      });

      setOrders(enriched);
    } catch (err) {
      console.error('OrdersView load error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadOrders(); }, [loadOrders]);
  useRealtimeRefresh(['orders', 'delivery_queue'], loadOrders, 800, { notify: true, lang: isSo ? 'so' : 'en' });

  const filtered = orders.filter(o => {
    if (filter === 'pending') return o.delivery_status === 'pending' || o.delivery_status === 'processing';
    if (filter === 'delivered') return o.delivery_status === 'delivered';
    if (filter === 'failed') return o.delivery_status === 'failed' || o.delivery_status === 'timeout';
    return true;
  }).filter(o => !search || 
    o.receiver_phone?.includes(search) || 
    o.sender_phone?.includes(search) || 
    o.customer_phone?.includes(search) ||
    o.package_name?.toLowerCase().includes(search.toLowerCase())
  );

  const markDelivered = async (id: string) => {
    await supabase.from('orders').update({ delivery_status: 'delivered', delivered_at: new Date().toISOString(), delivery_notes: 'Manually verified - OrdersView' }).eq('id', id);
    toast.success(isSo ? 'Waa la dhameeyay' : 'Marked as delivered');
    loadOrders();
  };

  const retryOrder = async (id: string) => {
    const order = orders.find(o => o.id === id);
    if (!order) return;
    await supabase.from('orders').update({ delivery_status: 'pending', status: 'paid' }).eq('id', id);
    toast.success(isSo ? 'Dib loo diray' : 'Retrying...');
    loadOrders();
  };

  const pendingCount = orders.filter(o => o.delivery_status === 'pending' || o.delivery_status === 'processing').length;
  const deliveredCount = orders.filter(o => o.delivery_status === 'delivered').length;
  const failedCount = orders.filter(o => o.delivery_status === 'failed' || o.delivery_status === 'timeout').length;

  return (
    <div className="space-y-3">
      {/* Summary */}
      <div className="grid grid-cols-4 gap-2">
        <button onClick={() => setFilter('all')} className={`p-2 rounded-lg text-center text-[10px] font-bold border ${filter === 'all' ? 'bg-blue-500 text-white border-blue-500' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700'}`}>
          <div className="text-lg">{orders.length}</div>
          Wadarta
        </button>
        <button onClick={() => setFilter('pending')} className={`p-2 rounded-lg text-center text-[10px] font-bold border ${filter === 'pending' ? 'bg-yellow-500 text-white border-yellow-500' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700'}`}>
          <div className="text-lg">{pendingCount}</div>
          Sugaya
        </button>
        <button onClick={() => setFilter('delivered')} className={`p-2 rounded-lg text-center text-[10px] font-bold border ${filter === 'delivered' ? 'bg-green-500 text-white border-green-500' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700'}`}>
          <div className="text-lg">{deliveredCount}</div>
          Guul
        </button>
        <button onClick={() => setFilter('failed')} className={`p-2 rounded-lg text-center text-[10px] font-bold border ${filter === 'failed' ? 'bg-red-500 text-white border-red-500' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700'}`}>
          <div className="text-lg">{failedCount}</div>
          Fashil
        </button>
      </div>

      <SearchInput value={search} onChange={setSearch} placeholder={isSo ? 'Raadi lambarka...' : 'Search phone...'} />

      {loading ? <LazyFallback /> : filtered.length === 0 ? <EmptyState message={isSo ? 'Wax dalab ah lama helin' : 'No orders found'} /> : (
        <div className="space-y-3">
          {/* Table header - Dire System style */}
          <div className="bg-blue-500 text-white px-3 py-2 rounded-t-lg grid grid-cols-3 text-[10px] font-bold">
            <span>Sender</span>
            <span className="text-center">Recharge</span>
            <span className="text-right">Price</span>
          </div>

          {filtered.map((order, idx) => {
            const profit = order.bundle_profit != null
              ? Number(order.bundle_profit)
              : calculateOrderProfit(order.selling_price, order.cost_price, order.evoucher_rate || 0, Boolean(order.is_direct_flow));
            const displayStatus = order.delivery_status || order.status;
            const isExpanded = expandedId === order.id;
            
            return (
              <div key={order.id} className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                {/* Collapsed row - tap to expand */}
                <button
                  onClick={() => setExpandedId(isExpanded ? null : order.id)}
                  className="w-full grid grid-cols-3 items-center px-3 py-2.5 text-left active:bg-gray-50 dark:active:bg-gray-750"
                >
                  <div className="flex items-center gap-1">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${displayStatus === 'delivered' ? 'bg-green-500' : displayStatus === 'failed' || displayStatus === 'timeout' ? 'bg-red-500' : 'bg-yellow-400'}`} />
                    <span className="text-[11px] font-medium text-gray-800 dark:text-white truncate">{formatPhone(order.sender_phone || order.customer_phone)}</span>
                  </div>
                  <span className="text-[11px] text-center font-medium text-gray-800 dark:text-white">{formatPhone(order.receiver_phone)}</span>
                  <div className="flex items-center justify-end gap-1">
                    <span className="text-[11px] font-bold text-blue-600 dark:text-blue-400">${Number(order.selling_price).toFixed(2)}</span>
                    <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                  </div>
                </button>

                {/* Expanded details */}
                {isExpanded && (
                  <>
                    <div className="px-3 border-t border-gray-100 dark:border-gray-700">
                      <DetailRow label="Business" value={order.provider_name || 'N/A'} />
                      {order.sim_number && <DetailRow label="AccNo" value={`SIM_${order.sim_number}`} />}
                      <DetailRow label="Data" value={`$${Number(order.cost_price || 0).toFixed(2)}`} />
                      <DetailRow label="Network" value={order.package_name} bold />
                      <DetailRow label="Profit" value={`$${profit < 0.01 && profit > 0 ? profit.toFixed(3) : profit.toFixed(2)}`} bold />
                      {order.device_name && <DetailRow label="Device" value={order.device_name} />}
                      {order.sim_number && <DetailRow label="SimNO" value={order.sim_number} />}
                      <div className="flex items-start justify-between py-2 border-b border-gray-100 dark:border-gray-700">
                        <span className="text-[11px] font-bold text-gray-600 dark:text-gray-400">Status</span>
                        <StatusBadge status={displayStatus} />
                      </div>
                      <DetailRow label="Process Time" value={order.delivered_at ? `${formatTime(order.delivered_at)} ${formatDate(order.delivered_at)}` : '—'} />
                      
                      {/* Show ALL delivery SMS responses */}
                      {order.deliveries.length > 0 && (
                        <div className="py-2 border-b border-gray-100 dark:border-gray-700">
                          <span className="text-[11px] font-bold text-gray-600 dark:text-gray-400">
                            📩 SMS ({order.deliveries.length})
                          </span>
                          <div className="space-y-1.5 mt-1">
                            {order.deliveries.map((dq, i) => (
                              <div key={dq.id} className={`p-2 rounded border text-[10px] whitespace-pre-wrap ${
                                dq.status === 'completed' ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-gray-700 dark:text-gray-300' :
                                dq.status === 'failed' || dq.status === 'timeout' ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-gray-700 dark:text-gray-300' :
                                'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800 text-gray-700 dark:text-gray-300'
                              }`}>
                                <div className="flex justify-between items-center mb-1">
                                  <span className="font-bold text-gray-500">USSD: {dq.ussd_code}</span>
                                  <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${
                                    dq.status === 'completed' ? 'bg-green-500 text-white' :
                                    dq.status === 'failed' || dq.status === 'timeout' ? 'bg-red-500 text-white' :
                                    'bg-yellow-400 text-yellow-900'
                                  }`}>{dq.status}</span>
                                </div>
                                {dq.provider_response ? (
                                  <span>"{dq.provider_response}"</span>
                                ) : (
                                  <span className="italic text-gray-400">Jawaab lama helin</span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <DetailRow label="Create Time" value={`${formatTime(order.created_at)} ${formatDate(order.created_at)}`} />
                      <DetailRow label="ID" value={order.id.slice(0, 8)} />
                    </div>

                    <div className="px-3 py-2 border-t border-gray-100 dark:border-gray-700 flex gap-2 flex-wrap">
                      {displayStatus === 'pending' && (
                        <button onClick={() => markDelivered(order.id)} className="flex items-center gap-1 px-2 py-1 bg-green-500 text-white rounded text-[10px] font-bold">
                          <CheckCircle className="w-3 h-3" /> Dhamee
                        </button>
                      )}
                      <button onClick={() => setResendItem(order)} className="flex items-center gap-1 px-2 py-1 bg-purple-600 text-white rounded text-[10px] font-bold">
                        <RotateCcw className="w-3 h-3" /> {isSo ? 'Dib u dir' : 'Resend'}
                      </button>
                      {(displayStatus === 'failed' || displayStatus === 'timeout') && (
                        <button onClick={() => retryOrder(order.id)} className="flex items-center gap-1 px-2 py-1 bg-orange-500 text-white rounded text-[10px] font-bold">
                          <RotateCcw className="w-3 h-3" /> {isSo ? 'Isku day mar kale' : 'Retry'}
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {resendItem && (
        <ResendOrderPrompt
          order={resendItem}
          isSo={isSo}
          onClose={() => setResendItem(null)}
          onDone={loadOrders}
        />
      )}
    </div>
  );
};
