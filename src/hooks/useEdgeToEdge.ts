import { useEffect } from 'react';
import { App } from '@capacitor/app';

// Detect Android WebView using User-Agent (works even with Capacitor remote URL)
const isAndroidWebView = (): boolean => {
  if (typeof window === 'undefined' || !navigator?.userAgent) return false;
  const ua = navigator.userAgent;
  return /Android/.test(ua) && ua.includes('wv');
};

const setVar = (name: string, value: string) => {
  document.documentElement.style.setProperty(name, value);
};

/**
 * Android WebView safe areas and shell height must stay stable while TanStack
 * swaps client-side routes. Device recordings showed a ~32px one/two-frame
 * viewport resize during navigation; even a normal-flow bottom bar moves when
 * its parent uses a live `100vh` value. Capture the native WebView height once
 * and keep it fixed for the current orientation instead.
 */
export const useEdgeToEdge = () => {
  useEffect(() => {
    const android = isAndroidWebView();

    const pinAndroidViewport = () => {
      if (!android) return;
      // innerHeight is read only at startup/orientation change, never during a
      // route transition or transient system-bar resize.
      const height = Math.max(1, Math.round(window.innerHeight));
      setVar('--iftin-shell-height', `${height}px`);
      setVar('--effective-safe-area-top', '0px');
      setVar('--effective-safe-area-bottom', '0px');
    };

    const setSafeArea = () => {
      if (android) {
        setVar('--effective-safe-area-top', '0px');
        setVar('--effective-safe-area-bottom', '0px');
      } else {
        setVar('--iftin-shell-height', '100dvh');
        setVar('--effective-safe-area-top', 'env(safe-area-inset-top, 0px)');
        setVar('--effective-safe-area-bottom', 'env(safe-area-inset-bottom, 0px)');
      }
    };

    setSafeArea();
    pinAndroidViewport();

    let resumeListener: { remove: () => void } | undefined;

    if (typeof App !== 'undefined' && App.addListener) {
      App.addListener('appStateChange', (state) => {
        if (state.isActive) setSafeArea();
      }).then(listener => {
        resumeListener = listener;
      }).catch(() => {
        // App listener is not available in a normal browser.
      });
    }

    const handleVisibilityChange = () => {
      if (!document.hidden) setSafeArea();
    };

    // A real orientation change is the only time Android is allowed to choose a
    // new shell height. Delay one frame so the new orientation layout settles.
    const handleOrientationChange = () => {
      if (!android) {
        setSafeArea();
        return;
      }
      requestAnimationFrame(() => requestAnimationFrame(pinAndroidViewport));
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('orientationchange', handleOrientationChange);

    return () => {
      resumeListener?.remove();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('orientationchange', handleOrientationChange);
    };
  }, []);
};
