import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from "@/lib/router-compat";

interface ProtectedRouteProps {
  children: React.ReactNode;
}

// Validate Somali phone format: 9 digits starting with 61, 77, or 68
const isValidSomaliPhone = (phone: string | null): boolean => {
  if (!phone) return false;
  return /^(61|77|68)\d{7}$/.test(phone);
};

const readLocal = (key: string): string | null => {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

// Check if user has completed offline registration
const hasOfflineRegistration = (): boolean => {
  const sender = readLocal('offlineSenderPhone');
  const receiver = readLocal('offlineReceiverPhone');
  return !!sender && !!receiver && sender.length === 9 && receiver.length >= 7;
};

const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [checked, setChecked] = useState(false);

  const verifiedPhone = readLocal('verifiedPhone');
  const hasAccess = isValidSomaliPhone(verifiedPhone);
  const hasSkipped = readLocal('hasSkippedOfflineRegistration') === 'true';
  const hasOffline = hasOfflineRegistration() || hasSkipped;

  useEffect(() => {
    setChecked(true);
    if (!hasAccess) {
      try {
        localStorage.removeItem('verifiedPhone');
        localStorage.removeItem('isGuestUser');
      } catch {
        /* ignore */
      }
      navigate('/', { replace: true });
    } else if (!hasOffline && location.pathname !== '/offline-mode') {
      navigate('/offline-mode', { replace: true });
    }
  }, [navigate, hasAccess, hasOffline, location.pathname]);

  // Render the page right away; only hide it once we know access is invalid,
  // so navigating between providers / categories / packages never flashes blank.
  if (checked && !hasAccess) {
    return null;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
