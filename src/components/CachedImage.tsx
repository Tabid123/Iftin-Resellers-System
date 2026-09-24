import React, { useEffect, useState } from 'react';
import { ImageOff } from 'lucide-react';
import { getLocalImage, genericCategoryImage, type LocalImageKind } from '@/lib/localImages';

type Props = Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  src: string | null | undefined;
  bundledName?: string | null;
  kind?: LocalImageKind;
  providerName?: string | null;
  fallback?: React.ReactNode;
};

/**
 * Fast image path for the storefront.
 *
 * Do not serialize remote artwork into one giant localStorage base64 map during
 * page transitions. Tenant APK builds already package the storefront snapshot
 * artwork locally, while web/native HTTP caches handle later remote updates.
 */
const CachedImage = ({ src, alt, bundledName, kind = 'provider', providerName, fallback, ...rest }: Props) => {
  const skipBundled = bundledName === null;
  const imageName = bundledName ?? (typeof alt === 'string' ? alt : null);
  const bundled = skipBundled ? null : getLocalImage(kind, imageName, src, providerName);

  const initial = kind === 'provider' && bundled ? bundled : (src ?? bundled ?? null);
  const [resolved, setResolved] = useState<string | null>(initial);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);

    if (kind === 'provider' && bundled && src && /^https?:/i.test(src)) {
      setResolved(bundled);
      const img = new Image();
      img.decoding = 'async';
      img.onload = async () => {
        try { await img.decode?.(); } catch {}
        if (!cancelled) setResolved(src);
      };
      img.onerror = () => {};
      img.src = src;
      return () => { cancelled = true; };
    }

    setResolved(src ?? bundled ?? null);
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

export default React.memo(CachedImage);
