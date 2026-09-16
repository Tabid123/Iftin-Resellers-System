import { useEffect } from 'react';
import { bundledStaticImages } from '@/lib/localImages';
import { useTenant } from '@/contexts/TenantContext';
import { workspaceStorage } from '@/lib/workspaceKeys';

const PRELOAD_BATCH_SIZE = 3;
const PRELOAD_BATCH_DELAY_MS = 140;

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
        batch.forEach((url, batchIndex) => {
          const img = new Image();
          img.decoding = 'async';
          // The first item is the current/first banner. Give it network priority;
          // everything else stays background work.
          if (index === 0 && batchIndex === 0 && 'fetchPriority' in img) {
            (img as HTMLImageElement).fetchPriority = 'high';
          }
          img.src = url;
        });
        index += batch.length;

        if (index < urls.length) {
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

        // Above-the-fold banner first, then provider/payment logos, then category
        // artwork. Previously every custom URL was also fetched a second time by
        // cacheImages(), which competed for bandwidth/decoding and made Android
        // WebView feel heavy during the first taps.
        const orderedUrls: string[] = [
          ...banners.map((b: any) => b.banner_image).filter(Boolean),
          ...providers.map((p: any) => p.provider_logo).filter(Boolean),
          ...paymentProviders.map((pp: any) => pp.provider_logo).filter(Boolean),
          ...categories.map((c: any) => c.category_image).filter(Boolean),
          ...bundledStaticImages,
        ];

        const uniqueUrls = [...new Set(orderedUrls)];
        preloadInBatches(uniqueUrls);

        console.log(`[ImagePreloader] Scheduled ${uniqueUrls.length} tenant images without duplicate cache fetches`);
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
