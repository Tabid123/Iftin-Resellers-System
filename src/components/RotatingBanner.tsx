import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import CachedImage from '@/components/CachedImage';
import { useTenant } from '@/contexts/TenantContext';
import { onStorefront } from '@/lib/storefrontEvents';
import { activeWorkspaceId, workspaceStorage } from '@/lib/workspaceKeys';

interface Banner {
  id: string;
  banner_image: string;
  alt_text: string | null;
  display_order: number;
  media_type?: string;
  video_duration?: number | null;
  rotation_interval?: number | null;
}

const BANNER_RESOURCE = 'offline_banners';
const BANNER_AT_RESOURCE = 'offline_banners_at';

function readBannerCache(workspaceId: string | null): Banner[] {
  if (!workspaceId) return [];
  const parsed = workspaceStorage.getJson<Banner[]>(BANNER_RESOURCE, [], workspaceId);
  return Array.isArray(parsed) ? parsed : [];
}

const RotatingBanner = () => {
  const tenantState = useTenant();
  const tenant = tenantState.status === 'ready' || tenantState.status === 'suspended'
    ? tenantState.tenant
    : null;
  const workspaceId = tenant?.id ?? null;

  const [banners, setBanners] = useState<Banner[]>(() => readBannerCache(workspaceId));
  const [currentBanner, setCurrentBanner] = useState(0);
  const [isLoading, setIsLoading] = useState(() => readBannerCache(workspaceId).length === 0);
  const [reloadKey, setReloadKey] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => onStorefront('banners-changed', () => setReloadKey((n) => n + 1)), []);

  useEffect(() => {
    if (!workspaceId) return;

    const cached = readBannerCache(workspaceId);
    setBanners(cached);
    setIsLoading(cached.length === 0);

    let cancelled = false;
    const load = async () => {
      try {
        const { data, error } = await (supabase as any).rpc('get_tenant_banners');
        if (error || cancelled || activeWorkspaceId() !== workspaceId) return;
        const fresh = Array.isArray(data) ? (data as Banner[]) : [];
        setBanners(fresh);
        setCurrentBanner((prev) => fresh.length ? Math.min(prev, fresh.length - 1) : 0);
        workspaceStorage.setJson(BANNER_RESOURCE, fresh, workspaceId);
        workspaceStorage.set(BANNER_AT_RESOURCE, String(Date.now()), workspaceId);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void load();
    return () => { cancelled = true; };
  }, [workspaceId, reloadKey]);

  useEffect(() => {
    const handleVisible = () => {
      if (document.visibilityState === 'visible') setReloadKey((n) => n + 1);
    };
    window.addEventListener('online', handleVisible);
    document.addEventListener('visibilitychange', handleVisible);
    return () => {
      window.removeEventListener('online', handleVisible);
      document.removeEventListener('visibilitychange', handleVisible);
    };
  }, []);

  useEffect(() => {
    if (!banners.length) return;
    const item = banners[currentBanner];
    if (!item || item.media_type === 'video') return;
    const delay = item.rotation_interval ? item.rotation_interval * 1000 : 4000;
    const timer = window.setTimeout(
      () => setCurrentBanner((prev) => (prev + 1) % banners.length),
      delay,
    );
    return () => window.clearTimeout(timer);
  }, [banners, currentBanner]);

  if (!banners.length) {
    if (!isLoading) return null;
    return (
      <div className="w-full space-y-2">
        <div className="w-full rounded-xl bg-muted" style={{ aspectRatio: '2.5/1', maxHeight: '320px' }} />
      </div>
    );
  }

  const item = banners[currentBanner];
  if (!item) return null;
  const isVideo = item.media_type === 'video';

  return (
    <div className="w-full space-y-2">
      <div className="relative w-full overflow-hidden rounded-xl shadow-elegant" style={{ aspectRatio: '2.5/1', maxHeight: '320px' }}>
        {isVideo ? (
          <video
            ref={videoRef}
            key={item.banner_image}
            src={item.banner_image}
            className="h-full w-full object-cover"
            autoPlay
            muted
            playsInline
            preload="metadata"
            onEnded={() => setCurrentBanner((prev) => (prev + 1) % banners.length)}
            aria-label={item.alt_text || 'Promotional video'}
          />
        ) : (
          <CachedImage
            key={item.banner_image}
            src={item.banner_image}
            alt={item.alt_text || 'Promotional banner'}
            kind="banner"
            className="h-full w-full object-cover"
            width={1200}
            height={400}
            sizes="(max-width: 768px) 100vw, 1200px"
            loading="eager"
            fetchPriority="high"
            decoding="async"
          />
        )}
      </div>
      {banners.length > 1 && (
        <div className="flex justify-center gap-1.5">
          {banners.map((_, index) => (
            <span
              key={index}
              className={index === currentBanner ? 'h-1.5 w-8 rounded-full bg-primary' : 'h-1.5 w-4 rounded-full bg-muted-foreground/30'}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default RotatingBanner;
