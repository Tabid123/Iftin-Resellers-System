import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DollarSign, TrendingUp, Package, Smartphone, Calendar, CheckCircle, XCircle, Clock, Wallet, Percent, Save, SlidersHorizontal, CalendarIcon } from 'lucide-react';
import { formatPrice, cn } from '@/lib/utils';
import { useLanguage } from '@/contexts/LanguageContext';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';
import { DateRangeAnalytics } from './DateRangeAnalytics';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { format } from 'date-fns';

type PeriodFilter = 'today' | 'week' | 'month' | 'year' | 'all' | 'custom';

interface SimCard {
  id: string;
  sim_number: string;
  provider_name: string;
}

interface AnalyticsData {
  totalRevenue: number;
  totalCost: number;
  totalProfit: number;
  totalOrders: number;
  deliveredOrders: number;
  pendingOrders: number;
  failedOrders: number;
}

interface PeriodData {
  revenue: number;
  cost: number;
  profit: number;
  orders: number;
  pendingOrders: number;
  failedOrders: number;
  deliveredOrders: number;
}

interface DeviceStats {
  device_id: string;
  device_name: string;
  sim_number: string;
  total_deliveries: number;
  failed_deliveries: number;
  success_rate: number;
  revenue: number;
  profit: number;
}

interface ProviderBalance {
  provider_name: string;
  evoucher_balance: number;
  evc_plus_balance: number;
  sim_count: number;
  evoucher_rate: number;
}

interface ProviderRate {
  id: string;
  provider_name: string;
  evoucher_rate: number;
}

interface ProviderDailyStats {
  provider_id: string;
  provider_name: string;
  provider_logo: string | null;
  evoucher_rate: number;
  orders: number;
  revenue: number;
  cost: number;
  profit: number;
}

export const AnalyticsDashboard = ({ refreshTrigger }: { refreshTrigger?: number }) => {
  const { language } = useLanguage();
  const [analytics, setAnalytics] = useState<AnalyticsData>({
    totalRevenue: 0,
    totalCost: 0,
    totalProfit: 0,
    totalOrders: 0,
    deliveredOrders: 0,
    pendingOrders: 0,
    failedOrders: 0,
  });
  
  const [dailyData, setDailyData] = useState<PeriodData>({ revenue: 0, cost: 0, profit: 0, orders: 0, pendingOrders: 0, failedOrders: 0, deliveredOrders: 0 });
  const [weeklyData, setWeeklyData] = useState<PeriodData>({ revenue: 0, cost: 0, profit: 0, orders: 0, pendingOrders: 0, failedOrders: 0, deliveredOrders: 0 });
  const [monthlyData, setMonthlyData] = useState<PeriodData>({ revenue: 0, cost: 0, profit: 0, orders: 0, pendingOrders: 0, failedOrders: 0, deliveredOrders: 0 });
  const [yearlyData, setYearlyData] = useState<PeriodData>({ revenue: 0, cost: 0, profit: 0, orders: 0, pendingOrders: 0, failedOrders: 0, deliveredOrders: 0 });
  const [deviceStats, setDeviceStats] = useState<DeviceStats[]>([]);
  const [providerBalances, setProviderBalances] = useState<ProviderBalance[]>([]);
  const [providerRates, setProviderRates] = useState<ProviderRate[]>([]);
  const [editingRates, setEditingRates] = useState<Record<string, string>>({});
  const [savingRates, setSavingRates] = useState<Record<string, boolean>>({});
  const [providerDailyStats, setProviderDailyStats] = useState<ProviderDailyStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('today');
  const [selectedSimId, setSelectedSimId] = useState<string>('all');
  const [simCards, setSimCards] = useState<SimCard[]>([]);
  const [allOrders, setAllOrders] = useState<any[]>([]);
  const [selectedOrderStatusPeriod, setSelectedOrderStatusPeriod] = useState<'all' | 'today' | 'weekly' | 'monthly' | 'yearly'>('today');
  const [customDate, setCustomDate] = useState<Date | undefined>(undefined);
  const [customDateData, setCustomDateData] = useState<PeriodData>({ revenue: 0, cost: 0, profit: 0, orders: 0, pendingOrders: 0, failedOrders: 0, deliveredOrders: 0 });
  const [providerStatsDate, setProviderStatsDate] = useState<Date>(new Date());

  const orderStatusPeriodLabels = {
    all: language === 'so' ? 'Dhammaan' : 'All',
    today: language === 'so' ? 'Maanta' : 'Today',
    weekly: language === 'so' ? 'Todobaad' : 'Weekly',
    monthly: language === 'so' ? 'Bil' : 'Monthly',
    yearly: language === 'so' ? 'Sanad' : 'Yearly',
  };

  const getOrderStatusData = () => {
    switch (selectedOrderStatusPeriod) {
      case 'today': return dailyData;
      case 'weekly': return weeklyData;
      case 'monthly': return monthlyData;
      case 'yearly': return yearlyData;
      default: return { deliveredOrders: analytics.deliveredOrders, pendingOrders: analytics.pendingOrders, failedOrders: analytics.failedOrders };
    }
  };

  const loadProviderRates = async () => {
    try {
      const { data: providers } = await supabase
        .from('providers_config')
        .select('id, provider_name, evoucher_rate')
        .order('display_order');
      
      if (providers) {
        setProviderRates(providers.map(p => ({
          id: p.id,
          provider_name: p.provider_name,
          evoucher_rate: Number(p.evoucher_rate || 0)
        })));
        
        // Initialize editing rates
        const rates: Record<string, string> = {};
        providers.forEach(p => {
          rates[p.id] = ((Number(p.evoucher_rate || 0)) * 100).toFixed(1);
        });
        setEditingRates(rates);
      }
    } catch (error) {
      console.error('Error loading provider rates:', error);
    }
  };

  const saveProviderRate = async (providerId: string) => {
    setSavingRates(prev => ({ ...prev, [providerId]: true }));
    try {
      const ratePercent = parseFloat(editingRates[providerId] || '0');
      const rateDecimal = ratePercent / 100;
      
      const { error } = await supabase
        .from('providers_config')
        .update({ evoucher_rate: rateDecimal })
        .eq('id', providerId);
      
      if (error) throw error;
      
      toast.success(language === 'so' ? 'Rate-ka waa la keydiyay' : 'Rate saved successfully');
      loadProviderRates();
      loadAnalytics();
    } catch (error) {
      console.error('Error saving rate:', error);
      toast.error(language === 'so' ? 'Khalad baa dhacay' : 'Failed to save rate');
    } finally {
      setSavingRates(prev => ({ ...prev, [providerId]: false }));
    }
  };

  const loadProviderBalances = async () => {
    try {
      const { data: devices } = await supabase
        .from('android_devices')
        .select('id, provider_name, sim1_provider, sim2_provider')
        .eq('is_active', true)
        .is('archived_at', null);

      const { data: balances } = await supabase
        .from('sim_balances')
        .select('device_id, balance_type, balance, sim_slot');

      const { data: providers } = await supabase
        .from('providers_config')
        .select('provider_name, evoucher_rate');

      // Create rate lookup
      const rateMap = new Map<string, number>();
      providers?.forEach(p => {
        rateMap.set(p.provider_name.toLowerCase(), Number(p.evoucher_rate || 0));
      });

      // Group by provider_name (considering sim_slot)
      const providerMap = new Map<string, ProviderBalance>();
      
      devices?.forEach(device => {
        // SIM 1 balances
        const sim1Balances = balances?.filter(b => 
          b.device_id === device.id && (!b.sim_slot || b.sim_slot === 1)
        ) || [];
        
        const sim1Provider = device.sim1_provider || device.provider_name;
        const sim1Evoucher = Number(sim1Balances.find(b => b.balance_type === 'evoucher')?.balance || 0);
        const sim1EvcPlus = Number(sim1Balances.find(b => b.balance_type === 'evc_plus')?.balance || 0);
        const sim1Rate = rateMap.get(sim1Provider.toLowerCase()) || 0;
        
        if (providerMap.has(sim1Provider)) {
          const existing = providerMap.get(sim1Provider)!;
          existing.evoucher_balance += sim1Evoucher;
          existing.evc_plus_balance += sim1EvcPlus;
          existing.sim_count += 1;
        } else {
          providerMap.set(sim1Provider, {
            provider_name: sim1Provider,
            evoucher_balance: sim1Evoucher,
            evc_plus_balance: sim1EvcPlus,
            sim_count: 1,
            evoucher_rate: sim1Rate
          });
        }
        
        // SIM 2 balances - if sim2_provider exists
        if (device.sim2_provider) {
          const sim2Balances = balances?.filter(b => 
            b.device_id === device.id && b.sim_slot === 2
          ) || [];
          
          const sim2Provider = device.sim2_provider;
          const sim2Evoucher = Number(sim2Balances.find(b => b.balance_type === 'evoucher')?.balance || 0);
          const sim2EvcPlus = Number(sim2Balances.find(b => b.balance_type === 'evc_plus')?.balance || 0);
          const sim2Rate = rateMap.get(sim2Provider.toLowerCase()) || 0;
          
          if (providerMap.has(sim2Provider)) {
            const existing = providerMap.get(sim2Provider)!;
            existing.evoucher_balance += sim2Evoucher;
            existing.evc_plus_balance += sim2EvcPlus;
            existing.sim_count += 1;
          } else {
            providerMap.set(sim2Provider, {
              provider_name: sim2Provider,
              evoucher_balance: sim2Evoucher,
              evc_plus_balance: sim2EvcPlus,
              sim_count: 1,
              evoucher_rate: sim2Rate
            });
          }
        }
      });
      
      setProviderBalances(Array.from(providerMap.values()));
    } catch (error) {
      console.error('Error loading provider balances:', error);
    }
  };

  const loadSimCards = async () => {
    try {
      const { data } = await supabase
        .from('android_devices')
        .select('id, sim_number, provider_name, sim1_provider, sim2_number, sim2_provider')
        .eq('is_active', true)
        .is('archived_at', null);
      
      // Create array with both SIM 1 and SIM 2 cards
      const allSims: SimCard[] = [];
      data?.forEach(device => {
        // SIM 1
        allSims.push({
          id: `${device.id}_sim1`,
          sim_number: device.sim_number,
          provider_name: device.sim1_provider || device.provider_name
        });
        
        // SIM 2 (if exists)
        if (device.sim2_number && device.sim2_provider) {
          allSims.push({
            id: `${device.id}_sim2`,
            sim_number: device.sim2_number,
            provider_name: device.sim2_provider
          });
        }
      });
      
      setSimCards(allSims);
    } catch (error) {
      console.error('Error loading SIM cards:', error);
    }
  };

  // Realtime: just re-call the lightweight RPC (~1KB response)
  const refreshAnalyticsViaRPC = useCallback(async () => {
    console.log('📊 Refreshing analytics via RPC...');
    const { data: summary } = await (supabase as any).rpc('get_admin_analytics_summary');
    if (summary) {
      const s = summary as any;
      setAnalytics({
        totalRevenue: Number(s.total_revenue || 0),
        totalCost: Number(s.total_cost || 0),
        totalProfit: Number(s.total_profit || 0),
        totalOrders: Number(s.total_orders || 0),
        deliveredOrders: Number(s.delivered_orders || 0),
        pendingOrders: Number(s.pending_orders || 0),
        failedOrders: Number(s.failed_orders || 0),
      });

      const mapPeriod = (p: any): PeriodData => ({
        revenue: Number(p?.revenue || 0),
        cost: Number(p?.cost || 0),
        profit: Number(p?.profit || 0),
        orders: Number(p?.orders || 0),
        pendingOrders: Number(p?.pending || 0),
        failedOrders: Number(p?.failed || 0),
        deliveredOrders: Number(p?.delivered || 0),
      });

      setDailyData(mapPeriod(s.today));
      setWeeklyData(mapPeriod(s.week));
      setMonthlyData(mapPeriod(s.month));
      setYearlyData(mapPeriod(s.year));
    }

    // Also refresh provider daily stats
    const { data: providerStats } = await (supabase as any).rpc('get_admin_provider_daily_stats');
    if (Array.isArray(providerStats)) {
      setProviderDailyStats((providerStats as any[]).map(ps => ({
        provider_id: ps.provider_id,
        provider_name: ps.provider_name,
        provider_logo: null,
        evoucher_rate: Number(ps.evoucher_rate || 0),
        orders: Number(ps.order_count || 0),
        revenue: Number(ps.revenue || 0),
        cost: Number(ps.cost || 0),
        profit: Number(ps.profit || 0),
      })));
    }
  }, []);

  useEffect(() => {
    loadAnalytics();
    loadProviderBalances();
    loadProviderRates();
    loadSimCards();

    // Real-time subscription for orders: INSERT + UPDATE → re-call lightweight RPC
    const ordersChannel = supabase
      .channel('analytics-orders-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'orders' },
        () => {
          console.log('📊 New order detected via realtime');
          refreshAnalyticsViaRPC();
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders' },
        () => {
          console.log('📊 Order updated via realtime');
          refreshAnalyticsViaRPC();
        }
      )
      .subscribe();

    // Real-time subscription for sim_balances table - UPDATE only
    const balancesChannel = supabase
      .channel('provider-balances-realtime')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'sim_balances' },
        () => {
          console.log('💰 Balance change detected, refreshing provider balances...');
          loadProviderBalances();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ordersChannel);
      supabase.removeChannel(balancesChannel);
    };
  }, [refreshTrigger, refreshAnalyticsViaRPC]);

  const loadAnalytics = async (silent: boolean = false) => {
    try {
      if (!silent) {
        setLoading(true);
      }
      
      // ========================================
      // KING LEVEL: Use RPC instead of fetching all rows
      // Single call returns ALL metrics as 1 JSON row (~1KB vs ~680KB)
      // ========================================
      const { data: summary, error: summaryError } = await (supabase as any).rpc('get_admin_analytics_summary');
      
      if (summaryError) throw summaryError;
      
      const s = summary as any;
      
      setAnalytics({
        totalRevenue: Number(s.total_revenue || 0),
        totalCost: Number(s.total_cost || 0),
        totalProfit: Number(s.total_profit || 0),
        totalOrders: Number(s.total_orders || 0),
        deliveredOrders: Number(s.delivered_orders || 0),
        pendingOrders: Number(s.pending_orders || 0),
        failedOrders: Number(s.failed_orders || 0),
      });

      const mapPeriod = (p: any): PeriodData => ({
        revenue: Number(p?.revenue || 0),
        cost: Number(p?.cost || 0),
        profit: Number(p?.profit || 0),
        orders: Number(p?.orders || 0),
        pendingOrders: Number(p?.pending || 0),
        failedOrders: Number(p?.failed || 0),
        deliveredOrders: Number(p?.delivered || 0),
      });

      setDailyData(mapPeriod(s.today));
      setWeeklyData(mapPeriod(s.week));
      setMonthlyData(mapPeriod(s.month));
      setYearlyData(mapPeriod(s.year));

      // Provider daily stats via RPC
      const { data: providerStats } = await (supabase as any).rpc('get_admin_provider_daily_stats');
      if (Array.isArray(providerStats)) {
        setProviderDailyStats((providerStats as any[]).map(ps => ({
          provider_id: ps.provider_id,
          provider_name: ps.provider_name,
          provider_logo: null,
          evoucher_rate: Number(ps.evoucher_rate || 0),
          orders: Number(ps.order_count || 0),
          revenue: Number(ps.revenue || 0),
          cost: Number(ps.cost || 0),
          profit: Number(ps.profit || 0),
        })));
      }

      // Load device statistics - these are small queries, keep as-is
      const { data: devices, error: devicesError } = await supabase
        .from('android_devices')
        .select('*')
        .is('archived_at', null);

      if (!devicesError && devices) {
        const { data: deliveries } = await supabase
          .from('delivery_queue')
          .select(`
            *,
            order:orders!left(selling_price, delivery_status, provider_id, data_packages_config!left(cost_price), providers_config!left(evoucher_rate))
          `);

        const deviceStatsList: DeviceStats[] = [];

        devices.forEach(device => {
          const deviceDeliveries = deliveries?.filter(d => d.android_device_id === device.device_id) || [];
          
          // === SIM 1 Stats ===
          const sim1Deliveries = deviceDeliveries.filter(d => !d.sim_slot || d.sim_slot === 1);
          const sim1Completed = sim1Deliveries.filter(d => {
            const order = d.order as any;
            return d.status === 'completed' && order?.delivery_status === 'delivered';
          });
          const sim1Failed = sim1Deliveries.filter(d => d.status === 'failed');

          const sim1Revenue = sim1Completed.reduce((sum, d) => {
            const order = d.order as any;
            return sum + Number(order?.selling_price || 0);
          }, 0);

          const sim1Profit = sim1Completed.reduce((sum, d) => {
            const order = d.order as any;
            const pkg = order?.data_packages_config;
            const provider = order?.providers_config;
            const sellingPrice = Number(order?.selling_price || 0);
            const costPrice = Number(pkg?.cost_price || 0);
            const evoucherRate = Number(provider?.evoucher_rate || 0);
            const evoucherReceived = sellingPrice * (1 + evoucherRate);
            return sum + (evoucherReceived - costPrice);
          }, 0);

          deviceStatsList.push({
            device_id: device.id + '-sim1',
            device_name: device.device_name || 'Unknown',
            sim_number: `${device.sim_number} (${device.sim1_provider || device.provider_name})`,
            total_deliveries: sim1Completed.length,
            failed_deliveries: sim1Failed.length,
            success_rate: sim1Deliveries.length > 0 
              ? ((sim1Completed.length) / sim1Deliveries.length * 100)
              : 0,
            revenue: sim1Revenue,
            profit: sim1Profit,
          });

          // === SIM 2 Stats (if exists) ===
          if (device.sim2_number) {
            const sim2Deliveries = deviceDeliveries.filter(d => d.sim_slot === 2);
            const sim2Completed = sim2Deliveries.filter(d => {
              const order = d.order as any;
              return d.status === 'completed' && order?.delivery_status === 'delivered';
            });
            const sim2Failed = sim2Deliveries.filter(d => d.status === 'failed');

            const sim2Revenue = sim2Completed.reduce((sum, d) => {
              const order = d.order as any;
              return sum + Number(order?.selling_price || 0);
            }, 0);

            const sim2Profit = sim2Completed.reduce((sum, d) => {
              const order = d.order as any;
              const pkg = order?.data_packages_config;
              const provider = order?.providers_config;
              const sellingPrice = Number(order?.selling_price || 0);
              const costPrice = Number(pkg?.cost_price || 0);
              const evoucherRate = Number(provider?.evoucher_rate || 0);
              const evoucherReceived = sellingPrice * (1 + evoucherRate);
              return sum + (evoucherReceived - costPrice);
            }, 0);

            deviceStatsList.push({
              device_id: device.id + '-sim2',
              device_name: `${device.device_name || 'Unknown'} - SIM 2`,
              sim_number: `${device.sim2_number} (${device.sim2_provider || 'Unknown'})`,
              total_deliveries: sim2Completed.length,
              failed_deliveries: sim2Failed.length,
              success_rate: sim2Deliveries.length > 0 
                ? ((sim2Completed.length) / sim2Deliveries.length * 100)
                : 0,
              revenue: sim2Revenue,
              profit: sim2Profit,
            });
          }
        });

        setDeviceStats(deviceStatsList);
      }

    } catch (error) {
      console.error('Error loading analytics:', error);
    } finally {
      setLoading(false);
      setIsInitialLoad(false);
    }
  };

  // Load custom date data when a specific date is selected
  useEffect(() => {
    if (!customDate || periodFilter !== 'custom') return;
    
    const loadCustomDateData = async () => {
      // Use Africa/Mogadishu timezone (UTC+3) for date boundaries
      const dateStr = format(customDate, 'yyyy-MM-dd');
      const dayStartUTC = new Date(`${dateStr}T00:00:00+03:00`);
      const dayEndUTC = new Date(`${dateStr}T23:59:59.999+03:00`);

      const { data: rpcData, error } = await (supabase as any).rpc('get_admin_date_range_breakdown', {
        p_start_date: dayStartUTC.toISOString(),
        p_end_date: dayEndUTC.toISOString(),
        p_provider_id: null,
      });

      if (error) {
        console.error('Error loading custom date data:', error);
        return;
      }

      let revenue = 0, cost = 0, profit = 0, orders = 0;
      ((rpcData as any[]) || []).forEach((row: any) => {
        revenue += Number(row.revenue || 0);
        cost += Number(row.cost || 0);
        profit += Number(row.profit || 0);
        orders += Number(row.order_count || 0);
      });

      setCustomDateData({
        revenue,
        cost,
        profit,
        orders,
        pendingOrders: 0,
        failedOrders: 0,
        deliveredOrders: orders,
      });
    };

    loadCustomDateData();
  }, [customDate, periodFilter]);

  // Filtered analytics based on period selection (RPC data already provides period breakdowns)
  const filteredAnalytics = useMemo(() => {
    const defaultData = {
      revenue: analytics.totalRevenue,
      cost: analytics.totalCost,
      profit: analytics.totalProfit,
      orders: analytics.totalOrders,
      pendingOrders: analytics.pendingOrders,
      failedOrders: analytics.failedOrders,
      deliveredOrders: analytics.deliveredOrders,
    };

    switch (periodFilter) {
      case 'today': return dailyData;
      case 'week': return weeklyData;
      case 'month': return monthlyData;
      case 'year': return yearlyData;
      case 'custom': return customDateData;
      default: return defaultData;
    }
  }, [periodFilter, analytics, dailyData, weeklyData, monthlyData, yearlyData, customDateData]);

  // Filter provider daily stats by selected date using RPC
  const [filteredProviderDailyStats, setFilteredProviderDailyStats] = useState<ProviderDailyStats[]>([]);
  
  useEffect(() => {
    const loadProviderStatsForDate = async () => {
      const dateStr = format(providerStatsDate, 'yyyy-MM-dd');
      const { data: providerStats } = await (supabase as any).rpc('get_admin_provider_daily_stats', {
        p_date: dateStr,
      });
      if (Array.isArray(providerStats)) {
        setFilteredProviderDailyStats((providerStats as any[]).map(ps => ({
          provider_id: ps.provider_id,
          provider_name: ps.provider_name,
          provider_logo: null,
          evoucher_rate: Number(ps.evoucher_rate || 0),
          orders: Number(ps.order_count || 0),
          revenue: Number(ps.revenue || 0),
          cost: Number(ps.cost || 0),
          profit: Number(ps.profit || 0),
        })));
      }
    };
    loadProviderStatsForDate();
  }, [providerStatsDate]);

  const StatCard = ({ 
    title, 
    value, 
    icon: Icon, 
    subtitle, 
    trend 
  }: { 
    title: string; 
    value: string | number; 
    icon: any; 
    subtitle?: string;
    trend?: 'up' | 'down';
  }) => (
    <Card className="w-full">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 md:p-6 pb-1 md:pb-2">
        <CardTitle className="text-xs md:text-sm font-medium">{title}</CardTitle>
        <Icon className="h-3.5 w-3.5 md:h-4 md:w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent className="p-3 md:p-6 pt-0">
        <div className="text-xl md:text-2xl font-bold">{value}</div>
        {subtitle && (
          <p className="text-[10px] md:text-xs text-muted-foreground">{subtitle}</p>
        )}
      </CardContent>
    </Card>
  );

  const PeriodCard = ({ title, data }: { title: string; data: PeriodData }) => (
    <Card>
      <CardHeader className="p-3 md:p-6 pb-1 md:pb-2">
        <CardTitle className="text-sm md:text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="p-3 md:p-6 pt-0 space-y-1.5 md:space-y-2">
        <div className="flex justify-between">
          <span className="text-xs md:text-sm text-muted-foreground">
            {language === 'so' ? 'Dakhli' : 'Revenue'}:
          </span>
          <span className="text-sm md:text-base font-semibold">${formatPrice(data.revenue)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-xs md:text-sm text-muted-foreground">
            {language === 'so' ? 'Kharash' : 'Cost'}:
          </span>
          <span className="text-sm md:text-base font-semibold text-destructive">${formatPrice(data.cost)}</span>
        </div>
        <div className="flex justify-between border-t pt-1.5 md:pt-2">
          <span className="text-xs md:text-sm font-medium">
            {language === 'so' ? 'Faa\'iido' : 'Profit'}:
          </span>
          <span className="text-sm md:text-base font-bold text-primary">${formatPrice(data.profit)}</span>
        </div>
        <div className="flex justify-between text-[10px] md:text-xs text-muted-foreground">
          <span>{language === 'so' ? 'La diray' : 'Delivered'}:</span>
          <span>{data.orders}</span>
        </div>
      </CardContent>
    </Card>
  );

  // Only show skeleton on initial load
  if (loading && isInitialLoad) {
    return (
      <div className="space-y-6">
        {/* Top Stats Skeleton */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-4 rounded" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-20 mb-2" />
                <Skeleton className="h-3 w-32" />
              </CardContent>
            </Card>
          ))}
        </div>
        {/* Order Status Skeleton */}
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-64 mt-2" />
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-20 rounded-lg" />
              ))}
            </div>
          </CardContent>
        </Card>
        {/* Period Cards Skeleton */}
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-48" />
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-32 rounded-lg" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Filters: Period + SIM */}
      <div className="flex flex-wrap items-center gap-4">
        {/* Period Filter Buttons */}
        <div className="flex flex-wrap gap-2">
          <Button 
            variant={periodFilter === 'all' ? 'default' : 'outline'} 
            size="sm"
            onClick={() => { setPeriodFilter('all'); setCustomDate(undefined); }}
          >
            {language === 'so' ? 'Dhammaan' : 'All Time'}
          </Button>
          <Button 
            variant={periodFilter === 'today' ? 'default' : 'outline'} 
            size="sm"
            onClick={() => { setPeriodFilter('today'); setCustomDate(undefined); }}
          >
            {language === 'so' ? 'Maanta' : 'Today'}
          </Button>
          <Button 
            variant={periodFilter === 'week' ? 'default' : 'outline'} 
            size="sm"
            onClick={() => { setPeriodFilter('week'); setCustomDate(undefined); }}
          >
            {language === 'so' ? 'Isbuucan' : 'Week'}
          </Button>
          <Button 
            variant={periodFilter === 'month' ? 'default' : 'outline'} 
            size="sm"
            onClick={() => { setPeriodFilter('month'); setCustomDate(undefined); }}
          >
            {language === 'so' ? 'Bisha' : 'Month'}
          </Button>
          <Button 
            variant={periodFilter === 'year' ? 'default' : 'outline'} 
            size="sm"
            onClick={() => { setPeriodFilter('year'); setCustomDate(undefined); }}
          >
            {language === 'so' ? 'Sanadka' : 'Year'}
          </Button>
          
          {/* Custom Date Picker */}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant={periodFilter === 'custom' ? 'default' : 'outline'}
                size="sm"
                className={cn(
                  "gap-1",
                  !customDate && periodFilter !== 'custom' && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="h-4 w-4" />
                {customDate ? format(customDate, "dd/MM/yyyy") : (language === 'so' ? 'Maalin' : 'Date')}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <CalendarComponent
                mode="single"
                selected={customDate}
                onSelect={(date) => {
                  setCustomDate(date);
                  if (date) {
                    setPeriodFilter('custom');
                  }
                }}
                disabled={(date) => date > new Date()}
                initialFocus
                className={cn("p-3 pointer-events-auto")}
              />
            </PopoverContent>
          </Popover>
        </div>

        {/* SIM Filter Dropdown */}
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <SlidersHorizontal className="h-4 w-4 text-muted-foreground shrink-0" />
          <Select value={selectedSimId} onValueChange={setSelectedSimId}>
            <SelectTrigger className="w-full sm:w-[220px]">
              <SelectValue placeholder={language === 'so' ? 'Dhammaan SIM-yada' : 'All SIMs'} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                {language === 'so' ? 'Dhammaan SIM-yada' : 'All SIMs'}
              </SelectItem>
              {simCards.map(sim => (
                <SelectItem key={sim.id} value={sim.id}>
                  {sim.sim_number} ({sim.provider_name})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Overall Stats - Filtered by period */}
      <div className="grid grid-cols-2 gap-3 w-full lg:grid-cols-4">
        <StatCard
          title={language === 'so' ? 'Wadarta Dakhliga' : 'Total Revenue'}
          value={`$${formatPrice(filteredAnalytics.revenue)}`}
          icon={DollarSign}
          subtitle={`${filteredAnalytics.deliveredOrders} ${language === 'so' ? 'dalabo oo la diray' : 'delivered orders'}`}
        />
        <StatCard
          title={language === 'so' ? 'Wadarta Faa\'iidada' : 'Total Profit'}
          value={`$${formatPrice(filteredAnalytics.profit)}`}
          icon={TrendingUp}
          subtitle={`${language === 'so' ? 'Kharash' : 'Cost'}: $${formatPrice(filteredAnalytics.cost)}`}
        />
        <StatCard
          title={language === 'so' ? 'Wadarta Dalabada' : 'Total Orders'}
          value={filteredAnalytics.orders}
          icon={Package}
          subtitle={`${filteredAnalytics.pendingOrders} ${language === 'so' ? 'sugaya' : 'pending'}, ${filteredAnalytics.failedOrders} ${language === 'so' ? 'fashilmay' : 'failed'}`}
        />
        <StatCard
          title={language === 'so' ? 'SIM-yada Firfircoon' : 'Active SIMs'}
          value={deviceStats.length}
          icon={Smartphone}
          subtitle={`${language === 'so' ? 'Shaqaynaya' : 'Operational'}`}
        />
      </div>

      {/* Order Status Summary */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                {language === 'so' ? 'Xaalada Dalabada' : 'Order Status Summary'}
              </CardTitle>
              <CardDescription>
                {language === 'so' 
                  ? 'Kaliya dalabyadii la diray ayaa dakhliga iyo faa\'iidada lagu daraa'
                  : 'Only delivered orders are counted towards revenue and profit'}
              </CardDescription>
            </div>
          </div>
          {/* Period filter tabs */}
          <div className="flex gap-1 mt-3 overflow-x-auto">
            {(['all', 'today', 'weekly', 'monthly', 'yearly'] as const).map((period) => (
              <button
                key={period}
                onClick={() => setSelectedOrderStatusPeriod(period)}
                className={`px-3 py-1.5 text-xs font-medium rounded-full whitespace-nowrap transition-colors ${
                  selectedOrderStatusPeriod === period
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted hover:bg-muted/80 text-muted-foreground'
                }`}
              >
                {orderStatusPeriodLabels[period]}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-2 md:gap-4">
            <div className="flex items-center gap-2 md:gap-3 p-2 md:p-4 rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800">
              <CheckCircle className="h-5 w-5 md:h-8 md:w-8 text-green-600 shrink-0" />
              <div className="min-w-0">
                <p className="text-lg md:text-2xl font-bold text-green-700 dark:text-green-400">{getOrderStatusData().deliveredOrders}</p>
                <p className="text-[10px] md:text-sm text-green-600 truncate">{language === 'so' ? 'La diray' : 'Delivered'}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 md:gap-3 p-2 md:p-4 rounded-lg bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-800">
              <Clock className="h-5 w-5 md:h-8 md:w-8 text-yellow-600 shrink-0" />
              <div className="min-w-0">
                <p className="text-lg md:text-2xl font-bold text-yellow-700 dark:text-yellow-400">{getOrderStatusData().pendingOrders}</p>
                <p className="text-[10px] md:text-sm text-yellow-600 truncate">{language === 'so' ? 'Sugaya' : 'Pending'}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 md:gap-3 p-2 md:p-4 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800">
              <XCircle className="h-5 w-5 md:h-8 md:w-8 text-red-600 shrink-0" />
              <div className="min-w-0">
                <p className="text-lg md:text-2xl font-bold text-red-700 dark:text-red-400">{getOrderStatusData().failedOrders}</p>
                <p className="text-[10px] md:text-sm text-red-600 truncate">{language === 'so' ? 'Fashilmay' : 'Failed'}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Per-Provider Daily Analytics */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                {language === 'so' ? 'Shirkad Walba' : 'Per-Provider Analytics'}
              </CardTitle>
              <CardDescription>
                {language === 'so' 
                  ? `Dalabyadii la diray ${format(providerStatsDate, 'dd/MM/yyyy')} shirkad walba si gooni ah`
                  : `Delivered orders breakdown by provider for ${format(providerStatsDate, 'dd/MM/yyyy')}`}
              </CardDescription>
            </div>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-auto justify-start text-left font-normal">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {format(providerStatsDate, 'dd/MM/yyyy')}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <CalendarComponent
                  mode="single"
                  selected={providerStatsDate}
                  onSelect={(date) => date && setProviderStatsDate(date)}
                  disabled={(date) => date > new Date()}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
          </div>
        </CardHeader>
        <CardContent>
          {filteredProviderDailyStats.length > 0 ? (
            <>
              {/* Mobile Card View */}
              <div className="md:hidden space-y-2">
                {filteredProviderDailyStats.map(provider => (
                  <div key={provider.provider_id} className="border rounded-lg p-3 bg-card space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold">{provider.provider_name}</span>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                        {(provider.evoucher_rate * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-1 text-xs">
                      <div>
                        <p className="text-[10px] text-muted-foreground">{language === 'so' ? 'Dalabyo' : 'Orders'}</p>
                        <p className="font-semibold">{provider.orders}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground">{language === 'so' ? 'Dakhli' : 'Revenue'}</p>
                        <p className="font-medium">${formatPrice(provider.revenue)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground">{language === 'so' ? 'Faa\'iido' : 'Profit'}</p>
                        <p className="font-bold text-green-600 dark:text-green-400">${formatPrice(provider.profit)}</p>
                      </div>
                    </div>
                  </div>
                ))}
                {/* Mobile Totals */}
                <div className="border rounded-lg p-3 bg-muted/30 space-y-1">
                  <p className="text-xs font-semibold">{language === 'so' ? 'Wadarta' : 'Total'}</p>
                  <div className="grid grid-cols-3 gap-1 text-xs">
                    <div><p className="font-semibold">{filteredProviderDailyStats.reduce((s, p) => s + p.orders, 0)}</p></div>
                    <div><p className="font-medium">${formatPrice(filteredProviderDailyStats.reduce((s, p) => s + p.revenue, 0))}</p></div>
                    <div><p className="font-bold text-green-600 dark:text-green-400">${formatPrice(filteredProviderDailyStats.reduce((s, p) => s + p.profit, 0))}</p></div>
                  </div>
                </div>
              </div>

              {/* Desktop Table View */}
              <div className="hidden md:block w-full overflow-x-auto border rounded-lg">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-3 px-2 font-medium">{language === 'so' ? 'Shirkad' : 'Provider'}</th>
                      <th className="text-center py-3 px-2 font-medium">Rate</th>
                      <th className="text-center py-3 px-2 font-medium">{language === 'so' ? 'Dalabyo' : 'Orders'}</th>
                      <th className="text-right py-3 px-2 font-medium">{language === 'so' ? 'Dakhli' : 'Revenue'}</th>
                      <th className="text-right py-3 px-2 font-medium">{language === 'so' ? 'Kharash' : 'Cost'}</th>
                      <th className="text-right py-3 px-2 font-medium">{language === 'so' ? 'Faa\'iido' : 'Profit'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProviderDailyStats.map(provider => (
                      <tr key={provider.provider_id} className="border-b last:border-b-0 hover:bg-muted/50">
                        <td className="py-3 px-2 font-medium">{provider.provider_name}</td>
                        <td className="py-3 px-2 text-center">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                            {(provider.evoucher_rate * 100).toFixed(1)}%
                          </span>
                        </td>
                        <td className="py-3 px-2 text-center font-semibold">{provider.orders}</td>
                        <td className="py-3 px-2 text-right">${formatPrice(provider.revenue)}</td>
                        <td className="py-3 px-2 text-right text-destructive">${formatPrice(provider.cost)}</td>
                        <td className="py-3 px-2 text-right">
                          <span className="font-bold text-green-600 dark:text-green-400">${formatPrice(provider.profit)}</span>
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-muted/30 font-semibold">
                      <td className="py-3 px-2">{language === 'so' ? 'Wadarta' : 'Total'}</td>
                      <td className="py-3 px-2"></td>
                      <td className="py-3 px-2 text-center">{filteredProviderDailyStats.reduce((sum, p) => sum + p.orders, 0)}</td>
                      <td className="py-3 px-2 text-right">${formatPrice(filteredProviderDailyStats.reduce((sum, p) => sum + p.revenue, 0))}</td>
                      <td className="py-3 px-2 text-right text-destructive">${formatPrice(filteredProviderDailyStats.reduce((sum, p) => sum + p.cost, 0))}</td>
                      <td className="py-3 px-2 text-right text-green-600 dark:text-green-400">
                        ${formatPrice(filteredProviderDailyStats.reduce((sum, p) => sum + p.profit, 0))}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              {language === 'so' ? `${format(providerStatsDate, 'dd/MM/yyyy')} dalabo ma jirto oo la diray` : `No delivered orders on ${format(providerStatsDate, 'dd/MM/yyyy')}`}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Date Range Analytics with Daily Breakdown */}
      <DateRangeAnalytics />

      {/* Period-based Analytics Summary Cards */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            {language === 'so' ? 'Kooban - Waqtiyada' : 'Quick Summary - Periods'}
          </CardTitle>
          <CardDescription>
            {language === 'so' 
              ? 'Kooban ku saabsan dakhliga iyo faa\'iidada'
              : 'Quick summary of revenue and profit by period'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2 md:gap-4 lg:grid-cols-4">
            <PeriodCard 
              title={language === 'so' ? 'Maanta' : 'Today'} 
              data={dailyData} 
            />
            <PeriodCard 
              title={language === 'so' ? 'Todobaadkan' : 'This Week'} 
              data={weeklyData} 
            />
            <PeriodCard 
              title={language === 'so' ? 'Bisha' : 'This Month'} 
              data={monthlyData} 
            />
            <PeriodCard 
              title={language === 'so' ? 'Sannadkan' : 'This Year'} 
              data={yearlyData} 
            />
          </div>
        </CardContent>
      </Card>

      {/* Total Balances Summary Card */}
      {(() => {
        const hormuudProvider = providerBalances.find(p => p.provider_name.toLowerCase().includes('hormuud'));
        const totalEvoucher = providerBalances.reduce((sum, p) => {
          const isHormuud = p.provider_name.toLowerCase().includes('hormuud');
          if (isHormuud) return sum + p.evoucher_balance;
          return sum + (p.evoucher_balance || p.evc_plus_balance);
        }, 0);
        const totalEvcPlus = hormuudProvider?.evc_plus_balance || 0;
        const grandTotal = totalEvoucher + totalEvcPlus;
        
        return (
          <Card className="bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20">
            <CardHeader className="p-3 md:p-6 pb-2">
              <CardTitle className="text-base md:text-lg flex items-center gap-2">
                <Wallet className="h-4 w-4 md:h-5 md:w-5 text-primary" />
                {language === 'so' ? 'Wadarta Lacagta' : 'Total Balances'}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 md:p-6 pt-0">
              <div className="grid grid-cols-3 gap-2">
                <div className="text-center p-2 md:p-3 rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800">
                  <p className="text-[10px] md:text-xs text-muted-foreground">E-Voucher</p>
                  <p className="text-sm md:text-xl font-bold text-green-600 dark:text-green-400">${totalEvoucher.toLocaleString()}</p>
                </div>
                <div className="text-center p-2 md:p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800">
                  <p className="text-[10px] md:text-xs text-muted-foreground">EVC Plus</p>
                  <p className="text-sm md:text-xl font-bold text-blue-600 dark:text-blue-400">${totalEvcPlus.toLocaleString()}</p>
                </div>
                <div className="text-center p-2 md:p-3 rounded-lg bg-primary/10 border border-primary/30">
                  <p className="text-[10px] md:text-xs text-muted-foreground">{language === 'so' ? 'Wadarta' : 'Total'}</p>
                  <p className="text-sm md:text-xl font-bold text-primary">${grandTotal.toLocaleString()}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {/* Provider Balances */}
      <Card>
        <CardHeader className="p-3 md:p-6 pb-2">
          <CardTitle className="text-base md:text-lg flex items-center gap-2">
            <Wallet className="h-4 w-4 md:h-5 md:w-5" />
            {language === 'so' ? 'Lacagta Shirkadaha' : 'Provider Balances'}
          </CardTitle>
          <CardDescription className="text-xs md:text-sm">
            {language === 'so' ? 'E-Voucher iyo EVC Plus balance-ka shirkad walba' : 'E-Voucher and EVC Plus balances per provider'}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-3 md:p-6 pt-0">
          <div className="grid gap-2 md:gap-3 grid-cols-2 lg:grid-cols-3">
            {providerBalances.map(provider => {
              const pName = provider.provider_name.toLowerCase();
              const borderColor = pName.includes('hormuud') ? 'border-l-hormuud' : pName.includes('somtel') ? 'border-l-somtel' : pName.includes('somnet') ? 'border-l-somnet' : pName.includes('somlink') ? 'border-l-somlink' : pName.includes('amtel') ? 'border-l-amtel' : 'border-l-primary';
              const bgColor = pName.includes('hormuud') ? 'bg-hormuud/5 dark:bg-hormuud/10' : pName.includes('somtel') ? 'bg-somtel/5 dark:bg-somtel/10' : pName.includes('somnet') ? 'bg-somnet/5 dark:bg-somnet/10' : pName.includes('somlink') ? 'bg-somlink/5 dark:bg-somlink/10' : pName.includes('amtel') ? 'bg-amtel/5 dark:bg-amtel/10' : 'bg-primary/5';
              const textColor = pName.includes('hormuud') ? 'text-hormuud' : pName.includes('somtel') ? 'text-somtel' : pName.includes('somnet') ? 'text-somnet' : pName.includes('somlink') ? 'text-somlink' : pName.includes('amtel') ? 'text-amtel' : 'text-primary';
              
              return (
                <Card key={provider.provider_name} className={`border-l-4 ${borderColor} ${bgColor} shadow-none`}>
                  <CardHeader className="p-2.5 md:p-4 pb-1">
                    <CardTitle className={`text-sm md:text-base ${textColor}`}>{provider.provider_name}</CardTitle>
                    <CardDescription className="text-[10px] md:text-xs">
                      {provider.sim_count} SIM • Rate: {(provider.evoucher_rate * 100).toFixed(1)}%
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-2.5 md:p-4 pt-0 space-y-1">
                    {provider.provider_name.toLowerCase().includes('hormuud') ? (
                      <>
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] md:text-xs text-muted-foreground">E-Voucher:</span>
                          <span className="text-xs md:text-sm font-bold text-green-600 dark:text-green-400">${provider.evoucher_balance.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] md:text-xs text-muted-foreground">EVC Plus:</span>
                          <span className="text-xs md:text-sm font-bold text-blue-600 dark:text-blue-400">${provider.evc_plus_balance.toLocaleString()}</span>
                        </div>
                      </>
                    ) : (
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] md:text-xs text-muted-foreground">Balance:</span>
                        <span className="text-xs md:text-sm font-bold text-green-600 dark:text-green-400">${(provider.evoucher_balance || provider.evc_plus_balance).toLocaleString()}</span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </CardContent>
      </Card>

    </div>
  );
};
