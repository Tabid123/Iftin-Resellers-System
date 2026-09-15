import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from "@/lib/router-compat";
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';

export const useAndroidBackButton = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [showExitDialog, setShowExitDialog] = useState(false);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const backButtonListener = App.addListener('backButton', () => {
      // Home pages - show exit confirmation
      if (location.pathname === '/' || location.pathname === '/providers') {
        setShowExitDialog(true);
      } else {
        // Navigate back to previous page
        navigate(-1);
      }
    });

    return () => {
      backButtonListener.then(listener => listener.remove());
    };
  }, [location.pathname, navigate]);

  const handleExitApp = () => {
    App.exitApp();
  };

  const handleCancelExit = () => {
    setShowExitDialog(false);
  };

  return { showExitDialog, handleExitApp, handleCancelExit };
};
