import { useEffect } from 'react';

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
 * Native Android shell height is established before React paints by the root
 * shell script. Do not write --iftin-shell-height again from React: two owners
 * can disagree by a few pixels when Android briefly changes its visual viewport
 * after a tap, which shows up as a small bottom-navigation jump.
 */
export const useEdgeToEdge = () => {
  useEffect(() => {
    const android = isAndroidWebView();

    if (android) {
      // Capawesome EdgeToEdge owns the native WebView insets. The app content is
      // already inset by the native plugin, so CSS must not add another safe area.
      setVar('--effective-safe-area-top', '0px');
      setVar('--effective-safe-area-bottom', '0px');
      return;
    }

    // Browsers should follow the live dynamic viewport so Safari/Chrome URL-bar
    // changes never leave a white strip below the app.
    setVar('--iftin-shell-height', '100dvh');
    setVar('--effective-safe-area-top', 'env(safe-area-inset-top, 0px)');
    setVar('--effective-safe-area-bottom', 'env(safe-area-inset-bottom, 0px)');
  }, []);
};
