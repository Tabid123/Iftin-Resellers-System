import { useEffect } from 'react';
import { cacheImages } from '@/lib/imageCache';
import { bundledStaticImages, getLocalImage } from '@/lib/localImages';
import { useTenant } from '@/contexts/TenantContext';
import { workspaceStorage } from '@/lib/workspaceKeys';

type IdleWindow = Window & {
  requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
  cancelIdleCallback?: (handle: number) => void;
};

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
    let timeoutId: number | null = null;
    let idleId: number | null = null;

    const preloadProgressively = () => {
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

        // Do not decode every image on the main thread during startup. The
        // first small batch covers the visible storefront; the remainder is
        // warmed in small chunks while the browser/WebView is idle.
        const queue = [...uniqueUrls];
        const warmBatch = () => {
          if (cancelled || queue.length === 0) return;
          const batch = queue.splice(0, 6);
          batch.forEach((url) => {
            const img = new Image();
            img.decoding = 'async';
            img.loading = 'eager';
            img.src = url;
          });

          if (queue.length > 0) scheduleNextBatch();
        };

        const scheduleNextBatch = () => {
          if (cancelled) return;
          const idleWindow = window as IdleWindow;
          if (idleWindow.requestIdleCallback) {
            idleId = idleWindow.requestIdleCallback(() => warmBatch(), { timeout: 1200 });
          } else {
            timeoutId = window.setTimeout(warmBatch, 120);
          }
        };

        warmBatch();

        // Known static images are already in the bundle. Cache only custom
        // remote uploads for true offline reuse, but let cacheImages handle I/O
        // independently from image decoding above.
        const customRemoteUrls = cachedImageUrls.filter((url) =>
          /^https?:/i.test(url) &&
          !getLocalImage('provider', null, url) &&
          !getLocalImage('payment', null, url) &&
          !getLocalImage('category', null, url) &&
          !getLocalImage('banner', null, url),
        );
        void cacheImages(customRemoteUrls);
      } catch (error) {
        console.error('[ImagePreloader] Error preloading images:', error);
      }
    };

    preloadProgressively();
    window.addEventListener('online', preloadProgressively);

    return () => {
      cancelled = true;
      window.removeEventListener('online', preloadProgressively);
      if (timeoutId != null) window.clearTimeout(timeoutId);
      const idleWindow = window as IdleWindow;
      if (idleId != null && idleWindow.cancelIdleCallback) idleWindow.cancelIdleCallback(idleId);
    };
  }, [workspaceId]);
};
