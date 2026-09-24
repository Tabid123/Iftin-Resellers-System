import { useEffect } from 'react';
import { useNavigate, useLocation } from "@/lib/router-compat";
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';

function storefrontPath(pathname: string) {
  const tenantPrefixed = pathname.match(/^\/t\/[^/]+(\/.*)?$/);
  return tenantPrefixed ? (tenantPrefixed[1] || '/') : pathname;
}

export const useAndroidBackButton = () => {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const backButtonListener = App.addListener('backButton', () => {
      const pathname = storefrontPath(location.pathname);

      if (pathname === '/' || pathname === '/providers') {
        void App.exitApp();
        return;
      }

      navigate(-1);
    });

    return () => {
      backButtonListener.then((listener) => listener.remove());
    };
  }, [location.pathname, navigate]);

  return {
    showExitDialog: false,
    handleExitApp: () => { void App.exitApp(); },
    handleCancelExit: () => {},
  };
};
