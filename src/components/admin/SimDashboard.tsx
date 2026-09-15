import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { DollarSign, TrendingUp, Package, Calendar, Edit, Trash2, Wallet, CreditCard, RefreshCw } from 'lucide-react';
import { formatPrice } from '@/lib/utils';
import { useLanguage } from '@/contexts/LanguageContext';
import { toast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';
import { EditSimDialog } from './EditSimDialog';
import { DeleteSimDialog } from './DeleteSimDialog';

// Skeleton component for SimDashboard
const SimDashboardSkeleton = () => (
  <div className="space-y-6">
    {/* Header Card Skeleton */}
    <Card className="border-primary/20">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-3 w-3 rounded-full" />
            </div>
            <Skeleton className="h-5 w-64 mt-2" />
            <Skeleton className="h-4 w-40 mt-1" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-8" />
            <Skeleton className="h-6 w-20 rounded-full" />
            <Skeleton className="h-8 w-8" />
            <Skeleton className="h-8 w-8" />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Balance Cards Skeleton */}
        <div className="grid grid-cols-2 gap-2 md:gap-4 mb-6">
          {[1, 2].map((i) => (
            <div key={i} className="p-4 rounded-lg border">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-5 w-5" />
                  <div>
                    <Skeleton className="h-5 w-24" />
                    <Skeleton className="h-3 w-32 mt-1" />
                  </div>
                </div>
                <Skeleton className="h-5 w-20 rounded-full" />
              </div>
              <Skeleton className="h-8 w-24 mt-2" />
              <Skeleton className="h-3 w-32 mt-2" />
            </div>
          ))}
        </div>

        {/* Period Filter Skeleton */}
        <div className="flex gap-2 mb-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-9 w-24" />
          ))}
        </div>

        {/* Stats Cards Skeleton */}
        <div className="grid grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="p-4 rounded-lg border">
              <Skeleton className="h-4 w-16 mb-2" />
              <Skeleton className="h-8 w-20" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  </div>
);
interface SimDevice {
  id: string;
  device_id: string;
  device_name: string;
  sim_number: string;
  provider_name: string;
  sim1_provider?: string | null;
  sim2_provider?: string | null;
  is_active: boolean;
  total_deliveries: number;
  failed_deliveries: number;
  last_ping_at: string | null;
}

interface PeriodData {
  revenue: number;
  cost: number;
  profit: number;
  orders: number;
}

interface BalanceData {
  id: string | null;
  balance: number;
  balance_type: 'evc_plus' | 'evoucher' | 'manual';
  balance_source: 'manual' | 'sms' | 'ussd';
  last_updated: string | null;
}

interface SimDashboardProps {
  sim: SimDevice;
  onUpdate: () => void;
}

export const SimDashboard = ({ sim, onUpdate }: SimDashboardProps) => {
  const { language } = useLanguage();
  
  // SIM 1 balance types
  const [sim1EvcBalance, setSim1EvcBalance] = useState<BalanceData>({ id: null, balance: 0, balance_type: 'evc_plus', balance_source: 'manual', last_updated: null });
  const [sim1EvoucherBalance, setSim1EvoucherBalance] = useState<BalanceData>({ id: null, balance: 0, balance_type: 'evoucher', balance_source: 'manual', last_updated: null });
  
  // SIM 2 balance types
  const [sim2EvcBalance, setSim2EvcBalance] = useState<BalanceData>({ id: null, balance: 0, balance_type: 'evc_plus', balance_source: 'manual', last_updated: null });
  const [sim2EvoucherBalance, setSim2EvoucherBalance] = useState<BalanceData>({ id: null, balance: 0, balance_type: 'evoucher', balance_source: 'manual', last_updated: null });
  
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isOnline, setIsOnline] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState<'today' | 'weekly' | 'monthly' | 'yearly'>('today');

  const [dailyData, setDailyData] = useState<PeriodData>({ revenue: 0, cost: 0, profit: 0, orders: 0 });
  const [weeklyData, setWeeklyData] = useState<PeriodData>({ revenue: 0, cost: 0, profit: 0, orders: 0 });
  const [monthlyData, setMonthlyData] = useState<PeriodData>({ revenue: 0, cost: 0, profit: 0, orders: 0 });
  const [yearlyData, setYearlyData] = useState<PeriodData>({ revenue: 0, cost: 0, profit: 0, orders: 0 });

  // Auto-update online status when sim.last_ping_at changes
  // Use 3 minutes threshold to reduce false offline events
  useEffect(() => {
    const threeMinutesAgo = new Date(Date.now() - 3 * 60 * 1000);
    setIsOnline(sim.last_ping_at ? new Date(sim.last_ping_at) > threeMinutesAgo : false);
  }, [sim.last_ping_at]);

  // Local-only 30s online status check (0 egress)
  useEffect(() => {
    const checkOnline = () => {
      const threeMinutesAgo = new Date(Date.now() - 3 * 60 * 1000);
      setIsOnline(sim.last_ping_at ? new Date(sim.last_ping_at) > threeMinutesAgo : false);
    };
    const interval = setInterval(checkOnline, 30000);
    return () => clearInterval(interval);
  }, [sim.last_ping_at]);

  useEffect(() => {
    loadSimData(true);
    
    // Set up real-time subscription for deliveries
    const deliveryChannel = supabase
      .channel('sim-dashboard-deliveries')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'delivery_queue',
          filter: `android_device_id=eq.${sim.device_id}`
        },
        () => {
          loadSimData();
        }
      )
      .subscribe();

    // Set up real-time subscription for balance updates
    const balanceChannel = supabase
      .channel(`sim-balances-${sim.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'sim_balances',
          filter: `device_id=eq.${sim.id}`
        },
        (payload) => {
          console.log('💰 Balance update received:', payload);
          // Reload balances when updated
          loadBalances();
        }
      )
      .subscribe();

    // Realtime subscriptions handle all updates - no polling needed

    return () => {
      supabase.removeChannel(deliveryChannel);
      supabase.removeChannel(balanceChannel);
    };
  }, [sim.device_id, sim.id]);

  // Load only balances (for real-time updates)
  const loadBalances = async () => {
    try {
      const { data: balances, error: balanceError } = await supabase
        .from("sim_balances")
        .select("*")
        .eq("device_id", sim.id);

      if (balanceError && balanceError.code !== 'PGRST116') {
        throw balanceError;
      }

      if (balances) {
        // SIM 1 EVC Plus balance
        const sim1Evc = balances.find(b => b.balance_type === 'evc_plus' && b.sim_slot === 1);
        if (sim1Evc) {
          setSim1EvcBalance({
            id: sim1Evc.id,
            balance: sim1Evc.balance,
            balance_type: 'evc_plus',
            balance_source: (sim1Evc.balance_source as 'manual' | 'sms' | 'ussd') || 'manual',
            last_updated: sim1Evc.last_updated
          });
        }

        // SIM 1 E-Voucher balance
        const sim1Evoucher = balances.find(b => b.balance_type === 'evoucher' && b.sim_slot === 1);
        if (sim1Evoucher) {
          setSim1EvoucherBalance({
            id: sim1Evoucher.id,
            balance: sim1Evoucher.balance,
            balance_type: 'evoucher',
            balance_source: (sim1Evoucher.balance_source as 'manual' | 'sms' | 'ussd') || 'manual',
            last_updated: sim1Evoucher.last_updated
          });
        }

        // SIM 2 EVC Plus balance
        const sim2Evc = balances.find(b => b.balance_type === 'evc_plus' && b.sim_slot === 2);
        if (sim2Evc) {
          setSim2EvcBalance({
            id: sim2Evc.id,
            balance: sim2Evc.balance,
            balance_type: 'evc_plus',
            balance_source: (sim2Evc.balance_source as 'manual' | 'sms' | 'ussd') || 'manual',
            last_updated: sim2Evc.last_updated
          });
        }

        // SIM 2 E-Voucher balance
        const sim2Evoucher = balances.find(b => b.balance_type === 'evoucher' && b.sim_slot === 2);
        if (sim2Evoucher) {
          setSim2EvoucherBalance({
            id: sim2Evoucher.id,
            balance: sim2Evoucher.balance,
            balance_type: 'evoucher',
            balance_source: (sim2Evoucher.balance_source as 'manual' | 'sms' | 'ussd') || 'manual',
            last_updated: sim2Evoucher.last_updated
          });
        }

        // Handle legacy balance without sim_slot (default to SIM 1)
        const legacyEvc = balances.find(b => b.balance_type === 'evc_plus' && !b.sim_slot);
        if (legacyEvc && !sim1Evc) {
          setSim1EvcBalance({
            id: legacyEvc.id,
            balance: legacyEvc.balance,
            balance_type: 'evc_plus',
            balance_source: (legacyEvc.balance_source as 'manual' | 'sms' | 'ussd') || 'manual',
            last_updated: legacyEvc.last_updated
          });
        }

        const legacyEvoucher = balances.find(b => b.balance_type === 'evoucher' && !b.sim_slot);
        if (legacyEvoucher && !sim1Evoucher) {
          setSim1EvoucherBalance({
            id: legacyEvoucher.id,
            balance: legacyEvoucher.balance,
            balance_type: 'evoucher',
            balance_source: (legacyEvoucher.balance_source as 'manual' | 'sms' | 'ussd') || 'manual',
            last_updated: legacyEvoucher.last_updated
          });
        }
      }
    } catch (error) {
      console.error('Error loading balances:', error);
    }
  };

  const loadSimData = async (showSkeleton = false) => {
    try {
      if (showSkeleton) {
        setInitialLoading(true);
      }

      // Check online status (last ping within 3 minutes - matches threshold on line 139)
      const threeMinutesAgo = new Date(Date.now() - 3 * 60 * 1000).toISOString();
      setIsOnline(sim.last_ping_at ? new Date(sim.last_ping_at) > new Date(threeMinutesAgo) : false);

      // Fetch evoucher rates for all providers
      const { data: providerConfigs } = await supabase
        .from('providers_config')
        .select('provider_name, evoucher_rate');
      
      const evoucherRates = new Map<string, number>();
      providerConfigs?.forEach(p => {
        evoucherRates.set(p.provider_name.toLowerCase(), Number(p.evoucher_rate) || 0);
      });

      // Load deliveries for this SIM - ONLY DELIVERED orders
      const { data: deliveries } = await supabase
        .from('delivery_queue')
        .select(`
          *,
          order:orders!inner(
            selling_price,
            delivered_at,
            delivery_status,
            data_packages_config!inner(cost_price)
          )
        `)
        .eq('android_device_id', sim.device_id)
        .eq('status', 'completed');

      // Filter to only delivered orders
      const deliveredOrders = deliveries?.filter(d => {
        const order = d.order as any;
        return order?.delivery_status === 'delivered';
      }) || [];

      // Calculate period-based data using delivered_at
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
      const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
      const yearAgo = new Date(today.getTime() - 365 * 24 * 60 * 60 * 1000);

      const calculatePeriodData = (startDate: Date): PeriodData => {
        const periodDeliveries = deliveredOrders.filter(d => {
          const order = d.order as any;
          const deliveredAt = order?.delivered_at;
          return deliveredAt && new Date(deliveredAt) >= startDate;
        });

        const revenue = periodDeliveries.reduce((sum, d) => {
          const order = d.order as any;
          return sum + Number(order?.selling_price || 0);
        }, 0);

        const cost = periodDeliveries.reduce((sum, d) => {
          const order = d.order as any;
          const pkg = order?.data_packages_config;
          return sum + Number(pkg?.cost_price || 0);
        }, 0);

        // Calculate profit using evoucher rate: (selling_price × (1 + evoucher_rate)) - cost_price
        const profit = periodDeliveries.reduce((sum, d) => {
          const deliveryProvider = (d.provider_name || '').toLowerCase();
          const evoucherRate = evoucherRates.get(deliveryProvider) || 0;
          const order = d.order as any;
          const sellingPrice = Number(order?.selling_price || 0);
          const costPrice = Number(order?.data_packages_config?.cost_price || 0);
          const commission = sellingPrice * evoucherRate;
          const totalReceived = sellingPrice + commission;
          return sum + (totalReceived - costPrice);
        }, 0);

        return {
          revenue,
          cost,
          profit,
          orders: periodDeliveries.length,
        };
      };

      setDailyData(calculatePeriodData(today));
      setWeeklyData(calculatePeriodData(weekAgo));
      setMonthlyData(calculatePeriodData(monthAgo));
      setYearlyData(calculatePeriodData(yearAgo));

      // Load all balances for this SIM
      const { data: balances, error: balanceError } = await supabase
        .from("sim_balances")
        .select("*")
        .eq("device_id", sim.id);

      if (balanceError && balanceError.code !== 'PGRST116') {
        throw balanceError;
      }

      if (balances) {
        // SIM 1 EVC Plus balance
        const sim1Evc = balances.find(b => b.balance_type === 'evc_plus' && b.sim_slot === 1);
        if (sim1Evc) {
          setSim1EvcBalance({
            id: sim1Evc.id,
            balance: sim1Evc.balance,
            balance_type: 'evc_plus',
            balance_source: (sim1Evc.balance_source as 'manual' | 'sms' | 'ussd') || 'manual',
            last_updated: sim1Evc.last_updated
          });
        }

        // SIM 1 E-Voucher balance
        const sim1Evoucher = balances.find(b => b.balance_type === 'evoucher' && b.sim_slot === 1);
        if (sim1Evoucher) {
          setSim1EvoucherBalance({
            id: sim1Evoucher.id,
            balance: sim1Evoucher.balance,
            balance_type: 'evoucher',
            balance_source: (sim1Evoucher.balance_source as 'manual' | 'sms' | 'ussd') || 'manual',
            last_updated: sim1Evoucher.last_updated
          });
        }

        // SIM 2 EVC Plus balance
        const sim2Evc = balances.find(b => b.balance_type === 'evc_plus' && b.sim_slot === 2);
        if (sim2Evc) {
          setSim2EvcBalance({
            id: sim2Evc.id,
            balance: sim2Evc.balance,
            balance_type: 'evc_plus',
            balance_source: (sim2Evc.balance_source as 'manual' | 'sms' | 'ussd') || 'manual',
            last_updated: sim2Evc.last_updated
          });
        }

        // SIM 2 E-Voucher balance
        const sim2Evoucher = balances.find(b => b.balance_type === 'evoucher' && b.sim_slot === 2);
        if (sim2Evoucher) {
          setSim2EvoucherBalance({
            id: sim2Evoucher.id,
            balance: sim2Evoucher.balance,
            balance_type: 'evoucher',
            balance_source: (sim2Evoucher.balance_source as 'manual' | 'sms' | 'ussd') || 'manual',
            last_updated: sim2Evoucher.last_updated
          });
        }

        // Handle legacy balance without sim_slot (default to SIM 1)
        const legacyEvc = balances.find(b => b.balance_type === 'evc_plus' && !b.sim_slot);
        if (legacyEvc && !sim1Evc) {
          setSim1EvcBalance({
            id: legacyEvc.id,
            balance: legacyEvc.balance,
            balance_type: 'evc_plus',
            balance_source: (legacyEvc.balance_source as 'manual' | 'sms' | 'ussd') || 'manual',
            last_updated: legacyEvc.last_updated
          });
        }

        const legacyEvoucher = balances.find(b => b.balance_type === 'evoucher' && !b.sim_slot);
        if (legacyEvoucher && !sim1Evoucher) {
          setSim1EvoucherBalance({
            id: legacyEvoucher.id,
            balance: legacyEvoucher.balance,
            balance_type: 'evoucher',
            balance_source: (legacyEvoucher.balance_source as 'manual' | 'sms' | 'ussd') || 'manual',
            last_updated: legacyEvoucher.last_updated
          });
        }
      }

    } catch (error) {
      console.error('Error loading SIM data:', error);
    } finally {
      setInitialLoading(false);
    }
  };


  const BalanceCard = ({ 
    title, 
    subtitle,
    balance,
    source,
    lastUpdated,
    icon: Icon,
    colorClass
  }: {
    title: string;
    subtitle: string;
    balance: number;
    source: string;
    lastUpdated: string | null;
    icon: any;
    colorClass: string;
  }) => (
    <div className={`p-4 rounded-lg border ${colorClass}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Icon className="h-5 w-5" />
          <div>
            <h3 className="font-medium">{title}</h3>
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {source === 'sms' && (
            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
              🟢 Auto SMS
            </span>
          )}
          {source === 'ussd' && (
            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
              🔵 USSD
            </span>
          )}
          {source === 'manual' && (
            <span className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full">
              ✏️ Manual
            </span>
          )}
          {!source && (
            <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">
              ⏳ {language === 'so' ? 'Sugaya SMS' : 'Awaiting SMS'}
            </span>
          )}
        </div>
      </div>
      
      <div className="flex items-center gap-3">
        <p className="text-2xl font-bold">${formatPrice(balance)}</p>
      </div>
      
      {lastUpdated ? (
        <p className="text-xs text-muted-foreground mt-2">
          {language === 'so' ? 'La cusboonaysiiyay' : 'Updated'}: {formatDistanceToNow(new Date(lastUpdated), { addSuffix: true })}
        </p>
      ) : (
        <p className="text-xs text-yellow-600 mt-2">
          {language === 'so' ? 'SMS balance-ka weli lama helin' : 'No SMS balance received yet'}
        </p>
      )}
    </div>
  );

  // Get current period data based on selection
  const getCurrentPeriodData = (): PeriodData => {
    switch (selectedPeriod) {
      case 'today': return dailyData;
      case 'weekly': return weeklyData;
      case 'monthly': return monthlyData;
      case 'yearly': return yearlyData;
    }
  };

  const periodLabels = {
    today: language === 'so' ? 'Maanta' : 'Today',
    weekly: language === 'so' ? 'Todobaad' : 'Weekly',
    monthly: language === 'so' ? 'Bil' : 'Monthly',
    yearly: language === 'so' ? 'Sanad' : 'Yearly',
  };

  const currentData = getCurrentPeriodData();

  if (initialLoading) {
    return <SimDashboardSkeleton />;
  }

  const successRate = sim.total_deliveries > 0 
    ? ((sim.total_deliveries - sim.failed_deliveries) / sim.total_deliveries * 100)
    : 0;

  return (
    <div className="space-y-6">
      {/* SIM Info Header */}
      <Card className="border-primary/20">
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <CardTitle className="text-2xl">{sim.device_name}</CardTitle>
                {isOnline ? (
                  <span className="h-3 w-3 rounded-full bg-green-500 animate-pulse" title="Online" />
                ) : (
                  <span className="h-3 w-3 rounded-full bg-red-500" title="Offline" />
                )}
              </div>
              <CardDescription className="text-base mt-2">
                SIM: {sim.sim_number} | {sim.sim1_provider || sim.provider_name}
              </CardDescription>
              {sim.last_ping_at && (
                <p className="text-sm text-muted-foreground mt-1">
                  {language === 'so' ? 'Markii ugu dambeysay' : 'Last seen'}:{' '}
                  {formatDistanceToNow(new Date(sim.last_ping_at), { addSuffix: true })}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button 
                size="sm" 
                variant="outline" 
                onClick={async () => {
                  setRefreshing(true);
                  await loadSimData();
                  setRefreshing(false);
                  toast({
                    title: language === 'so' ? 'Cusboonaysiisay' : 'Refreshed',
                    description: language === 'so' ? 'Xogta waa la cusboonaysiiyay' : 'Data refreshed successfully',
                  });
                }}
                disabled={refreshing}
              >
                <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              </Button>
              <div className={`px-3 py-1 rounded-full text-sm ${sim.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                {sim.is_active ? (language === 'so' ? 'Firfircoon' : 'Active') : (language === 'so' ? 'Ma shaqeynayo' : 'Inactive')}
              </div>
              <Button size="sm" variant="outline" onClick={() => setEditDialogOpen(true)}>
                <Edit className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="outline" onClick={() => setDeleteDialogOpen(true)}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* SIM 1 Balance Cards */}
          <div className="mb-6">
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-primary"></span>
              SIM 1 - {sim.sim1_provider || sim.provider_name}
            </h3>
            <div className="grid grid-cols-2 gap-2 md:gap-4">
              <BalanceCard
                title="EVC Plus"
                subtitle={language === 'so' ? 'Lacagta la qabatay' : 'Received Payments'}
                balance={sim1EvcBalance.balance}
                source={sim1EvcBalance.balance_source}
                lastUpdated={sim1EvcBalance.last_updated}
                icon={Wallet}
                colorClass="bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-800"
              />
              
              <BalanceCard
                title={(sim.sim1_provider || sim.provider_name || '').toLowerCase().includes('somnet') ? 'Jeeb' : 'E-Voucher'}
                subtitle={language === 'so' ? 'Lacagta Xirmooyinka' : 'Package Credit'}
                balance={sim1EvoucherBalance.balance}
                source={sim1EvoucherBalance.balance_source}
                lastUpdated={sim1EvoucherBalance.last_updated}
                icon={CreditCard}
                colorClass="bg-blue-50 border-blue-200 dark:bg-blue-950/20 dark:border-blue-800"
              />
            </div>
          </div>

          {/* SIM 2 Balance Cards - Only show if SIM 2 exists */}
          {sim.sim2_provider && (
            <div className="mb-6">
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-orange-500"></span>
                SIM 2 - {sim.sim2_provider}
              </h3>
              <div className="grid grid-cols-2 gap-2 md:gap-4">
                <BalanceCard
                  title="EVC Plus"
                  subtitle={language === 'so' ? 'Lacagta la qabatay' : 'Received Payments'}
                  balance={sim2EvcBalance.balance}
                  source={sim2EvcBalance.balance_source}
                  lastUpdated={sim2EvcBalance.last_updated}
                  icon={Wallet}
                  colorClass="bg-emerald-50 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-800"
                />
                
                <BalanceCard
                  title={(sim.sim2_provider || '').toLowerCase().includes('somnet') ? 'Jeeb' : 'E-Voucher'}
                  subtitle={language === 'so' ? 'Lacagta Xirmooyinka' : 'Package Credit'}
                  balance={sim2EvoucherBalance.balance}
                  source={sim2EvoucherBalance.balance_source}
                  lastUpdated={sim2EvoucherBalance.last_updated}
                  icon={CreditCard}
                  colorClass="bg-indigo-50 border-indigo-200 dark:bg-indigo-950/20 dark:border-indigo-800"
                />
              </div>
            </div>
          )}

          {/* Period Filter Tabs */}
          <div className="flex gap-2 mb-4">
            {(['today', 'weekly', 'monthly', 'yearly'] as const).map((period) => (
              <Button
                key={period}
                variant={selectedPeriod === period ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedPeriod(period)}
                className="flex-1 sm:flex-none"
              >
                {periodLabels[period]}
              </Button>
            ))}
          </div>

          {/* Simple 4 Stats Cards */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            {/* Dakhli (Revenue) */}
            <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
              <p className="text-sm text-muted-foreground mb-1">
                {language === 'so' ? 'Dakhli' : 'Revenue'}
              </p>
              <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                ${formatPrice(currentData.revenue)}
              </p>
            </div>

            {/* Kharash (Cost) */}
            <div className="p-4 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800">
              <p className="text-sm text-muted-foreground mb-1">
                {language === 'so' ? 'Kharash' : 'Cost'}
              </p>
              <p className="text-2xl font-bold text-red-600 dark:text-red-400">
                ${formatPrice(currentData.cost)}
              </p>
            </div>

            {/* Faa'iido (Profit) */}
            <div className="p-4 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800">
              <p className="text-sm text-muted-foreground mb-1">
                {language === 'so' ? "Faa'iido" : 'Profit'}
              </p>
              <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                ${formatPrice(currentData.profit)}
              </p>
            </div>

            {/* Dalabyo (Orders) */}
            <div className="p-4 rounded-lg bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800">
              <p className="text-sm text-muted-foreground mb-1">
                {language === 'so' ? 'Dalabyo' : 'Orders'}
              </p>
              <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                {currentData.orders}
              </p>
            </div>
          </div>

          {/* Performance Stats */}
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-3 bg-muted/50 rounded-lg">
              <div className="text-2xl font-bold">{sim.total_deliveries}</div>
              <div className="text-xs text-muted-foreground">
                {language === 'so' ? 'Wadarta' : 'Total Deliveries'}
              </div>
            </div>
            <div className="text-center p-3 bg-muted/50 rounded-lg">
              <div className="text-2xl font-bold text-destructive">{sim.failed_deliveries}</div>
              <div className="text-xs text-muted-foreground">
                {language === 'so' ? 'Fashilmay' : 'Failed'}
              </div>
            </div>
            <div className="text-center p-3 bg-muted/50 rounded-lg">
              <div className="text-2xl font-bold text-green-600">{successRate.toFixed(1)}%</div>
              <div className="text-xs text-muted-foreground">
                {language === 'so' ? 'Guul' : 'Success Rate'}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Edit and Delete Dialogs */}
      <EditSimDialog 
        sim={sim} 
        open={editDialogOpen} 
        onOpenChange={setEditDialogOpen}
        onSuccess={onUpdate}
      />
      <DeleteSimDialog 
        sim={sim} 
        open={deleteDialogOpen} 
        onOpenChange={setDeleteDialogOpen}
        onSuccess={onUpdate}
      />
    </div>
  );
};
