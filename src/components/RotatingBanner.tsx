import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import CachedImage from '@/components/CachedImage';
import { useTenant } from '@/contexts/TenantContext';
import { onStorefront } from '@/lib/storefrontEvents';
import { activeWorkspaceId, workspaceQueryKey, workspaceStorage } from '@/lib/workspaceKeys';
import { useQueryClient } from '@tanstack/react-query';

/** Decode every banner up front so rotating to the next one never pops in. */
function preloadBanners(list: { banner_image: string; media_type?: string }[]) {
  if (typeof window === 'undefined') return;
  for (const item of list) {
    if (!item?.banner_image || item.media_type === 'video') continue;
    const img = new Image();
    img.decoding = 'async';
    img.src = item.banner_image;
  }
}

interface Banner {
  id: string;
  banner_image: string;
  alt_text: string | null;
  display_order: number;
  media_type?: string;
  video_duration?: number | null;
  rotation_interval?: number | null;
}

// Short TTL: a tenant admin swapping a banner should be visible almost at
// once even if the realtime event was missed (bad network, app resumed).
const BANNER_TTL_MS = 60 * 1000;

const BANNER_RESOURCE = 'offline_banners';
const BANNER_AT_RESOURCE = 'offline_banners_at';

function readBannerCache(workspaceId: string | null): Banner[] {
  if (!workspaceId) return [];
  const parsed = workspaceStorage.getJson<Banner[]>(BANNER_RESOURCE, [], workspaceId);
  return Array.isArray(parsed) ? parsed : [];
}

const RotatingBanner = () => {
  const queryClient = useQueryClient();
  const tenantState = useTenant();
  const tenant = tenantState.status === 'ready' || tenantState.status === 'suspended'
    ? tenantState.tenant
    : null;
  const workspaceId = tenant?.id ?? null;

  // Critical for visual stability: read this workspace's snapshot during the
  // FIRST render, not later in an effect. This prevents a blank/skeleton banner
  // frame whenever the route remounts — and it can only ever be this
  // workspace's own snapshot.
  const [banners, setBanners] = useState<Banner[]>(() => readBannerCache(workspaceId));
  const [currentBanner, setCurrentBanner] = useState(() => {
    try {
      const sessionActive = sessionStorage.getItem('session_active');
      if (!sessionActive) {
        sessionStorage.setItem('session_active', 'true');
        sessionStorage.removeItem('banner_position');
        return 0;
      }
      const saved = sessionStorage.getItem('banner_position');
      return saved ? parseInt(saved, 10) : 0;
    } catch {
      return 0;
    }
  });
  const [isLoading, setIsLoading] = useState(() => readBannerCache(workspaceId).length === 0);
  const [reloadKey, setReloadKey] = useState(0);
  // An admin change (realtime) refreshes the banners without a manual reload.
  useEffect(() => onStorefront('banners-changed', () => setReloadKey((n) => n + 1)), []);
  const [isVisible, setIsVisible] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      sessionStorage.setItem('banner_position', currentBanner.toString());
    } catch {}
  }, [currentBanner]);

  useEffect(() => {
    if (banners.length > 0 && currentBanner >= banners.length) setCurrentBanner(0);
  }, [banners.length, currentBanner]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new IntersectionObserver(([entry]) => setIsVisible(entry.isIntersecting), { threshold: 0.1 });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!videoRef.current) return;
    const currentMedia = banners[currentBanner];
    if (currentMedia?.media_type !== 'video') return;
    if (isVisible && !document.hidden) videoRef.current.play().catch(() => {});
    else videoRef.current.pause();
  }, [isVisible, currentBanner, banners]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!videoRef.current) return;
      const currentMedia = banners[currentBanner];
      if (currentMedia?.media_type !== 'video') return;
      if (document.hidden || !isVisible) videoRef.current.pause();
      else videoRef.current.play().catch(() => {});
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isVisible, currentBanner, banners]);

  useEffect(() => {
    const saveVideoPosition = () => {
      if (videoRef.current && banners[currentBanner]?.media_type === 'video') {
        try {
          sessionStorage.setItem('video_position', videoRef.current.currentTime.toString());
          sessionStorage.setItem('video_banner_index', currentBanner.toString());
        } catch {}
      }
    };
    const interval = setInterval(saveVideoPosition, 2000);
    window.addEventListener('beforeunload', saveVideoPosition);
    return () => {
      saveVideoPosition();
      clearInterval(interval);
      window.removeEventListener('beforeunload', saveVideoPosition);
    };
  }, [currentBanner, banners]);

  const handleVideoLoaded = () => {
    try {
      const savedPosition = sessionStorage.getItem('video_position');
      const savedBannerIndex = sessionStorage.getItem('video_banner_index');
      if (savedPosition && savedBannerIndex === currentBanner.toString()) {
        const position = parseFloat(savedPosition);
        if (videoRef.current && position > 0 && position < (videoRef.current.duration - 0.5)) {
          videoRef.current.currentTime = position;
        }
        sessionStorage.removeItem('video_position');
        sessionStorage.removeItem('video_banner_index');
      }
    } catch {}
  };

  useEffect(() => {
    if (!workspaceId) {
      setBanners([]);
      setIsLoading(false);
      return;
    }

    const cachedBanners = readBannerCache(workspaceId);
    setBanners(cachedBanners);
    preloadBanners(cachedBanners);
    if (cachedBanners.length > 0) setIsLoading(false);

    // Do not re-query banners merely because the user navigated away and back.
    // Refresh only when the snapshot is missing or older than the short TTL.
    let freshEnough = false;
    if (reloadKey === 0 && cachedBanners.length > 0) {
      const at = Number(workspaceStorage.get(BANNER_AT_RESOURCE, workspaceId) || 0);
      freshEnough = at > 0 && Date.now() - at < BANNER_TTL_MS;
    }
    if (freshEnough) return;

    let cancelled = false;
    const loadBanners = async () => {
      try {
        const freshBanners = await queryClient.fetchQuery<Banner[]>({
          queryKey: workspaceQueryKey(workspaceId, 'banners'),
          queryFn: async () => {
            const { data, error } = await (supabase as any).rpc('get_tenant_banners');
            if (error) throw error;
            return Array.isArray(data) ? (data as Banner[]) : [];
          },
          staleTime: reloadKey === 0 ? BANNER_TTL_MS : 0,
        });
        // A response that lands after the workspace changed is discarded.
        if (cancelled || activeWorkspaceId() !== workspaceId) return;
        setBanners(freshBanners);
        preloadBanners(freshBanners);
        if (freshBanners.length > 0) {
          workspaceStorage.setJson(BANNER_RESOURCE, freshBanners, workspaceId);
        } else {
          workspaceStorage.remove(BANNER_RESOURCE, workspaceId);
        }
        workspaceStorage.set(BANNER_AT_RESOURCE, String(Date.now()), workspaceId);
      } catch {
        // Keep the last known snapshot.
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void loadBanners();
    return () => { cancelled = true; };
  }, [workspaceId, reloadKey, queryClient]);

  useEffect(() => {
    if (banners.length === 0) return;
    const currentMedia = banners[currentBanner];
    if (!currentMedia || currentMedia.media_type === 'video') return;
    const rotationTime = currentMedia.rotation_interval ? currentMedia.rotation_interval * 1000 : 4000;
    const interval = setInterval(() => {
      setCurrentBanner((prev) => (prev + 1) % banners.length);
    }, rotationTime);
    return () => clearInterval(interval);
  }, [banners.length, currentBanner, banners]);

  const handleVideoEnded = () => setCurrentBanner((prev) => (prev + 1) % banners.length);

  if (banners.length === 0) {
    if (isLoading) {
      return (
        <div className="w-full space-y-2">
          <div className="w-full rounded-xl overflow-hidden bg-muted" style={{ aspectRatio: '2.5/1', maxHeight: '320px' }} />
          <div className="flex justify-center space-x-1.5">
            {[1, 2, 3].map(i => <div key={i} className="w-6 h-1.5 rounded-full bg-muted-foreground/20" />)}
          </div>
        </div>
      );
    }
    return null;
  }

  const currentMedia = banners[currentBanner];
  if (!currentMedia) return null;
  const isVideo = currentMedia.media_type === 'video';

  return (
    <div ref={containerRef} className="w-full space-y-2">
      <div className="w-full rounded-xl overflow-hidden shadow-elegant relative" style={{ aspectRatio: '2.5/1', maxHeight: '320px' }}>
        {isVideo ? (
          <video
            ref={videoRef}
            key={currentMedia.banner_image}
            src={currentMedia.banner_image}
            className="w-full h-full object-cover"
            autoPlay
            playsInline
            preload="auto"
            onEnded={handleVideoEnded}
            onLoadedMetadata={handleVideoLoaded}
            aria-label={currentMedia.alt_text || 'Promotional video'}
          />
        ) : (
          <CachedImage
            key={currentMedia.banner_image}
            src={currentMedia.banner_image}
            alt={currentMedia.alt_text || 'Promotional banner'}
            kind="banner"
            bundledName={null}
            className="w-full h-full object-cover"
            width={1200}
            height={400}
            sizes="(max-width: 768px) 100vw, 1200px"
            loading="eager"
            fetchPriority="high"
            decoding="async"
          />
        )}
      </div>
      <div className="flex justify-center space-x-1.5">
        {banners.map((_, index) => (
          <div
            key={index}
            className={`h-1.5 rounded-full ${index === currentBanner ? 'w-8 bg-primary' : 'w-4 bg-muted-foreground/30'}`}
            aria-label={`Banner ${index + 1}`}
          />
        ))}
      </div>
    </div>
  );
};

export default RotatingBanner;
