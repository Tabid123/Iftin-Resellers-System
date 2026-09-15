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
 * Android's WebView is already laid out below the status bar in this app.
 * Reusing SystemBars' top inset there counts the status bar twice and makes
 * every tenant header too tall. The bottom inset remains measured because the
 * fixed navigation still needs to clear the gesture area.
 */
export const useEdgeToEdge = () => {
  useEffect(() => {
    const setSafeArea = () => {
      if (isAndroidWebView()) {
        // The native window already places the WebView below the status icons.
        setVar('--effective-safe-area-top', '0px');
        setVar('--effective-safe-area-bottom', 'var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px))');
      } else {
        // iOS / web: the browser reports correct insets.
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
    const handleResize = () => setSafeArea();
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);

    return () => {
      resumeListener?.remove();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);
};
