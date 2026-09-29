import { useEffect, useRef } from 'react';
import { useNavigate, useLocation } from "@/lib/router-compat";
import { useConnectivity } from '@/contexts/ConnectivityContext';

// Pages that should auto-redirect when coming online
const OFFLINE_PAGES = ['/offline-mode'];

// Hook that automatically redirects to /providers when user comes online
export const useAutoOnlineRedirect = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isReallyOnline } = useConnectivity();
  const wasOffline = useRef<boolean | null>(null);
  
  useEffect(() => {
    // Track previous state
    if (wasOffline.current === null) {
      wasOffline.current = isReallyOnline === false;
      return;
    }
    
    // Detect transition: was offline -> now online
    if (wasOffline.current && isReallyOnline === true) {
      let keepOfflineOnboarding = false;
      if (location.pathname === '/offline-mode') {
        try {
          keepOfflineOnboarding =
            sessionStorage.getItem('iftin:force-offline-onboarding-once') === '1';
          if (keepOfflineOnboarding) {
            sessionStorage.removeItem('iftin:force-offline-onboarding-once');
          }
        } catch {}
      }

      // Existing offline-mode behaviour remains unchanged everywhere else.
      if (!keepOfflineOnboarding && OFFLINE_PAGES.includes(location.pathname)) {
        navigate('/providers', { replace: true });
      }
    }
    
    // Update previous state
    wasOffline.current = isReallyOnline === false;
  }, [isReallyOnline, navigate, location.pathname]);
};
