import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Textarea } from '@/components/ui/textarea';
import { useLanguage } from '@/contexts/LanguageContext';
import { Loader2, RefreshCw, Truck, CheckCircle2, XCircle, Clock, Phone, Zap, Radio, CheckCheck, Ban, RotateCcw, X } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { format, formatDistanceToNow, subDays, startOfDay, endOfDay } from 'date-fns';
import CachedImage from '@/components/CachedImage';

interface DeliveryItem {
  id: string;
  order_id: string;
  provider_name: string;
  receiver_phone: string;
  ussd_code: string;
  package_code: string | null;
  status: string | null;
  attempts: number | null;
  error_message: string | null;
  created_at: string | null;
  last_attempt_at: string | null;
  completed_at: string | null;
  android_device_id: string | null;
  order?: {
    package_name: string;
    data_amount: string;
    customer_phone: string;
    sender_phone: string | null;
    delivery_notes: string | null;
    delivery_status: string | null;
    provider_id: string | null;
    provider?: {
      provider_name: string;
      provider_logo: string | null;
    };
  };
}

// Extract actual amount from USSD code (e.g. *737*phone*1*pin# → $1)
const extractUssdAmount = (ussd: string): string | null => {
  if (!ussd) return null;
  const parts = ussd.replace('#', '').split('*').filter(Boolean);
  if (parts.length >= 4) {
    const amountPart = parts[parts.length - 2];
    if (/^\d+$/.test(amountPart)) {
      const num = parseInt(amountPart, 10);
      if (amountPart.length === 3 && num < 100) return `$${(num / 100).toFixed(2)}`;
      return `$${num}`;
    }
  }
  return null;
};

const formatPhone = (phone: string) => {
  if (!phone) return '';
  const clean = phone.replace(/\D/g, '');
  if (clean.length === 9) return `${clean.slice(0, 2)}-${clean.slice(2, 5)}-${clean.slice(5)}`;
  if (clean.length === 10) return `${clean.slice(0, 3)}-${clean.slice(3, 6)}-${clean.slice(6)}`;
  return phone;
};

export function DeliveryTracker() {
  const { language } = useLanguage();
  const isSo = language === 'so';
  const [deliveries, setDeliveries] = useState<DeliveryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [liveUpdates, setLiveUpdates] = useState(true);
  const [dateFilter, setDateFilter] = useState<string>('today');
  const [cancelReason, setCancelReason] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [providerLogos, setProviderLogos] = useState<Record<string, string>>({});

  // Providers are loaded separately: `orders.provider_id` has no FK to
  // providers_config, so a nested PostgREST embed fails the whole query.
  useEffect(() => {
    supabase.from('providers_config').select('id, provider_logo').then(({ data }) => {
      const map: Record<string, string> = {};
      (data ?? []).forEach((p: any) => { if (p.provider_logo) map[p.id] = p.provider_logo; });
      setProviderLogos(map);
    });
  }, []);

  const loadDeliveries = async () => {
    try {
      let dateFrom: Date | null = null;
      let dateTo: Date | null = null;
      const now = new Date();

      switch (dateFilter) {
        case 'today': dateFrom = startOfDay(now); dateTo = endOfDay(now); break;
        case 'yesterday': dateFrom = startOfDay(subDays(now, 1)); dateTo = endOfDay(subDays(now, 1)); break;
        case '7days': dateFrom = startOfDay(subDays(now, 7)); dateTo = endOfDay(now); break;
        case '30days': dateFrom = startOfDay(subDays(now, 30)); dateTo = endOfDay(now); break;
        case 'all': break;
      }

      let query = supabase
        .from('delivery_queue')
        .select(`*, order:order_id (package_name, data_amount, customer_phone, sender_phone, delivery_notes, delivery_status, provider_id)`)
        .order('created_at', { ascending: false });

      if (dateFrom) query = query.gte('created_at', dateFrom.toISOString());
      if (dateTo) query = query.lte('created_at', dateTo.toISOString());

      const { data, error } = await query.limit(100);
      if (error) throw error;
      setDeliveries(data as unknown as DeliveryItem[]);
    } catch (error: any) {
      console.error('Error loading deliveries:', error);
      toast({ title: isSo ? 'Xogta lama soo dejin' : 'Failed to load deliveries', description: error?.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadDeliveries(); }, [dateFilter]);

  // Realtime
  useEffect(() => {
    if (!liveUpdates) return;
    const channel = supabase
      .channel('delivery-queue-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'delivery_queue' }, async (payload) => {
        const newId = payload.new?.id;
        if (!newId) return;
        const { data } = await supabase.from('delivery_queue')
          .select(`*, order:order_id (package_name, data_amount, customer_phone, sender_phone, delivery_notes, delivery_status, provider_id)`)
          .eq('id', newId).single();
        if (data) setDeliveries(prev => [data as unknown as DeliveryItem, ...prev]);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'delivery_queue' }, async (payload) => {
        const updatedId = payload.new?.id;
        if (!updatedId) return;
        const { data } = await supabase.from('delivery_queue')
          .select(`*, order:order_id (package_name, data_amount, customer_phone, sender_phone, delivery_notes, delivery_status, provider_id)`)
          .eq('id', updatedId).single();
        if (data) setDeliveries(prev => prev.map(d => d.id === updatedId ? (data as unknown as DeliveryItem) : d));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [liveUpdates]);

  const getStatusInfo = (status: string | null) => {
    switch (status) {
      case 'completed': return { icon: '✅', color: 'text-green-600', bg: 'bg-green-100 dark:bg-green-900', label: 'Delivered' };
      case 'processing': return { icon: '⚡', color: 'text-blue-600', bg: 'bg-blue-100 dark:bg-blue-900', label: 'Processing' };
      case 'failed': return { icon: '❌', color: 'text-red-600', bg: 'bg-red-100 dark:bg-red-900', label: 'Failed' };
      case 'cancelled': return { icon: '🚫', color: 'text-red-700', bg: 'bg-red-200 dark:bg-red-950', label: isSo ? 'La damiyay' : 'Cancelled' };
      default: return { icon: '⏳', color: 'text-yellow-600', bg: 'bg-yellow-100 dark:bg-yellow-900', label: 'Pending' };
    }
  };

  const needsManualVerify = (d: DeliveryItem): boolean => {
    return !!(d.attempts && d.attempts > 0 && (d.order?.delivery_status === 'failed' || d.order?.delivery_status === 'timeout'));
  };

  const handleManualVerify = async (orderId: string, queueId: string) => {
    try {
      await supabase.from('orders').update({ delivery_status: 'delivered', delivery_notes: 'Manually verified by admin', delivered_at: new Date().toISOString() }).eq('id', orderId);
      await supabase.from('delivery_queue').update({ status: 'completed', completed_at: new Date().toISOString(), error_message: null }).eq('id', queueId);
      toast({ title: isSo ? 'La xaqiijiyay!' : 'Verified!' });
      setSelectedId(null);
      loadDeliveries();
    } catch (error) {
      toast({ title: 'Error', variant: 'destructive' });
    }
  };

  const handleCancelOrder = async (orderId: string, queueId: string, reason: string) => {
    try {
      const note = reason.trim() ? `Cancelled: ${reason.trim()}` : 'Cancelled by admin';
      await supabase.from('orders').update({ delivery_status: 'cancelled', delivery_notes: note }).eq('id', orderId);
      await supabase.from('delivery_queue').update({ status: 'cancelled', error_message: note }).eq('id', queueId);
      toast({ title: isSo ? 'La damiyay!' : 'Cancelled!' });
      setCancelReason('');
      setSelectedId(null);
      loadDeliveries();
    } catch (error) {
      toast({ title: 'Error', variant: 'destructive' });
    }
  };

  const handleRestoreOrder = async (orderId: string, queueId: string) => {
    try {
      await supabase.from('orders').update({ delivery_status: 'delivered', delivery_notes: 'Restored by admin' }).eq('id', orderId);
      await supabase.from('delivery_queue').update({ status: 'completed', error_message: null }).eq('id', queueId);
      toast({ title: isSo ? 'Dib loo soo celiyay!' : 'Restored!' });
      setSelectedId(null);
      loadDeliveries();
    } catch (error) {
      toast({ title: 'Error', variant: 'destructive' });
    }
  };

  const cancelledCount = deliveries.filter(d => d.status === 'cancelled').length;
  const activeDel = deliveries.filter(d => d.status !== 'cancelled');
  const stats = {
    total: activeDel.length,
    completed: activeDel.filter(d => d.status === 'completed').length,
    processing: activeDel.filter(d => d.status === 'processing').length,
    pending: activeDel.filter(d => d.status === 'pending').length,
    failed: activeDel.filter(d => d.status === 'failed').length,
    cancelled: cancelledCount,
  };

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-gray-400" /></div>;
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2">
            <Truck className="w-4 h-4" />
            {isSo ? 'E-Voucher Delivery Tracking' : 'E-Voucher Delivery Tracking'}
          </h3>
          <p className="text-xs text-gray-400">{isSo ? 'Real-time xirmadaha la diro' : 'Real-time delivery status'}</p>
        </div>
        <div className="flex gap-1.5">
          <button onClick={() => setLiveUpdates(!liveUpdates)}
            className={`px-2 py-1 rounded-lg text-xs font-medium flex items-center gap-1 ${liveUpdates ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'}`}>
            <Radio className={`w-3 h-3 ${liveUpdates ? 'animate-pulse' : ''}`} />
            {liveUpdates ? 'Live' : 'Paused'}
          </button>
          <button onClick={() => loadDeliveries()} className="p-1.5 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-1.5">
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
      </div>

      {/* Stats row */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {[
          { label: isSo ? 'Wadarta' : 'Total', val: stats.total, cls: 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200' },
          { label: 'Delivered', val: stats.completed, cls: 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300' },
          { label: 'Processing', val: stats.processing, cls: 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300' },
          { label: 'Pending', val: stats.pending, cls: 'bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300' },
          { label: 'Failed', val: stats.failed, cls: 'bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300' },
          { label: isSo ? 'La damiyay' : 'Cancelled', val: stats.cancelled, cls: 'bg-red-200 dark:bg-red-950 text-red-800 dark:text-red-400' },
        ].map(s => (
          <div key={s.label} className={`${s.cls} rounded-lg px-3 py-1.5 text-center min-w-[60px]`}>
            <div className="text-lg font-bold">{s.val}</div>
            <div className="text-[10px]">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Compact single-row card list */}
      {deliveries.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <Truck className="h-10 w-10 mx-auto mb-3 opacity-50" />
          <p className="text-sm">{isSo ? 'Delivery ma jiro' : 'No deliveries yet'}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {deliveries.map((d) => {
            const si = getStatusInfo(d.status);
            return (
              <div key={d.id}
                className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
                <button
                  onClick={() => setSelectedId(d.id)}
                  className="w-full p-3 flex items-center justify-between text-left active:bg-gray-50 dark:active:bg-gray-750 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-gray-800 dark:text-gray-100">{d.provider_name}</span>
                        <span className="text-[11px] text-gray-500 dark:text-gray-400 truncate">
                          {(d.order as any)?.package_name || d.package_code || ''}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-gray-400">
                        <Phone className="w-3 h-3" />
                        <span className="font-mono">{formatPhone(d.receiver_phone)}</span>
                        <span>·</span>
                        <span>{d.created_at ? format(new Date(d.created_at), 'HH:mm') : '-'}</span>
                      </div>
                    </div>
                  </div>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${si.bg} ${si.color}`}>
                    {si.label}
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Invoice Modal Popup */}
      {selectedId && (() => {
        const d = deliveries.find(del => del.id === selectedId);
        if (!d) return null;
        const si = getStatusInfo(d.status);
        const timeline = [
          { label: 'Queued', done: true, time: d.created_at },
          { label: 'Processing', done: d.status === 'processing' || d.status === 'completed' || d.status === 'failed', time: d.last_attempt_at },
          { label: 'USSD Sent', done: d.status === 'completed' || !!(d.attempts && d.attempts > 0), time: null },
          { label: 'Delivered', done: d.status === 'completed', time: d.completed_at },
        ];
        const duration = d.status === 'completed' && d.created_at && d.completed_at
          ? Math.round((new Date(d.completed_at).getTime() - new Date(d.created_at).getTime()) / 1000)
          : null;

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-5" onClick={() => setSelectedId(null)}>
            <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" />
            <div
              className="relative w-full max-w-[380px] bg-white dark:bg-gray-800 rounded-xl animate-in zoom-in-95 fade-in duration-200"
              style={{ boxShadow: '0 25px 60px -12px rgba(0,0,0,0.5), 0 0 0 1px rgba(0,0,0,0.05)' }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="bg-[#3D0066] rounded-t-xl px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Truck className="w-3.5 h-3.5 text-white/70" />
                  <h3 className="font-bold text-[13px] text-white">{isSo ? 'Delivery Invoice' : 'Delivery Invoice'}</h3>
                </div>
                <button onClick={() => setSelectedId(null)} className="p-1 rounded-full hover:bg-white/20 transition-colors">
                  <X className="w-3.5 h-3.5 text-white/80" />
                </button>
              </div>

              <div className="px-4 py-3 space-y-2.5">
                {/* Provider + Logo + Status */}
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    <CachedImage src={providerLogos[(d.order as any)?.provider_id ?? ''] ?? undefined} alt={d.provider_name} bundledName={d.provider_name} className="w-8 h-8 rounded-full object-contain border border-gray-200 dark:border-gray-600" />
                    <div>
                      <span className="text-[9px] uppercase tracking-wider text-purple-500 dark:text-purple-400 font-semibold">{isSo ? 'Shirkad' : 'Provider'}</span>
                      <div className="font-bold text-[14px] text-gray-800 dark:text-gray-100">{d.provider_name}</div>
                      <div className="text-[11px] text-gray-500 dark:text-gray-400">{(d.order as any)?.package_name || d.package_code || '-'}</div>
                    </div>
                  </div>
                  <Badge className={`text-[9px] font-bold px-2 py-0.5 ${si.bg} ${si.color}`}>
                    {si.icon} {si.label}
                  </Badge>
                </div>

                {/* Phone + Data */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="text-[9px] uppercase tracking-wider text-purple-500 dark:text-purple-400 font-semibold">{isSo ? 'Qaataha' : 'Receiver'}</span>
                    <div className="font-mono font-bold text-[13px] text-gray-800 dark:text-gray-100">{formatPhone(d.receiver_phone)}</div>
                  </div>
                  <div>
                    <span className="text-[9px] uppercase tracking-wider text-purple-500 dark:text-purple-400 font-semibold">Data</span>
                    <div className="font-bold text-[13px] text-gray-800 dark:text-gray-100">
                      {(d.order as any)?.data_amount || '-'}
                    </div>
                    {extractUssdAmount(d.ussd_code) && (
                      <div className="text-[10px] font-mono text-gray-500 dark:text-gray-400">
                        {isSo ? 'La diray' : 'Sent'}: {extractUssdAmount(d.ussd_code)}
                      </div>
                    )}
                  </div>
                </div>

                <div className="border-t border-dashed border-gray-200 dark:border-gray-600" />

                {/* Timeline */}
                <div>
                  <span className="text-[9px] uppercase tracking-wider text-[#3D0066] dark:text-purple-400 font-bold">TIMELINE</span>
                  <div className="flex items-center justify-between mt-1.5 px-1">
                    {timeline.map((step, i) => (
                      <React.Fragment key={step.label}>
                        <div className="flex flex-col items-center">
                          <div className={`w-3 h-3 rounded-full ${step.done ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`} />
                          <span className="text-[8px] text-gray-500 dark:text-gray-400 mt-0.5 text-center leading-tight">{step.label}</span>
                          {step.time && (
                            <span className="text-[8px] text-gray-400 font-mono">{format(new Date(step.time), 'HH:mm')}</span>
                          )}
                        </div>
                        {i < timeline.length - 1 && (
                          <div className={`flex-1 h-0.5 mx-1 ${step.done ? 'bg-green-400' : 'bg-gray-200 dark:bg-gray-600'}`} />
                        )}
                      </React.Fragment>
                    ))}
                  </div>
                </div>

                <div className="border-t border-dashed border-gray-200 dark:border-gray-600" />

                {/* Details grid */}
                <div>
                  <span className="text-[9px] uppercase tracking-wider text-[#3D0066] dark:text-purple-400 font-bold">{isSo ? 'FAAHFAAHIN' : 'DETAILS'}</span>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 mt-1">
                    <div>
                      <span className="text-[9px] text-gray-400">USSD</span>
                      <div className="text-[10px] font-mono text-gray-600 dark:text-gray-300 break-all">{d.ussd_code}</div>
                    </div>
                    {d.android_device_id && (
                      <div>
                        <span className="text-[9px] text-gray-400">Device</span>
                        <div className="text-[10px] font-mono text-gray-600 dark:text-gray-300">{d.android_device_id.slice(0, 10)}...</div>
                      </div>
                    )}
                    {d.attempts != null && d.attempts > 0 && (
                      <div>
                        <span className="text-[9px] text-gray-400">Attempts</span>
                        <div className="text-[10px] font-medium text-gray-600 dark:text-gray-300">{d.attempts}</div>
                      </div>
                    )}
                    <div>
                      <span className="text-[9px] text-gray-400">{isSo ? 'Waqti' : 'Time'}</span>
                      <div className="text-[10px] text-gray-600 dark:text-gray-300">
                        {d.created_at ? format(new Date(d.created_at), 'MMM dd, HH:mm:ss') : '-'}
                      </div>
                    </div>
                    {d.order?.sender_phone && (
                      <div>
                        <span className="text-[9px] text-gray-400">{isSo ? 'Lacag Bixiye' : 'Payment From'}</span>
                        <div className="text-[10px] font-mono font-semibold text-gray-800 dark:text-gray-100">{formatPhone(d.order.sender_phone)}</div>
                      </div>
                    )}
                    {d.order?.customer_phone && (
                      <div>
                        <span className="text-[9px] text-gray-400">{isSo ? 'Macaamiil' : 'Customer'}</span>
                        <div className="text-[10px] font-mono text-gray-600 dark:text-gray-300">{formatPhone(d.order.customer_phone)}</div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Delivery notes / result */}
                {((d as any).provider_response || d.order?.delivery_notes) && (
                  <>
                    <div className="border-t border-dashed border-gray-200 dark:border-gray-600" />
                    <div className={`text-[10px] p-2 rounded-lg ${
                      d.order?.delivery_notes?.startsWith('Cancelled:')
                        ? 'bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300'
                        : 'bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300'
                    }`}>
                      <strong>{d.order?.delivery_notes?.startsWith('Cancelled:') ? (isSo ? 'Sababta:' : 'Reason:') : (isSo ? 'Natiijada:' : 'Result:')}</strong>{' '}
                      {(d as any).provider_response || d.order?.delivery_notes?.replace('Cancelled: ', '') || ''}
                    </div>
                  </>
                )}

                {/* Error */}
                {d.error_message && (
                  <div className="text-[10px] p-2 rounded-lg bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-300">
                    ⚠️ {d.error_message}
                  </div>
                )}

                {/* Duration */}
                {duration !== null && (
                  <div className="text-[10px] text-green-600 dark:text-green-400 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    Delivered in {duration}s
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex flex-wrap gap-2 pt-1">
                  {needsManualVerify(d) && (
                    <Button size="sm" variant="outline"
                      className="h-8 text-[11px] bg-yellow-50 border-yellow-300 text-yellow-700 hover:bg-yellow-100 gap-1"
                      onClick={() => handleManualVerify(d.order_id, d.id)}>
                      <CheckCheck className="w-3.5 h-3.5" />
                      {isSo ? 'Xaqiiji' : 'Verify'}
                    </Button>
                  )}
                  {d.order?.delivery_status === 'delivered' && (
                    <AlertDialog onOpenChange={(open) => { if (!open) setCancelReason(''); }}>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="outline"
                          className="h-8 text-[11px] bg-red-50 border-red-300 text-red-700 hover:bg-red-100 gap-1">
                          <Ban className="w-3.5 h-3.5" />
                          {isSo ? 'Dami' : 'Cancel'}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>{isSo ? 'Ma hubtaa?' : 'Cancel this order?'}</AlertDialogTitle>
                          <AlertDialogDescription>{isSo ? 'Qor sababta.' : 'Enter the reason.'}</AlertDialogDescription>
                        </AlertDialogHeader>
                        <Textarea placeholder={isSo ? 'Sababta...' : 'Reason...'} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} className="min-h-[60px]" />
                        <AlertDialogFooter>
                          <AlertDialogCancel>{isSo ? 'Maya' : 'No'}</AlertDialogCancel>
                          <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => handleCancelOrder(d.order_id, d.id, cancelReason)}>
                            {isSo ? 'Haa, Dami' : 'Yes, Cancel'}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                  {d.order?.delivery_status === 'cancelled' && (
                    <Button size="sm" variant="outline"
                      className="h-8 text-[11px] bg-green-50 border-green-300 text-green-700 hover:bg-green-100 gap-1"
                      onClick={() => handleRestoreOrder(d.order_id, d.id)}>
                      <RotateCcw className="w-3.5 h-3.5" />
                      {isSo ? 'Dib u Daar' : 'Restore'}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
