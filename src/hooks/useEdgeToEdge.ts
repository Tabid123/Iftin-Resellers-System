import { useEffect } from 'react';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

// Detect Android native WebView reliably. Some tenant APK/WebView builds do not
// expose the literal `wv` token in the user-agent, so Capacitor is authoritative
// whenever it reports a native Android runtime; UA matching is only a fallback.
const isAndroidWebView = (): boolean => {
  if (typeof window === 'undefined') return false;

  try {
    if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') return true;
  } catch {
    // Fall through to UA detection for older/custom WebView shells.
  }

  const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
  if (!/Android/i.test(ua)) return false;

  return /\bwv\b/i.test(ua) || /Version\/4\.0/i.test(ua);
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
    // new shell height. Delay two frames so the new orientation layout settles.
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
