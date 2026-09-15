import { useEffect } from 'react';
import { cacheImages } from '@/lib/imageCache';
import { bundledStaticImages, getLocalImage } from '@/lib/localImages';
import { useTenant } from '@/contexts/TenantContext';
import { workspaceStorage } from '@/lib/workspaceKeys';

const PRELOAD_BATCH_SIZE = 4;
const PRELOAD_BATCH_DELAY_MS = 100;

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

    let cancelled = false;
    let batchTimer: number | null = null;

    const preloadInBatches = (urls: string[]) => {
      let index = 0;

      const loadNextBatch = () => {
        if (cancelled) return;

        const batch = urls.slice(index, index + PRELOAD_BATCH_SIZE);
        batch.forEach((url) => {
          const img = new Image();
          img.decoding = 'async';
          img.src = url;
        });
        index += batch.length;

        if (index < urls.length) {
          // Give Android WebView a chance to paint and respond to taps between
          // batches instead of decoding every cached image in one main-thread burst.
          batchTimer = window.setTimeout(loadNextBatch, PRELOAD_BATCH_DELAY_MS);
        }
      };

      loadNextBatch();
    };

    const preloadTenantImages = () => {
      try {
        const providers = workspaceStorage.getJson<any[]>('offline_providers', [], workspaceId);
        const categories = workspaceStorage.getJson<any[]>('offline_categories', [], workspaceId);
        const banners = workspaceStorage.getJson<any[]>('offline_banners', [], workspaceId);
        const paymentProviders = workspaceStorage.getJson<any[]>(
          'offline_payment_providers',
          [],
          workspaceId,
        );

        const cachedImageUrls: string[] = [
          ...providers.map((p: any) => p.provider_logo).filter(Boolean),
          ...categories.map((c: any) => c.category_image).filter(Boolean),
          ...banners.map((b: any) => b.banner_image).filter(Boolean),
          ...paymentProviders.map((pp: any) => pp.provider_logo).filter(Boolean),
        ];

        const uniqueUrls = [...new Set([...bundledStaticImages, ...cachedImageUrls])];
        preloadInBatches(uniqueUrls);

        // Known static images are already in the bundle. Cache only custom
        // remote uploads; known provider/category/banner images never need I/O.
        const customRemoteUrls = cachedImageUrls.filter((url) =>
          /^https?:/i.test(url) &&
          !getLocalImage('provider', null, url) &&
          !getLocalImage('payment', null, url) &&
          !getLocalImage('category', null, url) &&
          !getLocalImage('banner', null, url),
        );
        void cacheImages(customRemoteUrls);

        console.log(`[ImagePreloader] Scheduled ${uniqueUrls.length} tenant images in small batches`);
      } catch (error) {
        console.error('[ImagePreloader] Error preloading images:', error);
      }
    };

    preloadTenantImages();
    window.addEventListener('online', preloadTenantImages);

    return () => {
      cancelled = true;
      if (batchTimer !== null) window.clearTimeout(batchTimer);
      window.removeEventListener('online', preloadTenantImages);
    };
  }, [workspaceId]);
};
