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
 * <img> that prefers the exact admin-provided image (or its cached copy), then
 * falls back to artwork bundled in the app for offline use.
 */
const CachedImage = ({ src, alt, bundledName, kind = 'provider', providerName, fallback, ...rest }: Props) => {
  const skipBundled = bundledName === null;
  const imageName = bundledName ?? (typeof alt === 'string' ? alt : null);
  const bundled = skipBundled ? null : getLocalImage(kind, imageName, src, providerName);
  // A configured image must always win. Previously `bundled` came first, so a
  // category called "Anfac" could never display the image uploaded by its admin.
  const pick = (s: string | null | undefined) => getCachedImage(s) ?? s ?? bundled ?? null;

  const [resolved, setResolved] = useState<string | null>(() => pick(src));
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
    setResolved(pick(src));

    // Warm the cache for the NEXT mount, but never replace the source of an
    // already-painted image. Replacing remote URL -> data URL after paint made
    // cards/banner artwork visibly blink during navigation.
    if (src && !getCachedImage(src)) {
      // Warm off the critical path: downloading/encoding during a route change
      // competes with rendering the new screen.
      const idle: (cb: () => void) => number =
        (window as any).requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 300));
      idle(() => { void cacheImage(src); });
    }
  }, [src, bundled]);

  // Haddii admin-ku sawir gaar ah soo geliyay laakiin uu load-ku fashilmo, ha
  // muujin sawir bundled ah oo shirkad kale leh — taasi waa "sawir kale".
  if (failed && bundled && !src && resolved !== bundled) {
    return <img src={bundled} alt={alt} {...rest} />;
  }

  if (!resolved || failed) {
    if (kind === 'category') return <img src={genericCategoryImage} alt={alt} {...rest} />;
    return <>{fallback ?? <span className="flex size-full items-center justify-center rounded bg-muted text-muted-foreground" aria-hidden="true"><ImageOff className="size-5" /></span>}</>;
  }

  return (
    <img
      src={resolved}
      alt={alt}
      onError={() => setFailed(true)}
      {...rest}
    />
  );
};

export default CachedImage;
