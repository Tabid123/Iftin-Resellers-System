const IMAGE_FIELDS = new Set([
  'provider_logo',
  'category_image',
  'package_image',
  'banner_image',
  'logo_url',
  'image_url',
  'icon_url',
  'thumbnail_url',
  'provider_image',
  'payment_logo',
]);

function collect(value: unknown, urls: Set<string>) {
  if (!value) return;

  if (Array.isArray(value)) {
    for (const item of value) collect(item, urls);
    return;
  }

  if (typeof value !== 'object') return;

  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (
      typeof raw === 'string' &&
      raw.trim() &&
      (IMAGE_FIELDS.has(key) || /(?:image|logo|icon|thumbnail)(?:_url)?$/i.test(key))
    ) {
      const url = raw.trim();
      if (
        /^https?:\/\//i.test(url) ||
        url.startsWith('/') ||
        url.startsWith('data:') ||
        url.startsWith('blob:')
      ) {
        urls.add(url);
      }
    } else if (raw && typeof raw === 'object') {
      collect(raw, urls);
    }
  }
}

export function collectStorefrontImageUrls(...values: unknown[]): string[] {
  const urls = new Set<string>();
  for (const value of values) collect(value, urls);
  return [...urls];
}

/**
 * Warm every storefront image as soon as tenant data arrives.
 *
 * The Image() pass makes visible navigation instant in both WebView and web.
 * The service-worker message additionally persists remote artwork for PWA
 * offline use. Failures are intentionally ignored; normal image fallbacks
 * remain responsible for individual unavailable files.
 */
export function precacheStorefrontImages(...values: unknown[]): void {
  if (typeof window === 'undefined') return;
  const urls = collectStorefrontImageUrls(...values);
  if (!urls.length) return;

  for (const url of urls) {
    if (url.startsWith('data:') || url.startsWith('blob:')) continue;
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
  }

  if (!('serviceWorker' in navigator)) return;
  void navigator.serviceWorker.ready
    .then((registration) => {
      const worker = registration.active ?? registration.waiting ?? registration.installing;
      worker?.postMessage({ type: 'CACHE_IMAGES', urls });
    })
    .catch(() => {});
}
