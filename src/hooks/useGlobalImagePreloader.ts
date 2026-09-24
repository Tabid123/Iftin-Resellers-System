import { useEffect } from 'react';
import { bundledStaticImages } from '@/lib/localImages';
import { useTenant } from '@/contexts/TenantContext';
import { workspaceStorage } from '@/lib/workspaceKeys';

const PRELOAD_BATCH_SIZE = 8;
const PRELOAD_BATCH_DELAY_MS = 24;

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
          // The first visible storefront artwork should start immediately. The
          // remaining images are still decoded asynchronously so taps stay light.
          if (index === 0 && batchIndex < 4 && 'fetchPriority' in img) {
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

        // Prioritize what the customer sees/taps first: provider logos and
        // category artwork. This prevents category images from appearing one by
        // one after navigation. Banners/payment logos can warm immediately after.
        const orderedUrls: string[] = [
          ...providers.map((p: any) => p.provider_logo).filter(Boolean),
          ...categories.map((c: any) => c.category_image).filter(Boolean),
          ...banners.map((b: any) => b.banner_image).filter(Boolean),
          ...paymentProviders.map((pp: any) => pp.provider_logo).filter(Boolean),
          ...bundledStaticImages,
        ];

        const uniqueUrls = [...new Set(orderedUrls)];
        preloadInBatches(uniqueUrls);

        console.log(`[ImagePreloader] Prioritized ${uniqueUrls.length} tenant images for instant storefront paint`);
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
