import React, { useEffect, useState } from 'react';
import { ImageOff } from 'lucide-react';
import { cacheImage, getCachedImage } from '@/lib/imageCache';
import { getLocalImage, genericCategoryImage, type LocalImageKind } from '@/lib/localImages';

type Props = Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  src: string | null | undefined;
  /** Provider / payment name used to pick a logo shipped inside the app build. */
  bundledName?: string | null;
  kind?: LocalImageKind;
  providerName?: string | null;
  /** Last resort when there is no cached, remote or bundled image. */
  fallback?: React.ReactNode;
};

/**
 * Image component tuned for Android WebView:
 * - configured/cache image still wins once ready;
 * - known provider logos paint instantly from the APK bundle instead of leaving
 *   an empty card while a remote upload downloads;
 * - remote provider artwork is decoded off-screen, then swapped in;
 * - custom banners/categories keep their offline cache behaviour.
 */
const CachedImage = ({ src, alt, bundledName, kind = 'provider', providerName, fallback, ...rest }: Props) => {
  const skipBundled = bundledName === null;
  const imageName = bundledName ?? (typeof alt === 'string' ? alt : null);
  const bundled = skipBundled ? null : getLocalImage(kind, imageName, src, providerName);
  const cached = getCachedImage(src);

  const initialSource = cached ?? (kind === 'provider' && bundled ? bundled : (src ?? bundled ?? null));
  const [resolved, setResolved] = useState<string | null>(initialSource);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);

    const cachedNow = getCachedImage(src);
    if (cachedNow) {
      setResolved(cachedNow);
      return () => { cancelled = true; };
    }

    // Provider logos are visible above the fold. Paint the bundled copy in the
    // first frame, then switch to the tenant-uploaded version only after that
    // remote image is fully decoded. This removes the one-by-one logo pop-in.
    if (kind === 'provider' && bundled && src && /^https?:/i.test(src)) {
      setResolved(bundled);
      const img = new Image();
      img.decoding = 'async';
      img.onload = async () => {
        try { await img.decode?.(); } catch { /* already loaded is good enough */ }
        if (!cancelled) setResolved(src);
      };
      img.onerror = () => { /* keep bundled */ };
      img.src = src;
      return () => { cancelled = true; };
    }

    setResolved(src ?? bundled ?? null);

    // Warm custom artwork for offline use, but skip known provider logos: their
    // local bundled copy already gives us an instant offline-safe image and
    // avoids expensive base64/localStorage work during app startup.
    if (src && !getCachedImage(src) && !(kind === 'provider' && bundled)) {
      const idle: (cb: () => void) => number =
        (window as any).requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 1200));
      idle(() => { void cacheImage(src); });
    }

    return () => { cancelled = true; };
  }, [src, bundled, kind]);

  if (!resolved || failed) {
    if (kind === 'category') return <img src={genericCategoryImage} alt={alt} {...rest} />;
    if (bundled) return <img src={bundled} alt={alt} {...rest} />;
    return <>{fallback ?? <span className="flex size-full items-center justify-center rounded bg-muted text-muted-foreground" aria-hidden="true"><ImageOff className="size-5" /></span>}</>;
  }

  return (
    <img
      src={resolved}
      alt={alt}
      onError={() => {
        if (bundled && resolved !== bundled) {
          setResolved(bundled);
          return;
        }
        setFailed(true);
      }}
      {...rest}
    />
  );
};

export default CachedImage;
