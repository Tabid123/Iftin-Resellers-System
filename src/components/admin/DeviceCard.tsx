import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { DollarSign, TrendingUp, Package, Calendar, Edit, Trash2, Wallet, CreditCard, RefreshCw, Smartphone, Battery, BatteryLow, BatteryMedium, BatteryFull, BatteryCharging, Plus, Star } from 'lucide-react';
import { formatPrice } from '@/lib/utils';
import { useLanguage } from '@/contexts/LanguageContext';
import { toast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';
import { EditSimDialog } from './EditSimDialog';
import { EditSim2Dialog } from './EditSim2Dialog';
import { DeleteSimDialog } from './DeleteSimDialog';
import { AddManualDeliveryDialog } from './AddManualDeliveryDialog';


// Skeleton component for DeviceCard
const DeviceCardSkeleton = () => (
  <Card className="border-primary/20">
    <CardHeader className="pb-3">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-lg" />
          <div>
            <Skeleton className="h-6 w-32 mb-2" />
            <Skeleton className="h-4 w-48" />
          </div>
        </div>
        <Skeleton className="h-8 w-8 rounded" />
      </div>
    </CardHeader>
    <CardContent>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[1, 2].map((i) => (
          <div key={i} className="p-4 rounded-lg border space-y-3">
            <div className="flex items-center justify-between">
              <Skeleton className="h-5 w-28" />
              <div className="flex gap-1">
                <Skeleton className="h-7 w-7" />
                <Skeleton className="h-7 w-7" />
              </div>
            </div>
            <Skeleton className="h-4 w-32" />
            <div className="space-y-2 border-t pt-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
            </div>
            <div className="grid grid-cols-3 gap-2 pt-3 border-t">
              <Skeleton className="h-16 rounded" />
              <Skeleton className="h-16 rounded" />
              <Skeleton className="h-16 rounded" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Skeleton className="h-16 rounded" />
              <Skeleton className="h-16 rounded" />
            </div>
          </div>
        ))}
      </div>
    </CardContent>
  </Card>
);
interface SimDevice {
  id: string;
  device_id: string;
  device_name: string;
  sim_number: string;
  sim2_number: string | null;
  provider_name: string;
  sim1_provider: string | null;
  sim2_provider: string | null;
  is_active: boolean;
  is_primary_hormuud_sim?: boolean;
  total_deliveries: number;
  failed_deliveries: number;
  last_ping_at: string | null;
}

interface BalanceData {
  id: string | null;
  balance: number;
  balance_type: 'evc_plus' | 'evoucher' | 'manual';
  balance_source: 'manual' | 'sms' | 'ussd';
  last_updated: string | null;
  sim_slot: number;
}

interface PeriodData {
  revenue: number;
  cost: number;
  profit: number;
  orders: number;
}

interface SimStats {
  evc: BalanceData;
  evoucher: BalanceData;
  dailyData: PeriodData;
  weeklyData: PeriodData;
  monthlyData: PeriodData;
  yearlyData: PeriodData;
}

// SIM 2 specific stats (may not have EVC for non-Hormuud providers)
interface Sim2Stats {
  evc: BalanceData | null;  // null for non-Hormuud providers
  evoucher: BalanceData;
  dailyData: PeriodData;
  weeklyData: PeriodData;
  monthlyData: PeriodData;
  yearlyData: PeriodData;
}

type PeriodType = 'today' | 'weekly' | 'monthly' | 'yearly';

interface DeviceGroup {
  device_id: string;
  device_name: string;
  sims: SimDevice[];
}

interface DeviceCardProps {
  device: DeviceGroup;
  onUpdate: () => void;
}

export const DeviceCard = ({ device, onUpdate }: DeviceCardProps) => {
  const { language } = useLanguage();
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isOnline, setIsOnline] = useState(false);
  const [lastPingTime, setLastPingTime] = useState<string | null>(null);
  const [batteryLevel, setBatteryLevel] = useState<number | null>(null);
  const [isCharging, setIsCharging] = useState(false);
  const [simStats, setSimStats] = useState<Map<string, SimStats>>(new Map());
  const [sim2Stats, setSim2Stats] = useState<Map<string, Sim2Stats>>(new Map());
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editSim2DialogOpen, setEditSim2DialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodType>('today');
  
  const [selectedSimForEdit, setSelectedSimForEdit] = useState<SimDevice | null>(null);
  const [selectedSimForSim2Edit, setSelectedSimForSim2Edit] = useState<SimDevice | null>(null);
  const [selectedSimForDelete, setSelectedSimForDelete] = useState<SimDevice | null>(null);
  
  // Manual delivery dialog state
  const [manualDeliveryDialogOpen, setManualDeliveryDialogOpen] = useState(false);
  const [manualDeliverySimSlot, setManualDeliverySimSlot] = useState<1 | 2>(1);
  const [manualDeliveryProvider, setManualDeliveryProvider] = useState('');

  const periodLabels = {
    today: language === 'so' ? 'Maanta' : 'Today',
    weekly: language === 'so' ? 'Todobaad' : 'Weekly',
    monthly: language === 'so' ? 'Bil' : 'Monthly',
    yearly: language === 'so' ? 'Sanad' : 'Yearly',
  };

  const getPeriodData = (stats: SimStats | Sim2Stats | undefined) => {
    if (!stats) return { revenue: 0, cost: 0, profit: 0, orders: 0 };
    switch (selectedPeriod) {
      case 'today': return stats.dailyData;
      case 'weekly': return stats.weeklyData;
      case 'monthly': return stats.monthlyData;
      case 'yearly': return stats.yearlyData;
    }
  };

  useEffect(() => {
    loadDeviceData(true);

    // Real-time subscriptions - PATCH state directly, no full refetch
    const channels = device.sims.map((sim, index) => {
      return supabase
        .channel(`device-balances-${device.device_id}-${index}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'sim_balances',
            filter: `device_id=eq.${sim.id}`
          },
          (payload) => {
            console.log(`💰 Balance patch for SIM ${index + 1}:`, payload);
            if (payload.eventType === 'DELETE') return;
            const bal = payload.new as any;
            const simSlot = bal.sim_slot || 1;
            const newBalData = {
              id: bal.id,
              balance: bal.balance,
              balance_type: bal.balance_type as 'evc_plus' | 'evoucher' | 'manual',
              balance_source: (bal.balance_source || 'manual') as 'manual' | 'sms' | 'ussd',
              last_updated: bal.last_updated,
              sim_slot: simSlot,
            };
            
            if (simSlot === 1) {
              setSimStats(prev => {
                const updated = new Map(prev);
                const existing = updated.get(sim.id);
                if (existing) {
                  if (bal.balance_type === 'evc_plus' || bal.balance_type === 'manual') {
                    updated.set(sim.id, { ...existing, evc: newBalData });
                  } else if (bal.balance_type === 'evoucher') {
                    updated.set(sim.id, { ...existing, evoucher: newBalData });
                  }
                }
                return updated;
              });
            } else if (simSlot === 2) {
              setSim2Stats(prev => {
                const updated = new Map(prev);
                const existing = updated.get(sim.id);
                if (existing) {
                  if (bal.balance_type === 'evc_plus') {
                    updated.set(sim.id, { ...existing, evc: newBalData });
                  } else if (bal.balance_type === 'evoucher') {
                    updated.set(sim.id, { ...existing, evoucher: newBalData });
                  }
                }
                return updated;
              });
            }
          }
        )
        .subscribe();
    });

    // Device status updates - patch lastPingTime and batteryLevel directly
    const deviceChannel = supabase
      .channel(`device-status-${device.device_id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'android_devices',
          filter: `device_id=eq.${device.device_id}`
        },
        (payload) => {
          console.log(`📱 Device status patch:`, payload);
          const updated = payload.new as any;
          if (updated.last_ping_at) {
            setLastPingTime(updated.last_ping_at);
          }
          if (typeof updated.battery_level === 'number') {
            setBatteryLevel(updated.battery_level);
          }
          if (typeof updated.is_charging === 'boolean') {
            setIsCharging(updated.is_charging);
          }
          // Immediately check online status
          const threeMinutesAgo = new Date(Date.now() - 3 * 60 * 1000);
          setIsOnline(updated.last_ping_at ? new Date(updated.last_ping_at) > threeMinutesAgo : false);
        }
      )
      .subscribe();

    return () => {
      channels.forEach(channel => supabase.removeChannel(channel));
      supabase.removeChannel(deviceChannel);
    };
  }, [device.device_id]);

  // Local-only 30s online status check (0 egress - just compares state to Date.now())
  useEffect(() => {
    const checkOnlineStatus = () => {
      const threeMinutesAgo = new Date(Date.now() - 3 * 60 * 1000);
      setIsOnline(lastPingTime ? new Date(lastPingTime) > threeMinutesAgo : false);
    };
    checkOnlineStatus();
    const interval = setInterval(checkOnlineStatus, 30000);
    return () => clearInterval(interval);
  }, [lastPingTime]);

  const loadDeviceData = async (showSkeleton = false) => {
    if (showSkeleton) {
      setInitialLoading(true);
    }
    try {
      // Fetch fresh device data from database for accurate online status
      // Filter out archived devices to avoid duplicate conflicts
      const { data: freshDevice } = await supabase
        .from('android_devices')
        .select('last_ping_at, battery_level, is_charging')
        .eq('device_id', device.device_id)
        .is('archived_at', null)
        .maybeSingle();

      // Check online status using fresh data from database
      // Use 3 minutes threshold to reduce false offline events
      const threeMinutesAgo = new Date(Date.now() - 3 * 60 * 1000).toISOString();
      const lastPing = freshDevice?.last_ping_at || device.sims[0]?.last_ping_at;
      const deviceIsOnline = lastPing ? new Date(lastPing) > new Date(threeMinutesAgo) : false;
      setIsOnline(deviceIsOnline);
      
      // Update last ping and battery level display
      if (freshDevice?.last_ping_at) {
        setLastPingTime(freshDevice.last_ping_at);
      }
      if (typeof freshDevice?.battery_level === 'number') {
        setBatteryLevel(freshDevice.battery_level);
      }
      if (typeof freshDevice?.is_charging === 'boolean') {
        setIsCharging(freshDevice.is_charging);
      }

      console.log(`📱 Device ${device.device_name} online check:`, {
        lastPing,
        threeMinutesAgo,
        isOnline: deviceIsOnline
      });

      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
      const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
      const yearAgo = new Date(today.getTime() - 365 * 24 * 60 * 60 * 1000);

      // Fetch evoucher rates for all providers
      const { data: providerConfigs } = await supabase
        .from('providers_config')
        .select('provider_name, evoucher_rate');
      
      const evoucherRates = new Map<string, number>();
      providerConfigs?.forEach(p => {
        evoucherRates.set(p.provider_name.toLowerCase(), Number(p.evoucher_rate) || 0);
      });

      const statsMap = new Map<string, SimStats>();
      const sim2StatsMap = new Map<string, Sim2Stats>();

      for (const sim of device.sims) {
        // Load balances for this SIM - now filtering by sim_slot
        const { data: balances } = await supabase
          .from('sim_balances')
          .select('*')
          .eq('device_id', sim.id);

        // SIM 1 balances (sim_slot = 1 or null for backwards compatibility)
        const sim1Balances = balances?.filter(b => !b.sim_slot || b.sim_slot === 1) || [];
        const evc = sim1Balances.find(b => b.balance_type === 'evc_plus');
        const evoucher = sim1Balances.find(b => b.balance_type === 'evoucher');
        const manual = sim1Balances.find(b => b.balance_type === 'manual');

        // SIM 2 balances (sim_slot = 2)
        const sim2Balances = balances?.filter(b => b.sim_slot === 2) || [];
        const sim2Evc = sim2Balances.find(b => b.balance_type === 'evc_plus');
        const sim2Evoucher = sim2Balances.find(b => b.balance_type === 'evoucher');

        // Load deliveries for this SIM
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

        // Filter to only orders that went through THIS specific SIM
        const allDeliveries = deliveries?.filter(d => {
          const order = d.order as any;
          return order?.delivery_status === 'delivered';
        }) || [];

        // Get provider names for filtering
        const sim1ProviderName = (sim.sim1_provider || sim.provider_name || '').toLowerCase();
        const sim2ProviderName = (sim.sim2_provider || '').toLowerCase();

        // Filter deliveries by provider_name instead of sim_slot (more accurate)
        const sim1Deliveries = allDeliveries.filter(d => {
          const deliveryProvider = (d.provider_name || '').toLowerCase();
          return deliveryProvider === sim1ProviderName;
        });
        
        const sim2Deliveries = allDeliveries.filter(d => {
          const deliveryProvider = (d.provider_name || '').toLowerCase();
          return deliveryProvider === sim2ProviderName;
        });

        // Get evoucher rates for each SIM's provider
        const sim1EvoucherRate = evoucherRates.get(sim1ProviderName) || 0;
        const sim2EvoucherRate = evoucherRates.get(sim2ProviderName) || 0;

        const calculatePeriodData = (deliveriesList: any[], startDate: Date, evoucherRate: number): PeriodData => {
          const periodDeliveries = deliveriesList.filter(d => {
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
            const order = d.order as any;
            const sellingPrice = Number(order?.selling_price || 0);
            const costPrice = Number(order?.data_packages_config?.cost_price || 0);
            const commission = sellingPrice * evoucherRate;
            const totalReceived = sellingPrice + commission;
            return sum + (totalReceived - costPrice);
          }, 0);

          return { revenue, cost, profit, orders: periodDeliveries.length };
        };

        // SIM 1 Stats
        statsMap.set(sim.id, {
          evc: evc ? {
            id: evc.id,
            balance: evc.balance,
            balance_type: 'evc_plus',
            balance_source: (evc.balance_source as 'manual' | 'sms' | 'ussd') || 'manual',
            last_updated: evc.last_updated,
            sim_slot: 1
          } : (manual ? {
            id: manual.id,
            balance: manual.balance,
            balance_type: 'evc_plus',
            balance_source: 'manual',
            last_updated: manual.last_updated,
            sim_slot: 1
          } : { id: null, balance: 0, balance_type: 'evc_plus', balance_source: 'manual', last_updated: null, sim_slot: 1 }),
          evoucher: evoucher ? {
            id: evoucher.id,
            balance: evoucher.balance,
            balance_type: 'evoucher',
            balance_source: (evoucher.balance_source as 'manual' | 'sms' | 'ussd') || 'manual',
            last_updated: evoucher.last_updated,
            sim_slot: 1
          } : { id: null, balance: 0, balance_type: 'evoucher', balance_source: 'manual', last_updated: null, sim_slot: 1 },
          dailyData: calculatePeriodData(sim1Deliveries, today, sim1EvoucherRate),
          weeklyData: calculatePeriodData(sim1Deliveries, weekAgo, sim1EvoucherRate),
          monthlyData: calculatePeriodData(sim1Deliveries, monthAgo, sim1EvoucherRate),
          yearlyData: calculatePeriodData(sim1Deliveries, yearAgo, sim1EvoucherRate),
        });

        // SIM 2 Stats - All providers need EVC Plus balance loaded
        sim2StatsMap.set(sim.id, {
          evc: sim2Evc ? {
            id: sim2Evc.id,
            balance: sim2Evc.balance,
            balance_type: 'evc_plus',
            balance_source: (sim2Evc.balance_source as 'manual' | 'sms' | 'ussd') || 'manual',
            last_updated: sim2Evc.last_updated,
            sim_slot: 2
          } : { id: null, balance: 0, balance_type: 'evc_plus', balance_source: 'manual', last_updated: null, sim_slot: 2 },
          evoucher: sim2Evoucher ? {
            id: sim2Evoucher.id,
            balance: sim2Evoucher.balance,
            balance_type: 'evoucher',
            balance_source: (sim2Evoucher.balance_source as 'manual' | 'sms' | 'ussd') || 'manual',
            last_updated: sim2Evoucher.last_updated,
            sim_slot: 2
          } : { id: null, balance: 0, balance_type: 'evoucher', balance_source: 'manual', last_updated: null, sim_slot: 2 },
          dailyData: calculatePeriodData(sim2Deliveries, today, sim2EvoucherRate),
          weeklyData: calculatePeriodData(sim2Deliveries, weekAgo, sim2EvoucherRate),
          monthlyData: calculatePeriodData(sim2Deliveries, monthAgo, sim2EvoucherRate),
          yearlyData: calculatePeriodData(sim2Deliveries, yearAgo, sim2EvoucherRate),
        });
      }

      setSimStats(statsMap);
      setSim2Stats(sim2StatsMap);
    } catch (error) {
      console.error('Error loading device data:', error);
    } finally {
      setInitialLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadDeviceData();
    setRefreshing(false);
    toast({
      title: language === 'so' ? 'Cusboonaysiisay' : 'Refreshed',
      description: language === 'so' ? 'Xogta waa la cusboonaysiiyay' : 'Data refreshed successfully',
    });
  };

  const BalanceRow = ({ 
    title, 
    balance, 
    source, 
    icon: Icon 
  }: { 
    title: string; 
    balance: number; 
    source: string; 
    icon: any 
  }) => (
    <div className="flex items-center justify-between py-1">
      <div className="flex items-center gap-2 text-sm">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span>{title}:</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="font-semibold">${formatPrice(balance)}</span>
        {source === 'sms' && <span className="text-xs text-green-600">🟢</span>}
        {source === 'ussd' && <span className="text-xs text-blue-600">🔵</span>}
      </div>
    </div>
  );

  if (initialLoading) {
    return <DeviceCardSkeleton />;
  }

  // Use the state lastPingTime for real-time updates, fallback to prop
  const displayLastPing = lastPingTime || device.sims
    .map(s => s.last_ping_at)
    .filter(Boolean)
    .sort((a, b) => new Date(b!).getTime() - new Date(a!).getTime())[0];

  return (
    <Card className="border-primary/20">
      <CardHeader className="p-3 md:p-6 pb-2 md:pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 md:gap-3 min-w-0">
            <div className="p-1.5 md:p-2 rounded-lg bg-primary/10 shrink-0">
              <Smartphone className="h-4 w-4 md:h-6 md:w-6 text-primary" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 md:gap-2 flex-wrap">
                <CardTitle className="text-base md:text-xl truncate">{device.device_name}</CardTitle>
                {isOnline ? (
                  <div className="flex items-center gap-1">
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
                    </span>
                    <span className="text-[10px] md:text-xs text-green-600 font-medium">Live</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1">
                    <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
                    <span className="text-[10px] md:text-xs text-red-600">Offline</span>
                  </div>
                )}
                {batteryLevel !== null && (
                  <div className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-muted">
                    {isCharging ? (
                      <BatteryCharging className="h-3.5 w-3.5 text-green-500" />
                    ) : batteryLevel <= 20 ? (
                      <BatteryLow className="h-3.5 w-3.5 text-destructive" />
                    ) : batteryLevel <= 50 ? (
                      <BatteryMedium className="h-3.5 w-3.5 text-yellow-500" />
                    ) : (
                      <BatteryFull className="h-3.5 w-3.5 text-green-500" />
                    )}
                    <span className={`text-[10px] md:text-xs font-medium ${
                      batteryLevel <= 20 && !isCharging ? 'text-destructive' : 
                      batteryLevel <= 50 ? 'text-yellow-600' : 'text-green-600'
                    }`}>
                      {batteryLevel}%{isCharging ? ' ⚡' : ''}
                    </span>
                  </div>
                )}
              </div>
              <CardDescription className="text-[10px] md:text-sm">
                {device.sims[0]?.sim1_provider && device.sims[0]?.sim2_provider ? '2 SIMs' : '1 SIM'} • {device.device_id.slice(0, 8)}...
              </CardDescription>
              {displayLastPing && (
                <p className="text-[10px] md:text-xs text-muted-foreground mt-0.5">
                  {language === 'so' ? 'Markii ugu dambeysay' : 'Last seen'}:{' '}
                  {formatDistanceToNow(new Date(displayLastPing), { addSuffix: true })}
                </p>
              )}
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={handleRefresh} disabled={refreshing} className="h-7 w-7 p-0 md:h-8 md:w-8 shrink-0">
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="p-3 md:p-6 pt-0 space-y-3 md:space-y-4">
        {/* Primary Hormuud SIM toggle — only show if any SIM is Hormuud */}
        {device.sims.some(s => {
          const p1 = (s.sim1_provider || s.provider_name || '').toLowerCase();
          const p2 = (s.sim2_provider || '').toLowerCase();
          return p1.includes('hormuud') || p2.includes('hormuud');
        }) && (
          <div className="flex items-center justify-between gap-2 p-2.5 rounded-lg border border-primary/30 bg-primary/5">
            <div className="flex items-center gap-2 min-w-0">
              <Star className="h-4 w-4 text-primary shrink-0" />
              <div className="min-w-0">
                <div className="text-xs md:text-sm font-medium truncate">
                  {language === 'so' ? 'Hormuud E-Voucher SIM-ka Aasaasiga ah' : 'Primary Hormuud E-Voucher SIM'}
                </div>
                <div className="text-[10px] md:text-xs text-muted-foreground truncate">
                  {language === 'so'
                    ? 'Dhammaan dalabaadka Hormuud waxay ka bixi doonaan SIM-kan'
                    : 'All Hormuud orders will be sent from this SIM'}
                </div>
              </div>
            </div>
            <Switch
              checked={!!device.sims[0]?.is_primary_hormuud_sim}
              onCheckedChange={async (checked) => {
                try {
                  if (checked) {
                    // Clear all other primaries first (UNIQUE index ensures only one)
                    await supabase
                      .from('android_devices')
                      .update({ is_primary_hormuud_sim: false })
                      .eq('is_primary_hormuud_sim', true);
                  }
                  const { error } = await supabase
                    .from('android_devices')
                    .update({ is_primary_hormuud_sim: checked })
                    .eq('id', device.sims[0].id);
                  if (error) throw error;
                  toast({
                    title: language === 'so' ? 'Guul' : 'Success',
                    description: checked
                      ? (language === 'so'
                          ? 'Aaladdan hadda waa Primary Hormuud SIM-ka'
                          : 'This device is now the Primary Hormuud SIM')
                      : (language === 'so'
                          ? 'Primary Hormuud SIM-ka waa la dami yay'
                          : 'Primary Hormuud SIM disabled'),
                  });
                  onUpdate();
                } catch (err: any) {
                  toast({
                    title: language === 'so' ? 'Khalad' : 'Error',
                    description: err?.message || 'Failed to update',
                    variant: 'destructive',
                  });
                }
              }}
            />
          </div>
        )}

        {/* Period Filter Tabs */}
        <div className="flex gap-1.5 md:gap-2">
          {(['today', 'weekly', 'monthly', 'yearly'] as const).map((period) => (
            <Button
              key={period}
              variant={selectedPeriod === period ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedPeriod(period)}
              className="flex-1 h-7 md:h-8 text-[10px] md:text-xs px-1 md:px-3"
            >
              {periodLabels[period]}
            </Button>
          ))}
        </div>

        {/* SIM Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
        {device.sims.map((sim) => {
            const stats = simStats.get(sim.id);
            const currentPeriodData = getPeriodData(stats);
            const successRate = sim.total_deliveries > 0
              ? ((sim.total_deliveries - sim.failed_deliveries) / sim.total_deliveries * 100)
              : 0;

            // Check if device has both SIMs configured
            const hasSim1 = !!sim.sim1_provider;
            const hasSim2 = !!sim.sim2_provider;
            
            // Check if SIM 1 provider is Hormuud (only Hormuud has EVC Plus)
            const sim1Provider = (sim.sim1_provider || sim.provider_name || '').toLowerCase();
            const isHormuudSim1 = sim1Provider.includes('hormuud');

            return (
              <React.Fragment key={sim.id}>
                {/* SIM 1 Card */}
                <div 
                  className={`p-3 md:p-4 rounded-lg border ${sim.is_active ? 'bg-card' : 'bg-muted/50 opacity-70'}`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <div className="font-medium flex items-center gap-2">
                        SIM 1: {sim.sim1_provider || sim.provider_name}
                        {!sim.is_active && (
                          <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded">
                            Inactive
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground">{sim.sim_number}</div>
                    </div>
                    <div className="flex gap-1">
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        className="h-7 w-7 text-primary"
                        title={language === 'so' ? 'Ku Dar Manual' : 'Add Manual'}
                        onClick={() => {
                          setManualDeliverySimSlot(1);
                          setManualDeliveryProvider(sim.sim1_provider || sim.provider_name);
                          setManualDeliveryDialogOpen(true);
                        }}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        className="h-7 w-7"
                        onClick={() => {
                          setSelectedSimForEdit(sim);
                          setEditDialogOpen(true);
                        }}
                      >
                        <Edit className="h-3 w-3" />
                      </Button>
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        className="h-7 w-7 text-destructive"
                        onClick={() => {
                          setSelectedSimForDelete(sim);
                          setDeleteDialogOpen(true);
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>

                  {/* Balances */}
                  <div className="space-y-1 border-t pt-2">
                    {/* Only show EVC Plus for Hormuud provider */}
                    {isHormuudSim1 && (
                      <BalanceRow
                        title="EVC Plus"
                        balance={stats?.evc.balance || 0}
                        source={stats?.evc.balance_source || 'manual'}
                        icon={Wallet}
                      />
                    )}
                    <BalanceRow
                      title="E-Voucher"
                      balance={stats?.evoucher.balance || 0}
                      source={stats?.evoucher.balance_source || 'manual'}
                      icon={CreditCard}
                    />
                  </div>

                  {/* 4 Stats Cards */}
                  <div className="grid grid-cols-2 gap-1.5 md:gap-2 mt-2 md:mt-3 pt-2 md:pt-3 border-t">
                    <div className="text-center p-1.5 md:p-2 rounded bg-blue-50 dark:bg-blue-950/30">
                      <div className="text-sm md:text-lg font-bold text-blue-600">${formatPrice(currentPeriodData.revenue)}</div>
                      <div className="text-[9px] md:text-xs text-muted-foreground">{language === 'so' ? 'Dakhli' : 'Revenue'}</div>
                    </div>
                    <div className="text-center p-1.5 md:p-2 rounded bg-red-50 dark:bg-red-950/30">
                      <div className="text-sm md:text-lg font-bold text-red-600">${formatPrice(currentPeriodData.cost)}</div>
                      <div className="text-[9px] md:text-xs text-muted-foreground">{language === 'so' ? 'Kharash' : 'Cost'}</div>
                    </div>
                    <div className="text-center p-1.5 md:p-2 rounded bg-green-50 dark:bg-green-950/30">
                      <div className="text-sm md:text-lg font-bold text-green-600">${formatPrice(currentPeriodData.profit)}</div>
                      <div className="text-[9px] md:text-xs text-muted-foreground">{language === 'so' ? "Faa'iido" : 'Profit'}</div>
                    </div>
                    <div className="text-center p-1.5 md:p-2 rounded bg-purple-50 dark:bg-purple-950/30">
                      <div className="text-sm md:text-lg font-bold text-purple-600">{currentPeriodData.orders}</div>
                      <div className="text-[9px] md:text-xs text-muted-foreground">{language === 'so' ? 'Dalabyo' : 'Orders'}</div>
                    </div>
                  </div>

                  {/* Delivery counts */}
                  <div className="flex items-center justify-between text-xs text-muted-foreground mt-2 pt-2 border-t">
                    <span>{language === 'so' ? 'La diray' : 'Delivered'}: {sim.total_deliveries}</span>
                    <span>{language === 'so' ? 'Fashilmay' : 'Failed'}: {sim.failed_deliveries}</span>
                  </div>
                </div>

                {/* SIM 2 Card - Show if sim2_provider exists */}
                {hasSim2 ? (
                  (() => {
                    const s2Stats = sim2Stats.get(sim.id);
                    const isHormuud = sim.sim2_provider?.toLowerCase().includes('hormuud');
                    const sim2PeriodData = getPeriodData(s2Stats);
                    
                    return (
                      <div className={`p-3 md:p-4 rounded-lg border ${sim.is_active ? 'bg-card' : 'bg-muted/50 opacity-70'}`}>
                        <div className="flex items-center justify-between mb-3">
                          <div>
                            <div className="font-medium flex items-center gap-2">
                              SIM 2: {sim.sim2_provider}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {sim.sim2_number || (language === 'so' ? 'Lambar la\'aan' : 'No number')}
                            </div>
                          </div>
                          <div className="flex gap-1">
                            <Button 
                              size="icon" 
                              variant="ghost" 
                              className="h-7 w-7 text-primary"
                              title={language === 'so' ? 'Ku Dar Manual' : 'Add Manual'}
                              onClick={() => {
                                setManualDeliverySimSlot(2);
                                setManualDeliveryProvider(sim.sim2_provider || '');
                                setManualDeliveryDialogOpen(true);
                              }}
                            >
                              <Plus className="h-3 w-3" />
                            </Button>
                            <Button 
                              size="icon" 
                              variant="ghost" 
                              className="h-7 w-7"
                              onClick={() => {
                                setSelectedSimForSim2Edit(sim);
                                setEditSim2DialogOpen(true);
                              }}
                            >
                              <Edit className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>

                        {/* SIM 2 Balances - Show based on provider type */}
                        <div className="space-y-1 border-t pt-2">
                          {/* Hormuud SIM 2: Show both EVC Plus and E-Voucher */}
                          {isHormuud && (
                            <>
                              <BalanceRow
                                title="EVC Plus"
                                balance={s2Stats?.evc?.balance || 0}
                                source={s2Stats?.evc?.balance_source || 'manual'}
                                icon={Wallet}
                              />
                              <BalanceRow
                                title="E-Voucher"
                                balance={s2Stats?.evoucher?.balance || 0}
                                source={s2Stats?.evoucher?.balance_source || 'manual'}
                                icon={CreditCard}
                              />
                            </>
                          )}
                          {/* Non-Hormuud SIM 2 (Somnet, Amtel, Somtel): Show Balance (E-Voucher) */}
                          {!isHormuud && (
                            <BalanceRow
                              title="Balance"
                              balance={s2Stats?.evoucher?.balance || s2Stats?.evc?.balance || 0}
                              source={s2Stats?.evoucher?.balance_source || s2Stats?.evc?.balance_source || 'manual'}
                              icon={Wallet}
                            />
                          )}
                        </div>

                        <div className="grid grid-cols-2 gap-1.5 md:gap-2 mt-2 md:mt-3 pt-2 md:pt-3 border-t">
                          <div className="text-center p-1.5 md:p-2 rounded bg-blue-50 dark:bg-blue-950/30">
                            <div className="text-sm md:text-lg font-bold text-blue-600">${formatPrice(sim2PeriodData.revenue)}</div>
                            <div className="text-[9px] md:text-xs text-muted-foreground">{language === 'so' ? 'Dakhli' : 'Revenue'}</div>
                          </div>
                          <div className="text-center p-1.5 md:p-2 rounded bg-red-50 dark:bg-red-950/30">
                            <div className="text-sm md:text-lg font-bold text-red-600">${formatPrice(sim2PeriodData.cost)}</div>
                            <div className="text-[9px] md:text-xs text-muted-foreground">{language === 'so' ? 'Kharash' : 'Cost'}</div>
                          </div>
                          <div className="text-center p-1.5 md:p-2 rounded bg-green-50 dark:bg-green-950/30">
                            <div className="text-sm md:text-lg font-bold text-green-600">${formatPrice(sim2PeriodData.profit)}</div>
                            <div className="text-[9px] md:text-xs text-muted-foreground">{language === 'so' ? "Faa'iido" : 'Profit'}</div>
                          </div>
                          <div className="text-center p-1.5 md:p-2 rounded bg-purple-50 dark:bg-purple-950/30">
                            <div className="text-sm md:text-lg font-bold text-purple-600">{sim2PeriodData.orders}</div>
                            <div className="text-[9px] md:text-xs text-muted-foreground">{language === 'so' ? 'Dalabyo' : 'Orders'}</div>
                          </div>
                        </div>
                      </div>
                    );
                  })()
                ) : (
                  <div className="p-4 rounded-lg border border-dashed flex items-center justify-center text-muted-foreground">
                    <span className="text-sm">
                      {language === 'so' ? 'SIM 2 ma jiro' : 'No SIM 2'}
                    </span>
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>
      </CardContent>

      {/* Edit/Delete Dialogs */}
      {selectedSimForEdit && (
        <EditSimDialog
          open={editDialogOpen}
          onOpenChange={setEditDialogOpen}
          sim={selectedSimForEdit}
          onSuccess={() => {
            setEditDialogOpen(false);
            setSelectedSimForEdit(null);
            onUpdate();
          }}
        />
      )}
      {selectedSimForSim2Edit && (
        <EditSim2Dialog
          open={editSim2DialogOpen}
          onOpenChange={setEditSim2DialogOpen}
          sim={selectedSimForSim2Edit}
          onSuccess={() => {
            setEditSim2DialogOpen(false);
            setSelectedSimForSim2Edit(null);
            onUpdate();
          }}
        />
      )}
      {selectedSimForDelete && (
        <DeleteSimDialog
          open={deleteDialogOpen}
          onOpenChange={setDeleteDialogOpen}
          sim={selectedSimForDelete}
          onSuccess={() => {
            setDeleteDialogOpen(false);
            setSelectedSimForDelete(null);
            onUpdate();
          }}
        />
      )}
      
      {/* Manual Delivery Dialog */}
      <AddManualDeliveryDialog
        open={manualDeliveryDialogOpen}
        onOpenChange={setManualDeliveryDialogOpen}
        deviceId={device.device_id}
        deviceName={device.device_name}
        simSlot={manualDeliverySimSlot}
        providerName={manualDeliveryProvider}
        onSuccess={() => {
          loadDeviceData(false);
          onUpdate();
        }}
      />
    </Card>
  );
};

// Utility function to group SIMs by device_id
export const groupSimsByDevice = (sims: SimDevice[]): DeviceGroup[] => {
  const deviceMap = new Map<string, DeviceGroup>();

  for (const sim of sims) {
    const existing = deviceMap.get(sim.device_id);
    if (existing) {
      existing.sims.push(sim);
    } else {
      deviceMap.set(sim.device_id, {
        device_id: sim.device_id,
        device_name: sim.device_name,
        sims: [sim]
      });
    }
  }

  return Array.from(deviceMap.values());
};
