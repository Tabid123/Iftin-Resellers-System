import React, { useEffect } from 'react';
import { useNavigate, useParams, useLocation } from "@/lib/router-compat";
import { Phone, MessageCircle, ArrowLeft, Edit } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import RotatingBanner from '@/components/RotatingBanner';
import CachedImage from '@/components/CachedImage';
import { localizeImage } from '@/lib/localImages';
import { Button } from '@/components/ui/button';
import { useConnectivity } from '@/contexts/ConnectivityContext';
import { useTenant } from '@/contexts/TenantContext';
import { useSupportPhone } from '@/hooks/useSupportPhone';
import { fetchIftinCatalog, hasCatalog, isApiPartnerTenant, mapCategories } from '@/lib/iftinCatalog';
import { setCategoryIntent } from '@/lib/categoryIntent';
import { activeWorkspaceId, workspaceQueryKey, workspaceStorage } from '@/lib/workspaceKeys';

interface Category {
  id: string;
  category_name: string;
  display_order: number;
  is_active: boolean;
  provider_id?: string | null;
  category_image?: string | null;
  created_at?: string;
  updated_at?: string;
}

const versionedCategoryImage = (category: Category) => {
  const source = category.category_image?.trim();
  if (!source || !category.updated_at || source.startsWith('data:') || source.startsWith('blob:')) return source;
  try {
    const url = new URL(source);
    url.searchParams.set('updated', category.updated_at);
    return url.toString();
  } catch {
    return source;
  }
};

const CategorySelection = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isReallyOnline } = useConnectivity();
  const queryClient = useQueryClient();
  const tenantState = useTenant();
  const support = useSupportPhone();
  const brandName = (tenantState as any).tenant?.name || 'App';
  const workspaceId =
    tenantState.status === 'ready' || tenantState.status === 'suspended'
      ? tenantState.tenant.id || null
      : null;
  const {
    provider
  } = useParams<{
    provider: string;
  }>();
  const providerName = location.state?.providerName || 'Provider';

  // Show banner ad when component mounts

  // Realtime: categories changes, for this workspace only
  useEffect(() => {
    if (!workspaceId) return;
    const channel = supabase
      .channel(`categories-realtime-${workspaceId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'package_categories',
          filter: `tenant_id=eq.${workspaceId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: workspaceQueryKey(workspaceId, 'categories') });
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient, workspaceId]);

  // Read offline state and phone numbers from navigation
  const isOffline = location.state?.isOffline || false;
  const senderPhone = location.state?.senderPhone || '';
  const receiverPhone = location.state?.receiverPhone || '';
  // First, get the provider ID if we have a provider name instead of UUID
  const {
    data: providerData
  } = useQuery({
    queryKey: workspaceQueryKey(workspaceId, 'provider-lookup', provider),
    queryFn: async () => {
      // Check if provider is already a UUID (contains hyphens)
      if (provider?.includes('-')) {
        return {
          id: provider
        };
      }

      // Resolve from the cached provider list first (no network round trip) —
      // this is what makes tapping a company feel instant.
      {
        const providers = workspaceStorage.getJson<any[]>('offline_providers', [], workspaceId);
        if (providers.length) {
          // Try exact name match first
          let prov = providers.find((p: any) => 
            p.provider_name.toLowerCase() === provider?.toLowerCase()
          );
          // Also try by ID match
          if (!prov) {
            prov = providers.find((p: any) => 
              p.id === provider || p.id.toLowerCase() === provider?.toLowerCase()
            );
          }
          if (prov) {
            return { id: prov.id };
          }
        }
        // Offline with no cache match → don't guess, avoids wrong filtering.
        if (isReallyOnline === false) return null;
      }

      // Otherwise, look up provider by name
      const {
        data,
        error
      } = await supabase.from('providers_config').select('id').ilike('provider_name', provider || '').single();
      if (error) throw error;
      return data;
    },
    enabled: !!provider && Boolean(workspaceId) && !provider?.includes('-'),
    staleTime: 5 * 60 * 1000,
    retry: 1,
    retryDelay: 250,
  });
  const providerId = provider?.includes('-') ? provider : providerData?.id;
  
  // Get cached categories for offline use - completely self-contained, doesn't depend on providerId state
  const getCachedCategories = (): Category[] => {
    try {
      if (!workspaceId) return [];
      const allCategories = workspaceStorage.getJson<Category[]>('offline_categories', [], workspaceId);
      const providers = workspaceStorage.getJson<any[]>('offline_providers', [], workspaceId);

      if (!allCategories.length) return [];
      
      
      // Resolve provider UUID directly from URL param (don't depend on async providerId)
      let actualProviderId: string | null = null;
      
      // If provider param is already a UUID
      if (provider?.includes('-')) {
        actualProviderId = provider;
      } else if (provider) {
        if (!providers.length) return [];
        // Find provider by name or ID in cache
        const prov = providers.find((p: any) => 
          p.provider_name.toLowerCase() === provider.toLowerCase() ||
          p.id === provider ||
          p.id.toLowerCase() === provider.toLowerCase()
        );
        if (prov) {
          actualProviderId = prov.id;
        }
      }
      
      if (!actualProviderId) return [];
      
      // Filter by provider and deduplicate by ID
      const filtered = allCategories.filter(c => String(c.provider_id) === String(actualProviderId));
      const uniqueCategories = Array.from(
        new Map(filtered.map(cat => [cat.id, cat])).values()
      );
      return uniqueCategories;
    } catch (e) {
      console.error('Error loading cached categories:', e);
    }
    return [];
  };

  const {
    data: categories = [],
    isFetching: isFetchingCategories,
  } = useQuery<Category[]>({
    queryKey: workspaceQueryKey(workspaceId, 'categories', providerId || provider),
    queryFn: async () => {
      // Try cache first for offline
      const cachedCategories = getCachedCategories();
      
      // If offline is confirmed, return cache
      if (isReallyOnline === false) {
        return cachedCategories;
      }
      
      // If online but no providerId yet, return cache temporarily
      if (!providerId) {
        return cachedCategories;
      }
      
      if (!workspaceId) return cachedCategories;
      const partner = await isApiPartnerTenant(workspaceId);
      if (activeWorkspaceId() !== workspaceId) return cachedCategories;
      if (partner) {
        const catalog = await fetchIftinCatalog();
        if (activeWorkspaceId() !== workspaceId) return cachedCategories;
        if (hasCatalog(catalog)) {
          return mapCategories(catalog!, providerId) as Category[];
        }
        return cachedCategories;
      }

      // Android-device tenants read their local storefront directly.
      try {
        const {
          data,
          error
        } = await (supabase as any).rpc('get_active_categories', {
          p_provider_id: providerId
        });
        
        if (error || activeWorkspaceId() !== workspaceId) {
          return cachedCategories;
        }
        
        
        const uniqueData = Array.from(
          new Map(((data as any[]) || []).map((cat: Category) => [cat.id, cat])).values()
        );
        return uniqueData as Category[];
      } catch (err) {
        return cachedCategories;
      }
    },
    // Show cache immediately but still fetch fresh data
    placeholderData: () => getCachedCategories(),
    enabled: !!providerId && Boolean(workspaceId),
    staleTime: 5 * 60 * 1000,
    retry: 1,
    retryDelay: 250,
  });

  // Persist category artwork as data URLs the moment we know about it, so the
  // icons paint instantly next time — online or fully offline.
  useEffect(() => {
    if (!categories.length) return;
    const localized = categories.map((category) => ({
      ...category,
      category_image: localizeImage('category', versionedCategoryImage(category), category.category_name, providerName),
    }));
    try {
      // Keep only categories that still belong to other providers, then refresh
      // this provider's entries — stale/removed ones must not linger.
      const existing = workspaceStorage.getJson<any[]>('offline_categories', [], workspaceId) as any[];
      const others = Array.isArray(existing)
        ? existing.filter((c: any) => !providerId || String(c.provider_id) !== String(providerId))
        : [];
      const merged = Array.from(
        new Map([...others, ...localized].map((c: any) => [c.id, c])).values()
      );
      workspaceStorage.setJson('offline_categories', merged, workspaceId);
    } catch { /* ignore */ }
  }, [categories, providerId, providerName, workspaceId]);



  const getBrandBorderClass = (providerName: string) => {
    const providerLower = providerName?.toLowerCase() || '';
    switch (providerLower) {
      case 'hormuud':
        return 'border-hormuud';
      case 'somtel':
        return 'border-somtel';
      case 'somlink':
        return 'border-somlink';
      case 'somnet':
        return 'border-somnet';
      case 'amtel':
        return 'border-amtel';
      default:
        return 'border-primary';
    }
  };
  const handleCategoryClick = (categoryId: string) => {
    // Use providerId (UUID) for navigation instead of provider (which might be name)
    const navProviderId = providerId || provider;
    
    // Get category name to pass through
    const category = categories.find(c => c.id === categoryId);
    const categoryName = category?.category_name || '';

    // Always go to packages page first (both online and offline)
    // User needs to see packages before proceeding to payment
    setCategoryIntent(categoryId, categoryName);
    navigate(`/packages/${navProviderId}`, {
      state: {
        providerName,
        selectedCategoryId: categoryId,
        categoryName, // Pass category name for ADSL detection
        // Pass offline context so payment page knows later
        senderPhone,
        receiverPhone,
        isOffline
      }
    });
  };

  const handleChangeOfflineNumbers = () => {
    navigate('/offline-mode');
  };

  // Get saved offline numbers from localStorage
  const savedSenderPhone = localStorage.getItem('offlineSenderPhone') || '';
  const savedReceiverPhone = localStorage.getItem('offlineReceiverPhone') || '';
  return <div className="min-h-screen bg-background flex flex-col">
      {/* Blue Header - Fixed with safe-area padding for Android 12+ */}
      <div 
        className="fixed top-0 left-0 right-0 z-50" 
        style={{
          background: 'linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--primary)) 100%)',
          paddingTop: 'var(--effective-safe-area-top, 0px)',
          boxSizing: 'border-box' as const
        }}
      >
          <div className="text-white px-4">
           <div className="relative flex h-14 w-full items-center justify-between">
             <ArrowLeft className="w-6 h-6 shrink-0 cursor-pointer hover:opacity-80 transition-opacity text-accent" onClick={() => navigate('/providers')} aria-label="Go back" />
             <h1 className="pointer-events-none absolute inset-x-20 line-clamp-2 text-center text-sm font-bold leading-tight text-accent [overflow-wrap:anywhere] whitespace-normal break-words">{brandName} - {providerName}</h1>
             <div className="flex items-center gap-3 shrink-0 ml-auto">
              <Phone className="w-6 h-6 cursor-pointer hover:opacity-80 transition-opacity" onClick={() => window.open(support.telHref, '_self')} />
              <MessageCircle className="w-6 h-6 cursor-pointer hover:opacity-80 transition-opacity" onClick={() => window.open(support.whatsappHref, '_blank')} />
            </div>
          </div>
        </div>
      </div>

      {/* Content with top padding for fixed header + safe-area */}
      <div 
        className="flex-1"
        style={{ 
          paddingTop: 'calc(3.5rem + var(--effective-safe-area-top, 0px))',
          paddingBottom: 'calc(8rem + env(safe-area-inset-bottom, 0px))' 
        }}
      >
        {/* Rotating Banner Section */}
        <div className="px-4 pt-5 pb-3">
          <RotatingBanner />
        </div>

        {/* Main Content */}
        <div className="p-4 space-y-6">
          {/* Category Selection */}
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-foreground">
              Dooro Nooca Internet-ka
            </h2>
            
            <div className="grid grid-cols-3 gap-3">
              {categories.length === 0 && isFetchingCategories &&
                Array.from({ length: 6 }).map((_, index) => (
                  <div key={`category-skeleton-${index}`} className="h-28 w-full rounded-lg bg-muted animate-pulse" />
                ))}
              {categories.map((category, index) => (
                <button 
                  key={category.id} 
                  onClick={() => handleCategoryClick(category.id)} 
                  className={`bg-card border ${getBrandBorderClass(providerName)} rounded-lg shadow-sm hover:scale-105 active:scale-95 transition-transform hover:shadow-md h-28 w-full flex flex-col items-center justify-center gap-1`}
                >
                  <div 
                    className="w-12 h-12 flex-shrink-0 flex items-center justify-center animate-bounce-in opacity-0"
                    style={{ animationDelay: `${index * 100}ms`, animationFillMode: 'forwards' }}
                  >
                    <CachedImage
                      src={versionedCategoryImage(category)}
                      alt={category.category_name}
                      kind="category"
                      bundledName={category.category_name}
                      providerName={providerName}
                      className="w-12 h-12 object-contain"
                      loading="eager"
                      decoding="sync"
                    />
                  </div>
                  <span className="text-foreground text-center px-2 text-[10px] font-semibold line-clamp-2 leading-tight max-w-full">
                    {category.category_name}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Change Offline Numbers Button - Only show in offline mode */}
      {isOffline && (
        <div className="fixed bottom-20 left-0 right-0 z-40 px-4 pb-2">
          <Button
            onClick={handleChangeOfflineNumbers}
            className="w-full bg-card hover:bg-card/90 text-primary border-2 border-primary shadow-lg font-semibold"
            size="lg"
          >
            <Edit className="w-5 h-5 mr-2" />
            Badal Lambarka
          </Button>
        </div>
      )}

      {/* Bottom Navigation - Fixed */}
    </div>;
};
export default CategorySelection;