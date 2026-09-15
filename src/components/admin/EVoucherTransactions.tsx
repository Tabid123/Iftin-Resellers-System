import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useLanguage } from '@/contexts/LanguageContext';
import { Loader2, RefreshCw, ArrowDownCircle, ArrowUpCircle, Wallet } from 'lucide-react';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';

interface IncomeTransaction {
  id: string;
  sender_phone: string;
  amount: number;
  receiver_sim: string;
  sms_body: string | null;
  status: string | null;
  created_at: string | null;
}

interface OutgoingTransaction {
  id: string;
  receiver_phone: string;
  ussd_code: string;
  provider_name: string;
  package_code: string | null;
  sim_slot: number | null;
  completed_at: string | null;
  cost_price: number;
  order_id: string;
}

interface SimBalance {
  device_id: string;
  sim_slot: number;
  balance: number;
  balance_type: string;
  device_name: string;
  provider_name: string;
}

export function EVoucherTransactions() {
  const { language } = useLanguage();
  const [subTab, setSubTab] = useState('income');
  const [dateFilter, setDateFilter] = useState('today');
  const [simFilter, setSimFilter] = useState('all'); // 'all', 'hormuud', 'somnet', etc.
  const [loading, setLoading] = useState(true);
  const [availableSims, setAvailableSims] = useState<string[]>([]);
  
  const [incomeTransactions, setIncomeTransactions] = useState<IncomeTransaction[]>([]);
  const [outgoingTransactions, setOutgoingTransactions] = useState<OutgoingTransaction[]>([]);
  const [simBalances, setSimBalances] = useState<SimBalance[]>([]);

  // Calculate date range
  const getDateRange = () => {
    const now = new Date();
    switch (dateFilter) {
      case 'today':
        return { from: startOfDay(now), to: endOfDay(now) };
      case 'yesterday':
        return { from: startOfDay(subDays(now, 1)), to: endOfDay(subDays(now, 1)) };
      case '7days':
        return { from: startOfDay(subDays(now, 7)), to: endOfDay(now) };
      case '30days':
        return { from: startOfDay(subDays(now, 30)), to: endOfDay(now) };
      default:
        return { from: null, to: null };
    }
  };

  // Load income transactions (E-Voucher/JEEB SMS from payment_receipts)
  const loadIncomeTransactions = async () => {
    try {
      const { from, to } = getDateRange();
      
      // Query for E-Voucher and JEEB SMS (both are e-voucher payments)
      let query = supabase
        .from('payment_receipts')
        .select('id, sender_phone, amount, receiver_sim, sms_body, status, created_at')
        .order('created_at', { ascending: false });

      if (from) query = query.gte('created_at', from.toISOString());
      if (to) query = query.lte('created_at', to.toISOString());

      const { data, error } = await query.limit(200);
      
      if (error) throw error;
      
      // Filter for E-Voucher or JEEB SMS (both are e-voucher type payments)
      let filtered = (data || []).filter(t => 
        t.sms_body?.includes('-E-Voucher-') || 
        t.sms_body?.includes('-JEEB-') ||
        t.sms_body?.toLowerCase().includes('haragaaga') // Somnet e-voucher format
      );
      
      if (simFilter !== 'all') {
        // Filter by receiver_sim (e.g., 'hormuud', 'somnet')
        filtered = filtered.filter(t => 
          t.receiver_sim?.toLowerCase() === simFilter.toLowerCase()
        );
      }
      
      setIncomeTransactions(filtered as unknown as IncomeTransaction[]);
    } catch (error) {
      console.error('Error loading income transactions:', error);
    }
  };

  // Load outgoing transactions (completed deliveries)
  const loadOutgoingTransactions = async () => {
    try {
      const { from, to } = getDateRange();
      
      let query = supabase
        .from('delivery_queue')
        .select(`
          id,
          receiver_phone,
          ussd_code,
          provider_name,
          package_code,
          sim_slot,
          completed_at,
          order_id
        `)
        .eq('status', 'completed')
        .order('completed_at', { ascending: false });

      if (from) query = query.gte('completed_at', from.toISOString());
      if (to) query = query.lte('completed_at', to.toISOString());

      const { data: deliveries, error } = await query.limit(200);
      
      if (error) throw error;
      
      // Get cost prices from orders
      const orderIds = deliveries?.map(d => d.order_id).filter(Boolean) || [];
      const { data: orders } = await supabase
        .from('orders')
        .select('id, selling_price, package_id')
        .in('id', orderIds);

      // Get package cost prices
      const packageIds = orders?.map(o => o.package_id).filter(Boolean) || [];
      const { data: packages } = await supabase
        .from('data_packages_config')
        .select('id, cost_price')
        .in('id', packageIds as string[]);

      const packageCostMap = new Map(packages?.map(p => [p.id, p.cost_price]) || []);
      const orderCostMap = new Map(
        orders?.map(o => [o.id, packageCostMap.get(o.package_id as string) || o.selling_price]) || []
      );

      let outgoing = deliveries?.map(d => ({
        ...d,
        cost_price: orderCostMap.get(d.order_id) || 0
      })) || [];

      if (simFilter !== 'all') {
        // Filter by provider_name (e.g., 'Hormuud', 'Somnet')
        outgoing = outgoing.filter(t => 
          t.provider_name?.toLowerCase() === simFilter.toLowerCase()
        );
      }

      setOutgoingTransactions(outgoing);
    } catch (error) {
      console.error('Error loading outgoing transactions:', error);
    }
  };

  // Load current SIM balances and available SIMs
  const loadSimBalances = async () => {
    try {
      const { data: devices } = await supabase
        .from('android_devices')
        .select('id, device_name, sim1_provider, sim2_provider')
        .eq('is_active', true)
        .is('archived_at', null);

      const { data: balances } = await supabase
        .from('sim_balances')
        .select('device_id, sim_slot, balance, balance_type');

      const result: SimBalance[] = [];
      const simProviders: string[] = [];
      
      devices?.forEach(device => {
        // SIM 1 balance - use evoucher for all providers (data credit)
        const sim1Provider = device.sim1_provider || 'Unknown';
        if (!simProviders.includes(sim1Provider.toLowerCase())) {
          simProviders.push(sim1Provider.toLowerCase());
        }
        
        // Get all balances for SIM 1
        const sim1Balances = balances?.filter(
          b => b.device_id === device.id && (!b.sim_slot || b.sim_slot === 1)
        ) || [];
        
        // For E-Voucher Transactions: use evoucher balance, or evc_plus as fallback (Amtel uses evc_plus)
        const sim1Balance = sim1Balances.find(b => b.balance_type === 'evoucher') 
          || sim1Balances.find(b => b.balance_type === 'evc_plus');
        
        if (sim1Balance) {
          result.push({
              device_id: device.id,
            sim_slot: 1,
            balance: Number(sim1Balance.balance),
            balance_type: sim1Balance.balance_type,
            device_name: device.device_name,
            provider_name: sim1Provider
          });
        }

        // SIM 2 balance - use evoucher for all providers (data credit)
        if (device.sim2_provider) {
          const sim2Provider = device.sim2_provider;
          if (!simProviders.includes(sim2Provider.toLowerCase())) {
            simProviders.push(sim2Provider.toLowerCase());
          }
          
          // Get all balances for SIM 2
          const sim2Balances = balances?.filter(
            b => b.device_id === device.id && b.sim_slot === 2
          ) || [];
          
          // For E-Voucher Transactions: use evoucher balance, or evc_plus as fallback (Amtel uses evc_plus)
          const sim2Balance = sim2Balances.find(b => b.balance_type === 'evoucher')
            || sim2Balances.find(b => b.balance_type === 'evc_plus');
          
          if (sim2Balance) {
            result.push({
              device_id: device.id,
              sim_slot: 2,
              balance: Number(sim2Balance.balance),
              balance_type: sim2Balance.balance_type,
              device_name: device.device_name,
              provider_name: sim2Provider
            });
          }
        }
      });

      setSimBalances(result);
      setAvailableSims(simProviders);
    } catch (error) {
      console.error('Error loading sim balances:', error);
    }
  };

  // Load all data
  const loadData = async () => {
    setLoading(true);
    await Promise.all([
      loadIncomeTransactions(),
      loadOutgoingTransactions(),
      loadSimBalances()
    ]);
    setLoading(false);
  };

  useEffect(() => {
    loadData();

    // Real-time subscriptions - single row updates
    const receiptsChannel = supabase
      .channel('evoucher-receipts-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'payment_receipts' },
        async (payload) => {
          const newId = payload.new?.id;
          if (!newId) return;
          const { data } = await supabase
            .from('payment_receipts')
            .select('id, sender_phone, amount, receiver_sim, sms_body, status, created_at')
            .eq('id', newId)
            .single();
          if (data) {
            const isEvoucher = data.sms_body?.includes('-E-Voucher-') || 
              data.sms_body?.includes('-JEEB-') ||
              data.sms_body?.toLowerCase().includes('haragaaga');
            if (isEvoucher) {
              const passesSimFilter = simFilter === 'all' || 
                data.receiver_sim?.toLowerCase() === simFilter.toLowerCase();
              if (passesSimFilter) {
                setIncomeTransactions(prev => [data as IncomeTransaction, ...prev]);
              }
            }
          }
        }
      )
      .subscribe();

    const deliveryChannel = supabase
      .channel('evoucher-delivery-realtime')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'delivery_queue' },
        async (payload) => {
          if (payload.new?.status !== 'completed') return;
          const updatedId = payload.new?.id;
          if (!updatedId) return;
          const { data: delivery } = await supabase
            .from('delivery_queue')
            .select('id, receiver_phone, ussd_code, provider_name, package_code, sim_slot, completed_at, order_id')
            .eq('id', updatedId)
            .single();
          if (delivery && delivery.order_id) {
            const { data: order } = await supabase
              .from('orders')
              .select('id, selling_price, package_id')
              .eq('id', delivery.order_id)
              .single();
            let costPrice = order?.selling_price || 0;
            if (order?.package_id) {
              const { data: pkg } = await supabase
                .from('data_packages_config')
                .select('cost_price')
                .eq('id', order.package_id)
                .single();
              if (pkg) costPrice = pkg.cost_price;
            }
            const outgoing = { ...delivery, cost_price: costPrice } as OutgoingTransaction;
            const passesSimFilter = simFilter === 'all' || 
              delivery.provider_name?.toLowerCase() === simFilter.toLowerCase();
            if (passesSimFilter) {
              setOutgoingTransactions(prev => [outgoing, ...prev]);
            }
          }
        }
      )
      .subscribe();

    const balanceChannel = supabase
      .channel('evoucher-balances-realtime')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'sim_balances' },
        () => {
          // Balance updates are lightweight - just reload balances
          loadSimBalances();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(receiptsChannel);
      supabase.removeChannel(deliveryChannel);
      supabase.removeChannel(balanceChannel);
    };
  }, [dateFilter, simFilter]);

  // Filter balances based on SIM filter (by provider name)
  const filteredBalances = simFilter === 'all' 
    ? simBalances 
    : simBalances.filter(b => b.provider_name.toLowerCase() === simFilter.toLowerCase());

  // Calculate totals
  const totalIncome = incomeTransactions.reduce((sum, t) => sum + t.amount, 0);
  const totalOutgoing = outgoingTransactions.reduce((sum, t) => sum + t.cost_price, 0);
  const currentBalance = filteredBalances.reduce((sum, b) => sum + b.balance, 0);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5" />
              {language === 'so' ? 'E-Voucher Transactions' : 'E-Voucher Transactions'}
            </CardTitle>
            <CardDescription>
              {language === 'so' ? 'Lacagaha soo galaya iyo kuwa ka baxaya' : 'Incoming and outgoing E-Voucher funds'}
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={loadData} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              {language === 'so' ? 'Cusboonaysii' : 'Refresh'}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <Select value={dateFilter} onValueChange={setDateFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{language === 'so' ? 'Dhamaan' : 'All Time'}</SelectItem>
              <SelectItem value="today">{language === 'so' ? 'Maanta' : 'Today'}</SelectItem>
              <SelectItem value="yesterday">{language === 'so' ? 'Shalay' : 'Yesterday'}</SelectItem>
              <SelectItem value="7days">{language === 'so' ? '7 Maalmood' : '7 Days'}</SelectItem>
              <SelectItem value="30days">{language === 'so' ? '30 Maalmood' : '30 Days'}</SelectItem>
            </SelectContent>
          </Select>

          <Select value={simFilter} onValueChange={setSimFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{language === 'so' ? 'Dhammaan SIM' : 'All SIMs'}</SelectItem>
              {availableSims.map(sim => (
                <SelectItem key={sim} value={sim} className="capitalize">
                  {sim.charAt(0).toUpperCase() + sim.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4 text-center">
            <ArrowDownCircle className="h-6 w-6 mx-auto mb-2 text-green-600" />
            <p className="text-2xl font-bold text-green-600">${totalIncome.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground">{language === 'so' ? 'Soo Galay' : 'Income'}</p>
            <p className="text-xs text-muted-foreground mt-1">{incomeTransactions.length} SMS</p>
          </div>
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 text-center">
            <ArrowUpCircle className="h-6 w-6 mx-auto mb-2 text-red-600" />
            <p className="text-2xl font-bold text-red-600">${totalOutgoing.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground">{language === 'so' ? 'Ka Baxay' : 'Outgoing'}</p>
            <p className="text-xs text-muted-foreground mt-1">{outgoingTransactions.length} Deliveries</p>
          </div>
          <div className="bg-primary/10 border border-primary/20 rounded-lg p-4 text-center">
            <Wallet className="h-6 w-6 mx-auto mb-2 text-primary" />
            <p className="text-2xl font-bold text-primary">${currentBalance.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground">{language === 'so' ? 'Balance Hadda' : 'Current Balance'}</p>
            <p className="text-xs text-muted-foreground mt-1 capitalize">
              {simFilter === 'all' ? `${filteredBalances.length} SIMs` : simFilter}
            </p>
          </div>
        </div>

        {/* Sub-tabs for Income/Outgoing */}
        <Tabs value={subTab} onValueChange={setSubTab}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="income" className="gap-2">
              <ArrowDownCircle className="h-4 w-4 text-green-600" />
              {language === 'so' ? 'Soo Galayo' : 'Income'}
            </TabsTrigger>
            <TabsTrigger value="outgoing" className="gap-2">
              <ArrowUpCircle className="h-4 w-4 text-red-600" />
              {language === 'so' ? 'Ka Baxayo' : 'Outgoing'}
            </TabsTrigger>
          </TabsList>

          {/* Income Tab */}
          <TabsContent value="income" className="mt-4">
            {loading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : incomeTransactions.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <ArrowDownCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>{language === 'so' ? 'E-Voucher SMS ma jiro' : 'No E-Voucher income found'}</p>
              </div>
            ) : (
              <>
                {/* Mobile Card View */}
                <div className="md:hidden space-y-2">
                  {incomeTransactions.map((tx) => (
                    <div key={tx.id} className="border rounded-lg p-3 bg-card text-xs space-y-1">
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">{tx.created_at ? format(new Date(tx.created_at), 'HH:mm dd/MM') : '-'}</span>
                        <Badge variant={tx.status === 'matched' ? 'default' : 'secondary'} className="text-[10px]">{tx.status || 'saved'}</Badge>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="font-mono">{tx.sender_phone}</span>
                        <span className="font-semibold text-green-600">${tx.amount.toFixed(2)}</span>
                      </div>
                      <div className="text-muted-foreground">{tx.receiver_sim || '-'}</div>
                    </div>
                  ))}
                </div>
                {/* Desktop Table */}
                <div className="hidden md:block rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{language === 'so' ? 'Waqti' : 'Time'}</TableHead>
                        <TableHead>{language === 'so' ? 'Soo Diray' : 'From'}</TableHead>
                        <TableHead>{language === 'so' ? 'Lacag' : 'Amount'}</TableHead>
                        <TableHead>SIM</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {incomeTransactions.map((tx) => (
                        <TableRow key={tx.id}>
                          <TableCell className="whitespace-nowrap text-sm">
                            {tx.created_at ? format(new Date(tx.created_at), 'HH:mm') : '-'}
                            <span className="block text-xs text-muted-foreground">{tx.created_at ? format(new Date(tx.created_at), 'dd/MM') : ''}</span>
                          </TableCell>
                          <TableCell className="font-mono text-sm">{tx.sender_phone}</TableCell>
                          <TableCell className="font-semibold text-green-600">${tx.amount.toFixed(2)}</TableCell>
                          <TableCell className="text-sm">{tx.receiver_sim || '-'}</TableCell>
                          <TableCell><Badge variant={tx.status === 'matched' ? 'default' : 'secondary'}>{tx.status || 'saved'}</Badge></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </TabsContent>

          {/* Outgoing Tab */}
          <TabsContent value="outgoing" className="mt-4">
            {loading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : outgoingTransactions.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <ArrowUpCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>{language === 'so' ? 'Delivery ma jiro' : 'No outgoing deliveries found'}</p>
              </div>
            ) : (
              <>
                {/* Mobile Card View */}
                <div className="md:hidden space-y-2">
                  {outgoingTransactions.map((tx) => (
                    <div key={tx.id} className="border rounded-lg p-3 bg-card text-xs space-y-1">
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">{tx.completed_at ? format(new Date(tx.completed_at), 'HH:mm dd/MM') : '-'}</span>
                        <Badge variant="outline" className="text-[10px]">SIM {tx.sim_slot || 1}</Badge>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="font-mono">{tx.receiver_phone}</span>
                        <span className="font-semibold text-red-600">${tx.cost_price.toFixed(2)}</span>
                      </div>
                      <div className="text-muted-foreground">{tx.provider_name}</div>
                    </div>
                  ))}
                </div>
                {/* Desktop Table */}
                <div className="hidden md:block rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{language === 'so' ? 'Waqti' : 'Time'}</TableHead>
                        <TableHead>Receiver</TableHead>
                        <TableHead>{language === 'so' ? 'Lacag' : 'Cost'}</TableHead>
                        <TableHead>Provider</TableHead>
                        <TableHead>SIM</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {outgoingTransactions.map((tx) => (
                        <TableRow key={tx.id}>
                          <TableCell className="whitespace-nowrap text-sm">
                            {tx.completed_at ? format(new Date(tx.completed_at), 'HH:mm') : '-'}
                            <span className="block text-xs text-muted-foreground">{tx.completed_at ? format(new Date(tx.completed_at), 'dd/MM') : ''}</span>
                          </TableCell>
                          <TableCell className="font-mono text-sm">{tx.receiver_phone}</TableCell>
                          <TableCell className="font-semibold text-red-600">${tx.cost_price.toFixed(2)}</TableCell>
                          <TableCell className="text-sm">{tx.provider_name}</TableCell>
                          <TableCell><Badge variant="outline">SIM {tx.sim_slot || 1}</Badge></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
