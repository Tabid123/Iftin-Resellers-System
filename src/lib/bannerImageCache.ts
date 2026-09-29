const DB_NAME = 'iftin-banner-image-cache-v1';
const STORE_NAME = 'images';
const DB_VERSION = 1;
const MAX_BANNER_BYTES = 6 * 1024 * 1024;

type CachedBannerImage = {
  key: string;
  blob: Blob;
  source: string;
  savedAt: number;
};

function openDb(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !('indexedDB' in window)) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'key' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export function bannerCacheKey(
  workspaceId: string,
  banner: { id?: string | null; display_order?: number | null },
): string {
  const identity = String(banner.id || banner.display_order || 'banner');
  return `${workspaceId}:${identity}`;
}

export async function readCachedBannerImage(key: string): Promise<string | null> {
  const db = await openDb();
  if (!db) return null;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const request = tx.objectStore(STORE_NAME).get(key);
      request.onsuccess = () => {
        const cached = request.result as CachedBannerImage | undefined;
        if (!cached?.blob) {
          resolve(null);
          return;
        }
        resolve(URL.createObjectURL(cached.blob));
      };
      request.onerror = () => resolve(null);
      tx.oncomplete = () => db.close();
      tx.onerror = () => db.close();
    } catch {
      db.close();
      resolve(null);
    }
  });
}

export async function cacheBannerImage(key: string, source: string): Promise<void> {
  if (!source || source.startsWith('blob:') || source.startsWith('data:')) return;

  const db = await openDb();
  if (!db) return;

  try {
    const existing = await new Promise<CachedBannerImage | null>((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const request = tx.objectStore(STORE_NAME).get(key);
        request.onsuccess = () => resolve((request.result as CachedBannerImage | undefined) ?? null);
        request.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });

    if (existing?.source === source && existing.blob?.size) {
      db.close();
      return;
    }

    const response = await fetch(source, { cache: 'no-store' });
    if (!response.ok) {
      db.close();
      return;
    }

    const blob = await response.blob();
    if (!blob.size || blob.size > MAX_BANNER_BYTES || (blob.type && !blob.type.startsWith('image/'))) {
      db.close();
      return;
    }

    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put({
          key,
          blob,
          source,
          savedAt: Date.now(),
        } satisfies CachedBannerImage);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
        tx.onabort = () => resolve();
      } catch {
        resolve();
      }
    });
  } catch {
    // Banner caching is best-effort and must never affect storefront rendering.
  } finally {
    try { db.close(); } catch {}
  }
}
