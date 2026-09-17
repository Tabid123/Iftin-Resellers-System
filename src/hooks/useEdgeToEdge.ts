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
 * Android WebView safe areas must be stable across route transitions.
 *
 * The WebView in this app already owns its native system-bar layout. Reading
 * env(safe-area-inset-bottom) live from CSS caused Android to briefly report a
 * larger bottom inset while routes were swapping. Because the persistent nav
 * used that live value for its height, it visibly jumped upward for a frame.
 *
 * Keep Android's effective top/bottom insets pinned to 0px. The nav itself has
 * enough internal height to keep controls clear of the gesture indicator. iOS
 * and normal web continue using browser-provided safe-area env() values.
 */
export const useEdgeToEdge = () => {
  useEffect(() => {
    const setSafeArea = () => {
      if (isAndroidWebView()) {
        setVar('--effective-safe-area-top', '0px');
        setVar('--effective-safe-area-bottom', '0px');
      } else {
        setVar('--effective-safe-area-top', 'env(safe-area-inset-top, 0px)');
        setVar('--effective-safe-area-bottom', 'env(safe-area-inset-bottom, 0px)');
      }
    };

    setSafeArea();

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
    const handleOrientationChange = () => setSafeArea();
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('orientationchange', handleOrientationChange);

    return () => {
      resumeListener?.remove();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('orientationchange', handleOrientationChange);
    };
  }, []);
};
