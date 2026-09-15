import { useEffect } from 'react';
import { cacheImages } from '@/lib/imageCache';
import { bundledStaticImages, getLocalImage } from '@/lib/localImages';
import { useTenant } from '@/contexts/TenantContext';
import { workspaceStorage } from '@/lib/workspaceKeys';

const IMMEDIATE_IMAGE_COUNT = 10;
const IDLE_BATCH_SIZE = 8;

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
    const scheduled: number[] = [];

    const scheduleIdle = (callback: () => void, timeout = 1200) => {
      const idle = (window as any).requestIdleCallback as
        | ((cb: () => void, options?: { timeout: number }) => number)
        | undefined;
      if (idle) {
        const id = idle(() => !cancelled && callback(), { timeout });
        scheduled.push(id);
      } else {
        const id = window.setTimeout(() => !cancelled && callback(), 150);
        scheduled.push(id);
      }
    };

    const preload = () => {
      try {
        const providers = workspaceStorage.getJson<any[]>('offline_providers', [], workspaceId);
        const categories = workspaceStorage.getJson<any[]>('offline_categories', [], workspaceId);
        const banners = workspaceStorage.getJson<any[]>('offline_banners', [], workspaceId);
        const paymentProviders = workspaceStorage.getJson<any[]>(
          'offline_payment_providers',
          [],
          workspaceId,
        );

        // Prioritize what the first screen is most likely to paint. Everything
        // else is decoded later while the WebView main thread is idle.
        const firstPaintUrls = [
          ...banners.slice(0, 2).map((b: any) => b.banner_image),
          ...providers.slice(0, 6).map((p: any) => p.provider_logo),
          ...paymentProviders.slice(0, 2).map((p: any) => p.provider_logo),
        ].filter(Boolean) as string[];

        const allCachedUrls = [
          ...providers.map((p: any) => p.provider_logo),
          ...categories.map((c: any) => c.category_image),
          ...banners.filter((b: any) => b?.media_type !== 'video').map((b: any) => b.banner_image),
          ...paymentProviders.map((pp: any) => pp.provider_logo),
        ].filter(Boolean) as string[];

        const uniqueUrls = [...new Set([...firstPaintUrls, ...bundledStaticImages, ...allCachedUrls])];
        const immediate = uniqueUrls.slice(0, IMMEDIATE_IMAGE_COUNT);
        const deferred = uniqueUrls.slice(IMMEDIATE_IMAGE_COUNT);

        immediate.forEach((url) => {
          const img = new Image();
          img.decoding = 'async';
          img.src = url;
        });

        let offset = 0;
        const preloadNextBatch = () => {
          if (cancelled || offset >= deferred.length) return;
          const batch = deferred.slice(offset, offset + IDLE_BATCH_SIZE);
          offset += IDLE_BATCH_SIZE;
          batch.forEach((url) => {
            const img = new Image();
            img.decoding = 'async';
            img.src = url;
          });
          if (offset < deferred.length) scheduleIdle(preloadNextBatch);
        };
        if (deferred.length) scheduleIdle(preloadNextBatch);

        // Persistent data-URL caching is also throttled in imageCache.ts. Local
        // APK assets never need to be copied into localStorage.
        const customRemoteUrls = allCachedUrls.filter((url) =>
          /^https?:/i.test(url) &&
          !getLocalImage('provider', null, url) &&
          !getLocalImage('payment', null, url) &&
          !getLocalImage('category', null, url) &&
          !getLocalImage('banner', null, url),
        );
        cacheImages(customRemoteUrls);
      } catch (error) {
        console.error('[ImagePreloader] Error preloading images:', error);
      }
    };

    preload();
    window.addEventListener('online', preload);

    return () => {
      cancelled = true;
      window.removeEventListener('online', preload);
      // requestIdleCallback and setTimeout ids occupy the same numeric type in
      // browsers; cancelling both is harmless and prevents stale-workspace work.
      for (const id of scheduled) {
        try { (window as any).cancelIdleCallback?.(id); } catch { /* ignore */ }
        window.clearTimeout(id);
      }
    };
  }, [workspaceId]);
};
