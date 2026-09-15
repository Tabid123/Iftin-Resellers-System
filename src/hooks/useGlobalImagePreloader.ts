import { useEffect } from 'react';
import { cacheImages } from '@/lib/imageCache';
import { bundledStaticImages, getLocalImage } from '@/lib/localImages';
import { useTenant } from '@/contexts/TenantContext';
import { workspaceStorage } from '@/lib/workspaceKeys';

export const useGlobalImagePreloader = () => {
  const tenantState = useTenant();
  const workspaceId =
    tenantState.status === 'ready' || tenantState.status === 'suspended'
      ? tenantState.tenant.id || null
      : null;

  useEffect(() => {
    // Never preload another workspace's images: wait for resolution, and read
    // only this workspace's snapshots.
    if (!workspaceId) return;
    const preloadAllImages = () => {
      try {
        const providers = workspaceStorage.getJson<any[]>('offline_providers', [], workspaceId);
        const categories = workspaceStorage.getJson<any[]>('offline_categories', [], workspaceId);
        const banners = workspaceStorage.getJson<any[]>('offline_banners', [], workspaceId);
        const paymentProviders = workspaceStorage.getJson<any[]>(
          'offline_payment_providers',
          [],
          workspaceId,
        );
        
        
        // Collect ALL image URLs
        const cachedImageUrls: string[] = [
          ...providers.map((p: any) => p.provider_logo).filter(Boolean),
          ...categories.map((c: any) => c.category_image).filter(Boolean),
          ...banners.map((b: any) => b.banner_image).filter(Boolean),
          ...paymentProviders.map((pp: any) => pp.provider_logo).filter(Boolean),
        ];
        
        // Remove duplicates
        const uniqueUrls = [...new Set([...bundledStaticImages, ...cachedImageUrls])];
        
        // Preload ALL images into browser memory immediately
        uniqueUrls.forEach(url => {
          const img = new Image();
          img.src = url;
        });

        // Known static images are already in the bundle. Cache only custom
        // remote uploads; known provider/category/banner images never need I/O.
        const customRemoteUrls = cachedImageUrls.filter((url) =>
          /^https?:/i.test(url) &&
          !getLocalImage('provider', null, url) &&
          !getLocalImage('payment', null, url) &&
          !getLocalImage('category', null, url) &&
          !getLocalImage('banner', null, url),
        );
        cacheImages(customRemoteUrls);
        
        console.log(`[ImagePreloader] Preloaded ${uniqueUrls.length} images into memory`);
      } catch (error) {
        console.error('[ImagePreloader] Error preloading images:', error);
      }
    };
    
    // Run immediately
    preloadAllImages();
    
    // Also run when coming back online
    window.addEventListener('online', preloadAllImages);
    
    return () => {
      window.removeEventListener('online', preloadAllImages);
    };
  }, [workspaceId]);
};
