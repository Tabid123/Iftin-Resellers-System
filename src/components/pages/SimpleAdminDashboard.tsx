import { useState, useEffect, useCallback } from 'react';

import { useNavigate } from "@/lib/router-compat";
import { supabase, getTenantId, setTenantHeader } from '@/integrations/supabase/client';
import { decideWorkspace, fetchMemberships, rememberedWorkspace } from '@/lib/workspaceMembership';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { SimpleAdminSidebar } from '@/components/admin/SimpleAdminSidebar';
import { Menu, RefreshCw, Globe, Moon, Sun, Plus, Pencil, Volume2, VolumeX, CalendarIcon, Wallet } from 'lucide-react';
import { format } from 'date-fns';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import { AddManualDeliveryDialog } from '@/components/admin/AddManualDeliveryDialog';
import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';
import najaxLogo from '@/assets/najax-logo.jpeg';
import { useTenant } from '@/contexts/TenantContext';
import { useTenantCapabilities } from '@/hooks/useTenantCapabilities';
import { prefetchAdminViews } from '@/lib/prefetchAdminViews';
import { fetchIftinWallet, type IftinWalletData } from '@/lib/iftinWallet';
import CachedImage from '@/components/CachedImage';

interface DashboardStats {
  todayOrderCount: number;
  todayFailed: number;
  todayPending: number;
  todayProfit: number;
  todayCost: number;
  todaySales: number;
  todayDelivered: number;
  failed: number;
  pending: number;
  delivered: number;
  devicesOnline: number;
}

interface SimInfo {
  sim_slot: 1 | 2;
  sim_number: string;
  provider_name: string;
  provider_logo: string | null;
  evc_balance: number;
  evoucher_balance: number;
  evoucher_rate: number;
}

interface DeviceCardData {
  device_name: string;
  device_id: string;
  is_online: boolean;
  last_ping: string | null;
  battery_level: number | null;
  is_charging: boolean;
  sims: SimInfo[];
  todayDelivered: number;
  todayFailed: number;
  todayCost: number;
  todayRevenue: number;
  todayProfit: number;
  todayOrders: number;
}

const getProviderColor = (name: string, simNumber?: string) => {
  const n = name.toLowerCase();
  if (n.includes('hormuud')) return { bg: 'bg-green-600', dark: 'bg-green-700', border: 'border-green-300' };
  if (n.includes('somnet')) return { bg: 'bg-blue-400', dark: 'bg-blue-500', border: 'border-blue-300' };
  if (n.includes('somtel')) return { bg: 'bg-yellow-500', dark: 'bg-yellow-600', border: 'border-yellow-300' };
  if (n.includes('amtel')) return { bg: 'bg-red-600', dark: 'bg-red-700', border: 'border-red-300' };
  if (n.includes('somlink')) return { bg: 'bg-purple-600', dark: 'bg-purple-700', border: 'border-purple-300' };
  if (simNumber) {
    const digits = simNumber.replace(/\D/g, '');
    const prefix = digits.startsWith('252') ? digits.slice(3, 5) : digits.slice(0, 2);
    if (prefix === '61' || prefix === '77') return { bg: 'bg-green-600', dark: 'bg-green-700', border: 'border-green-300' };
    if (prefix === '68') return { bg: 'bg-blue-400', dark: 'bg-blue-500', border: 'border-blue-300' };
    if (prefix === '62') return { bg: 'bg-yellow-500', dark: 'bg-yellow-600', border: 'border-yellow-300' };
    if (prefix === '71') return { bg: 'bg-red-600', dark: 'bg-red-700', border: 'border-red-300' };
    if (prefix === '64') return { bg: 'bg-purple-600', dark: 'bg-purple-700', border: 'border-purple-300' };
  }
  return { bg: 'bg-gray-600', dark: 'bg-gray-700', border: 'border-gray-300' };
};

const formatTimeAgo = (dateStr: string | null) => {
  if (!dateStr) return 'Never';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'less than a minute ago';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

const SimpleAdminDashboard = () => {
  const navigate = useNavigate();
  const { language, setLanguage } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const isSo = language === 'so';
  const tenantState = useTenant();
  const tenant = tenantState.tenant;
  const tenantReady = tenantState.status === 'ready' || tenantState.status === 'platform';
  const { isPartner } = useTenantCapabilities();
  const [clock, setClock] = useState(new Date());
  const [selectedPeriod, setSelectedPeriod] = useState<'today' | 'week' | 'month' | 'year'>('today');
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [stats, setStats] = useState<DashboardStats>({
    todayOrderCount: 0, todayFailed: 0, todayPending: 0, todayProfit: 0, todayCost: 0, todaySales: 0, todayDelivered: 0, failed: 0, pending: 0, delivered: 0, devicesOnline: 0
  });
  const [deviceCards, setDeviceCards] = useState<DeviceCardData[]>([]);
  const [wallet, setWallet] = useState<IftinWalletData['wallet']>({ pending: 0, available: 0, paid_out: 0 });
  const [unmatchedCount, setUnmatchedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [manualDeliveryOpen, setManualDeliveryOpen] = useState(false);
  const [selectedSimForDelivery, setSelectedSimForDelivery] = useState<{ device_id: string; device_name: string; sim_slot: 1 | 2; provider_name: string } | null>(null);
  const [notificationsEnabled, setNotificationsEnabled] = useState(() => {
    const stored = localStorage.getItem('admin_notifications_enabled');
    return stored !== 'false';
  });

  const toggleNotifications = () => {
    setNotificationsEnabled(prev => {
      const next = !prev;
      localStorage.setItem('admin_notifications_enabled', String(next));
      return next;
    });
  };

  useEffect(() => {
    const checkAuth = async () => {
      const emergency = localStorage.getItem('adminEmergencySession');
      if (emergency === 'true') return;
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate('/dashboard/login'); return; }
      const [{ data: roleData }, memberships] = await Promise.all([
        supabase.from('user_roles').select('role').eq('user_id', session.user.id)
          .in('role', ['admin', 'super_admin']).limit(1).maybeSingle(),
        fetchMemberships(session.user.id),
      ]);
      if (!roleData && memberships.length === 0) { navigate('/dashboard/login'); return; }

      const isSuperAdmin = roleData?.role === 'super_admin';
      const decision = decideWorkspace({
        memberships,
        requestedWorkspaceId: tenant?.id ?? null,
        rememberedWorkspaceId: rememberedWorkspace(),
        isSuperAdmin,
      });
      if (decision.status === 'ready') {
        if (!isSuperAdmin) setTenantHeader(decision.workspaceId);
        return;
      }
      if (decision.status === 'denied' && !isSuperAdmin) {
        await supabase.auth.signOut();
        navigate('/dashboard/login');
        return;
      }
      if (decision.status === 'choose') navigate('/dashboard/login');
    };
    checkAuth();
  }, [navigate, tenant]);

  useEffect(() => { prefetchAdminViews(); }, []);

  useEffect(() => {
    const interval = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const mogDate = new Date(new Date().toLocaleString('en-US', { timeZone: 'Africa/Mogadishu' }));
      mogDate.setHours(0, 0, 0, 0);
      const todayISO = mogDate.toISOString();

      const useCustomDate = !!selectedDate;
      let customStartISO = '';
      let customEndISO = '';
      if (useCustomDate) {
        const customStart = new Date(selectedDate!.toLocaleString('en-US', { timeZone: 'Africa/Mogadishu' }));
        customStart.setHours(0, 0, 0, 0);
        const customEnd = new Date(customStart);
        customEnd.setDate(customEnd.getDate() + 1);
        customStartISO = customStart.toISOString();
        customEndISO = customEnd.toISOString();
      }

      const periodStartISO = (() => {
        if (useCustomDate) return customStartISO;
        const startDate = new Date(mogDate);
        if (selectedPeriod === 'week') {
          const day = startDate.getDay();
          startDate.setDate(startDate.getDate() - (day === 0 ? 6 : day - 1));
        } else if (selectedPeriod === 'month') {
          startDate.setDate(1);
        } else if (selectedPeriod === 'year') {
          startDate.setMonth(0, 1);
        }
        return startDate.toISOString();
      })();
      const periodEndISO = useCustomDate ? customEndISO : null;

      const tid = getTenantId();
      const scoped = (q: any) => (tid ? q.eq('tenant_id', tid) : q);

      // Only compact aggregate RPCs + small device/config tables are loaded.
      const [summaryRes, deviceStatsRes, devicesRes, balancesRes, providersRes] = await Promise.all([
        (supabase as any).rpc('get_admin_dashboard_summary', {
          p_start: periodStartISO,
          p_end: periodEndISO,
        }),
        (supabase as any).rpc('get_admin_device_period_stats', {
          p_start: todayISO,
          p_end: null,
        }),
        scoped(
          supabase
            .from('android_devices')
            .select('id,device_id,device_name,provider_name,sim1_provider,sim2_provider,sim_number,sim2_number,last_ping_at,is_active,battery_level,is_charging')
            .eq('is_active', true)
            .is('archived_at', null)
            .limit(50),
        ),
        scoped(
          supabase
            .from('sim_balances')
            .select('device_id,sim_slot,balance,balance_type,last_updated')
            .limit(100),
        ),
        scoped(
          supabase
            .from('providers_config')
            .select('id,evoucher_rate,provider_name,provider_logo')
            .eq('is_active', true)
            .limit(50),
        ),
      ]);

      const firstError = summaryRes.error || deviceStatsRes.error || devicesRes.error || balancesRes.error || providersRes.error;
      if (firstError) throw firstError;

      const summary = summaryRes.data || {};
      const providerRates = providersRes.data || [];
      const deviceList = devicesRes.data || [];
      const balanceData = balancesRes.data || [];
      const deviceStats = new Map<string, any>(
        ((deviceStatsRes.data || []) as any[]).map((row) => [String(row.device_id), row]),
      );
      const OFFLINE_THRESHOLD = 5 * 60 * 1000;
      const now = Date.now();
      const devicesOnline = deviceList.filter(
        (d) => d.last_ping_at && now - new Date(d.last_ping_at).getTime() < OFFLINE_THRESHOLD,
      ).length;

      setStats({
        todayOrderCount: Number(summary.order_count || 0),
        todayFailed: Number(summary.failed || 0),
        todayPending: Number(summary.pending || 0),
        todayProfit: Number(summary.profit || 0),
        todayCost: Number(summary.cost || 0),
        todaySales: Number(summary.sales || 0),
        todayDelivered: Number(summary.delivered || 0),
        failed: Number(summary.failed || 0),
        pending: Number(summary.pending || 0),
        delivered: Number(summary.delivered || 0),
        devicesOnline,
      });

      const findProviderLogo = (provName: string) => {
        const match = providerRates.find((p) => p.provider_name?.toLowerCase() === provName.toLowerCase());
        return match?.provider_logo || null;
      };
      const findProviderRate = (provName: string) => {
        const match = providerRates.find((p) => p.provider_name?.toLowerCase() === provName.toLowerCase());
        return Number(match?.evoucher_rate || 0);
      };

      const cards: DeviceCardData[] = deviceList.map((d) => {
        const isOnline = d.last_ping_at ? now - new Date(d.last_ping_at).getTime() < OFFLINE_THRESHOLD : false;
        const deviceBalances = balanceData.filter((b) => b.device_id === d.id);
        const sim1Provider = d.sim1_provider || d.provider_name || '';
        const sim1Evc = deviceBalances.find((b) => b.sim_slot === 1 && b.balance_type === 'evc_plus');
        const sim1Ev = deviceBalances.find((b) => b.sim_slot === 1 && b.balance_type === 'evoucher');
        const sims: SimInfo[] = [{
          sim_slot: 1,
          sim_number: d.sim_number || '',
          provider_name: sim1Provider,
          provider_logo: findProviderLogo(sim1Provider),
          evc_balance: Number(sim1Evc?.balance || 0),
          evoucher_balance: Number(sim1Ev?.balance || 0),
          evoucher_rate: findProviderRate(sim1Provider),
        }];

        if (d.sim2_number && d.sim2_provider) {
          const sim2Evc = deviceBalances.find((b) => b.sim_slot === 2 && b.balance_type === 'evc_plus');
          const sim2Ev = deviceBalances.find((b) => b.sim_slot === 2 && b.balance_type === 'evoucher');
          sims.push({
            sim_slot: 2,
            sim_number: d.sim2_number,
            provider_name: d.sim2_provider,
            provider_logo: findProviderLogo(d.sim2_provider),
            evc_balance: Number(sim2Evc?.balance || 0),
            evoucher_balance: Number(sim2Ev?.balance || 0),
            evoucher_rate: findProviderRate(d.sim2_provider),
          });
        }

        const ds = deviceStats.get(String(d.device_id)) || {};
        return {
          device_name: d.device_name,
          device_id: d.device_id,
          is_online: isOnline,
          last_ping: d.last_ping_at,
          battery_level: d.battery_level,
          is_charging: d.is_charging || false,
          sims,
          todayDelivered: Number(ds.delivered || 0),
          todayFailed: Number(ds.failed || 0),
          todayCost: Number(ds.cost || 0),
          todayRevenue: Number(ds.revenue || 0),
          todayProfit: Number(ds.profit || 0),
          todayOrders: Number(ds.orders || 0),
        };
      });

      setDeviceCards(cards);

      if (!isPartner) {
        const { count } = await supabase
          .from('payment_receipts')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'unmatched')
          .eq('tenant_id', tid ?? '00000000-0000-0000-0000-000000000000');
        setUnmatchedCount(count || 0);
      }

      if (isPartner) {
        try {
          const walletData = await fetchIftinWallet();
          setWallet(walletData.wallet);
        } catch (walletErr) {
          console.error('Wallet fetch error:', walletErr);
        }
      }
    } catch (err) {
      console.error('SimpleAdmin fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedDate, selectedPeriod, isPartner]);

  useEffect(() => { void fetchData(); }, [fetchData]);

  useRealtimeRefresh(
    ['orders', 'android_devices', 'sim_balances', 'delivery_queue', 'payment_receipts', 'device_alerts'],
    fetchData,
    1200,
    { notify: notificationsEnabled, lang: isSo ? 'so' : 'en' },
  );

  const periodLabel = selectedDate ? format(selectedDate, 'dd/MM') : selectedPeriod === 'today' ? 'Maanta' : selectedPeriod === 'week' ? 'Isbuucan' : selectedPeriod === 'month' ? 'Bisha' : 'Sanadka';

  const statCards = ([
    { label: "Wallet & Faa'iido", value: `$${wallet.available.toFixed(2)}`, sub: `La baxsan karo · Faa'idada ${periodLabel.toLowerCase()}: $${stats.todayProfit.toFixed(2)}`, color: 'from-emerald-500 to-teal-700', darkFooter: 'bg-emerald-800', link: '/dashboard/iftin-wallet', fullWidth: true, isWallet: true, partnerOnly: true },
    { label: 'Warbixin', value: stats.todayOrderCount, icon: '📊', sub: 'Shirkad walba & taariikh', color: 'from-indigo-500 to-indigo-700', darkFooter: 'bg-indigo-800', link: '/dashboard/warbixin', partnerOnly: true },
    { label: `Dalabyada ${periodLabel}`, value: stats.todayOrderCount, icon: '🛒', sub: `${stats.todayFailed} fashilmay · ${stats.todayPending} sugaya`, color: 'from-teal-400 to-teal-600', darkFooter: 'bg-teal-700', link: '/dashboard/daily-orders' },
    { label: `Dakhliga ${periodLabel}`, value: `$${stats.todaySales.toFixed(2)}`, icon: '💰', sub: `${stats.todayDelivered} dalab la diray`, color: 'from-red-500 to-red-700', darkFooter: 'bg-red-800', link: '/dashboard/transactions', deviceOnly: true },
    { label: `Faaidada ${periodLabel}`, value: `$${stats.todayProfit.toFixed(2)}`, icon: '📈', sub: `Qarash: $${stats.todayCost.toFixed(2)}`, color: 'from-green-600 to-green-800', darkFooter: 'bg-green-900', link: '/dashboard/transactions', deviceOnly: true },
    { label: 'Unmatched', value: unmatchedCount, icon: '⚠️', sub: `${unmatchedCount} unmatched · ${stats.todayFailed} fashilmay`, color: 'from-blue-500 to-blue-700', darkFooter: 'bg-blue-800', link: '/dashboard/unmatched', deviceOnly: true },
    { label: 'Orders', value: stats.todayOrderCount, icon: '📦', sub: `${stats.todayDelivered} guul · ${stats.todayFailed} fashil`, color: 'from-pink-500 to-pink-700', darkFooter: 'bg-pink-800', link: '/dashboard/abdiqafar', deviceOnly: true },
    { label: 'Devices Online', value: stats.devicesOnline, icon: '📱', color: 'from-yellow-400 to-yellow-600', darkFooter: 'bg-yellow-700', link: '/dashboard/devices', deviceOnly: true },
  ] as any[]).filter((c) => {
    if (!isPartner && c.partnerOnly) return false;
    if (isPartner && c.deviceOnly) return false;
    return true;
  });

  const clockStr = clock.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });

  if (!tenantReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900">
        <div className="flex flex-col items-center gap-3 text-gray-600 dark:text-gray-300">
          <div className="h-10 w-10 rounded-full border-4 border-blue-500 border-t-transparent animate-spin" />
          <span className="text-sm">Soo kicinaya reseller-kaaga…</span>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider defaultOpen={false}>
      <div className="min-h-screen flex w-full bg-gray-100 dark:bg-gray-900">
        <SimpleAdminSidebar />
        <div className="flex-1 flex flex-col w-full">
          <header className="text-white" style={{ backgroundColor: 'var(--brand-primary, #2563eb)' }}>
            <div className="flex items-center justify-center px-4 py-3">
              <div className="flex items-center gap-2">
                <CachedImage src={tenant?.logo_url || najaxLogo} alt={`${tenant?.name || (import.meta.env.VITE_TENANT_NAME as string) || 'App'} logo`} className="w-8 h-8 rounded-lg object-contain bg-white" fallback={<img src={najaxLogo} alt="Logo" className="w-8 h-8 rounded-lg object-contain bg-white" />} />
                <h1 className="text-lg font-bold">{tenant?.name || (import.meta.env.VITE_TENANT_NAME as string) || 'App'}</h1>
                <span className="flex items-center gap-1 bg-white/15 border border-white/25 px-2 py-0.5 rounded-full ml-1">
                  <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-300 opacity-75" /><span className="relative inline-flex rounded-full h-2 w-2 bg-green-400" /></span>
                  <span className="text-[10px] font-bold text-white/90 tracking-wider">LIVE</span>
                </span>
              </div>
            </div>
            <div className="flex items-center justify-between px-4 pb-3 gap-2">
              <SidebarTrigger className="text-white hover:bg-white/20 p-1.5 rounded-full -ml-2"><Menu className="h-6 w-6" /></SidebarTrigger>
              <div className="px-5 py-1 rounded-md bg-white/10 text-base font-mono tracking-wider border border-white/10">{clockStr}</div>
              <div className="flex items-center gap-2">
                <button onClick={toggleNotifications} className="text-white hover:bg-white/20 p-2 rounded-full" title={notificationsEnabled ? 'Mute' : 'Unmute'}>{notificationsEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4 opacity-50" />}</button>
                <button onClick={fetchData} className="text-white hover:bg-white/20 p-2 rounded-full"><RefreshCw className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} /></button>
              </div>
            </div>
          </header>

          <div className="px-4 py-2 text-sm text-gray-500 flex items-center gap-1">🏠 Home &gt; Dashboard</div>

          <main className="flex-1 px-3 pb-6 space-y-4">
            <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide py-1">
              {([
                { key: 'today' as const, label: 'Maanta' },
                { key: 'week' as const, label: 'Isbuucan' },
                { key: 'month' as const, label: 'Bisha' },
                { key: 'year' as const, label: 'Sanadka' },
              ]).map(item => (
                <button key={item.key} onClick={() => { setSelectedPeriod(item.key); setSelectedDate(undefined); }} className={`px-3 py-1 text-xs font-medium rounded-full whitespace-nowrap shrink-0 transition-colors ${selectedPeriod === item.key && !selectedDate ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-muted text-muted-foreground hover:bg-muted/80 border border-border'}`}>{item.label}</button>
              ))}
              <Popover>
                <PopoverTrigger asChild>
                  <button className={`px-3 py-1 text-xs font-medium rounded-full whitespace-nowrap shrink-0 transition-colors flex items-center gap-1 ${selectedDate ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-muted text-muted-foreground hover:bg-muted/80 border border-border'}`}>
                    <CalendarIcon className="w-3 h-3" />{selectedDate ? format(selectedDate, 'dd/MM/yy') : '📅'}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={selectedDate} onSelect={(date) => { setSelectedDate(date); }} disabled={(date) => date > new Date()} initialFocus className={cn("p-3 pointer-events-auto")} />
                </PopoverContent>
              </Popover>
            </div>

            {statCards[0]?.isWallet && (
              <div onClick={() => navigate(statCards[0].link)} className="relative col-span-2 rounded-2xl overflow-hidden shadow-lg cursor-pointer active:scale-[0.98] transition-transform">
                <div className="bg-gradient-to-br from-emerald-500 via-teal-600 to-teal-800 text-white p-5">
                  <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 80% 20%, rgba(255,255,255,0.35) 0%, transparent 35%)' }} />
                  <div className="relative flex items-start justify-between">
                    <div><div className="text-xs font-medium opacity-80 uppercase tracking-wide">{isSo ? "Wallet & Faa'iido" : "Wallet & Profit"}</div><div className="text-4xl font-extrabold mt-1 tracking-tight">{statCards[0].value}</div></div>
                    <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center backdrop-blur-sm border border-white/30"><Wallet className="w-6 h-6 text-white" /></div>
                  </div>
                </div>
                <div className="bg-emerald-900 text-white text-center py-2.5 text-xs font-medium flex items-center justify-center gap-1.5"><span>➡</span> More Info</div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              {statCards.filter((c) => !(c as any).isWallet).map((card, i) => (
                <div key={i} className={`rounded-lg overflow-hidden shadow-md cursor-pointer active:scale-95 transition-transform flex flex-col ${(card as any).fullWidth ? 'col-span-2' : ''}`} onClick={() => navigate(card.link)}>
                  <div className={`bg-gradient-to-br ${card.color} text-white p-4 text-center flex-1`}><div className="text-3xl font-bold">{card.value}</div><div className="text-sm mt-1 opacity-90">{card.label}</div>{card.sub && <div className="text-[10px] mt-0.5 opacity-70">{card.sub}</div>}</div>
                  <div className={`${card.darkFooter} text-white text-center py-2 text-xs flex items-center justify-center gap-1 shrink-0`}><span>➡</span> More Info</div>
                </div>
              ))}
              <div className="rounded-lg overflow-hidden shadow-md cursor-pointer active:scale-95 transition-transform flex flex-col" onClick={() => navigate('/dashboard/blocked')}>
                <div className="bg-gradient-to-br from-gray-600 to-gray-800 text-white p-4 text-center flex-1"><div className="text-3xl font-bold">🚫</div><div className="text-sm mt-1 opacity-90">Blocked Users</div></div>
                <div className="bg-gray-900 text-white text-center py-2 text-xs flex items-center justify-center gap-1 shrink-0"><span>➡</span> More Info</div>
              </div>
              {!isPartner && (
                <div className="rounded-lg overflow-hidden shadow-md cursor-pointer active:scale-95 transition-transform flex flex-col" onClick={() => navigate('/dashboard/sms-logs')}>
                  <div className="bg-gradient-to-br from-indigo-600 to-indigo-800 text-white p-4 text-center flex-1"><div className="text-3xl font-bold">💬</div><div className="text-sm mt-1 opacity-90">SMS Logs</div></div>
                  <div className="bg-indigo-950 text-white text-center py-2 text-xs flex items-center justify-center gap-1 shrink-0"><span>➡</span> More Info</div>
                </div>
              )}
            </div>

            {!isPartner && (
            <div className="space-y-3">
              <div className="flex items-center gap-3"><div className="flex-1 h-px bg-gray-300 dark:bg-gray-700" /><span className="text-gray-500 dark:text-gray-400 text-sm font-medium">Devices & SIM Balances</span><div className="flex-1 h-px bg-gray-300 dark:bg-gray-700" /></div>
              {deviceCards.length === 0 && !loading && <p className="text-center text-gray-400 text-sm py-4">Wax device ah lama helin</p>}
              <div className="grid grid-cols-2 gap-2">
                {deviceCards.map((device, di) => (
                  <div key={di} className="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700 overflow-hidden text-[11px]">
                    <div className="bg-gradient-to-r from-blue-50 to-blue-100 dark:from-gray-700 dark:to-gray-750 px-2 py-1.5 border-b border-gray-200 dark:border-gray-600">
                      <div className="flex items-center gap-1.5"><div className="w-7 h-7 bg-blue-500 rounded flex items-center justify-center flex-shrink-0"><span className="text-white text-xs">📱</span></div><div className="min-w-0 flex-1"><div className="flex items-center gap-1 flex-wrap"><span className="font-bold text-gray-900 dark:text-white text-xs truncate">{device.device_name}</span><span className={`inline-flex items-center gap-0.5 px-1 py-px rounded-full text-[8px] font-semibold ${device.is_online ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}><span className={`w-1 h-1 rounded-full ${device.is_online ? 'bg-green-500' : 'bg-red-500'}`} />{device.is_online ? 'Live' : 'Off'}</span>{device.battery_level !== null && <span className="text-[8px] text-yellow-600">🔋{device.battery_level}%</span>}</div><div className="text-[8px] text-gray-400 truncate">{formatTimeAgo(device.last_ping)}</div></div></div>
                    </div>
                    <div className="p-2 space-y-2">
                      {device.sims.map((sim, si) => {
                        const isHormuud = sim.provider_name.toLowerCase().includes('hormuud');
                        const colors = getProviderColor(sim.provider_name, sim.sim_number);
                        return (
                          <div key={si} className={`rounded-lg border ${colors.border} shadow-sm overflow-hidden`}>
                            <div className={`${colors.bg} px-2 py-1 flex items-center justify-between`}><div className="flex items-center gap-1 min-w-0"><CachedImage src={sim.provider_logo} alt={sim.provider_name} bundledName={sim.provider_name} className="w-4 h-4 rounded-full object-contain bg-white flex-shrink-0" /><span className="font-semibold text-[10px] text-white truncate">SIM{sim.sim_slot}: {sim.provider_name}</span></div><button onClick={() => { setSelectedSimForDelivery({ device_id: device.device_id, device_name: device.device_name, sim_slot: sim.sim_slot, provider_name: sim.provider_name }); setManualDeliveryOpen(true); }} className="w-5 h-5 rounded-full bg-white/30 text-white flex items-center justify-center flex-shrink-0"><Plus className="w-3 h-3" /></button></div>
                            <div className="bg-white dark:bg-gray-800 px-2 py-1.5">
                              <div className="flex items-center justify-between mb-1"><span className="text-[9px] text-gray-400">{sim.sim_number}</span>{sim.evoucher_rate > 0 && <span className="text-[8px] bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 px-1 py-px rounded font-bold">Rate: {(sim.evoucher_rate * 100).toFixed(1)}%</span>}</div>
                              {isHormuud ? (
                                <div className="space-y-0.5 text-[10px]"><div className="flex items-center justify-between"><span className="text-gray-500">EVC Plus:</span><span className="font-bold text-gray-900 dark:text-white">${sim.evc_balance.toFixed(2)} <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500 align-middle" /></span></div><div className="flex items-center justify-between"><span className="text-gray-500">E-Voucher:</span><span className="font-bold text-gray-900 dark:text-white">${sim.evoucher_balance.toFixed(2)} <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500 align-middle" /></span></div></div>
                              ) : (
                                <div className="flex items-center justify-between text-[10px]"><span className="text-gray-500">Balance:</span><span className="font-bold text-gray-900 dark:text-white">${sim.evoucher_balance.toFixed(2)} <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500 align-middle" /></span></div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              {deviceCards.length > 0 && (() => {
                const totalEvoucher = deviceCards.reduce((sum, d) => sum + d.sims.reduce((s, sim) => s + sim.evoucher_balance, 0), 0);
                const totalEvc = deviceCards.reduce((sum, d) => sum + d.sims.reduce((s, sim) => s + sim.evc_balance, 0), 0);
                const totalAll = totalEvoucher + totalEvc;
                return (
                  <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-gray-800 dark:to-gray-750 rounded-xl border border-blue-200 dark:border-gray-700 p-3 mt-3 shadow-sm">
                    <div className="flex items-center gap-1.5 mb-2"><span className="text-blue-600 dark:text-blue-400">💰</span><span className="font-bold text-sm text-gray-900 dark:text-white">Wadarta Lacagta</span></div>
                    <div className="grid grid-cols-3 gap-2"><div className="bg-white dark:bg-gray-800 rounded-lg border border-green-200 dark:border-green-800 p-2 text-center"><div className="text-[9px] text-gray-500 mb-0.5">E-Voucher</div><div className="font-bold text-green-700 dark:text-green-400 text-sm">${totalEvoucher.toFixed(2)}</div></div><div className="bg-white dark:bg-gray-800 rounded-lg border border-blue-200 dark:border-blue-800 p-2 text-center"><div className="text-[9px] text-gray-500 mb-0.5">EVC Plus</div><div className="font-bold text-gray-900 dark:text-white text-sm">${totalEvc.toFixed(2)}</div></div><div className="bg-blue-50 dark:bg-blue-900/30 rounded-lg border border-blue-300 dark:border-blue-700 p-2 text-center"><div className="text-[9px] text-gray-500 mb-0.5">Wadarta Guud</div><div className="font-bold text-blue-700 dark:text-blue-400 text-sm">${totalAll.toFixed(2)}</div></div></div>
                  </div>
                );
              })()}
            </div>
            )}

            <div className="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 rounded-lg p-3 mt-2">
              <div className="flex items-center justify-between gap-2">
                <button onClick={() => setLanguage(isSo ? 'en' : 'so')} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-xs font-medium flex-1"><Globe className="h-3.5 w-3.5" />{isSo ? '🇬🇧 English' : '🇸🇴 Soomaali'}</button>
                <button onClick={toggleTheme} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-xs font-medium">{theme === 'dark' ? <Sun className="h-3.5 w-3.5 text-yellow-400" /> : <Moon className="h-3.5 w-3.5 text-blue-400" />}{theme === 'dark' ? (isSo ? 'Nuur' : 'Light') : (isSo ? 'Mugdi' : 'Dark')}</button>
              </div>
              <button onClick={toggleNotifications} className={`w-full mt-2 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${notificationsEnabled ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'}`}>
                {notificationsEnabled ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}{notificationsEnabled ? (isSo ? '🔔 Ogeysiisyadu way shidan yihiin' : '🔔 Notifications ON') : (isSo ? '🔕 Ogeysiisyadu way damanyihiin' : '🔕 Notifications OFF')}
              </button>
              <div className="text-center text-xs text-gray-400 mt-2">{tenant?.name || (import.meta.env.VITE_TENANT_NAME as string) || 'App'} Admin v1.0</div>
            </div>
          </main>
        </div>

        {selectedSimForDelivery && (
          <AddManualDeliveryDialog open={manualDeliveryOpen} onOpenChange={(open) => { setManualDeliveryOpen(open); if (!open) setSelectedSimForDelivery(null); }} deviceId={selectedSimForDelivery.device_id} deviceName={selectedSimForDelivery.device_name} simSlot={selectedSimForDelivery.sim_slot} providerName={selectedSimForDelivery.provider_name} onSuccess={fetchData} />
        )}
      </div>
    </SidebarProvider>
  );
};

export default SimpleAdminDashboard;
