import { useEffect } from 'react';
import { buildTenantSlug, isNativeApp } from '@/lib/nativeTenant';
import { writeNativeSession } from '@/lib/nativeStorefrontSession';

const LOCAL_BUILD_VERSION =
  (import.meta.env.VITE_BUILD_VERSION as string | undefined)?.trim() || '';
const UPDATE_CHECK_MS = 60_000;

function livePathForNative(slug: string) {
  const prefix = `/t/${slug}`;
  const currentPath = window.location.pathname || '/';

  if (currentPath === prefix || currentPath.startsWith(`${prefix}/`)) {
    return currentPath;
  }

  const suffix = currentPath === '/' ? '/' : currentPath;
  return `${prefix}${suffix.startsWith('/') ? suffix : `/${suffix}`}`;
}

declare global {
  interface Window {
    __IFTIN_REMOTE_BUILD_VERSION__?: string;
  }
}

async function readRemoteBuildVersion(): Promise<string | null> {
  // Native runs from localhost, so fetching the website JSON directly is a
  // cross-origin request and can be blocked by WebView CORS. A classic remote
  // script can load cross-origin without CORS and publishes the version onto
  // window instead.
  if (isNativeApp()) {
    return await new Promise((resolve) => {
      const script = document.createElement('script');
      script.async = true;
      script.src = `https://iftinagents.com/build-version.js?t=${Date.now()}`;

      const finish = (value: string | null) => {
        script.remove();
        resolve(value);
      };

      script.onload = () => {
        const version = String(window.__IFTIN_REMOTE_BUILD_VERSION__ || '').trim();
        finish(version || null);
      };
      script.onerror = () => finish(null);
      document.head.appendChild(script);
    });
  }

  try {
    const response = await fetch(
      `/build-version.json?t=${Date.now()}`,
      {
        method: 'GET',
        cache: 'no-store',
        credentials: 'same-origin',
      },
    );
    if (!response.ok) return null;
    const payload = await response.json();
    const version = String(payload?.version || '').trim();
    return version || null;
  } catch {
    return null;
  }
}

/**
 * Keep storefront code current without making cold startup depend on network.
 *
 * - Web: build-version mismatch triggers one cache-busted navigation.
 * - Native APK: packaged app renders first. If online and the website has a
 *   newer build, the WebView moves to the live tenant route in the background.
 *   Offline startup always stays on the packaged bundle.
 */
export function useBuildUpdate() {
  useEffect(() => {
    let stopped = false;
    let timer: number | undefined;

    const check = async () => {
      if (stopped || typeof navigator === 'undefined' || navigator.onLine === false) {
        return;
      }

      const remoteVersion = await readRemoteBuildVersion();
      if (stopped || !remoteVersion || remoteVersion === LOCAL_BUILD_VERSION) return;

      if (isNativeApp()) {
        // Once the native WebView is already on the live origin, this live
        // bundle will compare equal to the remote version and stop here.
        if (window.location.hostname !== 'localhost' &&
            window.location.hostname !== '127.0.0.1') {
          return;
        }

        const slug = buildTenantSlug();
        if (!slug) return;

        const url = new URL(
          `https://iftinagents.com${livePathForNative(slug)}`,
        );
        for (const [key, value] of new URLSearchParams(window.location.search)) {
          if (!key.startsWith('__')) url.searchParams.set(key, value);
        }
        url.searchParams.set('__appbuild', remoteVersion);

        // Remember the live build we successfully chose before leaving the
        // packaged localhost origin. Native startup can reuse this exact URL
        // on the next launch instead of applying the same update again.
        writeNativeSession('liveBuildVersion', remoteVersion);
        writeNativeSession('liveBuildUrl', url.toString());

        window.location.replace(url.toString());
        return;
      }

      const reloadKey = `iftin:web-build-reload:${remoteVersion}`;
      try {
        if (sessionStorage.getItem(reloadKey) === '1') return;
        sessionStorage.setItem(reloadKey, '1');
      } catch {}

      const url = new URL(window.location.href);
      url.searchParams.set('__build', remoteVersion);
      window.location.replace(url.toString());
    };

    void check();

    const onOnline = () => void check();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void check();
    };

    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisible);
    timer = window.setInterval(() => void check(), UPDATE_CHECK_MS);

    return () => {
      stopped = true;
      if (timer) window.clearInterval(timer);
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
}
