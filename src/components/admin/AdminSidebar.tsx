import { useEffect, useState } from 'react';
import {
  LayoutDashboard,
  Users,
  Package,
  ShoppingCart,
  Briefcase,
  Grid3x3,
  Star,
  CreditCard,
  ImageIcon,
  AlertTriangle,
  Smartphone,
  Settings,
  Wallet,
  WifiOff,
  Send,
  MessageSquare,
  BarChart3,
  Receipt,
  Zap,
  ShieldCheck,
  Bell,
  TrendingUp,
  FileText,
  UserX,
  Layers,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useLanguage } from "@/contexts/LanguageContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { supabase } from "@/integrations/supabase/client";

interface NavItem {
  title: string;
  titleSo: string;
  value: string;
  icon: LucideIcon;
  permission?: string;
}

interface NavGroup {
  label: string;
  labelSo: string;
  icon: LucideIcon;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    label: "Overview",
    labelSo: "Guud-mar",
    icon: LayoutDashboard,
    items: [
      { title: "Dashboard", titleSo: "Dashboard", value: "dashboard", icon: LayoutDashboard },
    ],
  },
  {
    label: "Payments & Analytics",
    labelSo: "Lacagaha & Falanqayn",
    icon: TrendingUp,
    items: [
      { title: "Transactions", titleSo: "Transactions", value: "transactions-dashboard", icon: Receipt, permission: "view_transactions" },
      { title: "Combined Analytics", titleSo: "Falanqayn", value: "combined-analytics", icon: BarChart3, permission: "view_transactions" },
      { title: "Online Payments", titleSo: "Online Payments", value: "online-payments", icon: CreditCard, permission: "view_transactions" },
      { title: "SMS Payments", titleSo: "SMS Lacago", value: "sms-payments", icon: MessageSquare, permission: "view_transactions" },
      { title: "Unmatched", titleSo: "Unmatched", value: "unmatched", icon: AlertTriangle, permission: "view_transactions" },
      { title: "E-Voucher Rates", titleSo: "E-Voucher Rate Settings", value: "company-finances", icon: Wallet, permission: "view_transactions" },
    ],
  },
  {
    label: "Orders",
    labelSo: "Dalabyo",
    icon: ShoppingCart,
    items: [
      { title: "Daily Orders", titleSo: "Dalabyada Maalinta", value: "daily-orders", icon: ShoppingCart, permission: "manage_orders" },
      { title: "All Orders", titleSo: "Dhammaan Orders", value: "orders", icon: FileText, permission: "manage_orders" },
      { title: "SMS Offline Orders", titleSo: "SMS Dalabyo", value: "sms-offline-orders", icon: MessageSquare, permission: "manage_orders" },
    ],
  },
  {
    label: "Customers",
    labelSo: "Macaamiisha",
    icon: Users,
    items: [
      { title: "Users", titleSo: "Macaamiisha", value: "users", icon: Users, permission: "manage_users" },
      { title: "Offline Registration", titleSo: "Offline Reg", value: "offline-registrations", icon: WifiOff, permission: "manage_users" },
      { title: "Blocked Users", titleSo: "Block Users", value: "blocked-users", icon: UserX, permission: "manage_users" },
    ],
  },
  {
    label: "Products",
    labelSo: "Badeecadaha",
    icon: Package,
    items: [
      { title: "Providers", titleSo: "Shirkadaha", value: "providers", icon: Briefcase, permission: "manage_providers" },
      { title: "Packages", titleSo: "Packages", value: "packages", icon: Package, permission: "manage_packages" },
      { title: "Categories", titleSo: "Categories", value: "categories", icon: Grid3x3, permission: "manage_packages" },
      { title: "Featured", titleSo: "Featured", value: "featured", icon: Star, permission: "manage_packages" },
      { title: "Bundling Rules", titleSo: "Xirmooyin", value: "delivery-rules", icon: Layers, permission: "manage_packages" },
    ],
  },
  {
    label: "Devices & Delivery",
    labelSo: "Aaladaha & Delivery",
    icon: Smartphone,
    items: [
      { title: "Devices", titleSo: "Devices", value: "devices", icon: Smartphone, permission: "manage_devices" },
      { title: "Auto Top-Up", titleSo: "Auto Top-Up", value: "auto-topup", icon: Zap, permission: "manage_settings" },
    ],
  },
  {
    label: "Communication",
    labelSo: "Xiriirka",
    icon: Send,
    items: [
      { title: "Send Notification", titleSo: "Farriin Dir", value: "send-notification", icon: Bell, permission: "manage_settings" },
      { title: "Bulk SMS", titleSo: "Bulk SMS", value: "bulk-sms", icon: MessageSquare, permission: "manage_bulk_sms" },
    ],
  },
  {
    label: "Settings",
    labelSo: "Settings",
    icon: Settings,
    items: [
      { title: "Payment Settings", titleSo: "Payment", value: "payment", icon: CreditCard, permission: "manage_settings" },
      { title: "Offline Payment", titleSo: "Offline Payment", value: "offline-payment", icon: WifiOff, permission: "manage_settings" },
      { title: "Banners", titleSo: "Banners", value: "banners", icon: ImageIcon, permission: "manage_settings" },
      { title: "App Settings", titleSo: "Settings", value: "settings", icon: Settings, permission: "manage_settings" },
    ],
  },
  {
    label: "Security & Admin",
    labelSo: "Amniga & Admin",
    icon: ShieldCheck,
    items: [
      { title: "Admin Management", titleSo: "Admins", value: "admin-management", icon: Users, permission: "manage_admins" },
      { title: "Audit Log", titleSo: "Taariikhda", value: "audit-log", icon: FileText, permission: "view_audit_log" },
      { title: "Fraud Alerts", titleSo: "Fraud Alerts", value: "fraud-alerts", icon: AlertTriangle, permission: "view_audit_log" },
    ],
  },
];

interface AdminSidebarProps {
  activeTab: string;
  onTabChange: (value: string) => void;
}

export function AdminSidebar({ activeTab, onTabChange }: AdminSidebarProps) {
  const { state, setOpenMobile } = useSidebar();
  const { language } = useLanguage();
  const isMobile = useIsMobile();
  const collapsed = state === "collapsed";
  const [userPermissions, setUserPermissions] = useState<string[] | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const loadPermissions = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Check if super_admin
      const { data: roles } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id);

      const superAdmin = roles?.some(r => r.role === 'super_admin') || false;
      setIsSuperAdmin(superAdmin);

      if (superAdmin) {
        // Super admin gets all access, no need to load specific permissions
        setUserPermissions([]);
      } else {
        const { data: perms } = await supabase
          .from('admin_permissions')
          .select('permission_key')
          .eq('user_id', user.id);

        setUserPermissions(perms?.map(p => p.permission_key) || []);
      }
    };
    loadPermissions();
  }, []);

  // Auto-open the group containing the active tab
  useEffect(() => {
    for (const group of navGroups) {
      if (group.items.some(item => item.value === activeTab)) {
        setOpenGroups(prev => ({ ...prev, [group.label]: true }));
        break;
      }
    }
  }, [activeTab]);

  const handleTabChange = (value: string) => {
    onTabChange(value);
    if (isMobile) {
      setOpenMobile(false);
    }
  };

  const toggleGroup = (label: string) => {
    setOpenGroups(prev => ({ ...prev, [label]: !prev[label] }));
  };

  const hasFullAccess = isSuperAdmin;

  const isItemVisible = (item: NavItem) => {
    if (!item.permission) return true;
    if (hasFullAccess) return true;
    if (userPermissions === null) return false;
    return userPermissions.includes(item.permission);
  };

  return (
    <Sidebar
      className={collapsed && !isMobile ? "w-16" : !isMobile ? "w-56" : ""}
      collapsible={isMobile ? "offcanvas" : "icon"}
    >
      <SidebarContent className="py-2 gap-0.5">
        {navGroups.map((group) => {
          const visibleItems = group.items.filter(isItemVisible);
          if (visibleItems.length === 0) return null;

          const groupHasActive = visibleItems.some(item => item.value === activeTab);
          const isOpen = openGroups[group.label] ?? groupHasActive;
          const GroupIcon = group.icon;

          // In collapsed mode, just show icons without collapsible
          if (collapsed && !isMobile) {
            return (
              <SidebarGroup key={group.label} className="py-0">
                <SidebarGroupLabel className="px-3 flex justify-center">
                  <GroupIcon className="h-3.5 w-3.5" />
                </SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {visibleItems.map((item) => {
                      const Icon = item.icon;
                      const isActive = activeTab === item.value;
                      return (
                        <SidebarMenuItem key={item.value}>
                          <SidebarMenuButton
                            onClick={() => handleTabChange(item.value)}
                            className={isActive ? "bg-primary text-primary-foreground font-medium" : "hover:bg-muted/50"}
                            title={language === 'so' ? item.titleSo : item.title}
                          >
                            <Icon className="h-4 w-4" />
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      );
                    })}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            );
          }

          return (
            <Collapsible
              key={group.label}
              open={isOpen}
              onOpenChange={() => toggleGroup(group.label)}
            >
              <SidebarGroup className="py-0">
                <CollapsibleTrigger asChild>
                  <SidebarGroupLabel className="text-xs uppercase tracking-wider text-muted-foreground/70 px-3 flex items-center gap-2 cursor-pointer hover:bg-muted/30 rounded-md transition-colors">
                    <GroupIcon className="h-3.5 w-3.5 shrink-0" />
                    <span className="flex-1">{language === 'so' ? group.labelSo : group.label}</span>
                    <ChevronRight className={`h-3.5 w-3.5 shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`} />
                  </SidebarGroupLabel>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      {visibleItems.map((item) => {
                        const Icon = item.icon;
                        const isActive = activeTab === item.value;
                        return (
                          <SidebarMenuItem key={item.value}>
                            <SidebarMenuButton
                              onClick={() => handleTabChange(item.value)}
                              className={isActive ? "bg-primary text-primary-foreground font-medium" : "hover:bg-muted/50"}
                              title={language === 'so' ? item.titleSo : item.title}
                            >
                              <Icon className="h-4 w-4 mr-2" />
                              <span className="text-sm truncate">{language === 'so' ? item.titleSo : item.title}</span>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                        );
                      })}
                    </SidebarMenu>
                  </SidebarGroupContent>
                </CollapsibleContent>
              </SidebarGroup>
            </Collapsible>
          );
        })}
      </SidebarContent>
    </Sidebar>
  );
}
