import React, { createContext, useContext, ReactNode, useState, useEffect } from 'react';

interface ConnectivityContextType {
  isReallyOnline: boolean;
  isChecking: boolean;
}

const ConnectivityContext = createContext<ConnectivityContextType | undefined>(undefined);

/**
 * Lightweight connectivity state.
 *
 * Do not block app startup on external ping endpoints. Android/WebView already
 * reports online/offline changes through the browser network events. Actual API
 * requests remain the source of truth for server availability and can fail
 * gracefully while cached storefront data stays visible.
 */
export const ConnectivityProvider = ({ children }: { children: ReactNode }) => {
  const [isReallyOnline, setIsReallyOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine
  );

  useEffect(() => {
    const sync = () => setIsReallyOnline(navigator.onLine);
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    document.addEventListener('visibilitychange', sync);

    return () => {
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
      document.removeEventListener('visibilitychange', sync);
    };
  }, []);

  return (
    <ConnectivityContext.Provider value={{ isReallyOnline, isChecking: false }}>
      {children}
    </ConnectivityContext.Provider>
  );
};

export const useConnectivity = () => {
  const context = useContext(ConnectivityContext);
  if (!context) {
    throw new Error('useConnectivity must be used within ConnectivityProvider');
  }
  return context;
};
