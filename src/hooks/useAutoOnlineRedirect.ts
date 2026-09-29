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
      // A successful first-time phone verification intentionally opens
      // /offline-mode so the user can register offline numbers. Connectivity
      // detection can settle from false -> true at the same moment; do not let
      // that one transition skip the onboarding page.
      let keepOfflineOnboarding = false;
      try {
        const markedAt = Number(
          sessionStorage.getItem('iftin:offline-onboarding-navigation') || 0,
        );
        keepOfflineOnboarding =
          location.pathname.endsWith('/offline-mode') &&
          markedAt > 0 &&
          Date.now() - markedAt < 5000;
        if (keepOfflineOnboarding || (markedAt > 0 && Date.now() - markedAt >= 5000)) {
          sessionStorage.removeItem('iftin:offline-onboarding-navigation');
        }
      } catch {}

      // Existing offline-mode behaviour remains unchanged for every other case.
      if (!keepOfflineOnboarding && OFFLINE_PAGES.includes(location.pathname)) {
        navigate('/providers', { replace: true });
      }
    }
    
    // Update previous state
    wasOffline.current = isReallyOnline === false;
  }, [isReallyOnline, navigate, location.pathname]);
};
