import { useState, useEffect, Suspense } from 'react';
import { lazyWithRetry as lazy } from '@/lib/lazyWithRetry';
import { useNavigate, useParams } from "@/lib/router-compat";
import { supabase } from '@/integrations/supabase/client';
import { fetchMemberships } from '@/lib/workspaceMembership';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { SimpleAdminSidebar } from '@/components/admin/SimpleAdminSidebar';
import { AdminViewErrorBoundary } from '@/components/admin/AdminViewErrorBoundary';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useTenant } from '@/contexts/TenantContext';
import { useTenantCapabilities } from '@/hooks/useTenantCapabilities';
import { ArrowLeft, Menu, Globe, Moon, Sun, Loader2 } from 'lucide-react';
import najaxLogo from '@/assets/najax-logo.jpeg';
import { prefetchAdminViews } from '@/lib/prefetchAdminViews';

// Lazy-loaded custom views (code-split per view)
const DailyOrdersCustomView = lazy(() => import('@/components/admin/simple/OrderViews').then(m => ({ default: m.DailyOrdersCustomView })));
const OrdersListView = lazy(() => import('@/components/admin/simple/OrderViews').then(m => ({ default: m.OrdersListView })));
const AutoTopUpCustomView = lazy(() => import('@/components/admin/simple/OrderViews').then(m => ({ default: m.AutoTopUpCustomView })));
const OrdersView = lazy(() => import('@/components/admin/simple/OrdersView').then(m => ({ default: m.OrdersView })));
const CustomersCustomView = lazy(() => import('@/components/admin/simple/CustomerViews').then(m => ({ default: m.CustomersCustomView })));
const OfflineRegistrationsCustomView = lazy(() => import('@/components/admin/simple/CustomerViews').then(m => ({ default: m.OfflineRegistrationsCustomView })));
const DevicesCustomView = lazy(() => import('@/components/admin/simple/CustomerViews').then(m => ({ default: m.DevicesCustomView })));
const BlockedCustomView = lazy(() => import('@/components/admin/simple/CustomerViews').then(m => ({ default: m.BlockedCustomView })));
const ProvidersCustomView = lazy(() => import('@/components/admin/simple/ConfigViews').then(m => ({ default: m.ProvidersCustomView })));
const PackagesCustomView = lazy(() => import('@/components/admin/simple/ConfigViews').then(m => ({ default: m.PackagesCustomView })));
const CategoriesCustomView = lazy(() => import('@/components/admin/simple/ConfigViews').then(m => ({ default: m.CategoriesCustomView })));
const FeaturedCustomView = lazy(() => import('@/components/admin/simple/ConfigViews').then(m => ({ default: m.FeaturedCustomView })));
const BannersCustomView = lazy(() => import('@/components/admin/simple/ConfigViews').then(m => ({ default: m.BannersCustomView })));
const PaymentSettingsCustomView = lazy(() => import('@/components/admin/simple/ConfigViews').then(m => ({ default: m.PaymentSettingsCustomView })));
const SystemCodesCustomView = lazy(() => import('@/components/admin/simple/ConfigViews').then(m => ({ default: m.SystemCodesCustomView })));
const SimPinsView = lazy(() => import('@/components/admin/simple/SimPinsView').then(m => ({ default: m.SimPinsView })));
const DiscoveryPricing = lazy(() => import('@/components/admin/DiscoveryPricing'));
const AppsView = lazy(() => import('@/components/admin/simple/AppsView').then(m => ({ default: m.AppsView })));

// Lazy-loaded full admin components
const TransactionsDashboard = lazy(() => import('@/components/admin/TransactionsDashboard').then(m => ({ default: m.TransactionsDashboard })));
const IftinTransactions = lazy(() => import('@/components/admin/IftinTransactions'));
const IftinReport = lazy(() => import('@/components/admin/IftinReport'));
const CombinedPaymentAnalytics = lazy(() => import('@/components/admin/CombinedPaymentAnalytics'));
const OnlinePaymentsDashboard = lazy(() => import('@/components/admin/OnlinePaymentsDashboard').then(m => ({ default: m.OnlinePaymentsDashboard })));
const SMSOfflineOrdersDashboard = lazy(() => import('@/components/admin/SMSOfflineOrdersDashboard').then(m => ({ default: m.SMSOfflineOrdersDashboard })));
const UnmatchedPayments = lazy(() => import('@/components/admin/UnmatchedPayments'));
const CompanyFinances = lazy(() => import('@/components/admin/CompanyFinances').then(m => ({ default: m.CompanyFinances })));
const DailyOrdersManager = lazy(() => import('@/components/admin/DailyOrdersManager').then(m => ({ default: m.DailyOrdersManager })));
const BlockedUsersManager = lazy(() => import('@/components/admin/BlockedUsersManager').then(m => ({ default: m.BlockedUsersManager })));
const BulkSmsManager = lazy(() => import('@/components/admin/BulkSmsManager').then(m => ({ default: m.BulkSmsManager })));
const SendNotification = lazy(() => import('@/components/admin/SendNotification').then(m => ({ default: m.SendNotification })));
const AppSettings = lazy(() => import('@/components/admin/AppSettings'));
const OfflinePaymentSettings = lazy(() => import('@/components/admin/OfflinePaymentSettings'));
const AutoTopUpSettings = lazy(() => import('@/components/admin/AutoTopUpSettings').then(m => ({ default: m.AutoTopUpSettings })));
const AuditLogViewer = lazy(() => import('@/components/admin/AuditLogViewer').then(m => ({ default: m.AuditLogViewer })));
const AdminManagement = lazy(() => import('@/components/admin/AdminManagement').then(m => ({ default: m.AdminManagement })));
const FraudAlerts = lazy(() => import('@/components/admin/FraudAlerts').then(m => ({ default: m.FraudAlerts })));
const PackageDeliveryRules = lazy(() => import('@/components/admin/PackageDeliveryRules').then(m => ({ default: m.PackageDeliveryRules })));
const BalanceManagement = lazy(() => import('@/components/admin/BalanceManagement').then(m => ({ default: m.BalanceManagement })));
const PaymentSmsLog = lazy(() => import('@/components/admin/PaymentSmsLog').then(m => ({ default: m.PaymentSmsLog })));
const SmsLacagoCards = lazy(() => import('@/components/admin/SmsLacagoCards').then(m => ({ default: m.SmsLacagoCards })));
const SmsLogsViewer = lazy(() => import('@/components/admin/SmsLogsViewer'));
const DeliveryTracker = lazy(() => import('@/components/admin/DeliveryTracker').then(m => ({ default: m.DeliveryTracker })));
const IftinPricing = lazy(() => import('@/components/admin/IftinPricing'));
const IftinPaymentNumbers = lazy(() => import('@/components/admin/IftinPaymentNumbers'));
const IftinWallet = lazy(() => import('@/components/admin/IftinWallet'));
const IftinPayments = lazy(() => import('@/components/admin/IftinPayments'));
const IftinOfflineCustomers = lazy(() => import('@/components/admin/IftinOfflineCustomers'));
const IftinDailyOrders = lazy(() => import('@/components/admin/IftinDailyOrders'));
const BankTransactions = lazy(() => import('@/components/admin/BankTransactions').then(m => ({ default: m.BankTransactions })));
const SomlinkIntegrationSettings = lazy(() => import('@/components/admin/SomlinkIntegrationSettings'));

interface DetailConfig {
  title: string;
  titleSo: string;
  headerBg: string;
}

const DETAIL_CONFIGS: Record<string, DetailConfig> = {
  customers: { title: 'Customers', titleSo: 'Macaamiisha', headerBg: 'from-teal-500 to-teal-700' },
  'offline-registrations': { title: 'Offline Registrations', titleSo: 'Offline Reg', headerBg: 'from-orange-500 to-orange-700' },
  'auto-topup': { title: 'Auto Top-Up', titleSo: 'Auto Top-Up', headerBg: 'from-lime-500 to-lime-700' },
  'daily-orders': { title: 'Daily Orders', titleSo: 'Dalabyada Maalinta', headerBg: 'from-indigo-600 to-indigo-800' },
  sales: { title: "Today's Sales", titleSo: 'Iibka Maanta', headerBg: 'from-green-500 to-green-700' },
  failed: { title: 'Failed Orders', titleSo: 'Guul Darro', headerBg: 'from-red-500 to-red-700' },
  pending: { title: 'Pending Orders', titleSo: 'Sugaya', headerBg: 'from-blue-500 to-blue-700' },
  delivered: { title: 'Delivered', titleSo: 'Dhameystiran', headerBg: 'from-pink-500 to-pink-700' },
  'all-orders': { title: 'All Orders', titleSo: 'Dhammaan Orders', headerBg: 'from-indigo-500 to-indigo-700' },
  devices: { title: 'Devices', titleSo: 'Aaladaha', headerBg: 'from-yellow-500 to-yellow-700' },
  blocked: { title: 'Blocked Users', titleSo: 'Block Users', headerBg: 'from-gray-600 to-gray-800' },
  providers: { title: 'Providers', titleSo: 'Shirkadaha', headerBg: 'from-purple-500 to-purple-700' },
  packages: { title: 'Packages', titleSo: 'Packages', headerBg: 'from-cyan-500 to-cyan-700' },
  categories: { title: 'Categories', titleSo: 'Categories', headerBg: 'from-emerald-500 to-emerald-700' },
  featured: { title: 'Featured', titleSo: 'Featured', headerBg: 'from-amber-500 to-amber-700' },
  banners: { title: 'Banners', titleSo: 'Banners', headerBg: 'from-rose-500 to-rose-700' },
  'payment-settings': { title: 'Payment Providers', titleSo: 'Payment Settings', headerBg: 'from-violet-500 to-violet-700' },
  integrations: { title: 'Integration Settings', titleSo: 'API Integrations', headerBg: 'from-blue-600 to-cyan-700' },
  'system-codes': { title: 'System Codes', titleSo: 'USSD Codes', headerBg: 'from-indigo-600 to-indigo-800' },
  'sim-pins': { title: 'SIM PINs', titleSo: 'SIM PINs', headerBg: 'from-indigo-500 to-blue-700' },
  'discovery-pricing': { title: 'Discovery Pricing', titleSo: 'Qiimaha Baarista', headerBg: 'from-fuchsia-600 to-purple-800' },
  transactions: { title: 'Transactions', titleSo: 'Transactions', headerBg: 'from-blue-600 to-blue-800' },
  warbixin: { title: 'Report', titleSo: 'Warbixin', headerBg: 'from-indigo-600 to-indigo-800' },
  'sms-lacago': { title: 'SMS Lacago', titleSo: 'SMS Lacago', headerBg: 'from-orange-600 to-orange-800' },
  'evoucher-rates': { title: 'E-Voucher Rates', titleSo: 'E-Voucher Rates', headerBg: 'from-emerald-600 to-emerald-800' },
  'bulk-sms': { title: 'Bulk SMS', titleSo: 'Bulk SMS', headerBg: 'from-teal-600 to-teal-800' },
  'send-notification': { title: 'Notifications', titleSo: 'Farriin Dir', headerBg: 'from-blue-600 to-blue-800' },
  'app-settings': { title: 'App Settings', titleSo: 'Settings', headerBg: 'from-gray-600 to-gray-800' },
  'offline-payment': { title: 'Offline Payment', titleSo: 'Offline Payment', headerBg: 'from-amber-600 to-amber-800' },
  'delivery-rules': { title: 'Bundling Rules', titleSo: 'Xirmooyin', headerBg: 'from-pink-600 to-pink-800' },
  'admin-management': { title: 'Admin Management', titleSo: 'Admins', headerBg: 'from-slate-600 to-slate-800' },
  'audit-log': { title: 'Audit Log', titleSo: 'Taariikhda', headerBg: 'from-zinc-600 to-zinc-800' },
  'fraud-alerts': { title: 'Fraud Alerts', titleSo: 'Fraud Alerts', headerBg: 'from-red-600 to-red-800' },
  'deliveries': { title: 'Deliveries', titleSo: 'Deliveries', headerBg: 'from-green-600 to-green-800' },
  orders: { title: 'Orders', titleSo: 'Dalabyada', headerBg: 'from-sky-500 to-sky-700' },
  'abdiqafar': { title: 'Orders', titleSo: 'Dalabyada', headerBg: 'from-sky-500 to-sky-700' }, // legacy URL alias
  'unmatched': { title: 'Unmatched Payments', titleSo: 'Lacago La Heli Waayay', headerBg: 'from-red-600 to-red-800' },
  'sms-logs': { title: 'SMS Logs', titleSo: 'SMS', headerBg: 'from-indigo-600 to-indigo-800' },
  'iftin-pricing': { title: 'Iftin Pricing', titleSo: 'Qiimaha Iibka', headerBg: 'from-cyan-600 to-cyan-800' },
  'iftin-payment-numbers': { title: 'Payment Numbers', titleSo: 'Lambarada Lacagta', headerBg: 'from-violet-600 to-violet-800' },
  'iftin-wallet': { title: 'Wallet', titleSo: 'Wallet & Faa\'iido', headerBg: 'from-emerald-600 to-teal-700' },
  'iftin-payments': { title: 'Payments Log', titleSo: 'Lacagaha SMS-ka', headerBg: 'from-orange-600 to-amber-700' },
  'apps': { title: 'Apps', titleSo: 'Apps', headerBg: 'from-blue-600 to-indigo-800' },
  'bank-transactions': { title: 'Bank Transactions', titleSo: 'Lacagaha Bank-ka', headerBg: 'from-emerald-600 to-emerald-800' },
};

const LazyFallback = () => (
  <div className="flex justify-center items-center py-16">
    <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
  </div>
);

const SimpleAdminDetail = () => {
  const navigate = useNavigate();
  const { type } = useParams<{ type: string }>();
  const { language, setLanguage } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const tenantState = useTenant();
  const tenant = tenantState.status === 'ready' ? tenantState.tenant : null;
  const config = DETAIL_CONFIGS[type || ''] || DETAIL_CONFIGS.customers;
  const isSo = language === 'so';
  const { canSee, isPartner } = useTenantCapabilities();
  const allowed = canSee(type);

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
      if (!roleData && memberships.length === 0) navigate('/dashboard/login');
    };
    checkAuth();
  }, [navigate]);

  useEffect(() => {
    prefetchAdminViews();
  }, []);

  const renderView = () => {
    if (!allowed) {
      return (
        <div className="text-center py-16 px-4">
          <p className="text-gray-600 dark:text-gray-300 font-medium">
            {isSo ? 'Qeybtan ma khusayso akoonkaaga' : 'This section is not available for your account'}
          </p>
          <p className="text-xs text-gray-400 mt-2">
            {isSo
              ? 'Dalabyada waxaa lagu gaarsiiyaa API — devices, SIM iyo USSD lama maamulo halkan.'
              : 'Orders are delivered via API — devices, SIMs and USSD are not managed here.'}
          </p>
        </div>
      );
    }
    switch (type) {
      // Custom views (lazy-loaded)
      case 'daily-orders': return isPartner ? <IftinDailyOrders isSo={isSo} /> : <DailyOrdersCustomView isSo={isSo} />;
      case 'customers': return <CustomersCustomView isSo={isSo} />;
      case 'offline-registrations':
        return isPartner ? <IftinOfflineCustomers /> : <OfflineRegistrationsCustomView isSo={isSo} />;
      case 'auto-topup': return <AutoTopUpCustomView isSo={isSo} />;
      case 'sales': case 'failed': case 'pending': case 'delivered': case 'all-orders':
        return <OrdersListView isSo={isSo} type={type!} />;
      case 'devices': return <DevicesCustomView isSo={isSo} />;
      case 'blocked': return <BlockedCustomView isSo={isSo} />;
      case 'providers': return <ProvidersCustomView isSo={isSo} />;
      case 'packages': return <PackagesCustomView isSo={isSo} />;
      case 'categories': return <CategoriesCustomView isSo={isSo} />;
      case 'featured': return <FeaturedCustomView isSo={isSo} />;
      case 'banners': return <BannersCustomView isSo={isSo} />;
      case 'payment-settings': return <PaymentSettingsCustomView isSo={isSo} />;
      case 'integrations': return <SomlinkIntegrationSettings />;
      case 'system-codes': return <SystemCodesCustomView isSo={isSo} />;
      case 'sim-pins': return <SimPinsView isSo={isSo} />;
      case 'discovery-pricing': return <DiscoveryPricing />;
      case 'apps': return <AppsView isSo={isSo} />;
      // Full admin components (lazy-loaded)
      case 'transactions': return isPartner ? <IftinTransactions isSo={isSo} /> : <TransactionsDashboard />;
      case 'warbixin': return <IftinReport isSo={isSo} />;
      case 'sms-lacago': return <SmsLacagoCards />;
      case 'evoucher-rates': return <CompanyFinances />;
      case 'bulk-sms': return <BulkSmsManager />;
      case 'send-notification': return <SendNotification />;
      case 'app-settings': return <AppSettings />;
      case 'offline-payment': return <OfflinePaymentSettings />;
      case 'delivery-rules': return <PackageDeliveryRules />;
      case 'admin-management': return <AdminManagement />;
      case 'audit-log': return <AuditLogViewer />;
      case 'fraud-alerts': return <FraudAlerts />;
      case 'deliveries': return <DeliveryTracker />;
      case 'orders':
      case 'abdiqafar': return <OrdersView isSo={isSo} />; // keep old URL as a backward-compatible alias
      case 'unmatched': return <UnmatchedPayments />;
      case 'sms-logs': return <SmsLogsViewer />;
      case 'iftin-pricing': return <IftinPricing />;
      case 'iftin-payment-numbers': return <IftinPaymentNumbers />;
      case 'iftin-wallet': return <IftinWallet />;
      case 'iftin-payments': return <IftinPayments />;
      case 'bank-transactions': return <BankTransactions isSo={isSo} />;
      default: return <LazyFallback />;
    }
  };

  const title = isSo ? config.titleSo : config.title;

  return (
    <SidebarProvider defaultOpen={false}>
      <div className="min-h-screen flex w-full bg-gray-100 dark:bg-gray-900">
        <SimpleAdminSidebar />
        <div className="flex-1 flex flex-col w-full">
          <header
            className="text-white"
            style={{ backgroundColor: 'var(--brand-primary, #2563eb)' }}
          >
            <div className="flex items-center justify-between px-4 py-3">
              <button onClick={() => navigate('/dashboard')} className="p-1.5 rounded-full hover:bg-white/20 -ml-2">
                <ArrowLeft className="h-5 w-5" />
              </button>
              <div className="flex items-center gap-2">
                <img src={tenant?.logo_url || najaxLogo} alt="Logo" className="w-7 h-7 rounded-lg object-contain bg-white" onError={(e) => { (e.currentTarget as HTMLImageElement).src = najaxLogo; }} />
                <h1 className="text-lg font-bold">{title}</h1>
              </div>
              <SidebarTrigger className="text-white hover:bg-white/20 p-1.5 rounded-full -mr-2">
                <Menu className="h-5 w-5" />
              </SidebarTrigger>
            </div>
          </header>

          <main className="flex-1 px-3 py-4 space-y-2">
            <AdminViewErrorBoundary key={type} isSo={isSo}>
              <Suspense fallback={<LazyFallback />}>
                {renderView()}
              </Suspense>
            </AdminViewErrorBoundary>
          </main>

          <div className="border-t border-gray-200 dark:border-gray-700 px-3 py-2 bg-white dark:bg-gray-800">
            <div className="flex items-center justify-between gap-1.5">
              <button onClick={() => setLanguage(isSo ? 'en' : 'so')} className="flex items-center gap-1 px-2 py-1.5 rounded-md bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-[11px] font-medium">
                <Globe className="h-3 w-3" />{isSo ? '🇬🇧 EN' : '🇸🇴 SO'}
              </button>
              <span className="text-[10px] text-gray-400">{tenant?.name || (import.meta.env.VITE_TENANT_NAME as string) || 'App'} v1.0</span>
              <button onClick={toggleTheme} className="flex items-center gap-1 px-2 py-1.5 rounded-md bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-[11px] font-medium">
                {theme === 'dark' ? <Sun className="h-3 w-3 text-yellow-500" /> : <Moon className="h-3 w-3 text-blue-500" />}
                {theme === 'dark' ? 'Light' : 'Dark'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default SimpleAdminDetail;
