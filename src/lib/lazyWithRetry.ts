import { lazy, type ComponentType } from 'react';

const RELOAD_FLAG = 'chunk-reload-attempted';

/**
 * Wraps React.lazy with retry + one-time reload recovery.
 * Chunk load failures usually mean the browser cached an old index that
 * points at hashed chunk files which no longer exist after a new deploy,
 * or a transient network drop. We retry a couple of times, then force a
 * single hard reload to pick up the fresh manifest.
 */
export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
  retries = 2,
  delayMs = 500,
) {
  return lazy(async () => {
    let lastError: unknown;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const mod = await factory();
        if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(RELOAD_FLAG);
        return mod;
      } catch (error) {
        lastError = error;
        if (attempt < retries) {
          await new Promise((r) => setTimeout(r, delayMs * (attempt + 1)));
        }
      }
    }

    const message = String((lastError as Error)?.message ?? lastError);
    const isChunkError =
      /dynamically imported module|Loading chunk|Importing a module script failed|Failed to fetch/i.test(
        message,
      );

    if (isChunkError && typeof window !== 'undefined' && typeof sessionStorage !== 'undefined') {
      if (!sessionStorage.getItem(RELOAD_FLAG)) {
        sessionStorage.setItem(RELOAD_FLAG, '1');
        window.location.reload();
        // Keep Suspense pending while the page reloads.
        return await new Promise<{ default: T }>(() => {});
      }
    }

    throw lastError;
  });
}
