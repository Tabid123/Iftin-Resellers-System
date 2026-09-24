import { Capacitor } from '@capacitor/core';

/**
 * Keep the native artwork just long enough for the bundled web UI to paint.
 * Network/tenant lookups must never extend this window.
 */
export const NATIVE_SPLASH_MS = 1500;

let hidden = false;
let hidePromise: Promise<void> | null = null;

/** Timestamp of the first script evaluation = closest we get to app start. */
const bootedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();

function elapsedSinceBoot() {
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  return now - bootedAt;
}

/**
 * Hides the native Android splash after a short, fixed paint window. This is
 * deliberately independent of connectivity so airplane mode and slow data
 * start just as quickly as an online launch.
 */
export function hideNativeSplash(): Promise<void> {
  if (hidePromise) return hidePromise;
  hidePromise = (async () => {
    if (hidden) return;
    hidden = true;
    if (!Capacitor.isNativePlatform()) return;
    const wait = Math.max(0, NATIVE_SPLASH_MS - elapsedSinceBoot());
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    try {
      const { SplashScreen } = await import('@capacitor/splash-screen');
      await SplashScreen.hide({ fadeOutDuration: 0 });
    } catch {
      /* plugin unavailable (web / preview) */
    }
  })();
  return hidePromise;
}

/** Safety net: never leave the user trapped behind the native splash. */
export function scheduleNativeSplashFallback(ms = NATIVE_SPLASH_MS + 200) {
  if (typeof window === 'undefined') return;
  window.setTimeout(() => {
    void hideNativeSplash();
  }, ms);
}
