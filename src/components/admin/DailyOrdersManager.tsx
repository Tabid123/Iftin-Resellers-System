import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format, startOfDay, endOfDay } from 'date-fns';
import { cn, formatPrice } from '@/lib/utils';
import { useLanguage } from '@/contexts/LanguageContext';
import { toast } from 'sonner';
import {
  CalendarIcon, Search, CheckCircle, XCircle, Clock, RotateCcw,
  Loader2, ChevronLeft, ChevronRight, Package, DollarSign, AlertTriangle,
  Eye, Pencil, RefreshCw, Send, Ban
} from 'lucide-react';

interface Order {
  id: string;
  customer_phone: string;
  receiver_phone: string;
  package_name: string;
  data_amount: string;
  selling_price: number;
  status: string;
  delivery_status: string | null;
  delivery_notes: string | null;
  created_at: string;
  delivered_at: string | null;
  sender_phone: string | null;
  payment_number: string;
  payment_source: string | null;
  is_manual: boolean | null;
  provider_id: string;
  package_id: string;
}

type StatusFilter = 'all' | 'pending' | 'delivered' | 'failed' | 'cancelled';

export const DailyOrdersManager = () => {
  const { language } = useLanguage();
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelOrderId, setCancelOrderId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [detailsOrder, setDetailsOrder] = useState<Order | null>(null);
  const [editNotesOrder, setEditNotesOrder] = useState<Order | null>(null);
  const [editNotesText, setEditNotesText] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  // Resend dialog state
  const [resendOrder, setResendOrder] = useState<Order | null>(null);
  const [resendPhone, setResendPhone] = useState('');
  // Active retries
  const [activeRetries, setActiveRetries] = useState<any[]>([]);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    try {
      const dayStart = startOfDay(selectedDate).toISOString();
      const dayEnd = endOfDay(selectedDate).toISOString();

      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .gte('created_at', dayStart)
        .lte('created_at', dayEnd)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setOrders((data || []) as unknown as Order[]);
    } catch (err) {
      console.error('Error loading orders:', err);
      toast.error('Failed to load orders');
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  // Load active retries (delivery_queue pending/scheduled)
  const loadActiveRetries = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('delivery_queue')
        .select('*')
        .in('status', ['pending', 'scheduled'])
        .order('created_at', { ascending: false })
        .limit(50);
      setActiveRetries(data || []);
    } catch (err) {
      console.error('Error loading active retries:', err);
    }
  }, []);

  useEffect(() => {
    loadActiveRetries();
    const interval = setInterval(loadActiveRetries, 15000);
    return () => clearInterval(interval);
  }, [loadActiveRetries]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('daily-orders-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, (payload) => {
        const dayStart = startOfDay(selectedDate);
        const dayEnd = endOfDay(selectedDate);

        if (payload.eventType === 'INSERT') {
          const newOrder = payload.new as Order;
          const createdAt = new Date(newOrder.created_at);
          if (createdAt >= dayStart && createdAt <= dayEnd) {
            setOrders(prev => [newOrder, ...prev]);
          }
        } else if (payload.eventType === 'UPDATE') {
          const updated = payload.new as Order;
          setOrders(prev => prev.map(o => o.id === updated.id ? updated : o));
        } else if (payload.eventType === 'DELETE') {
          const old = payload.old as { id: string };
          setOrders(prev => prev.filter(o => o.id !== old.id));
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [selectedDate]);

  const filteredOrders = orders.filter(o => {
    const ds = o.delivery_status || o.status;
    const matchesStatus = statusFilter === 'all' ||
      (statusFilter === 'pending' && ['pending', 'queued', 'processing'].includes(ds)) ||
      (statusFilter === 'delivered' && ds === 'delivered') ||
      (statusFilter === 'failed' && ds === 'failed') ||
      (statusFilter === 'cancelled' && ['cancelled', 'canceled'].includes(ds));

    const q = searchQuery.toLowerCase();
    const matchesSearch = !q ||
      o.customer_phone?.toLowerCase().includes(q) ||
      o.receiver_phone?.toLowerCase().includes(q) ||
      o.package_name?.toLowerCase().includes(q) ||
      o.sender_phone?.toLowerCase().includes(q);

    return matchesStatus && matchesSearch;
  });

  // Summary stats (excluding cancelled)
  const activeOrders = orders.filter(o => !['cancelled', 'canceled'].includes(o.delivery_status || o.status));
  const delivered = activeOrders.filter(o => (o.delivery_status || o.status) === 'delivered');
  const pending = activeOrders.filter(o => ['pending', 'queued', 'processing'].includes(o.delivery_status || o.status));
  const failed = activeOrders.filter(o => (o.delivery_status || o.status) === 'failed');
  const cancelled = orders.filter(o => ['cancelled', 'canceled'].includes(o.delivery_status || o.status));
  const revenue = delivered.reduce((sum, o) => sum + Number(o.selling_price), 0);

  const navigateDay = (dir: number) => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() + dir);
    setSelectedDate(newDate);
  };

  const handleMarkDelivered = async (orderId: string) => {
    setActionLoading(orderId);
    try {
      const { error } = await supabase
        .from('orders')
        .update({ delivery_status: 'delivered', status: 'completed', delivered_at: new Date().toISOString() })
        .eq('id', orderId);
      if (error) throw error;
      toast.success(language === 'so' ? 'Dalabka waa la diray' : 'Order marked as delivered');
    } catch (err) {
      toast.error('Failed to update order');
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancelOrder = async () => {
    if (!cancelOrderId) return;
    setActionLoading(cancelOrderId);
    try {
      const { error } = await supabase
        .from('orders')
        .update({ delivery_status: 'cancelled', status: 'canceled', delivery_notes: cancelReason || null })
        .eq('id', cancelOrderId);
      if (error) throw error;
      toast.success(language === 'so' ? 'Dalabka waa la kansalay' : 'Order cancelled');
      setCancelDialogOpen(false);
      setCancelReason('');
      setCancelOrderId(null);
    } catch (err) {
      toast.error('Failed to cancel order');
    } finally {
      setActionLoading(null);
    }
  };

  const handleRestoreOrder = async (orderId: string) => {
    setActionLoading(orderId);
    try {
      const { error } = await supabase
        .from('orders')
        .update({ delivery_status: 'delivered', status: 'completed', delivery_notes: null })
        .eq('id', orderId);
      if (error) throw error;
      toast.success(language === 'so' ? 'Dalabka dib ayaa loo soo celiyay' : 'Order restored');
    } catch (err) {
      toast.error('Failed to restore order');
    } finally {
      setActionLoading(null);
    }
  };

  const handleRetryDelivery = async (order: Order) => {
    // Open resend dialog instead of direct retry
    setResendOrder(order);
    setResendPhone(order.receiver_phone);
  };

  const handleResendOrder = async () => {
    if (!resendOrder) return;
    setActionLoading(resendOrder.id);
    try {
      // Update order with new receiver_phone and reset status
      await supabase
        .from('orders')
        .update({ 
          delivery_status: 'pending', 
          status: 'paid', 
          delivered_at: null,
          receiver_phone: resendPhone || resendOrder.receiver_phone 
        })
        .eq('id', resendOrder.id);

      // Invoke activate-package to rebuild USSD and queue delivery
      const { error } = await supabase.functions.invoke('activate-package', {
        body: {
          orderId: resendOrder.id,
          providerName: resendOrder.provider_id,
          receiverPhone: resendPhone || resendOrder.receiver_phone,
        }
      });
      if (error) throw error;
      toast.success(language === 'so' ? 'Dalabka dib ayaa loo dirayaa' : 'Order resent');
      setResendOrder(null);
      loadActiveRetries();
    } catch (err) {
      toast.error('Failed to resend');
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancelRetry = async (queueId: string) => {
    setActionLoading(queueId);
    try {
      const { data: queueItem } = await supabase
        .from('delivery_queue')
        .select('order_id')
        .eq('id', queueId)
        .single();

      await supabase
        .from('delivery_queue')
        .update({ status: 'failed', error_message: 'Cancelled by admin' })
        .eq('id', queueId);

      if (queueItem?.order_id) {
        await supabase
          .from('orders')
          .update({ delivery_status: 'failed', delivery_notes: 'Retry cancelled by admin' })
          .eq('id', queueItem.order_id);
      }

      toast.success(language === 'so' ? 'Retry waa la joojiyay' : 'Retry cancelled');
      loadActiveRetries();
    } catch (err) {
      toast.error('Failed to cancel retry');
    } finally {
      setActionLoading(null);
    }
  };

  const handleSaveNotes = async () => {
    if (!editNotesOrder) return;
    setActionLoading(editNotesOrder.id);
    try {
      const { error } = await supabase
        .from('orders')
        .update({ delivery_notes: editNotesText })
        .eq('id', editNotesOrder.id);
      if (error) throw error;
      toast.success('Notes saved');
      setEditNotesOrder(null);
    } catch (err) {
      toast.error('Failed to save notes');
    } finally {
      setActionLoading(null);
    }
  };

  const getStatusBadge = (order: Order) => {
    const ds = order.delivery_status || order.status;
    switch (ds) {
      case 'delivered': return <Badge className="bg-green-500/10 text-green-600 border-green-500/20">✅ Delivered</Badge>;
      case 'pending': case 'queued': case 'processing': return <Badge className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20">⏳ Pending</Badge>;
      case 'failed': return <Badge className="bg-red-500/10 text-red-600 border-red-500/20">❌ Failed</Badge>;
      case 'cancelled': case 'canceled': return <Badge className="bg-muted text-muted-foreground">🚫 Cancelled</Badge>;
      default: return <Badge variant="outline">{ds}</Badge>;
    }
  };

  const formatPhone = (phone: string) => {
    if (!phone) return '';
    const clean = phone.replace(/^(\+?252)/, '');
    return `+252-${clean}`;
  };

  const statusButtons: { value: StatusFilter; label: string; labelSo: string; count: number }[] = [
    { value: 'all', label: 'All', labelSo: 'Dhammaan', count: activeOrders.length },
    { value: 'pending', label: 'Pending', labelSo: 'Sugaya', count: pending.length },
    { value: 'delivered', label: 'Delivered', labelSo: 'La diray', count: delivered.length },
    { value: 'failed', label: 'Failed', labelSo: 'Guuldaraystay', count: failed.length },
    { value: 'cancelled', label: 'Cancelled', labelSo: 'La kansalay', count: cancelled.length },
  ];

  return (
    <div className="space-y-4">
      {/* Date Navigation */}
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="outline" size="icon" onClick={() => navigateDay(-1)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="min-w-[200px] justify-start">
              <CalendarIcon className="mr-2 h-4 w-4" />
              {format(selectedDate, 'PPP')}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={(d) => d && setSelectedDate(d)}
              initialFocus
              className="p-3 pointer-events-auto"
            />
          </PopoverContent>
        </Popover>
        <Button variant="outline" size="icon" onClick={() => navigateDay(1)}>
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setSelectedDate(new Date())}>
          {language === 'so' ? 'Maanta' : 'Today'}
        </Button>
        <Button variant="ghost" size="icon" onClick={loadOrders}>
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card>
          <CardContent className="p-3 text-center">
            <Package className="h-5 w-5 mx-auto text-primary mb-1" />
            <div className="text-2xl font-bold">{activeOrders.length}</div>
            <div className="text-xs text-muted-foreground">{language === 'so' ? 'Wadarta' : 'Total'}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <CheckCircle className="h-5 w-5 mx-auto text-green-500 mb-1" />
            <div className="text-2xl font-bold text-green-600">{delivered.length}</div>
            <div className="text-xs text-muted-foreground">{language === 'so' ? 'La diray' : 'Delivered'}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <Clock className="h-5 w-5 mx-auto text-yellow-500 mb-1" />
            <div className="text-2xl font-bold text-yellow-600">{pending.length}</div>
            <div className="text-xs text-muted-foreground">{language === 'so' ? 'Sugaya' : 'Pending'}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <XCircle className="h-5 w-5 mx-auto text-red-500 mb-1" />
            <div className="text-2xl font-bold text-red-600">{failed.length}</div>
            <div className="text-xs text-muted-foreground">{language === 'so' ? 'Guuldaraystay' : 'Failed'}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <DollarSign className="h-5 w-5 mx-auto text-primary mb-1" />
            <div className="text-2xl font-bold">{formatPrice(revenue)}</div>
            <div className="text-xs text-muted-foreground">{language === 'so' ? 'Dakhli' : 'Revenue'}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        {statusButtons.map(sb => (
          <Button
            key={sb.value}
            variant={statusFilter === sb.value ? 'default' : 'outline'}
            size="sm"
            onClick={() => setStatusFilter(sb.value)}
          >
            {language === 'so' ? sb.labelSo : sb.label} ({sb.count})
          </Button>
        ))}
        <div className="relative ml-auto">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={language === 'so' ? 'Raadi...' : 'Search...'}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 w-[200px]"
          />
        </div>
      </div>

      {/* Orders List */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : filteredOrders.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {language === 'so' ? 'Dalabyo la helin maalintaan' : 'No orders found for this day'}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filteredOrders.map((order, idx) => {
            const ds = order.delivery_status || order.status;
            const isCancelled = ['cancelled', 'canceled'].includes(ds);
            const isPending = ['pending', 'queued', 'processing'].includes(ds);
            const isFailed = ds === 'failed';
            const isDelivered = ds === 'delivered';

            return (
              <Card key={order.id} className={cn(isCancelled && 'opacity-60')}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-muted-foreground">#{idx + 1}</span>
                        {getStatusBadge(order)}
                        {order.is_manual && <Badge variant="outline" className="text-xs">Manual</Badge>}
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(order.created_at), 'HH:mm')}
                        </span>
                      </div>
                      <div className="font-semibold">{order.package_name}</div>
                      <div className="text-sm text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
                        <span>📱 {formatPhone(order.receiver_phone)}</span>
                        <span>💰 {formatPrice(Number(order.selling_price))}</span>
                        {order.sender_phone && <span>📤 {formatPhone(order.sender_phone)}</span>}
                      </div>
                      {order.delivery_notes && (
                        <div className="text-xs text-muted-foreground italic">📝 {order.delivery_notes}</div>
                      )}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDetailsOrder(order)} title="Details">
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditNotesOrder(order); setEditNotesText(order.delivery_notes || ''); }} title="Edit Notes">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      {isPending && (
                        <Button
                          variant="ghost" size="icon" className="h-8 w-8 text-green-600"
                          onClick={() => handleMarkDelivered(order.id)}
                          disabled={actionLoading === order.id}
                          title="Mark Delivered"
                        >
                          {actionLoading === order.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                        </Button>
                      )}
                      {(isPending || isFailed) && (
                        <Button
                          variant="ghost" size="icon" className="h-8 w-8 text-red-600"
                          onClick={() => { setCancelOrderId(order.id); setCancelDialogOpen(true); }}
                          title="Cancel"
                        >
                          <XCircle className="h-4 w-4" />
                        </Button>
                      )}
                      {(isFailed || ds === 'processing') && (
                        <Button
                          variant="ghost" size="icon" className="h-8 w-8 text-blue-600"
                          onClick={() => handleRetryDelivery(order)}
                          disabled={actionLoading === order.id}
                          title={language === 'so' ? 'Dib u Dir' : 'Resend'}
                        >
                          {actionLoading === order.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                        </Button>
                      )}
                      {isCancelled && (
                        <Button
                          variant="ghost" size="icon" className="h-8 w-8 text-primary"
                          onClick={() => handleRestoreOrder(order.id)}
                          disabled={actionLoading === order.id}
                          title="Restore"
                        >
                          {actionLoading === order.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Cancel Dialog */}
      <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{language === 'so' ? 'Dalabka Kansal' : 'Cancel Order'}</DialogTitle>
          </DialogHeader>
          <Textarea
            placeholder={language === 'so' ? 'Sababta kansalka...' : 'Reason for cancellation...'}
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelDialogOpen(false)}>
              {language === 'so' ? 'Dib u noqo' : 'Cancel'}
            </Button>
            <Button variant="destructive" onClick={handleCancelOrder} disabled={!!actionLoading}>
              {actionLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {language === 'so' ? 'Xaqiiji Kansalka' : 'Confirm Cancel'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Details Dialog */}
      <Dialog open={!!detailsOrder} onOpenChange={() => setDetailsOrder(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{language === 'so' ? 'Faahfaahin Dalabka' : 'Order Details'}</DialogTitle>
          </DialogHeader>
          {detailsOrder && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div className="text-muted-foreground">{language === 'so' ? 'Xirmada' : 'Package'}</div>
                <div className="font-medium">{detailsOrder.package_name}</div>
                <div className="text-muted-foreground">{language === 'so' ? 'Qiimaha' : 'Price'}</div>
                <div className="font-medium">{formatPrice(Number(detailsOrder.selling_price))}</div>
                <div className="text-muted-foreground">{language === 'so' ? 'Macmiilka' : 'Customer'}</div>
                <div className="font-medium">{formatPhone(detailsOrder.customer_phone)}</div>
                <div className="text-muted-foreground">{language === 'so' ? 'Helaha' : 'Receiver'}</div>
                <div className="font-medium">{formatPhone(detailsOrder.receiver_phone)}</div>
                {detailsOrder.sender_phone && (
                  <>
                    <div className="text-muted-foreground">{language === 'so' ? 'Diraha' : 'Sender'}</div>
                    <div className="font-medium">{formatPhone(detailsOrder.sender_phone)}</div>
                  </>
                )}
                <div className="text-muted-foreground">Status</div>
                <div>{getStatusBadge(detailsOrder)}</div>
                <div className="text-muted-foreground">{language === 'so' ? 'Waqtiga' : 'Time'}</div>
                <div className="font-medium">{format(new Date(detailsOrder.created_at), 'PPP HH:mm')}</div>
                {detailsOrder.delivered_at && (
                  <>
                    <div className="text-muted-foreground">{language === 'so' ? 'La diray' : 'Delivered at'}</div>
                    <div className="font-medium">{format(new Date(detailsOrder.delivered_at), 'PPP HH:mm')}</div>
                  </>
                )}
                <div className="text-muted-foreground">{language === 'so' ? 'Lacag Bixinta' : 'Payment'}</div>
                <div className="font-medium">{detailsOrder.payment_source || 'N/A'}</div>
                {detailsOrder.is_manual && (
                  <>
                    <div className="text-muted-foreground">Type</div>
                    <div><Badge variant="outline">Manual</Badge></div>
                  </>
                )}
              </div>
              {detailsOrder.delivery_notes && (
                <div className="pt-2 border-t">
                  <div className="text-muted-foreground text-xs mb-1">{language === 'so' ? 'Qoraalo' : 'Notes'}</div>
                  <div className="text-sm">{detailsOrder.delivery_notes}</div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Notes Dialog */}
      <Dialog open={!!editNotesOrder} onOpenChange={() => setEditNotesOrder(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{language === 'so' ? 'Qoraalka Beddel' : 'Edit Notes'}</DialogTitle>
          </DialogHeader>
          <Textarea
            value={editNotesText}
            onChange={(e) => setEditNotesText(e.target.value)}
            placeholder={language === 'so' ? 'Qoraal ku dar...' : 'Add notes...'}
            rows={4}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditNotesOrder(null)}>
              {language === 'so' ? 'Dib u noqo' : 'Cancel'}
            </Button>
            <Button onClick={handleSaveNotes} disabled={!!actionLoading}>
              {actionLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {language === 'so' ? 'Kaydi' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Resend Dialog */}
      <Dialog open={!!resendOrder} onOpenChange={() => setResendOrder(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{language === 'so' ? 'Dib u Dir Dalabka' : 'Resend Order'}</DialogTitle>
          </DialogHeader>
          {resendOrder && (
            <div className="space-y-3">
              <div className="text-sm text-muted-foreground">
                {resendOrder.package_name} — {formatPrice(Number(resendOrder.selling_price))}
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">
                  {language === 'so' ? 'Lambarka Helaha' : 'Receiver Phone'}
                </label>
                <Input
                  value={resendPhone}
                  onChange={(e) => setResendPhone(e.target.value)}
                  type="tel"
                  inputMode="numeric"
                  placeholder="e.g. 61XXXXXXX"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setResendOrder(null)}>
              {language === 'so' ? 'Dib u noqo' : 'Cancel'}
            </Button>
            <Button onClick={handleResendOrder} disabled={!!actionLoading || !resendPhone}>
              {actionLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
              {language === 'so' ? 'Dib u Dir' : 'Resend'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Active Retries Section */}
      {activeRetries.length > 0 && (
        <Card className="border-yellow-500/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <RotateCcw className="h-4 w-4 text-yellow-500" />
              {language === 'so' ? 'Retries-ka Socda' : 'Active Retries'} ({activeRetries.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {activeRetries.map(q => (
              <div key={q.id} className="flex items-center justify-between gap-2 p-2 bg-yellow-50 dark:bg-yellow-900/10 rounded-lg text-sm">
                <div className="flex-1 min-w-0">
                  <div className="font-medium">{formatPhone(q.receiver_phone)}</div>
                  <div className="text-xs text-muted-foreground flex gap-2 flex-wrap">
                    <span>{q.provider_name}</span>
                    <span>Attempts: {q.attempts || 0}</span>
                    {q.last_attempt_at && <span>{format(new Date(q.last_attempt_at), 'HH:mm')}</span>}
                    <Badge variant="outline" className="text-[10px]">{q.status}</Badge>
                  </div>
                  {q.error_message && <div className="text-xs text-red-500 truncate">{q.error_message}</div>}
                </div>
                <Button
                  variant="ghost" size="icon" className="h-7 w-7 text-red-500 flex-shrink-0"
                  onClick={() => handleCancelRetry(q.id)}
                  disabled={actionLoading === q.id}
                  title={language === 'so' ? 'Jooji' : 'Cancel Retry'}
                >
                  {actionLoading === q.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Ban className="h-3.5 w-3.5" />}
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
};
