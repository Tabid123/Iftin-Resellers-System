import { useEffect } from 'react';
import { useNavigate, useLocation } from "@/lib/router-compat";
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';

export const useAndroidBackButton = () => {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const backButtonListener = App.addListener('backButton', () => {
      // Home pages - exit immediately without a confirmation dialog.
      if (location.pathname === '/' || location.pathname === '/providers') {
        void App.exitApp();
      } else {
        // Navigate back to previous page.
        navigate(-1);
      }
    });

    return () => {
      backButtonListener.then(listener => listener.remove());
    };
  }, [location.pathname, navigate]);
};
