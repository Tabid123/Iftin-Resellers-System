import { useState } from 'react';
import { useNavigate } from "@/lib/router-compat";
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  useSidebar,
} from '@/components/ui/sidebar';
import {
  LayoutDashboard, Bell, ShoppingCart, ChevronDown, ChevronRight,
  Users, MessageSquare, Smartphone, Settings, LogOut, Ban, Clock,
  XCircle, ListOrdered, History, Send, Megaphone, CreditCard,
  BarChart3, AlertTriangle, Wallet, Package, Briefcase, Grid3x3,
  Star, Layers, Zap, ImageIcon, WifiOff, ShieldCheck, FileText,
  Receipt, Moon, Sun, Globe, Banknote, Search, PlugZap,
} from 'lucide-react';
import najaxLogo from '@/assets/najax-logo.jpeg';
import { useTenant } from '@/contexts/TenantContext';
import { useTenantCapabilities } from '@/hooks/useTenantCapabilities';

interface MenuItem {
  label: string;
  labelSo: string;
  icon: React.ElementType;
  path?: string;
  children?: MenuItem[];
}

const menuGroups: MenuItem[] = [
  { label: 'Dashboard', labelSo: 'Dashboard', icon: LayoutDashboard, path: '/dashboard' },
  
  {
    label: 'Payments & Analytics', labelSo: 'Lacagaha & Falanqayn', icon: BarChart3,
    children: [
      { label: 'Transactions', labelSo: 'Transactions', icon: Receipt, path: '/dashboard/transactions' },
      { label: 'Report', labelSo: 'Warbixin', icon: Receipt, path: '/dashboard/warbixin' },
      { label: 'SMS Lacago', labelSo: 'SMS Lacago', icon: MessageSquare, path: '/dashboard/sms-lacago' },
      { label: 'Bank Transactions', labelSo: 'Lacagaha Bank-ka', icon: Banknote, path: '/dashboard/bank-transactions' },
      { label: 'E-Voucher Rates', labelSo: 'E-Voucher Rates', icon: Wallet, path: '/dashboard/evoucher-rates' },
    ],
  },
  {
    label: 'Orders', labelSo: 'Dalabyo', icon: ShoppingCart,
    children: [
      { label: 'Daily Orders', labelSo: 'Dalabyada Maalinta', icon: Clock, path: '/dashboard/daily-orders' },
      { label: 'Orders', labelSo: 'Orders', icon: FileText, path: '/dashboard/orders' },
      { label: 'All Orders', labelSo: 'Dhammaan Orders', icon: ListOrdered, path: '/dashboard/all-orders' },
      { label: 'Processing', labelSo: 'Sugaya', icon: Clock, path: '/dashboard/pending' },
      { label: 'Failed', labelSo: 'Guul Darro', icon: XCircle, path: '/dashboard/failed' },
      { label: 'Delivered', labelSo: 'Dhameystiran', icon: History, path: '/dashboard/delivered' },
    ],
  },
  {
    label: 'Customers', labelSo: 'Macaamiisha', icon: Users,
    children: [
      { label: 'Users', labelSo: 'Macaamiisha', icon: Users, path: '/dashboard/customers' },
      { label: 'Offline Registrations', labelSo: 'Offline Reg', icon: WifiOff, path: '/dashboard/offline-registrations' },
      { label: 'Blocked Users', labelSo: 'Block Users', icon: Ban, path: '/dashboard/blocked' },
    ],
  },
  {
    label: 'Products', labelSo: 'Badeecadaha', icon: Package,
    children: [
      { label: 'Providers', labelSo: 'Shirkadaha', icon: Briefcase, path: '/dashboard/providers' },
      { label: 'Packages', labelSo: 'Packages', icon: Package, path: '/dashboard/packages' },
      { label: 'Iftin Pricing', labelSo: 'Qiimaha Iibka', icon: Package, path: '/dashboard/iftin-pricing' },
      { label: 'Categories', labelSo: 'Categories', icon: Grid3x3, path: '/dashboard/categories' },
      { label: 'Featured', labelSo: 'Featured', icon: Star, path: '/dashboard/featured' },
      { label: 'Bundling Rules', labelSo: 'Xirmooyin', icon: Layers, path: '/dashboard/delivery-rules' },
      { label: 'System Codes', labelSo: 'USSD Codes', icon: Layers, path: '/dashboard/system-codes' },
      { label: 'SIM PINs', labelSo: 'SIM PINs', icon: Layers, path: '/dashboard/sim-pins' },
      { label: 'Discovery Pricing', labelSo: 'Qiimaha Baarista', icon: Search, path: '/dashboard/discovery-pricing' },
    ],
  },
  {
    label: 'Devices & Delivery', labelSo: 'Aaladaha & Delivery', icon: Smartphone,
    children: [
      { label: 'Devices', labelSo: 'Devices', icon: Smartphone, path: '/dashboard/devices' },
      { label: 'SMS', labelSo: 'SMS', icon: MessageSquare, path: '/dashboard/sms-logs' },
      { label: 'Auto Top-Up', labelSo: 'Auto Top-Up', icon: Zap, path: '/dashboard/auto-topup' },
      { label: 'Deliveries', labelSo: 'Deliveries', icon: Smartphone, path: '/dashboard/deliveries' },
    ],
  },
  {
    label: 'Communication', labelSo: 'Xiriirka', icon: Send,
    children: [
      { label: 'Send Message', labelSo: 'Farriin Dir', icon: Send, path: '/dashboard/send-notification' },
      { label: 'Notification', labelSo: 'Notification', icon: Bell, path: '/dashboard/send-notification?mode=push' },
      { label: 'Bulk SMS', labelSo: 'Bulk SMS', icon: Megaphone, path: '/dashboard/bulk-sms' },
    ],
  },
  {
    label: 'Settings', labelSo: 'Settings', icon: Settings,
    children: [
      { label: 'Payment Settings', labelSo: 'Payment', icon: CreditCard, path: '/dashboard/payment-settings' },
      { label: 'Integration Settings', labelSo: 'API Integrations', icon: PlugZap, path: '/dashboard/integrations' },
      { label: 'Payment Numbers', labelSo: 'Lambarada Lacagta', icon: CreditCard, path: '/dashboard/iftin-payment-numbers' },
      { label: 'Wallet', labelSo: "Wallet & Faa'iido", icon: CreditCard, path: '/dashboard/iftin-wallet' },
      { label: 'Payments Log', labelSo: 'Lacagaha SMS-ka', icon: CreditCard, path: '/dashboard/iftin-payments' },
      { label: 'Offline Payment', labelSo: 'Offline Payment', icon: WifiOff, path: '/dashboard/offline-payment' },
      { label: 'Banners', labelSo: 'Banners', icon: ImageIcon, path: '/dashboard/banners' },
      { label: 'App Settings', labelSo: 'Settings', icon: Settings, path: '/dashboard/app-settings' },
      { label: 'Apps', labelSo: 'Apps', icon: Smartphone, path: '/dashboard/apps' },
    ],
  },
  {
    label: 'Security & Admin', labelSo: 'Amniga & Admin', icon: ShieldCheck,
    children: [
      { label: 'Admin Management', labelSo: 'Admins', icon: Users, path: '/dashboard/admin-management' },
      { label: 'Audit Log', labelSo: 'Taariikhda', icon: FileText, path: '/dashboard/audit-log' },
      { label: 'Fraud Alerts', labelSo: 'Fraud Alerts', icon: AlertTriangle, path: '/dashboard/fraud-alerts' },
    ],
  },
];

export function SimpleAdminSidebar() {
  const navigate = useNavigate();
  const { setOpenMobile } = useSidebar();
  const { language, setLanguage } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  const toggleGroup = (label: string) => {
    setOpenGroups(prev => ({ ...prev, [label]: !prev[label] }));
  };

  const handleNav = (path?: string) => {
    if (path) {
      navigate(path);
      setOpenMobile(false);
    }
  };

  const handleLogout = async () => {
    localStorage.removeItem('adminEmergencySession');
    localStorage.removeItem('adminEmergencyTime');
    await supabase.auth.signOut();
    navigate('/dashboard/login');
  };

  const isSo = language === 'so';
  const { tenant } = useTenant();
  const { canSee } = useTenantCapabilities();

  // Reseller-ka API partner ah wuxuu arkaa oo kaliya modules-ka u shaqeeya.
  const visibleGroups = menuGroups
    .map((group) => {
      if (!group.children) return canSee(group.path) ? group : null;
      const children = group.children.filter((c) => canSee(c.path));
      return children.length ? { ...group, children } : null;
    })
    .filter(Boolean) as MenuItem[];

  return (
    <Sidebar collapsible="offcanvas" className="bg-gray-900 dark:bg-gray-950 border-none">
      <SidebarHeader className="bg-gray-900 dark:bg-gray-950 border-b border-gray-700 p-4">
        <div className="flex items-center gap-3">
          <img src={tenant?.logo_url || najaxLogo} alt="Logo" className="w-12 h-12 rounded-full border-2 border-blue-400 object-contain bg-white" onError={(e) => { (e.currentTarget as HTMLImageElement).src = najaxLogo }} />
          <div>
            <div className="text-white font-semibold text-base">{tenant?.name || (import.meta.env.VITE_TENANT_NAME as string) || 'App'}</div>
            <div className="flex items-center gap-1 text-xs text-blue-400">
              <span className="w-2 h-2 bg-green-400 rounded-full inline-block" />
              Owner
            </div>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="bg-gray-900 dark:bg-gray-950 text-gray-300">
        <SidebarMenu className="p-2 space-y-0.5">
          {visibleGroups.map((group) => (
            <div key={group.label}>
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => group.children ? toggleGroup(group.label) : handleNav(group.path)}
                  className="flex items-center justify-between w-full px-3 py-3 rounded-lg hover:bg-gray-800 text-gray-300 hover:text-white transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <group.icon className="h-5 w-5" />
                    <span className="text-sm font-medium">{isSo ? group.labelSo : group.label}</span>
                  </div>
                  {group.children && (
                    openGroups[group.label]
                      ? <ChevronDown className="h-4 w-4" />
                      : <ChevronRight className="h-4 w-4" />
                  )}
                </SidebarMenuButton>
              </SidebarMenuItem>

              {group.children && openGroups[group.label] && (
                <div className="ml-6 border-l border-gray-700 pl-3 space-y-0.5">
                  {group.children.map((child) => (
                    <SidebarMenuItem key={child.label}>
                      <SidebarMenuButton
                        onClick={() => handleNav(child.path)}
                        className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white text-sm transition-colors"
                      >
                        <child.icon className="h-4 w-4" />
                        <span>{isSo ? child.labelSo : child.label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </div>
              )}
            </div>
          ))}

          <div className="my-3 border-t border-gray-700" />

          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={handleLogout}
              className="flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-red-900/50 text-red-400 hover:text-red-300 transition-colors"
            >
              <LogOut className="h-5 w-5" />
              <span className="text-sm">{isSo ? 'Ka bax' : 'Logout'}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarContent>

      <SidebarFooter className="bg-gray-900 dark:bg-gray-950 border-t border-gray-700 p-3">
        <div className="flex items-center justify-between gap-2">
          <button
            onClick={() => setLanguage(isSo ? 'en' : 'so')}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm transition-colors flex-1"
          >
            <Globe className="h-4 w-4" />
            <span>{isSo ? '🇬🇧 English' : '🇸🇴 Soomaali'}</span>
          </button>

          <button
            onClick={toggleTheme}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm transition-colors"
          >
            {theme === 'dark' ? <Sun className="h-4 w-4 text-yellow-400" /> : <Moon className="h-4 w-4 text-blue-400" />}
            <span>{theme === 'dark' ? (isSo ? 'Nuur' : 'Light') : (isSo ? 'Mugdi' : 'Dark')}</span>
          </button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
