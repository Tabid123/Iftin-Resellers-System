import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useLanguage } from '@/contexts/LanguageContext';
import { toast } from '@/hooks/use-toast';
import { Loader2, Search, RefreshCw, Download, MessageSquare, CheckCircle, Clock, XCircle, TrendingUp, Truck, Wallet, Ban } from 'lucide-react';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';
import { PaymentAnalyticsCharts } from './PaymentAnalyticsCharts';
import { DeliveryTracker } from './DeliveryTracker';
import { EVoucherTransactions } from './EVoucherTransactions';
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
  // Joined from orders
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

export function PaymentSmsLog() {
  const { language } = useLanguage();
  const [activeTab, setActiveTab] = useState('sms-log');
  const [receipts, setReceipts] = useState<PaymentReceipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<string>('today');
  const [providerFilter, setProviderFilter] = useState<string>('all');
  const [selectedReceipt, setSelectedReceipt] = useState<PaymentReceipt | null>(null);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [providers, setProviders] = useState<{ id: string; provider_name: string }[]>([]);

  // Load providers for filter
  useEffect(() => {
    const loadProviders = async () => {
      const { data } = await supabase
        .from('providers_config')
        .select('id, provider_name')
        .eq('is_active', true);
      if (data) setProviders(data);
    };
    loadProviders();
  }, []);

  // Load payment receipts
  const loadReceipts = async () => {
    setLoading(true);
    try {
      // Calculate date range
      let dateFrom: Date | null = null;
      let dateTo: Date | null = null;
      const now = new Date();

      switch (dateFilter) {
        case 'today':
          dateFrom = startOfDay(now);
          dateTo = endOfDay(now);
          break;
        case 'yesterday':
          dateFrom = startOfDay(subDays(now, 1));
          dateTo = endOfDay(subDays(now, 1));
          break;
        case '7days':
          dateFrom = startOfDay(subDays(now, 7));
          dateTo = endOfDay(now);
          break;
        case '30days':
          dateFrom = startOfDay(subDays(now, 30));
          dateTo = endOfDay(now);
          break;
        case 'all':
          dateFrom = null;
          dateTo = null;
          break;
        default:
          dateFrom = startOfDay(now);
          dateTo = endOfDay(now);
      }

      // Build query
      let query = supabase
        .from('payment_receipts')
        .select(`
          *,
          order:matched_order_id (
            id,
            package_name,
            data_amount,
            customer_phone,
            receiver_phone,
            provider_id,
            delivery_status,
            delivery_notes,
            selling_price
          )
        `)
        .order('created_at', { ascending: false });

      // Apply date filter
      if (dateFrom) {
        query = query.gte('created_at', dateFrom.toISOString());
      }
      if (dateTo) {
        query = query.lte('created_at', dateTo.toISOString());
      }

      // Apply status filter
      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      const { data, error } = await query.limit(200);

      if (error) throw error;

      // Now fetch provider info for matched orders
      if (data) {
        const receiptsWithProviders = await Promise.all(
          data.map(async (receipt: any) => {
            if (receipt.order?.provider_id) {
              const { data: providerData } = await supabase
                .from('providers_config')
                .select('provider_name, provider_logo')
                .eq('id', receipt.order.provider_id)
                .single();
              
              if (providerData) {
                receipt.order.provider = providerData;
              }
            }
            return receipt as PaymentReceipt;
          })
        );

        // Filter by provider if selected
        let filteredReceipts = receiptsWithProviders;
        if (providerFilter !== 'all') {
          filteredReceipts = receiptsWithProviders.filter(
            r => r.order?.provider?.provider_name === providerFilter
          );
        }

        // Filter by search query
        if (searchQuery) {
          filteredReceipts = filteredReceipts.filter(r => 
            r.sender_phone.includes(searchQuery) ||
            r.order?.customer_phone?.includes(searchQuery) ||
            r.order?.receiver_phone?.includes(searchQuery)
          );
        }

        setReceipts(filteredReceipts);
      }
    } catch (error: any) {
      toast({
        title: language === 'so' ? 'Khalad' : 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // Initial load and when filters change
  useEffect(() => {
    loadReceipts();
  }, [statusFilter, dateFilter, providerFilter]);

  // Search with debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      loadReceipts();
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Real-time subscription - single row fetch, no full reload
  useEffect(() => {
    const channel = supabase
      .channel('payment-receipts-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'payment_receipts'
        },
        async (payload) => {
          const newId = payload.new?.id;
          if (!newId) return;
          const { data } = await supabase
            .from('payment_receipts')
            .select(`
              *,
              order:matched_order_id (
                id,
                package_name,
                data_amount,
                customer_phone,
                receiver_phone,
                provider_id,
                delivery_status,
                delivery_notes,
                selling_price
              )
            `)
            .eq('id', newId)
            .single();
          if (data) {
            const receipt = data as any;
            // Fetch provider info if matched
            if (receipt.order?.provider_id) {
              const { data: providerData } = await supabase
                .from('providers_config')
                .select('provider_name, provider_logo')
                .eq('id', receipt.order.provider_id)
                .single();
              if (providerData) receipt.order.provider = providerData;
            }
            // Apply current filters before adding
            const passesStatus = statusFilter === 'all' || receipt.status === statusFilter;
            const passesProvider = providerFilter === 'all' || receipt.order?.provider?.provider_name === providerFilter;
            const passesSearch = !searchQuery || 
              receipt.sender_phone?.includes(searchQuery) ||
              receipt.order?.customer_phone?.includes(searchQuery) ||
              receipt.order?.receiver_phone?.includes(searchQuery);
            if (passesStatus && passesProvider && passesSearch) {
              setReceipts(prev => [receipt as PaymentReceipt, ...prev]);
            }
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'payment_receipts'
        },
        async (payload) => {
          const updatedId = payload.new?.id;
          if (!updatedId) return;
          const { data } = await supabase
            .from('payment_receipts')
            .select(`
              *,
              order:matched_order_id (
                id,
                package_name,
                data_amount,
                customer_phone,
                receiver_phone,
                provider_id,
                delivery_status,
                delivery_notes,
                selling_price
              )
            `)
            .eq('id', updatedId)
            .single();
          if (data) {
            const receipt = data as any;
            if (receipt.order?.provider_id) {
              const { data: providerData } = await supabase
                .from('providers_config')
                .select('provider_name, provider_logo')
                .eq('id', receipt.order.provider_id)
                .single();
              if (providerData) receipt.order.provider = providerData;
            }
            setReceipts(prev => prev.map(r => r.id === updatedId ? (receipt as PaymentReceipt) : r));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [statusFilter, dateFilter, providerFilter, searchQuery]);

  // Export to CSV
  const exportToCSV = () => {
    const headers = ['Waqti', 'Soo Diray', 'Lacag', 'Shirkad', 'Xirmo', 'Data', 'Status', 'SMS Body'];
    const rows = receipts.map(r => [
      r.created_at ? format(new Date(r.created_at), 'yyyy-MM-dd HH:mm:ss') : '',
      r.sender_phone,
      r.amount.toString(),
      r.order?.provider?.provider_name || '-',
      r.order?.package_name || '-',
      r.order?.data_amount || '-',
      r.status || 'pending',
      r.sms_body?.replace(/"/g, '""') || ''
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `payment-sms-log-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    link.click();
  };

  const getStatusBadge = (status: string | null) => {
    switch (status) {
      case 'matched':
        return <Badge className="bg-green-500"><CheckCircle className="w-3 h-3 mr-1" /> Matched</Badge>;
      case 'pending':
        return <Badge variant="secondary"><Clock className="w-3 h-3 mr-1" /> Pending</Badge>;
      case 'unmatched':
        return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" /> Unmatched</Badge>;
      case 'blocked':
        return <Badge variant="destructive" className="bg-red-700"><Ban className="w-3 h-3 mr-1" /> Blocked</Badge>;
      default:
        return <Badge variant="outline"><Clock className="w-3 h-3 mr-1" /> {status || 'pending'}</Badge>;
    }
  };

  const handleRowClick = (receipt: PaymentReceipt) => {
    setSelectedReceipt(receipt);
    setShowDetailDialog(true);
  };

  return (
    <div className="space-y-4">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="sms-log" className="gap-2">
            <MessageSquare className="h-4 w-4" />
            <span className="hidden sm:inline">{language === 'so' ? 'SMS Log' : 'SMS Log'}</span>
          </TabsTrigger>
          <TabsTrigger value="evoucher" className="gap-2">
            <Wallet className="h-4 w-4" />
            <span className="hidden sm:inline">E-Voucher</span>
          </TabsTrigger>
          <TabsTrigger value="analytics" className="gap-2">
            <TrendingUp className="h-4 w-4" />
            <span className="hidden sm:inline">{language === 'so' ? 'Falanqayn' : 'Analytics'}</span>
          </TabsTrigger>
          <TabsTrigger value="deliveries" className="gap-2">
            <Truck className="h-4 w-4" />
            <span className="hidden sm:inline">{language === 'so' ? 'Deliveries' : 'Deliveries'}</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="sms-log" className="mt-4">
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <MessageSquare className="h-5 w-5" />
                    {language === 'so' ? 'Lacagaha Soo Galay (EVC Plus)' : 'Incoming Payments (EVC Plus)'}
                  </CardTitle>
                  <CardDescription>
                    {language === 'so' ? 'Dhammaan SMS-yada lacagaha EVC Plus' : 'All EVC Plus payment SMS messages'}
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={loadReceipts} disabled={loading}>
                    <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                    {language === 'so' ? 'Cusboonaysii' : 'Refresh'}
                  </Button>
                  <Button variant="outline" size="sm" onClick={exportToCSV} disabled={receipts.length === 0}>
                    <Download className="h-4 w-4 mr-2" />
                    CSV
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
        {/* Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={language === 'so' ? 'Raadi phone...' : 'Search phone...'}
              className="pl-10"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          
          <Select value={dateFilter} onValueChange={setDateFilter}>
            <SelectTrigger>
              <SelectValue placeholder={language === 'so' ? 'Taariikhda' : 'Date'} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{language === 'so' ? 'Dhamaan' : 'All'}</SelectItem>
              <SelectItem value="today">{language === 'so' ? 'Maanta' : 'Today'}</SelectItem>
              <SelectItem value="yesterday">{language === 'so' ? 'Shalay' : 'Yesterday'}</SelectItem>
              <SelectItem value="7days">{language === 'so' ? '7 Maalmood' : '7 Days'}</SelectItem>
              <SelectItem value="30days">{language === 'so' ? '30 Maalmood' : '30 Days'}</SelectItem>
            </SelectContent>
          </Select>

          <Select value={providerFilter} onValueChange={setProviderFilter}>
            <SelectTrigger>
              <SelectValue placeholder={language === 'so' ? 'Shirkad' : 'Provider'} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{language === 'so' ? 'Dhammaan' : 'All Providers'}</SelectItem>
              {providers.map(p => (
                <SelectItem key={p.id} value={p.provider_name}>{p.provider_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{language === 'so' ? 'Dhammaan' : 'All Status'}</SelectItem>
              <SelectItem value="matched">✅ Matched</SelectItem>
              <SelectItem value="pending">⏳ Pending</SelectItem>
              <SelectItem value="unmatched">❌ Unmatched</SelectItem>
              <SelectItem value="blocked">🚫 Blocked</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Stats Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div className="bg-muted/50 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold">{receipts.length}</p>
            <p className="text-xs text-muted-foreground">{language === 'so' ? 'Wadarta' : 'Total'}</p>
          </div>
          <div className="bg-green-500/10 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-green-600">{receipts.filter(r => r.status === 'matched').length}</p>
            <p className="text-xs text-muted-foreground">Matched</p>
          </div>
          <div className="bg-yellow-500/10 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-yellow-600">{receipts.filter(r => r.status === 'pending').length}</p>
            <p className="text-xs text-muted-foreground">Pending</p>
          </div>
          <div className="bg-red-500/10 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-red-600">{receipts.filter(r => r.status === 'unmatched').length}</p>
            <p className="text-xs text-muted-foreground">Unmatched</p>
          </div>
          <div className="bg-red-900/10 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-red-800">{receipts.filter(r => r.status === 'blocked').length}</p>
            <p className="text-xs text-muted-foreground">Blocked</p>
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : receipts.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>{language === 'so' ? 'SMS ma jiro' : 'No SMS messages found'}</p>
          </div>
        ) : (
          <>
            {/* Mobile Card View */}
            <div className="md:hidden space-y-2">
              {receipts.map((receipt) => (
                <div 
                  key={receipt.id} 
                  className="border rounded-lg p-3 bg-card text-xs space-y-1.5 cursor-pointer active:bg-muted/50"
                  onClick={() => handleRowClick(receipt)}
                >
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">
                      {receipt.created_at ? format(new Date(receipt.created_at), 'HH:mm dd/MM') : '-'}
                    </span>
                    {getStatusBadge(receipt.status)}
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="font-mono">{receipt.sender_phone}</span>
                    <span className="font-semibold">${receipt.amount.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="truncate max-w-[60%]">{receipt.order?.package_name || '-'}</span>
                    <span>{receipt.order?.provider?.provider_name || '-'}</span>
                  </div>
                </div>
              ))}
            </div>
            {/* Desktop Table */}
            <div className="hidden md:block rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap">{language === 'so' ? 'Waqti' : 'Time'}</TableHead>
                    <TableHead className="whitespace-nowrap">{language === 'so' ? 'Soo Diray' : 'From'}</TableHead>
                    <TableHead className="whitespace-nowrap">{language === 'so' ? 'Lacag' : 'Amount'}</TableHead>
                    <TableHead className="whitespace-nowrap">{language === 'so' ? 'Shirkad' : 'Provider'}</TableHead>
                    <TableHead className="whitespace-nowrap">{language === 'so' ? 'Xirmo' : 'Package'}</TableHead>
                    <TableHead className="whitespace-nowrap">Data</TableHead>
                    <TableHead className="whitespace-nowrap">SMS Body</TableHead>
                    <TableHead className="whitespace-nowrap">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {receipts.map((receipt) => (
                    <TableRow key={receipt.id} className="cursor-pointer hover:bg-muted/50" onClick={() => handleRowClick(receipt)}>
                      <TableCell className="whitespace-nowrap text-sm">
                        {receipt.created_at ? format(new Date(receipt.created_at), 'HH:mm') : '-'}
                        <span className="block text-xs text-muted-foreground">{receipt.created_at ? format(new Date(receipt.created_at), 'dd/MM') : ''}</span>
                      </TableCell>
                      <TableCell className="font-mono text-sm">{receipt.sender_phone}</TableCell>
                      <TableCell className="font-semibold">${receipt.amount.toFixed(2)}</TableCell>
                      <TableCell>
                        {receipt.order?.provider ? (
                          <div className="flex items-center gap-2">
                            <CachedImage src={receipt.order.provider.provider_logo} alt={receipt.order.provider.provider_name} bundledName={receipt.order.provider.provider_name} className="h-4 w-4 object-contain" />
                            <span className="text-sm">{receipt.order.provider.provider_name}</span>
                          </div>
                        ) : <span className="text-muted-foreground">-</span>}
                      </TableCell>
                      <TableCell className="max-w-[120px] truncate text-sm">{receipt.order?.package_name || '-'}</TableCell>
                      <TableCell className="text-sm">{receipt.order?.data_amount || '-'}</TableCell>
                      <TableCell className="max-w-[150px]">
                        {receipt.sms_body ? <span className="text-xs text-muted-foreground truncate block" title={receipt.sms_body}>{receipt.sms_body.slice(0, 40)}...</span> : <span className="text-muted-foreground">-</span>}
                      </TableCell>
                      <TableCell>{getStatusBadge(receipt.status)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
              </CardContent>

              {/* Detail Dialog */}
              <Dialog open={showDetailDialog} onOpenChange={setShowDetailDialog}>
                <DialogContent className="max-w-lg">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <MessageSquare className="h-5 w-5" />
                      {language === 'so' ? 'Faahfaahinta SMS' : 'SMS Details'}
                    </DialogTitle>
                  </DialogHeader>
                  
                  {selectedReceipt && (
                    <div className="space-y-4">
                      {/* Basic Info */}
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <p className="text-muted-foreground text-xs">{language === 'so' ? 'Soo Diray' : 'From'}</p>
                          <p className="font-semibold font-mono">{selectedReceipt.sender_phone}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground text-xs">{language === 'so' ? 'Lacag' : 'Amount'}</p>
                          <p className="font-semibold text-lg">${selectedReceipt.amount.toFixed(2)}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground text-xs">{language === 'so' ? 'Waqti' : 'Time'}</p>
                          <p className="font-medium">
                            {selectedReceipt.created_at 
                              ? format(new Date(selectedReceipt.created_at), 'MMM dd, yyyy HH:mm:ss')
                              : '-'}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground text-xs">Status</p>
                          {getStatusBadge(selectedReceipt.status)}
                        </div>
                      </div>

                      {/* Blocked Details */}
                      {selectedReceipt.status === 'blocked' && selectedReceipt.admin_notes && (
                        <div className="border-t pt-4">
                          <p className="text-muted-foreground text-xs mb-2">
                            {language === 'so' ? '🚫 Block Details' : '🚫 Block Details'}
                          </p>
                          <div className="bg-red-900/10 border border-red-500/20 rounded-lg p-3 text-sm">
                            <p className="font-medium text-red-700">
                              {language === 'so' ? 'Macaamiilkan waa la block-gareeya' : 'This user is blocked'}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">{selectedReceipt.admin_notes}</p>
                          </div>
                        </div>
                      )}

                      {/* Unmatched Reason */}
                      {selectedReceipt.status === 'unmatched' && selectedReceipt.admin_notes && (
                        <div className="border-t pt-4">
                          <p className="text-muted-foreground text-xs mb-2">
                            {language === 'so' ? '⚠️ Sababta Unmatched' : '⚠️ Unmatched Reason'}
                          </p>
                          <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 text-sm">
                            <p className="font-medium text-destructive">
                            {selectedReceipt.admin_notes.includes('No offline registration')
                                ? (language === 'so' ? 'Lambarkaan system-ka kuma jiro' : 'No registration found')
                                : selectedReceipt.admin_notes.includes('No package found')
                                ? (language === 'so' ? 'Ma jiro xirmo qiimahaan la iibiyo' : 'No package found for this amount')
                                : (language === 'so' ? 'Dalab la mid ah lama helin' : 'No matching order found')}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">{selectedReceipt.admin_notes}</p>
                          </div>
                        </div>
                      )}

                      {/* SMS Body */}
                      <div className="border-t pt-4">
                        <p className="text-muted-foreground text-xs mb-2">{language === 'so' ? 'SMS Body' : 'SMS Body'}</p>
                        <div className="bg-muted rounded-lg p-3 text-sm font-mono whitespace-pre-wrap break-all">
                          {selectedReceipt.sms_body || 'N/A'}
                        </div>
                      </div>

                      {/* Order Details (if matched) */}
                      {selectedReceipt.order && (
                        <div className="border-t pt-4 space-y-3">
                          <p className="text-muted-foreground text-xs uppercase font-semibold">
                            {language === 'so' ? 'Faahfaahinta Order-ka' : 'Order Details'}
                          </p>
                          
                          <div className="grid grid-cols-2 gap-3 text-sm">
                            <div>
                              <p className="text-muted-foreground text-xs">{language === 'so' ? 'Shirkad' : 'Provider'}</p>
                              <div className="flex items-center gap-2">
                                {selectedReceipt.order.provider?.provider_logo && (
                                  <img 
                                    src={selectedReceipt.order.provider.provider_logo} 
                                    alt="" 
                                    className="h-5 w-5 object-contain"
                                  />
                                )}
                                <span className="font-medium">{selectedReceipt.order.provider?.provider_name || '-'}</span>
                              </div>
                            </div>
                            <div>
                              <p className="text-muted-foreground text-xs">{language === 'so' ? 'Xirmo' : 'Package'}</p>
                              <p className="font-medium">{selectedReceipt.order.package_name}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground text-xs">Data</p>
                              <p className="font-medium">{selectedReceipt.order.data_amount}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground text-xs">{language === 'so' ? 'Qiimaha' : 'Price'}</p>
                              <p className="font-medium">${selectedReceipt.order.selling_price.toFixed(2)}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground text-xs">{language === 'so' ? 'Customer' : 'Customer'}</p>
                              <p className="font-mono">{selectedReceipt.order.customer_phone}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground text-xs">{language === 'so' ? 'Receiver' : 'Receiver'}</p>
                              <p className="font-mono">{selectedReceipt.order.receiver_phone}</p>
                            </div>
                            <div className="col-span-2">
                              <p className="text-muted-foreground text-xs">{language === 'so' ? 'Delivery Status' : 'Delivery Status'}</p>
                              <Badge variant={selectedReceipt.order.delivery_status === 'delivered' ? 'default' : 'secondary'}>
                                {selectedReceipt.order.delivery_status || 'pending'}
                              </Badge>
                            </div>
                            {selectedReceipt.order.delivery_notes && (
                              <div className="col-span-2 mt-2">
                                <p className="text-muted-foreground text-xs">{language === 'so' ? 'Natiijada Delivery' : 'Delivery Result'}</p>
                                <div className="bg-muted rounded p-2 text-sm font-mono whitespace-pre-wrap break-all mt-1">
                                  {selectedReceipt.order.delivery_notes}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* TX ID if available */}
                      {selectedReceipt.tx_id && (
                        <div className="border-t pt-4">
                          <p className="text-muted-foreground text-xs">TX ID</p>
                          <p className="font-mono text-sm">{selectedReceipt.tx_id}</p>
                        </div>
                      )}
                    </div>
                  )}
                </DialogContent>
              </Dialog>
            </Card>
          </TabsContent>

          <TabsContent value="evoucher" className="mt-4">
            <EVoucherTransactions />
          </TabsContent>

          <TabsContent value="analytics" className="mt-4">
            <PaymentAnalyticsCharts />
          </TabsContent>

          <TabsContent value="deliveries" className="mt-4">
            <DeliveryTracker />
          </TabsContent>
        </Tabs>
      </div>
  );
}
