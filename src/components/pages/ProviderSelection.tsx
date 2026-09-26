import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from "@/lib/router-compat";
import RotatingBanner from '@/components/RotatingBanner';
import ProviderCard from '@/components/ProviderCard';
import PopularPackages from '@/components/PopularPackages';
import { Phone, MessageCircle, WifiOff, X, Headphones, Bot } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { toast } from '@/hooks/use-toast';
import { logScreenView } from '@/services/firebase';
import { useConnectivity } from '@/contexts/ConnectivityContext';
import najaxLogo from '@/assets/najax-logo.jpeg';
import { useTenant } from '@/contexts/TenantContext';
import { useSupportPhone } from '@/hooks/useSupportPhone';
import { fetchIftinCatalog, hasCatalog, isApiPartnerTenant, mapProviders, mapCategories, mapPackages } from '@/lib/iftinCatalog';
import { Button } from '@/components/ui/button';
import { localizeImage } from '@/lib/localImages';
import { activeWorkspaceId, workspaceQueryKey, workspaceStorage } from '@/lib/workspaceKeys';
import { BottomNavigation } from '@/components/BottomNavigation';

const StorefrontAIChat = React.lazy(() =>
  import('@/components/StorefrontAIChat').then((m) => ({ default: m.StorefrontAIChat })),
);


interface Provider {
  id: string;
  provider_name: string;
  provider_logo: string | null;
  is_active: boolean;
}

const cachedProvidersMemo: { raw: string | null; value: any[] } = { raw: null, value: [] };

const ProviderSelection = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isReallyOnline } = useConnectivity();
  const t = useTenant();
  const support = useSupportPhone();
  const tenant = t.status === 'ready' || t.status === 'suspended' ? t.tenant : null;
  const brandLogo = tenant?.logo_url || najaxLogo;
  const brandName = tenant?.name || (import.meta.env.VITE_TENANT_NAME as string) || 'App';
  const [showOfflineToast, setShowOfflineToast] = useState(false);
  const [showAI, setShowAI] = useState(false);
  const [showContactSheet, setShowContactSheet] = useState(false);
  
  useEffect(() => {
    logScreenView('ProviderSelection');
  }, []);

  const workspaceId = tenant?.id ?? null;

  // Parsing + logo mapping is called on every render by React Query's
  // placeholderData, so memoize it against the raw cache string.
  const getCachedProviders = useCallback(() => {
    if (!workspaceId) return [];
    try {
      const cached = workspaceStorage.get('offline_providers', workspaceId);
      if (!cached) return [];
      if (cachedProvidersMemo.raw === cached) return cachedProvidersMemo.value;
      const items = JSON.parse(cached);
      const value = items.map((provider: Provider) => ({
        ...provider,
        provider_logo: localizeImage('provider', provider.provider_logo, provider.provider_name),
      }));
      cachedProvidersMemo.raw = cached;
      cachedProvidersMemo.value = value;
      return value;
    } catch {
      return [];
    }
  }, [workspaceId]);

  const { data: providers = [], isFetching: isFetchingProviders } = useQuery({
    queryKey: workspaceQueryKey(workspaceId, 'providers'),
    enabled: Boolean(workspaceId),
    queryFn: async () => {
      if (!workspaceId) return [];
      if (isReallyOnline === false) {
        return getCachedProviders();
      }

      const partner = await isApiPartnerTenant(workspaceId);
      if (activeWorkspaceId() !== workspaceId) return getCachedProviders();

      if (partner) {
        const catalog = await fetchIftinCatalog();
        if (activeWorkspaceId() !== workspaceId) return getCachedProviders();
        if (hasCatalog(catalog)) {
          const fromIftin = mapProviders(catalog!);
          workspaceStorage.setJson('offline_providers', fromIftin, workspaceId);
          return fromIftin;
        }
        return getCachedProviders();
      }

      const { data, error } = await (supabase as any).rpc('get_active_providers');
      if (error) throw error;
      if (activeWorkspaceId() !== workspaceId) return getCachedProviders();

      const freshProviders = (data || []).map((provider: Provider) => ({
        ...provider,
        provider_logo: localizeImage('provider', provider.provider_logo, provider.provider_name),
      }));
      workspaceStorage.setJson('offline_providers', freshProviders, workspaceId);
      return freshProviders;
    },
    initialData: getCachedProviders,
    staleTime: 30 * 1000,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    retry: false,
  });


  const detectProvider = (phone: string): { id: string; name: string } | null => {
    if (phone.length < 2) return null;
    const prefix = phone.substring(0, 2);
    const providerMap: { [key: string]: { id: string; name: string } } = {
      '61': { id: 'hormuud', name: 'Hormuud' },
      '68': { id: 'somnet', name: 'Somnet' },
      '62': { id: 'somtel', name: 'Somtel' },
      '71': { id: 'amtel', name: 'Amtel' },
      '64': { id: 'somlink', name: 'Somlink' }
    };
    return providerMap[prefix] || null;
  };

  const handleOfflineModeClick = () => {
    const savedSenderPhone = localStorage.getItem('offlineSenderPhone') || '';
    const savedReceiverPhone = localStorage.getItem('offlineReceiverPhone') || '';
    
    if (savedSenderPhone && savedReceiverPhone) {
      const provider = detectProvider(savedReceiverPhone);
      if (provider) {
        toast({
          title: "Lambarada hore ayaa la isticmaalayo",
          description: `Diraha: ${savedSenderPhone} | Heelaha: ${savedReceiverPhone}`,
          duration: 3000,
        });
        navigate(`/categories/${provider.id}`, {
          state: { providerName: provider.name, senderPhone: savedSenderPhone, receiverPhone: savedReceiverPhone, isOffline: true }
        });
        return;
      }
    }
    navigate('/offline-mode');
  };

  const handleProviderSelect = (providerId: string, providerName: string) => {
    if (providerName.toLowerCase().includes('offline')) {
      handleOfflineModeClick();
      return;
    }
    if (isReallyOnline === false) {
      setShowOfflineToast(true);
      setTimeout(() => setShowOfflineToast(false), 3000);
      return;
    }

    // Navigation must win the tap. Warm only the destination provider in the
    // background; never fan out requests for every provider during startup.
    if (workspaceId) {
      void queryClient.prefetchQuery({
        queryKey: workspaceQueryKey(workspaceId, 'categories', providerId),
        queryFn: async () => {
          const cached = workspaceStorage
            .getJson<any[]>('offline_categories', [], workspaceId)
            .filter((row: any) => String(row?.provider_id) === String(providerId));
          try {
            const partner = await isApiPartnerTenant(workspaceId);
            if (activeWorkspaceId() !== workspaceId) return cached;
            if (partner) {
              const catalog = await fetchIftinCatalog();
              if (activeWorkspaceId() !== workspaceId) return cached;
              return hasCatalog(catalog) ? mapCategories(catalog!, providerId) : cached;
            }
            const { data, error } = await (supabase as any).rpc('get_active_categories', {
              p_provider_id: providerId,
            });
            return error || activeWorkspaceId() !== workspaceId ? cached : (data || []);
          } catch {
            return cached;
          }
        },
        staleTime: 30 * 1000,
      });
    }

    navigate(`/categories/${providerId}`, { state: { providerName } });
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div 
        className="fixed top-0 left-0 right-0 z-50"
        style={{
          background: 'linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--primary)) 100%)',
          paddingTop: 'var(--effective-safe-area-top, 0px)',
          boxSizing: 'border-box' as const
        }}
      >
        <div className="grid h-14 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4">
          <h1 className="truncate text-xl font-extrabold text-primary-foreground">
            {brandName}
          </h1>
          <div className="flex shrink-0 items-center gap-2.5">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => window.open(support.telHref, '_self')}
              aria-label="Call"
              className="h-10 w-10 rounded-full bg-primary-foreground/10 p-0 text-primary-foreground hover:bg-primary-foreground/20 hover:text-primary-foreground active:scale-95 [&_svg]:size-[22px]"
            >
              <Phone strokeWidth={2} />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setShowAI(true)}
              aria-label="Assistant"
              className="h-10 w-10 rounded-full bg-primary-foreground/10 p-0 text-primary-foreground hover:bg-primary-foreground/20 hover:text-primary-foreground active:scale-95 [&_svg]:size-[22px]"
            >
              <Bot strokeWidth={2.1} />
            </Button>
          </div>
        </div>
      </div>

      {/* Scrollable Content */}
      <div
        className="flex-1 overflow-y-auto"
        style={{
          paddingTop: 'calc(3.5rem + var(--effective-safe-area-top, 0px))',
          paddingBottom: 'calc(5rem + env(safe-area-inset-bottom, 0px))'
        }}
      >

        {/* Banner */}
        <div className="px-4 pt-5 pb-3">
          <RotatingBanner />
        </div>

        {/* Offline Warning */}
        {showOfflineToast && (
          <div className="mx-4 mb-3 p-3 bg-amber-100 dark:bg-amber-900/30 border border-amber-500 rounded-2xl flex items-start gap-2 animate-in slide-in-from-top">
            <WifiOff className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">Internet ma hayso!</p>
              <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                Fadlan isticmaal <span className="font-bold">Offline Mode</span> oo hoos ku yaal →
              </p>
            </div>
          </div>
        )}

        {/* Providers Section */}
        <div className="px-4 space-y-4">
          <h2 className="text-base font-bold text-foreground">Dooro shirkada aa rabtid</h2>
          
          <div className="grid grid-cols-3 gap-3">
            {providers.length === 0 && (!workspaceId || isFetchingProviders) &&
              Array.from({ length: 3 }).map((_, index) => (
                <div key={`provider-skeleton-${index}`} className="h-[92px] rounded-2xl bg-muted animate-pulse" />
              ))}
            {providers.map((provider: Provider) => (
              <div key={provider.id} className={isReallyOnline === false ? 'opacity-60' : ''}>
                <ProviderCard 
                  name={provider.provider_name} 
                  logo={provider.provider_logo || ''} 
                  onClick={() => handleProviderSelect(provider.id, provider.provider_name)}
                  disabled={isReallyOnline === false}
                />
              </div>
            ))}
            
            {/* Offline Mode Card */}
            <button 
              onClick={handleOfflineModeClick}
              className={`relative rounded-2xl p-3 flex flex-col items-center justify-center gap-2 transition-all duration-300 hover:-translate-y-0.5 active:scale-[0.97] ${
                isReallyOnline === false 
                  ? 'animate-bounce shadow-lg' 
                  : ''
              }`}
              style={{ background: tenant?.primary_color ? tenant.primary_color : 'hsl(var(--primary))' }}
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/30">
                <WifiOff className="h-6 w-6 text-white" />
              </div>
              <span className="text-xs font-semibold text-white">Offline Mode</span>
            </button>
          </div>
        </div>

        {/* Live update test button */}
        <div className="px-4 mt-4">
          <button
            type="button"
            className="w-full rounded-xl border border-primary/30 bg-primary/10 px-4 py-2.5 text-sm font-bold text-primary"
          >
            LIVE UPDATE TEST
          </button>
        </div>

        {/* Popular Packages */}
        <div className="px-4 mt-6 mb-4">
          <PopularPackages />
        </div>
      </div>

      {/* Support FAB */}
      <button
        type="button"
        onClick={() => setShowContactSheet((open) => !open)}
        aria-label="Support"
        className={`fixed bottom-24 right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-transform duration-200 hover:scale-105 active:scale-95 ${
          showContactSheet ? 'bg-destructive' : ''
        }`}
        style={!showContactSheet ? { background: 'linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary)))' } : {}}
      >
        {showContactSheet ? (
          <X className="h-7 w-7 text-white" />
        ) : (
          <>
            <Headphones className="h-6 w-6 text-accent" />
            <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[10px] font-extrabold text-primary">
              24
            </span>
          </>
        )}
      </button>

      {showContactSheet && (
        <div className="fixed bottom-40 right-4 z-40 flex flex-col items-center gap-3 animate-in fade-in slide-in-from-bottom-2 duration-150">
          <a
            href={support.telHref}
            onClick={() => setShowContactSheet(false)}
            className="flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-transform hover:scale-105 active:scale-95"
            style={{ background: 'linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary)))' }}
            aria-label="Call support"
          >
            <Phone className="h-7 w-7 text-accent" />
          </a>
          <a
            href={support.whatsappHref}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setShowContactSheet(false)}
            className="flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] shadow-lg transition-transform hover:scale-105 active:scale-95"
            aria-label="WhatsApp support"
          >
            <MessageCircle className="h-7 w-7 text-white" />
          </a>
        </div>
      )}

      <BottomNavigation />

      {showAI && (
        <React.Suspense fallback={null}>
          <StorefrontAIChat open={showAI} onOpenChange={setShowAI} />
        </React.Suspense>
      )}

    </div>
  );
};

export default ProviderSelection;