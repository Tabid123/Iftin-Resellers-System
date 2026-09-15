import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { DollarSign, TrendingUp, CheckCircle, XCircle, Clock, Search, MessageSquare, Package, Calendar, Building, Receipt, Phone } from 'lucide-react';
import { formatPrice } from '@/lib/utils';
import { useLanguage } from '@/contexts/LanguageContext';
import { format } from 'date-fns';

type PeriodFilter = 'today' | 'week' | 'month' | 'year' | 'all';
type StatusFilter = 'all' | 'delivered' | 'pending' | 'failed';
type ProviderFilter = 'all' | string;

interface SMSOfflineOrder {
  id: string;
  customer_phone: string;
  receiver_phone: string;
  package_name: string;
  data_amount: string;
  selling_price: number;
  status: string;
  delivery_status: string;
  created_at: string;
  delivered_at: string | null;
  provider_id: string;
  data_packages_config: {
    cost_price: number;
  };
  providers_config: {
    provider_name: string;
    evoucher_rate: number;
  };
  payment_receipts: {
    tx_id: string | null;
    sender_phone: string;
    matching_strategy: string | null;
    amount: number;
  }[];
}

export const SMSOfflineOrdersDashboard = () => {
  const { language } = useLanguage();
  const [orders, setOrders] = useState<SMSOfflineOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('today');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [providerFilter, setProviderFilter] = useState<ProviderFilter>('all');
  const [providers, setProviders] = useState<{id: string, provider_name: string}[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadSMSOfflineOrders();
    loadProviders();

    // Real-time subscription - single row fetch instead of full reload
    const channel = supabase
      .channel('sms-offline-orders-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'orders' },
        async (payload) => {
          const newId = payload.new?.id;
          if (!newId) return;
          const { data } = await supabase
            .from('orders')
            .select(`
              *,
              data_packages_config(cost_price),
              providers_config(provider_name, evoucher_rate),
              payment_receipts(tx_id, sender_phone, matching_strategy, amount)
            `)
            .eq('id', newId)
            .single();
          if (data && ((data as any).payment_source === 'sms_offline' || !(data as any).payment_source)) {
            setOrders(prev => [data as unknown as SMSOfflineOrder, ...prev]);
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders' },
        async (payload) => {
          const updatedId = payload.new?.id;
          if (!updatedId) return;
          const { data } = await supabase
            .from('orders')
            .select(`
              *,
              data_packages_config(cost_price),
              providers_config(provider_name, evoucher_rate),
              payment_receipts(tx_id, sender_phone, matching_strategy, amount)
            `)
            .eq('id', updatedId)
            .single();
          if (data && ((data as any).payment_source === 'sms_offline' || !(data as any).payment_source)) {
            setOrders(prev => prev.map(o => o.id === updatedId ? data as unknown as SMSOfflineOrder : o));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const loadProviders = async () => {
    const { data } = await supabase
      .from('providers_config')
      .select('id, provider_name')
      .eq('is_active', true)
      .order('display_order');
    setProviders(data || []);
  };

  const loadSMSOfflineOrders = async () => {
    try {
      // Fetch SMS Offline orders with their payment receipts
      const { fetchAllRows } = await import('@/utils/fetchAllRows');
      const data = await fetchAllRows(() =>
        supabase
          .from('orders')
          .select(`
            *,
            data_packages_config(cost_price),
            providers_config(provider_name, evoucher_rate),
            payment_receipts(tx_id, sender_phone, matching_strategy, amount)
          `)
          .or('payment_source.eq.sms_offline,payment_source.is.null')
          .order('created_at', { ascending: false })
      );
      setOrders(data || []);
    } catch (error) {
      console.error('Error loading SMS offline orders:', error);
    } finally {
      setLoading(false);
    }
  };

  // Filter by period
  const periodFilteredOrders = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
    const yearAgo = new Date(today.getTime() - 365 * 24 * 60 * 60 * 1000);

    return orders.filter(order => {
      const orderDate = new Date(order.created_at);
      switch (periodFilter) {
        case 'today': return orderDate >= today;
        case 'week': return orderDate >= weekAgo;
        case 'month': return orderDate >= monthAgo;
        case 'year': return orderDate >= yearAgo;
        default: return true;
      }
    });
  }, [orders, periodFilter]);

  // Filter by status
  const statusFilteredOrders = useMemo(() => {
    if (statusFilter === 'all') return periodFilteredOrders;
    return periodFilteredOrders.filter(order => order.delivery_status === statusFilter);
  }, [periodFilteredOrders, statusFilter]);

  // Filter by provider
  const providerFilteredOrders = useMemo(() => {
    if (providerFilter === 'all') return statusFilteredOrders;
    return statusFilteredOrders.filter(order => order.provider_id === providerFilter);
  }, [statusFilteredOrders, providerFilter]);

  // Filter by search
  const filteredOrders = useMemo(() => {
    if (!searchQuery) return providerFilteredOrders;
    const query = searchQuery.toLowerCase();
    return providerFilteredOrders.filter(order =>
      order.customer_phone.includes(query) ||
      order.receiver_phone.includes(query) ||
      order.package_name.toLowerCase().includes(query) ||
      order.payment_receipts?.some(r => r.tx_id?.toLowerCase().includes(query) || r.sender_phone.includes(query))
    );
  }, [providerFilteredOrders, searchQuery]);

  // Calculate statistics
  const stats = useMemo(() => {
    const delivered = filteredOrders.filter(o => o.delivery_status === 'delivered');
    const pending = filteredOrders.filter(o => 
      o.delivery_status === 'pending' || 
      o.delivery_status === 'queued' || 
      o.delivery_status === 'processing'
    );
    const failed = filteredOrders.filter(o => o.delivery_status === 'failed');

    const totalRevenue = delivered.reduce((sum, o) => sum + Number(o.selling_price), 0);
    const totalProfit = delivered.reduce((sum, o) => {
      const pkg = o.data_packages_config as any;
      const provider = o.providers_config as any;
      const sellingPrice = Number(o.selling_price);
      const costPrice = Number(pkg?.cost_price || 0);
      const evoucherRate = Number(provider?.evoucher_rate || 0);
      const evoucherReceived = sellingPrice * (1 + evoucherRate);
      return sum + (evoucherReceived - costPrice);
    }, 0);

    return {
      totalOrders: filteredOrders.length,
      deliveredOrders: delivered.length,
      pendingOrders: pending.length,
      failedOrders: failed.length,
      totalRevenue,
      totalProfit,
      successRate: filteredOrders.length > 0 
        ? ((delivered.length / filteredOrders.length) * 100).toFixed(1)
        : '0'
    };
  }, [filteredOrders]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'delivered':
        return <Badge className="bg-green-500/10 text-green-600 border-green-500/20">✅ Delivered</Badge>;
      case 'failed':
        return <Badge className="bg-red-500/10 text-red-600 border-red-500/20">❌ Failed</Badge>;
      case 'pending':
      case 'queued':
      case 'processing':
        return <Badge className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20">⏳ Pending</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getMatchingStrategyBadge = (strategy: string | null) => {
    if (!strategy) return null;
    switch (strategy) {
      case 'offline_auto':
        return <Badge variant="outline" className="text-xs bg-blue-500/10 text-blue-600">Auto</Badge>;
      case 'manual':
        return <Badge variant="outline" className="text-xs bg-purple-500/10 text-purple-600">Manual</Badge>;
      default:
        return <Badge variant="outline" className="text-xs">{strategy}</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-20" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-24" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <MessageSquare className="h-6 w-6 text-primary" />
          {language === 'so' ? 'SMS Offline Dalabyo' : 'SMS Offline Orders'}
        </h2>
        <p className="text-muted-foreground">
          {language === 'so' 
            ? 'Dalabyadii SMS-ka lagu bixiyay oo keliya - La xidhiidhiyay Payment Receipts'
            : 'Orders paid via SMS only - Matched with Payment Receipts'}
        </p>
      </div>

      {/* Top Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        {/* Period Filter */}
        <Select value={periodFilter} onValueChange={(v) => setPeriodFilter(v as PeriodFilter)}>
          <SelectTrigger className="w-[150px]">
            <Calendar className="h-4 w-4 mr-2" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="today">📅 {language === 'so' ? 'Maanta' : 'Today'}</SelectItem>
            <SelectItem value="week">📆 {language === 'so' ? 'Toddobaadkan' : 'This Week'}</SelectItem>
            <SelectItem value="month">🗓️ {language === 'so' ? 'Bishan' : 'This Month'}</SelectItem>
            <SelectItem value="year">📊 {language === 'so' ? 'Sanadkan' : 'This Year'}</SelectItem>
            <SelectItem value="all">🌐 {language === 'so' ? 'Dhammaan' : 'All Time'}</SelectItem>
          </SelectContent>
        </Select>

        {/* Provider Filter */}
        <Select value={providerFilter} onValueChange={setProviderFilter}>
          <SelectTrigger className="w-[170px]">
            <Building className="h-4 w-4 mr-2" />
            <SelectValue placeholder={language === 'so' ? 'Shirkad' : 'Provider'} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">🏢 {language === 'so' ? 'Dhammaan Shirkadaha' : 'All Providers'}</SelectItem>
            {providers.map(provider => (
              <SelectItem key={provider.id} value={provider.id}>
                {provider.provider_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Status Filter */}
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{language === 'so' ? 'Dhammaan' : 'All Status'}</SelectItem>
            <SelectItem value="delivered">✅ {language === 'so' ? 'La Diray' : 'Delivered'}</SelectItem>
            <SelectItem value="pending">⏳ {language === 'so' ? 'Sugaya' : 'Pending'}</SelectItem>
            <SelectItem value="failed">❌ {language === 'so' ? 'Fashilmay' : 'Failed'}</SelectItem>
          </SelectContent>
        </Select>

        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={language === 'so' ? 'Raadi telefoon, TX ID...' : 'Search phone, TX ID...'}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Package className="h-4 w-4" />
              {language === 'so' ? 'Wadarta SMS Dalabyo' : 'Total SMS Orders'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalOrders}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              {language === 'so' ? 'Dakhliga' : 'Revenue'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{formatPrice(stats.totalRevenue)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              {language === 'so' ? 'Faa\'iido' : 'Profit'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{formatPrice(stats.totalProfit)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <CheckCircle className="h-4 w-4" />
              {language === 'so' ? 'Guul %' : 'Success Rate'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.successRate}%</div>
          </CardContent>
        </Card>
      </div>

      {/* Status Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="border-green-500/20 bg-green-500/5">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{language === 'so' ? 'La Diray' : 'Delivered'}</p>
                <p className="text-2xl font-bold text-green-600">{stats.deliveredOrders}</p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-yellow-500/20 bg-yellow-500/5">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{language === 'so' ? 'Sugaya' : 'Pending'}</p>
                <p className="text-2xl font-bold text-yellow-600">{stats.pendingOrders}</p>
              </div>
              <Clock className="h-8 w-8 text-yellow-500" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-red-500/20 bg-red-500/5">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{language === 'so' ? 'Fashilmay' : 'Failed'}</p>
                <p className="text-2xl font-bold text-red-600">{stats.failedOrders}</p>
              </div>
              <XCircle className="h-8 w-8 text-red-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Orders Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5" />
            {language === 'so' ? 'SMS Dalabyo & Receipts' : 'SMS Orders & Receipts'}
          </CardTitle>
          <CardDescription>
            {filteredOrders.length} {language === 'so' ? 'natiijo' : 'results'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <>
            {/* Mobile Card View */}
            <div className="md:hidden space-y-2">
              {filteredOrders.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  {language === 'so' ? 'SMS dalabyo la helin' : 'No SMS orders found'}
                </div>
              ) : (
                filteredOrders.slice(0, 50).map((order) => {
                  const receipt = order.payment_receipts?.[0];
                  return (
                    <div key={order.id} className="border rounded-lg p-3 bg-card text-xs space-y-1.5">
                      <div className="flex justify-between items-center">
                        <span className="font-mono">{order.customer_phone}</span>
                        <span className="text-muted-foreground">{format(new Date(order.created_at), 'HH:mm dd/MM')}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="font-medium text-xs">{order.package_name}</p>
                          <p className="text-[10px] text-muted-foreground">{order.data_amount}</p>
                        </div>
                        <span className="font-semibold">{formatPrice(order.selling_price)}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="font-mono text-muted-foreground">→ {order.receiver_phone}</span>
                        {getStatusBadge(order.delivery_status)}
                      </div>
                      {receipt && (
                        <div className="text-[10px] text-muted-foreground pt-1 border-t">
                          SMS: {receipt.sender_phone} {receipt.tx_id && `• ${receipt.tx_id.slice(0, 15)}...`}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{language === 'so' ? 'Macmiil' : 'Customer'}</TableHead>
                    <TableHead>{language === 'so' ? 'Helahe' : 'Receiver'}</TableHead>
                    <TableHead>{language === 'so' ? 'Package' : 'Package'}</TableHead>
                    <TableHead>{language === 'so' ? 'Qiimo' : 'Amount'}</TableHead>
                    <TableHead>{language === 'so' ? '🧾 TX ID' : '🧾 TX ID'}</TableHead>
                    <TableHead>{language === 'so' ? '📞 SMS Sender' : '📞 SMS Sender'}</TableHead>
                    <TableHead>{language === 'so' ? 'Xaalad' : 'Status'}</TableHead>
                    <TableHead>{language === 'so' ? 'Taariikh' : 'Date'}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredOrders.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                        {language === 'so' ? 'SMS dalabyo la helin' : 'No SMS orders found'}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredOrders.slice(0, 50).map((order) => {
                      const receipt = order.payment_receipts?.[0];
                      return (
                        <TableRow key={order.id}>
                          <TableCell className="font-mono text-sm">{order.customer_phone}</TableCell>
                          <TableCell className="font-mono text-sm">{order.receiver_phone}</TableCell>
                          <TableCell>
                            <div>
                              <p className="font-medium">{order.package_name}</p>
                              <p className="text-xs text-muted-foreground">{order.data_amount}</p>
                            </div>
                          </TableCell>
                          <TableCell className="font-semibold">{formatPrice(order.selling_price)}</TableCell>
                          <TableCell>
                            {receipt?.tx_id ? (
                              <code className="text-xs bg-muted px-2 py-1 rounded break-all max-w-[150px] block">
                                {receipt.tx_id.length > 20 ? `${receipt.tx_id.slice(0, 20)}...` : receipt.tx_id}
                              </code>
                            ) : <span className="text-muted-foreground text-xs">—</span>}
                          </TableCell>
                          <TableCell>
                            {receipt ? (
                              <div className="flex flex-col gap-1">
                                <span className="font-mono text-sm">{receipt.sender_phone}</span>
                                {getMatchingStrategyBadge(receipt.matching_strategy)}
                              </div>
                            ) : <span className="text-muted-foreground text-xs">—</span>}
                          </TableCell>
                          <TableCell>{getStatusBadge(order.delivery_status)}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{format(new Date(order.created_at), 'MMM d, HH:mm')}</TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </>
          {filteredOrders.length > 50 && (
            <p className="text-sm text-muted-foreground text-center mt-4">
              {language === 'so' 
                ? `Muujinaya 50 ka mid ah ${filteredOrders.length}`
                : `Showing 50 of ${filteredOrders.length}`}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default SMSOfflineOrdersDashboard;
