import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/contexts/LanguageContext';
import { toast } from '@/hooks/use-toast';
import { Search, RefreshCw, Download, MessageSquare, ChevronDown, Loader2, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';
import CachedImage from '@/components/CachedImage';

interface PaymentReceipt {
  id: string;
  sender_phone: string;
  amount: number;
  receiver_sim: string;
  sms_body: string | null;
  status: string | null;
  matched_order_id: string | null;
  tx_id: string | null;
  created_at: string | null;
  processed_at: string | null;
  matching_strategy: string | null;
  admin_notes: string | null;
  order?: {
    id: string;
    package_name: string;
    data_amount: string;
    customer_phone: string;
    receiver_phone: string;
    provider_id: string;
    delivery_status: string | null;
    delivery_notes: string | null;
    selling_price: number;
    provider?: {
      provider_name: string;
      provider_logo: string | null;
    };
  } | null;
}

const formatPhone = (phone: string) => {
  if (!phone) return '';
  const clean = phone.replace(/\D/g, '');
  if (clean.length === 9) return `${clean.slice(0, 2)}-${clean.slice(2, 5)}-${clean.slice(5)}`;
  if (clean.length === 10) return `${clean.slice(0, 3)}-${clean.slice(3, 6)}-${clean.slice(6)}`;
  return phone;
};

const PAGE_SIZE = 30;

export function SmsLacagoCards() {
  const { language } = useLanguage();
  const isSo = language === 'so';
  const [receipts, setReceipts] = useState<PaymentReceipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('today');
  const [providerFilter, setProviderFilter] = useState('all');
  const [providers, setProviders] = useState<{ id: string; provider_name: string }[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deliveryResponses, setDeliveryResponses] = useState<{ ussd_code: string; provider_response: string | null; status: string }[]>([]);

  // Fetch delivery queue responses when expanding a receipt
  useEffect(() => {
    if (!expandedId) { setDeliveryResponses([]); return; }
    const r = receipts.find(rec => rec.id === expandedId);
    if (!r?.order?.id) return;
    supabase
      .from('delivery_queue')
      .select('ussd_code, provider_response, status')
      .eq('order_id', r.order.id)
      .order('created_at', { ascending: true })
      .then(({ data }) => setDeliveryResponses((data || []) as any));
  }, [expandedId]);

  useEffect(() => {
    supabase.from('providers_config').select('id, provider_name').eq('is_active', true)
      .then(({ data }) => { if (data) setProviders(data); });
  }, []);

  // Cache providers map to avoid N+1 queries
  const [providersMap, setProvidersMap] = useState<Record<string, { provider_name: string; provider_logo: string | null }>>({});

  useEffect(() => {
    supabase.from('providers_config').select('id, provider_name, provider_logo')
      .then(({ data }) => {
        if (data) {
          const map: Record<string, { provider_name: string; provider_logo: string | null }> = {};
          data.forEach(p => { map[p.id] = { provider_name: p.provider_name, provider_logo: p.provider_logo }; });
          setProvidersMap(map);
        }
      });
  }, []);

  const loadReceipts = async (append = false) => {
    if (append) setLoadingMore(true); else setLoading(true);
    try {
      const now = new Date();
      let dateFrom: Date | null = null;
      let dateTo: Date | null = null;

      switch (dateFilter) {
        case 'today': dateFrom = startOfDay(now); dateTo = endOfDay(now); break;
        case 'yesterday': dateFrom = startOfDay(subDays(now, 1)); dateTo = endOfDay(subDays(now, 1)); break;
        case '7days': dateFrom = startOfDay(subDays(now, 7)); dateTo = endOfDay(now); break;
        case '30days': dateFrom = startOfDay(subDays(now, 30)); dateTo = endOfDay(now); break;
        case 'all': break;
      }

      const offset = append ? receipts.length : 0;

      let query = supabase
        .from('payment_receipts')
        .select(`*, order:matched_order_id (id, package_name, data_amount, customer_phone, receiver_phone, provider_id, delivery_status, delivery_notes, selling_price)`)
        .order('created_at', { ascending: false });

      if (dateFrom) query = query.gte('created_at', dateFrom.toISOString());
      if (dateTo) query = query.lte('created_at', dateTo.toISOString());
      if (statusFilter !== 'all') query = query.eq('status', statusFilter);

      const { data, error } = await query.range(offset, offset + PAGE_SIZE - 1);
      if (error) throw error;

      if (data) {
        const withProviders = data.map((r: any) => {
          if (r.order?.provider_id && providersMap[r.order.provider_id]) {
            r.order.provider = providersMap[r.order.provider_id];
          }
          return r as PaymentReceipt;
        });

        let filtered = withProviders;
        if (providerFilter !== 'all') filtered = filtered.filter(r => r.order?.provider?.provider_name === providerFilter);
        if (searchQuery) filtered = filtered.filter(r =>
          r.sender_phone.includes(searchQuery) ||
          r.order?.customer_phone?.includes(searchQuery) ||
          r.order?.receiver_phone?.includes(searchQuery)
        );

        setHasMore(data.length === PAGE_SIZE);
        if (append) setReceipts(prev => [...prev, ...filtered]);
        else setReceipts(filtered);
      }
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => { if (Object.keys(providersMap).length > 0) loadReceipts(); }, [statusFilter, dateFilter, providerFilter, providersMap]);
  useEffect(() => { if (Object.keys(providersMap).length === 0) return; const t = setTimeout(() => loadReceipts(), 300); return () => clearTimeout(t); }, [searchQuery, providersMap]);

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel('sms-lacago-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payment_receipts' }, () => { loadReceipts(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [statusFilter, dateFilter, providerFilter, searchQuery]);

  const exportCSV = () => {
    const headers = ['Waqti', 'Soo Diray', 'Lacag', 'Shirkad', 'Xirmo', 'Data', 'Status', 'SMS Body'];
    const rows = receipts.map(r => [
      r.created_at ? format(new Date(r.created_at), 'yyyy-MM-dd HH:mm:ss') : '',
      r.sender_phone, r.amount.toString(),
      r.order?.provider?.provider_name || '-', r.order?.package_name || '-',
      r.order?.data_amount || '-', r.status || 'pending',
      r.sms_body?.replace(/"/g, '""') || ''
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `sms-lacago-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    link.click();
  };

  const stats = {
    total: receipts.length,
    matched: receipts.filter(r => r.status === 'matched').length,
    pending: receipts.filter(r => r.status === 'pending').length,
    unmatched: receipts.filter(r => r.status === 'unmatched').length,
    blocked: receipts.filter(r => r.status === 'blocked').length,
  };

  const statusColor = (s: string | null) => {
    switch (s) {
      case 'matched': return 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300';
      case 'pending': return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300';
      case 'unmatched': return 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300';
      case 'blocked': return 'bg-red-200 text-red-800 dark:bg-red-950 dark:text-red-400';
      default: return 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300';
    }
  };

  return (
    <div className="space-y-3">
      {/* Title + actions */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2">
            <MessageSquare className="w-4 h-4" />
            {isSo ? 'Lacagaha Soo Galay (EVC Plus)' : 'Incoming Payments (EVC Plus)'}
          </h3>
          <p className="text-xs text-gray-400">{isSo ? 'Dhammaan SMS-yada lacagaha EVC Plus' : 'All EVC Plus payment SMS'}</p>
        </div>
        <div className="flex gap-1.5">
          <button onClick={() => loadReceipts()} className="p-1.5 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={exportCSV} className="p-1.5 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300">
            <Download className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Compact filter row */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        <div className="relative min-w-[120px] flex-1">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" />
          <Input
            placeholder={isSo ? 'Raadi...' : 'Search...'}
            className="pl-7 h-8 text-xs"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Select value={dateFilter} onValueChange={setDateFilter}>
          <SelectTrigger className="h-8 text-xs min-w-[90px] w-auto"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="today">{isSo ? 'Maanta' : 'Today'}</SelectItem>
            <SelectItem value="yesterday">{isSo ? 'Shalay' : 'Yesterday'}</SelectItem>
            <SelectItem value="7days">7d</SelectItem>
            <SelectItem value="30days">30d</SelectItem>
            <SelectItem value="all">{isSo ? 'Dhamaan' : 'All'}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-8 text-xs min-w-[90px] w-auto"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{isSo ? 'Dhammaan' : 'All'}</SelectItem>
            <SelectItem value="matched">✅ Matched</SelectItem>
            <SelectItem value="pending">⏳ Pending</SelectItem>
            <SelectItem value="unmatched">❌ Unmatched</SelectItem>
            <SelectItem value="blocked">🚫 Blocked</SelectItem>
          </SelectContent>
        </Select>
        <Select value={providerFilter} onValueChange={setProviderFilter}>
          <SelectTrigger className="h-8 text-xs min-w-[90px] w-auto"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{isSo ? 'Dhammaan' : 'All'}</SelectItem>
            {providers.map(p => <SelectItem key={p.id} value={p.provider_name}>{p.provider_name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Stats row */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {[
          { label: isSo ? 'Wadarta' : 'Total', val: stats.total, cls: 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200' },
          { label: 'Matched', val: stats.matched, cls: 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300' },
          { label: 'Pending', val: stats.pending, cls: 'bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300' },
          { label: 'Unmatched', val: stats.unmatched, cls: 'bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300' },
          { label: 'Blocked', val: stats.blocked, cls: 'bg-red-200 dark:bg-red-950 text-red-800 dark:text-red-400' },
        ].map(s => (
          <div key={s.label} className={`${s.cls} rounded-lg px-3 py-1.5 text-center min-w-[60px]`}>
            <div className="text-lg font-bold">{s.val}</div>
            <div className="text-[10px]">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Accordion Cards */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-gray-400" /></div>
      ) : receipts.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <MessageSquare className="h-10 w-10 mx-auto mb-3 opacity-50" />
          <p className="text-sm">{isSo ? 'SMS ma jiro' : 'No SMS found'}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {receipts.map((r) => (
              <div key={r.id} className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
                <button
                  onClick={() => setExpandedId(r.id)}
                  className="w-full p-3 flex items-center justify-between text-left active:bg-gray-50 dark:active:bg-gray-750 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-semibold text-sm text-gray-800 dark:text-gray-100">{formatPhone(r.sender_phone)}</span>
                        <span className="font-bold text-sm text-gray-700 dark:text-gray-200">${r.amount.toFixed(2)}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-gray-400">
                        <span>{r.created_at ? format(new Date(r.created_at), 'HH:mm') : '-'}</span>
                        <span>·</span>
                        <span>{r.created_at ? format(new Date(r.created_at), 'dd/MM') : ''}</span>
                        {r.order?.provider?.provider_name && (
                          <>
                            <span>·</span>
                            <span>{r.order.provider.provider_name}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${statusColor(r.status)}`}>
                      {r.status || 'pending'}
                    </span>
                  </div>
                </button>
              </div>
          ))}
          {hasMore && !loading && (
            <button
              onClick={() => loadReceipts(true)}
              disabled={loadingMore}
              className="w-full py-3 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-sm font-medium flex items-center justify-center gap-2 active:bg-gray-200 dark:active:bg-gray-600 transition-colors"
            >
              {loadingMore ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> {isSo ? 'Soo raadinta...' : 'Loading...'}</>
              ) : (
                <><ChevronDown className="w-4 h-4" /> {isSo ? 'Soo dheeraad ah' : 'Load More'}</>
              )}
            </button>
          )}
        </div>
      )}

      {/* Modal Popup - Invoice Style */}
      {expandedId && (() => {
        const r = receipts.find(rec => rec.id === expandedId);
        if (!r) return null;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-5" onClick={() => setExpandedId(null)}>
            <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" />
            <div
              className="relative w-full max-w-[370px] bg-white dark:bg-gray-800 rounded-xl animate-in zoom-in-95 fade-in duration-200"
              style={{ boxShadow: '0 25px 60px -12px rgba(0,0,0,0.5), 0 0 0 1px rgba(0,0,0,0.05)' }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header bar */}
              <div className="bg-[#3D0066] rounded-t-xl px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-3.5 h-3.5 text-white/70" />
                  <h3 className="font-bold text-[13px] text-white">{isSo ? 'Faahfaahinta SMS' : 'SMS Invoice'}</h3>
                </div>
                <button onClick={() => setExpandedId(null)} className="p-1 rounded-full hover:bg-white/20 transition-colors">
                  <X className="w-3.5 h-3.5 text-white/80" />
                </button>
              </div>

              <div className="px-4 py-3 space-y-2">
                {/* Sender + Amount */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="text-[9px] uppercase tracking-wider text-purple-500 dark:text-purple-400 font-semibold">{isSo ? 'Soo Diray' : 'Sender'}</span>
                    <div className="font-mono font-bold text-[13px] text-gray-800 dark:text-gray-100">{formatPhone(r.sender_phone)}</div>
                  </div>
                  <div>
                    <span className="text-[9px] uppercase tracking-wider text-purple-500 dark:text-purple-400 font-semibold">{isSo ? 'Lacag' : 'Amount'}</span>
                    <div className="font-bold text-[16px] text-gray-800 dark:text-gray-100">${r.amount.toFixed(2)}</div>
                  </div>
                </div>

                {/* Time + Status */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="text-[9px] uppercase tracking-wider text-purple-500 dark:text-purple-400 font-semibold">{isSo ? 'Waqti' : 'Time'}</span>
                    <div className="text-[11px] font-medium text-gray-600 dark:text-gray-300">
                      {r.created_at ? format(new Date(r.created_at), 'MMM dd, yyyy HH:mm:ss') : '-'}
                    </div>
                  </div>
                  <div>
                    <span className="text-[9px] uppercase tracking-wider text-purple-500 dark:text-purple-400 font-semibold">Status</span>
                    <div className="mt-0.5">
                      <Badge className={`text-[9px] font-bold px-1.5 py-0.5 ${statusColor(r.status)}`}>
                        {r.status === 'matched' ? '✅ Matched' : r.status === 'pending' ? '⏳ Pending' : r.status === 'unmatched' ? '❌ Unmatched' : r.status === 'blocked' ? '🚫 Blocked' : r.status || 'pending'}
                      </Badge>
                    </div>
                  </div>
                </div>

                <div className="border-t border-dashed border-gray-200 dark:border-gray-600" />

                {/* SMS Body */}
                {r.sms_body && (
                  <div>
                    <span className="text-[9px] uppercase tracking-wider text-purple-500 dark:text-purple-400 font-semibold">SMS Body</span>
                    <div className="mt-1 bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-md p-2 text-[10px] font-mono text-gray-600 dark:text-gray-300 whitespace-pre-wrap leading-snug max-h-[70px] overflow-y-auto">
                      {r.sms_body}
                    </div>
                  </div>
                )}

                <div className="border-t border-dashed border-gray-200 dark:border-gray-600" />

                {/* Order Details */}
                <div>
                  <h4 className="text-[9px] font-bold text-[#3D0066] dark:text-purple-400 uppercase tracking-wider mb-1">
                    {isSo ? 'FAAHFAAHINTA ORDER-KA' : 'ORDER DETAILS'}
                  </h4>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                    <div>
                      <span className="text-[9px] text-gray-400">{isSo ? 'Shirkad' : 'Provider'}</span>
                      <div className="font-semibold text-[11px] text-gray-800 dark:text-gray-100 flex items-center gap-1.5">
                         <CachedImage src={r.order?.provider?.provider_logo} alt={r.order?.provider?.provider_name || 'Provider'} bundledName={r.order?.provider?.provider_name} className="w-5 h-5 rounded-full object-contain border border-gray-200 dark:border-gray-600" />
                        {r.order?.provider?.provider_name || '-'}
                      </div>
                    </div>
                    <div>
                      <span className="text-[9px] text-gray-400">{isSo ? 'Xirmo' : 'Package'}</span>
                      <div className="font-semibold text-[11px] text-gray-800 dark:text-gray-100">{r.order?.package_name || '-'}</div>
                    </div>
                    <div>
                      <span className="text-[9px] text-gray-400">Data</span>
                      <div className="font-semibold text-[11px] text-gray-800 dark:text-gray-100">{r.order?.data_amount || '-'}</div>
                    </div>
                    <div>
                      <span className="text-[9px] text-gray-400">{isSo ? 'Qiimaha' : 'Price'}</span>
                      <div className="font-semibold text-[11px] text-gray-800 dark:text-gray-100">${r.order?.selling_price?.toFixed(2) || '-'}</div>
                    </div>
                    <div>
                      <span className="text-[9px] text-gray-400">{isSo ? 'Lacag Bixiye' : 'Payment From'}</span>
                      <div className="font-mono font-semibold text-[11px] text-gray-800 dark:text-gray-100">{formatPhone(r.sender_phone)}</div>
                    </div>
                    <div>
                      <span className="text-[9px] text-gray-400">Customer</span>
                      <div className="font-mono font-semibold text-[11px] text-gray-800 dark:text-gray-100">{r.order?.customer_phone ? formatPhone(r.order.customer_phone) : '-'}</div>
                    </div>
                    <div>
                      <span className="text-[9px] text-gray-400">Receiver</span>
                      <div className="font-mono font-semibold text-[11px] text-gray-800 dark:text-gray-100">{r.order?.receiver_phone ? formatPhone(r.order.receiver_phone) : '-'}</div>
                    </div>
                  </div>

                  {r.order?.delivery_status && (
                    <div className="mt-1.5 flex items-center gap-2">
                      <span className="text-[9px] text-gray-400">Delivery:</span>
                      <Badge className={`text-[9px] font-bold ${r.order.delivery_status === 'delivered' ? 'bg-green-500 text-white' : r.order.delivery_status === 'failed' ? 'bg-red-500 text-white' : 'bg-yellow-500 text-white'}`}>
                        {r.order.delivery_status}
                      </Badge>
                    </div>
                  )}
                </div>

                {/* All Delivery Responses from delivery_queue */}
                {deliveryResponses.length > 0 && (
                  <div>
                    <span className="text-[9px] uppercase tracking-wider text-purple-500 dark:text-purple-400 font-semibold">
                      {isSo ? 'NATIIJADA DELIVERY' : 'DELIVERY RESPONSES'} ({deliveryResponses.length})
                    </span>
                    <div className="mt-1 space-y-1.5">
                      {deliveryResponses.map((dq, idx) => (
                        <div key={idx} className="bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-md p-2">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[8px] font-semibold text-gray-400">#{idx + 1}</span>
                            <Badge className={`text-[8px] ${dq.status === 'completed' ? 'bg-green-500 text-white' : dq.status === 'failed' || dq.status === 'timeout' ? 'bg-red-500 text-white' : 'bg-yellow-500 text-white'}`}>
                              {dq.status}
                            </Badge>
                          </div>
                          {dq.provider_response ? (
                            <div className="text-[10px] font-mono text-gray-600 dark:text-gray-300 whitespace-pre-wrap leading-snug">
                              {dq.provider_response}
                            </div>
                          ) : (
                            <span className="text-[9px] text-gray-400 italic">{isSo ? 'Jawaab la\'aan' : 'No response yet'}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Fallback: show delivery_notes if no queue entries */}
                {deliveryResponses.length === 0 && r.order?.delivery_notes && (
                  <div>
                    <span className="text-[9px] uppercase tracking-wider text-purple-500 dark:text-purple-400 font-semibold">{isSo ? 'Natiijada Delivery' : 'Delivery Response'}</span>
                    <div className="mt-1 bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-md p-2 text-[10px] font-mono text-gray-600 dark:text-gray-300 whitespace-pre-wrap leading-snug max-h-[60px] overflow-y-auto">
                      {r.order.delivery_notes}
                    </div>
                  </div>
                )}

                {/* Unmatched / Blocked */}
                {r.admin_notes && (r.status === 'unmatched' || r.status === 'blocked') && (
                  <div className={`rounded-md p-2 text-[10px] ${r.status === 'blocked' ? 'bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300' : 'bg-orange-50 dark:bg-orange-950 text-orange-700 dark:text-orange-300'}`}>
                    <span className="font-semibold">{r.status === 'blocked' ? '🚫 Block:' : '⚠️ Reason:'}</span> {r.admin_notes}
                  </div>
                )}

                {/* TX ID */}
                {r.tx_id && (
                  <div className="pt-1 border-t border-dashed border-gray-200 dark:border-gray-600">
                    <span className="text-[8px] text-gray-400">TX ID</span>
                    <div className="font-mono text-[9px] text-gray-400 dark:text-gray-500 break-all">{r.tx_id}</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

export default SmsLacagoCards;
