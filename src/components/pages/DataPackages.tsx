import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams, useLocation } from "@/lib/router-compat";
import { getCategoryIntent } from '@/lib/categoryIntent';
import { ArrowLeft, Wifi, Smartphone, Clock, Zap, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { activeWorkspaceId, workspaceQueryKey, workspaceStorage } from '@/lib/workspaceKeys';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import dataIcon from '@/assets/mobile-data-icon.png';
import { formatPrice } from '@/lib/utils';
import { useOfflineSync } from '@/hooks/useOfflineSync';
import { useToast } from '@/hooks/use-toast';
import { showBannerAd, hideBannerAd } from '@/services/admob';
import { logScreenView } from '@/services/firebase';
import { useConnectivity } from '@/contexts/ConnectivityContext';
import { useTenant } from '@/contexts/TenantContext';
import { buildPaymentUssd, formatUssdAmount, fetchIftinCatalog, hasCatalog, isApiPartnerTenant, isOrderingBlocked, mapProviders, mapCategories, mapPackages } from '@/lib/iftinCatalog';
import UssdDiscoveryDialog, { type DiscoveryChoice } from '@/components/UssdDiscoveryDialog';
import MaamuusFlow from '@/components/ussd/MaamuusFlow';


interface Category {
  id: string;
  category_name: string;
  display_order: number;
  is_active: boolean;
  provider_id: string | null;
}

interface DataPackage {
  id: string;
  package_name: string;
  data_amount: string;
  validity_days: string;
  selling_price: number;
  cost_price: number | null;
  hide_cost_price?: boolean;
  is_active: boolean;
  category_id: string | null;
  connection_type_label: string;
  provider_id: string;
  ussd_code: string | null;
}

const DataPackages = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { provider } = useParams<{ provider: string }>();
  const categoryIntent = getCategoryIntent();
  const providerName = location.state?.providerName || 'Provider';
  const selectedPackageId = location.state?.selectedPackageId;
  const selectedCategoryId = location.state?.selectedCategoryId || categoryIntent?.id || '';
  const { isReallyOnline } = useConnectivity();
  const tenantState = useTenant();
  const brandName = (tenantState as any).tenant?.name || 'App';
  const workspaceId = (tenantState as any).tenant?.id ?? null;
  
  
  // Get offline context passed from category selection
  const isOffline = location.state?.isOffline || false;
  const senderPhone = location.state?.senderPhone || '';
  const receiverPhone = location.state?.receiverPhone || '';
  
  const [activeTab, setActiveTab] = useState('All');
  const packageRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});
  const queryClient = useQueryClient();
  const [showConfirmationScreen, setShowConfirmationScreen] = useState(false);
  const [selectedPackageData, setSelectedPackageData] = useState<any>(null);
  const [ussdCopied, setUssdCopied] = useState(false);
  const [discoveryRootPackage, setDiscoveryRootPackage] = useState<any | null>(null);
  const { queueOrder } = useOfflineSync();
  const { toast } = useToast();

  /**
   * Offline mode uses the number/prefix the tenant entered in the
   * "Offline Payment Settings" tab (app_settings). It overrides whatever
   * the cached payment provider row says.
   */
  const withTenantOfflinePayment = (pp: any) => {
    const settings = workspaceStorage.getJson<any[]>('offline_app_settings', [], workspaceId) || [];
    const number = String(
      settings.find((s: any) => s?.setting_key === 'payment_number')?.text_value ?? '',
    ).replace(/\D/g, '');
    const prefix = String(
      settings.find((s: any) => s?.setting_key === 'payment_prefix')?.text_value ?? '',
    ).trim();
    if (!number && !prefix) return pp ?? {};
    return {
      ...(pp ?? {}),
      ...(number ? { payment_number: number } : {}),
      ...(prefix ? { ussd_prefix: prefix, ussd_code_template: null } : {}),
    };
  };
  

  // Show AdMob banner on mount, hide on unmount
  useEffect(() => {
    showBannerAd();
    logScreenView('DataPackages');
    return () => {
      hideBannerAd();
    };
  }, []);

  // Realtime: packages & categories changes
  useEffect(() => {
    if (!workspaceId) return;
    const filter = `tenant_id=eq.${workspaceId}`;
    const channel = supabase
      .channel(`packages-realtime-${workspaceId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'data_packages_config', filter }, () => {
        queryClient.invalidateQueries({ queryKey: workspaceQueryKey(workspaceId, 'packages', provider) });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'package_categories', filter }, () => {
        queryClient.invalidateQueries({ queryKey: workspaceQueryKey(workspaceId, 'categories', provider) });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient, provider, workspaceId]);


  const getCachedCategories = (): Category[] => {
    if (!workspaceId) return [];
    const allCategories = workspaceStorage.getJson<Category[]>('offline_categories', [], workspaceId);
    if (!Array.isArray(allCategories)) return [];
    return provider
      ? allCategories.filter((c: any) => String(c.provider_id) === String(provider))
      : allCategories;
  };

  const { data: categories = [] } = useQuery({
    queryKey: workspaceQueryKey(workspaceId, 'categories', provider),
    queryFn: async () => {
      const cachedCategories = getCachedCategories();
      if (isReallyOnline === false || !workspaceId) return cachedCategories;

      const partner = await isApiPartnerTenant(workspaceId);
      if (activeWorkspaceId() !== workspaceId) return cachedCategories;
      if (partner) {
        const catalog = await fetchIftinCatalog();
        if (activeWorkspaceId() !== workspaceId) return cachedCategories;
        if (hasCatalog(catalog)) return mapCategories(catalog!, provider || null);
        return cachedCategories;
      }

      const { data, error } = await (supabase as any).rpc('get_active_categories', {
        p_provider_id: provider || null,
      });
      if (error || activeWorkspaceId() !== workspaceId) return cachedCategories;
      return (data as any[]) || [];
    },
    enabled: !!provider && Boolean(workspaceId),
    staleTime: 5 * 60 * 1000,
    retry: 1,
    retryDelay: 250,
    placeholderData: getCachedCategories,
  });

  // Get cached packages - self-contained, resolves provider UUID internally
  const getCachedPackages = (): DataPackage[] => {
    try {
      const cached = workspaceStorage.get('offline_packages', workspaceId);
      const cachedProviders = workspaceStorage.get('offline_providers', workspaceId);
      
      if (!cached) return [];
      
      const allPackages = JSON.parse(cached);
      
      // Resolve provider UUID from URL param
      let actualProviderId: string | null = null;
      
      // If provider param is already a UUID
      if (provider?.includes('-')) {
        actualProviderId = provider;
      } else if (provider && cachedProviders) {
        // Find provider by name in cache
        const providers = JSON.parse(cachedProviders);
        const prov = providers.find((p: any) => 
          p.provider_name.toLowerCase() === provider.toLowerCase() ||
          p.id === provider
        );
        if (prov) {
          actualProviderId = prov.id;
        }
      }
      
      if (!actualProviderId) return [];
      
      return allPackages[actualProviderId] || [];
    } catch (e) {
      console.error('Error loading cached packages:', e);
    }
    return [];
  };

  const { data: packages = [], isFetching: isFetchingPackages } = useQuery({
    queryKey: workspaceQueryKey(workspaceId, 'packages', provider),
    queryFn: async () => {
      // Try cache first for offline
      const cachedPackages = getCachedPackages();
      
      // If offline is confirmed, return cache
      if (isReallyOnline === false) {
        return cachedPackages;
      }
      
      if (!workspaceId) return cachedPackages;
      const partner = await isApiPartnerTenant(workspaceId);
      if (activeWorkspaceId() !== workspaceId) return cachedPackages;
      if (partner) {
        const catalog = await fetchIftinCatalog();
        if (activeWorkspaceId() !== workspaceId) return cachedPackages;
        if (hasCatalog(catalog)) {
          const list = mapPackages(catalog!, provider?.includes('-') ? provider : null);
          if (list.length) return list;
          const byName = mapProviders(catalog!).find(
            p => p.provider_name.toLowerCase() === provider?.toLowerCase(),
          );
          if (byName) return mapPackages(catalog!, byName.id);
        }
        return cachedPackages;
      }

      // Android-device tenants read their local packages directly.
      if (!provider?.includes('-')) {
        // Try to resolve UUID
        const cachedProviders = workspaceStorage.get('offline_providers', workspaceId);
        if (cachedProviders) {
          const providers = JSON.parse(cachedProviders);
          const prov = providers.find((p: any) => 
            p.provider_name.toLowerCase() === provider?.toLowerCase()
          );
          if (prov) {
            const { data, error } = await (supabase as any).rpc('get_public_packages', { p_provider_id: prov.id });
            if (error || activeWorkspaceId() !== workspaceId) return cachedPackages;
            const fresh = (data as any[]) || [];
            try {
              const allCached = workspaceStorage.getJson<Record<string, any[]>>('offline_packages', {}, workspaceId) || {};
              workspaceStorage.setJson('offline_packages', { ...allCached, [prov.id]: fresh }, workspaceId);
            } catch {}
            return fresh;
          }
        }
        return cachedPackages;
      }
      
      const { data, error } = await (supabase as any).rpc('get_public_packages', { p_provider_id: provider });
      if (error || activeWorkspaceId() !== workspaceId) return cachedPackages;
      const fresh = (data as any[]) || [];
      try {
        const allCached = workspaceStorage.getJson<Record<string, any[]>>('offline_packages', {}, workspaceId) || {};
        workspaceStorage.setJson('offline_packages', { ...allCached, [provider]: fresh }, workspaceId);
      } catch {}
      return fresh;
    },
    enabled: !!provider,
    staleTime: 60 * 1000,
    retry: 1,
    retryDelay: 250,
    // Show cache immediately but still fetch fresh data
    placeholderData: () => getCachedPackages(),
  });

  const resolvedProviderId = (() => {
    if (provider?.includes('-')) return provider;
    const fromPackages = packages.find((p: any) => p?.provider_id)?.provider_id;
    if (fromPackages) return fromPackages;
    try {
      const cachedProviders = JSON.parse(workspaceStorage.get('offline_providers', workspaceId) || '[]');
      return cachedProviders.find((p: any) =>
        p.id === provider || p.provider_name?.toLowerCase() === provider?.toLowerCase()
      )?.id || '';
    } catch {
      return '';
    }
  })();

  const { data: discoveryRootIds = [] } = useQuery({
    queryKey: ['discoveryRootIds', resolvedProviderId],
    queryFn: async () => {
      if (!resolvedProviderId || isReallyOnline === false) return [];
      const { data, error } = await (supabase as any).rpc('get_discovery_root_ids', {
        p_provider_id: resolvedProviderId,
      });
      if (error) {
        console.warn('Discovery roots unavailable:', error.message);
        return [];
      }
      return (data || []).map((row: any) => String(row.package_id));
    },
    enabled: !!resolvedProviderId && isReallyOnline !== false,
    staleTime: 5 * 60 * 1000,
    retry: false,
    initialData: [],
  });

  // This line identifies the tenant, not the mobile provider. Derive it from
  // the active tenant so an old provider promo can never leak another brand.
  const promotionalText = `${brandName} ka iibso Internet adigoona qof wicin, waqti kasta, xitaa offline!`;

  const getFilteredPackages = () => {
    // If coming from category selection, filter by that category
    if (selectedCategoryId) {
      return packages.filter(pkg => pkg.category_id === selectedCategoryId);
    }
    
    if (activeTab === 'All') return packages;
    
    const selectedCategory = categories.find(c => c.category_name === activeTab);
    if (!selectedCategory) return packages;
    
    return packages.filter(pkg => pkg.category_id === selectedCategory.id);
  };

  const getSelectedCategoryName = () => {
    if (selectedCategoryId) {
      const category = categories.find(c => c.id === selectedCategoryId);
      return category?.category_name || location.state?.categoryName || categoryIntent?.name || '';
    }
    return '';
  };

  const filteredPackages = getFilteredPackages();

  // Scroll to selected package when page loads
  useEffect(() => {
    if (selectedPackageId && packageRefs.current[selectedPackageId]) {
      setTimeout(() => {
        packageRefs.current[selectedPackageId]?.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'center' 
        });
      }, 300);
    }
  }, [selectedPackageId, filteredPackages]);

  const getBrandBackgroundClass = (providerName: string) => {
    const providerLower = providerName?.toLowerCase() || '';
    switch (providerLower) {
      case 'hormuud':
        return 'bg-hormuud';
      case 'somtel':
        return 'bg-somtel';
      case 'somlink':
        return 'bg-somlink';
      case 'somnet':
        return 'bg-somnet';
      case 'amtel':
        return 'bg-amtel';
      default:
        return 'bg-primary';
    }
  };

  const handlePurchase = (packageData: any) => {
    if (isOrderingBlocked()) {
      toast({
        title: 'Dalab lama sameyn karo',
        description: 'Xadka deynta (credit limit) waa la gaaray. Fadlan bixi fatuuradda.',
        variant: 'destructive',
      });
      return;
    }

    const rawSelected: any = packages.find((p: any) => p.id === packageData.id) || {};
    const isDiscoveryRoot = discoveryRootIds.includes(String(packageData.id))
      || rawSelected?.is_discovery_root === true
      || String(rawSelected?.ussd_code ?? rawSelected?.package_code ?? '').startsWith('*212');
    if (isDiscoveryRoot) {
      if (isReallyOnline !== true || isOffline) {
        toast({
          title: 'Internet ayaa loo baahan yahay',
          description: 'Xirmadan *212* waxay u baahan tahay raadinta live-ka ah ka hor lacag bixinta.',
          variant: 'destructive',
        });
        return;
      }
      const rawPackage = packages.find((p: any) => p.id === packageData.id);
      setDiscoveryRootPackage({ ...rawPackage, ...packageData, providerId: packageData.providerId || rawPackage?.provider_id || resolvedProviderId });
      return;
    }

    const packageCategory = categories.find(c => c.id === packageData.categoryId);
    const categoryName = packageCategory?.category_name || '';
    if (isOffline) {
      setSelectedPackageData(packageData);
      setShowConfirmationScreen(true);
    } else {
      navigate(`/payment/${provider}`, { state: { package: packageData, providerName, categoryName } });
    }
  };

  const handleDiscoverySelect = (choice: DiscoveryChoice, discoveredReceiver: string, discoveryId: string) => {
    if (!discoveryRootPackage || choice.selling_price == null) return;
    const packageCategory = categories.find(c => c.id === discoveryRootPackage.categoryId);
    const categoryName = packageCategory?.category_name || '';
    const carrierLabel = choice.carrier_label || choice.label;
    const dynamicPackage = {
      id: discoveryRootPackage.id,
      providerId: discoveryRootPackage.providerId || discoveryRootPackage.provider_id || resolvedProviderId,
      categoryId: discoveryRootPackage.categoryId || discoveryRootPackage.category_id || null,
      name: choice.label,
      price: `$${Number(choice.selling_price).toFixed(2)}`,
      costPrice: Number(discoveryRootPackage.costPrice ?? discoveryRootPackage.cost_price ?? 0),
      data: choice.info_line1 || choice.label,
      validity: choice.info_line2 || choice.label,
      ussdCode: discoveryRootPackage.ussdCode || discoveryRootPackage.ussd_code || null,
    };
    setDiscoveryRootPackage(null);
    navigate(`/payment/${provider}`, {
      state: { package: dynamicPackage, providerName, categoryName, discoveryId, discoveryLabel: carrierLabel, discoveryReceiverPhone: discoveredReceiver, discoveryRootId: discoveryRootPackage.id },
    });
  };

  const handleOfflineConfirmPurchase = () => {
    if (!selectedPackageData) return;

    const amount = selectedPackageData.price?.replace('$', '') || '0';
    
    // Get payment number from cached payment providers (admin-configured)
    const cachedPaymentProviders = workspaceStorage.get('offline_payment_providers', workspaceId);
    const paymentProvidersList = cachedPaymentProviders ? JSON.parse(cachedPaymentProviders) : [];
    const senderPrefix = senderPhone?.substring(0, 2) || '';
    const payProvider = withTenantOfflinePayment(
      paymentProvidersList.find((pp: any) => pp.prefix_code && senderPrefix && String(pp.prefix_code).startsWith(senderPrefix))
      ?? paymentProvidersList[0],
    );
    const paymentNumber = payProvider?.payment_number || '';

    // USSD string built strictly from the payment provider data (no hardcoding)
    const amountFormatted = formatUssdAmount(amount);
    const ussdCode = buildPaymentUssd(payProvider ?? {}, amountFormatted) ?? '';
    
    // Create offline order and queue it
    // customer_phone = app login phone (verifiedPhone), fallback to senderPhone
    const verifiedPhone = localStorage.getItem('verifiedPhone') || '';
    const customerPhone = verifiedPhone.startsWith('+252') ? verifiedPhone.substring(4) : (verifiedPhone || senderPhone);
    
    const offlineOrderData = {
      customer_phone: customerPhone,    // app login phone
      sender_phone: senderPhone,        // phone user pays FROM
      receiver_phone: receiverPhone,    // phone that gets data package
      package_id: selectedPackageData.id || '',
      provider_id: provider || '',
      payment_provider_id: '',
      package_name: selectedPackageData.name || 'Data Package',
      data_amount: selectedPackageData.data || '',
      selling_price: parseFloat(amount),
      // cost_price = Iftin base price (never the sell price)
      cost_price: Number(selectedPackageData.costPrice ?? 0),
      payment_number: paymentNumber,    // company number where money is sent TO
      status: 'pending_payment',
      delivery_status: 'pending'
    };
    
    const queuedOrderId = queueOrder(offlineOrderData as any);

    // Trigger USSD dial — encode so Android dialers keep the leading "*" and the trailing "#"
    window.location.href = `tel:${encodeURIComponent(ussdCode)}`;
    
    // Show toast message after USSD dialer opens (user sees it while in USSD)
    setTimeout(() => {
      toast({
        title: "WAX HAKA BEDELIN 😊",
      });
    }, 500);

    // Skip success screen for offline - go directly to home
    setTimeout(() => {
      setShowConfirmationScreen(false);
      navigate('/');
    }, 2000);
  };

  const getBrandColor = (providerName: string) => {
    const providerLower = providerName?.toLowerCase() || '';
    switch (providerLower) {
      case 'hormuud':
        return 'text-hormuud';
      case 'somtel':
        return 'text-somtel';
      case 'somlink':
        return 'text-somlink';
      case 'somnet':
        return 'text-somnet';
      case 'amtel':
        return 'text-amtel';
      default:
        return 'text-primary';
    }
  };

  const getBrandButtonClass = (providerName: string) => {
    const providerLower = providerName?.toLowerCase() || '';
    switch (providerLower) {
      case 'hormuud':
        return 'bg-hormuud hover:bg-hormuud/90';
      case 'somtel':
        return 'bg-somtel hover:bg-somtel/90';
      case 'somlink':
        return 'bg-somlink hover:bg-somlink/90';
      case 'somnet':
        return 'bg-somnet hover:bg-somnet/90';
      case 'amtel':
        return 'bg-amtel hover:bg-amtel/90';
      default:
        return 'bg-primary hover:bg-primary/90';
    }
  };

  const getIcon = (feature: string) => {
    const iconClass = `w-4 h-4 ${getBrandColor(provider || '')}`;
    if (feature.includes('Internet')) return <Wifi className={iconClass} />;
    if (feature.includes('App')) return <Smartphone className={iconClass} />;
    return <Clock className={iconClass} />;
  };


  // *212* Maamuus: haddii xirmooyinka la muujinayo ay dhammaantood yihiin discovery roots,
  // waxaa la furayaa flow-ga gaarka ah ee live-ka ah (halkii liiska caadiga ah).
  const isMaamuusRoot = (p: any) =>
    discoveryRootIds.includes(String(p.id)) ||
    p?.is_discovery_root === true ||
    String(p?.ussd_code ?? p?.package_code ?? '').startsWith('*212');
  const maamuusRoots = filteredPackages.filter(isMaamuusRoot);
  const selectedCategoryName =
    getSelectedCategoryName() ||
    location.state?.categoryName ||
    categoryIntent?.name ||
    '';
  const isMaamuusCategory = selectedCategoryName.trim().toLowerCase() === 'maamuus';
  const maamuusListRoots = isMaamuusCategory ? filteredPackages : maamuusRoots;

  // Maamuus category must always use the compact root list UI immediately.
  // Do not wait for discoveryRootIds to finish loading, otherwise the page can
  // briefly/finally fall back to the normal $0 package cards.
  if (
    maamuusListRoots.length > 0 &&
    (isMaamuusCategory || maamuusRoots.length === filteredPackages.length)
  ) {
    return (
      <MaamuusFlow
        roots={maamuusListRoots}
        providerName={providerName}
        brandName={brandName}
        onBack={() => navigate(-1)}
        onRootSelect={(root: any) => {
          const packageCategory = categories.find(c => c.id === (root.category_id || root.categoryId));
          navigate(`/payment/${provider}`, {
            state: {
              package: {
                id: root.id,
                providerId: root.provider_id || root.providerId || resolvedProviderId,
                categoryId: root.category_id || root.categoryId || null,
                name: root.package_name || root.name,
                price: '',
                costPrice: Number(root.cost_price ?? root.costPrice ?? 0),
                data: root.data_amount || '',
                validity: root.validity_days || '',
                ussdCode: root.ussd_code || root.ussdCode || null,
              },
              providerName,
              categoryName: packageCategory?.category_name || '',
              discoveryRootId: root.id,
              discoveryPending: true,
            },
          });
        }}
        onSelect={(sel) => {
          const packageCategory = categories.find(c => c.id === (sel.root.category_id || sel.root.categoryId));
          const dynamicPackage = {
            id: sel.root.id,
            providerId: sel.root.provider_id || sel.root.providerId || resolvedProviderId,
            categoryId: sel.root.category_id || sel.root.categoryId || null,
            name: sel.choice.label,
            price: `$${Number(sel.choice.selling_price).toFixed(2)}`,
            costPrice: Number(sel.root.cost_price ?? sel.root.costPrice ?? 0),
            data: sel.choice.info_line1 || sel.choice.label,
            validity: sel.choice.info_line2 || sel.choice.label,
            ussdCode: sel.root.ussd_code || sel.root.ussdCode || null,
          };
          navigate(`/payment/${provider}`, {
            state: {
              package: dynamicPackage,
              providerName,
              categoryName: packageCategory?.category_name || '',
              discoveryId: sel.discoveryId,
              discoveryLabel: sel.choice.carrier_label || sel.choice.label,
              discoveryIndex: sel.choice.index,
              discoveryReceiverPhone: sel.receiverPhone,
              discoveryRootId: sel.root.id,
              prefillSenderPhone: sel.senderPhone,
              prefillPaymentProviderId: sel.paymentProviderId,
            },
          });
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header with safe-area padding for Android 12+ */}
      <div 
        className={`${getBrandBackgroundClass(providerName)} text-white py-4 px-5`}
        style={{ paddingTop: 'calc(1rem + var(--effective-safe-area-top, 0px))', boxSizing: 'border-box' as const }}
      >
        <div className="grid grid-cols-[40px_minmax(0,1fr)_40px] items-center gap-3 min-h-[56px]">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(-1)}
            className="text-white hover:bg-white/20 w-10 h-10 shrink-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="min-w-0 text-center px-2">
            <h1 className="text-base sm:text-lg font-bold leading-snug [overflow-wrap:anywhere] whitespace-normal break-words">
              {getSelectedCategoryName() || location.state?.categoryName || categoryIntent?.name || brandName}
            </h1>
            {providerName && providerName !== 'Provider' && (
              <p className="text-white/80 text-sm leading-snug [overflow-wrap:anywhere] whitespace-normal break-words">{providerName}</p>
            )}
          </div>
          <div className="w-10" />
        </div>
      </div>

      {/* Tab Navigation - Only show if not coming from category selection */}
      {!selectedCategoryId && (
        <div className="bg-card border-b border-border">
          <div className="flex overflow-x-auto">
            <button
              onClick={() => setActiveTab('All')}
              className={`px-6 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                activeTab === 'All'
                  ? `border-primary ${getBrandColor(providerName)} bg-primary/10`
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              All
            </button>
            {categories.map((category) => (
              <button
                key={category.id}
                onClick={() => setActiveTab(category.category_name)}
                className={`px-6 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                  activeTab === category.category_name
                    ? `border-primary ${getBrandColor(providerName)} bg-primary/10`
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                {category.category_name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Promotional Text */}
      <div className="p-4 bg-primary/5">
        <p className="text-sm text-foreground/80 text-center">
          {promotionalText}
        </p>
      </div>

      {/* Data Packages */}
      <div className="p-4 space-y-4">
        {filteredPackages.length === 0 && isFetchingPackages &&
          Array.from({ length: 4 }).map((_, index) => (
            <div key={`package-skeleton-${index}`} className="h-36 rounded-xl border border-border bg-muted animate-pulse" />
          ))}
        {filteredPackages.map((pkg) => {
          return (
          <div 
            key={pkg.id} 
            ref={(el) => { packageRefs.current[pkg.id] = el; }}
            className={`bg-card rounded-xl border border-border shadow-sm p-4 transition-all ${
              selectedPackageId === pkg.id ? 'ring-2 ring-primary shadow-lg' : ''
            }`}
          >
            <div className="flex justify-between items-start mb-2">
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-foreground">{pkg.package_name}</h3>
              </div>
              <div className="text-right">
                {pkg.cost_price !== null && pkg.cost_price !== undefined && (
                  <span className="text-sm text-destructive line-through mr-2">
                    ${formatPrice(pkg.cost_price)}
                  </span>
                )}

                <span className={`text-2xl font-bold ${getBrandColor(providerName)}`}>${formatPrice(pkg.selling_price)}</span>
              </div>
            </div>
            <div className={`h-0.5 mb-3 ${getBrandColor(providerName).replace('text-', 'bg-')}`} style={{ width: '100%' }}></div>

            <div className="space-y-2 mb-4">
              <div className="flex items-center gap-2">
                <div 
                  className="w-5 h-5"
                  style={{
                    WebkitMaskImage: `url(${dataIcon})`,
                    maskImage: `url(${dataIcon})`,
                    WebkitMaskSize: 'contain',
                    maskSize: 'contain',
                    WebkitMaskRepeat: 'no-repeat',
                    maskRepeat: 'no-repeat',
                  }}
                >
                  <div className={`w-full h-full ${getBrandColor(providerName).replace('text-', 'bg-')}`} />
                </div>
                <span className="text-sm text-muted-foreground">{pkg.data_amount}</span>
              </div>
              <div className="flex items-center gap-2">
                <Smartphone className={`w-4 h-4 ${getBrandColor(providerName)}`} />
                <span className="text-sm text-muted-foreground">{pkg.connection_type_label || 'Mobile Internet'}</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className={`w-4 h-4 ${getBrandColor(providerName)}`} />
                <span className="text-sm text-muted-foreground">{pkg.validity_days}</span>
              </div>
            </div>

            <Button 
              onClick={() => handlePurchase({ 
                id: pkg.id,
                providerId: pkg.provider_id || resolvedProviderId || provider,
                categoryId: pkg.category_id,
                name: pkg.package_name, 
                price: `$${formatPrice(pkg.selling_price)}`,
                // cost_price sida Iftin uu u yahay — lama beddelo
                costPrice: Number(pkg.cost_price ?? (pkg as any).base_price ?? 0),
                data: pkg.data_amount,
                validity: pkg.validity_days,
                ussdCode: pkg.ussd_code
              })}
              className={`w-full ${getBrandButtonClass(providerName)} text-white font-semibold py-3 rounded-lg hover:opacity-90 transition-opacity`}
            >
              IIBSO
            </Button>
          </div>
        )})}
      </div>

      <UssdDiscoveryDialog
        open={!!discoveryRootPackage}
        rootPackage={discoveryRootPackage}
        providerName={providerName}
        onClose={() => setDiscoveryRootPackage(null)}
        onSelect={handleDiscoverySelect}
      />

      {/* Offline Confirmation Screen */}
      {showConfirmationScreen && isOffline && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-2xl p-6 w-full max-w-md space-y-4 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-center text-foreground">XAQIIJIN IIBSI</h2>
            
            {/* Package Details Card */}
            <div className="bg-card rounded-lg border border-border shadow-sm p-4">
              <div className="flex justify-between items-start mb-2">
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-foreground">{selectedPackageData?.name || 'Package'}</h3>
                </div>
                <div className="text-right">
                  <span className={`text-2xl font-bold ${getBrandColor(providerName)}`}>{selectedPackageData?.price}</span>
                </div>
              </div>
              <div className={`h-0.5 mb-3 ${getBrandColor(providerName).replace('text-', 'bg-')}`} style={{ width: '100%' }}></div>

              <div className="space-y-2 mb-4">
                <div className="flex items-center gap-2">
                  <Zap className={`w-4 h-4 ${getBrandColor(providerName)}`} />
                  <span className="text-sm text-muted-foreground">{selectedPackageData?.data || 'Data'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Smartphone className={`w-4 h-4 ${getBrandColor(providerName)}`} />
                  <span className="text-sm text-muted-foreground">Mobile Internet</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className={`w-4 h-4 ${getBrandColor(providerName)}`} />
                  <span className="text-sm text-muted-foreground">{selectedPackageData?.validity || 'Validity'}</span>
                </div>
              </div>
            </div>

            {/* Sender Number */}
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground font-medium uppercase">Lambarka lacagta diraayo</p>
              <div className="flex items-center gap-3 bg-muted rounded-lg p-3 border border-border">
                <span className="text-lg font-bold text-foreground">+252-{senderPhone}</span>
              </div>
            </div>

            {/* Receiver Number */}
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground font-medium uppercase">Lambarka xirmada helaayo</p>
              <div className="flex items-center gap-3 bg-muted rounded-lg p-3 border border-border">
                <span className="text-lg font-bold text-foreground">+252-{receiverPhone}</span>
              </div>
            </div>

            {/* Confirmation Message - Flashing Warning */}
            <div className="bg-destructive text-destructive-foreground p-3 rounded-lg text-center animate-pulse">
              <p className="font-semibold text-sm">
                Ma hubtaa inaad {selectedPackageData?.price} ka dirtid {senderPhone}?
              </p>
            </div>

            {/* USSD Code with Copy Button */}
            {(() => {
              const amount = selectedPackageData?.price?.replace('$', '') || '0';
              const sp = senderPhone?.substring(0, 2) || '';
              const cachedPP = workspaceStorage.get('offline_payment_providers', workspaceId);
              const ppList = cachedPP ? JSON.parse(cachedPP) : [];
              const pp = withTenantOfflinePayment(
                ppList.find((x: any) => x.prefix_code && sp && String(x.prefix_code).startsWith(sp)) ?? ppList[0],
              );

              const amountFormatted = formatUssdAmount(amount);
              const ussdCode = buildPaymentUssd(pp ?? {}, amountFormatted) ?? '';
              
              const handleCopyUssd = async () => {
                try {
                  await navigator.clipboard.writeText(ussdCode);
                  setUssdCopied(true);
                  toast({
                    title: "La koobiyeeyey!",
                    description: "USSD code-ka waa la koobiyeeyey",
                    duration: 2000
                  });
                  setTimeout(() => setUssdCopied(false), 2000);
                } catch (e) {
                  toast({
                    title: "Khalad",
                    description: "Ma koobiyeyn karin",
                    variant: "destructive"
                  });
                }
              };
              
              return (
                <div 
                  onClick={handleCopyUssd}
                  className="flex items-center justify-between bg-muted rounded-lg p-3 border border-border cursor-pointer hover:bg-muted/80 transition-colors"
                >
                  <span className="text-lg font-bold text-accent-foreground">{ussdCode}</span>
                  <button className="p-2 hover:bg-background rounded-lg transition-colors">
                    {ussdCopied ? (
                      <Check className="w-5 h-5 text-accent-foreground" />
                    ) : (
                      <Copy className="w-5 h-5 text-muted-foreground" />
                    )}
                  </button>
                </div>
              );
            })()}

            {/* Action Buttons */}
            <div className="flex gap-3 pt-2">
              <Button 
                variant="outline" 
                onClick={() => setShowConfirmationScreen(false)} 
                className="flex-1 py-5 text-base font-bold border-2"
              >
                MAYA
              </Button>
              <Button 
                onClick={handleOfflineConfirmPurchase} 
                className="flex-1 py-5 text-base font-bold bg-accent text-accent-foreground hover:bg-accent/90"
              >
                HADA IIBSO
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DataPackages;