import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from "@/lib/router-compat";
import { readVerifiedPhone } from "@/lib/verifiedPhone";
import { hasOfflineRegistrationSession, readStorefrontSessionValue } from "@/lib/storefrontSession";

interface ProtectedRouteProps {
  children: React.ReactNode;
}

// Validate the same Somali phone prefixes accepted by storefront login
const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [checked, setChecked] = useState(false);

  const verifiedPhone = readVerifiedPhone();
  const hasAccess = Boolean(verifiedPhone);
  const hasSkipped = readStorefrontSessionValue('hasSkippedOfflineRegistration') === 'true';
  const hasOffline = hasOfflineRegistrationSession() || hasSkipped;

  useEffect(() => {
    setChecked(true);
    if (!hasAccess) {
      navigate('/', { replace: true });
    } else if (!hasOffline && !location.pathname.endsWith('/offline-mode')) {
      const tenantMatch = location.pathname.match(/^\/t\/([^/]+)(?=\/|$)/);
      if (tenantMatch) {
        navigate('/t/$slug/offline-mode', {
          params: { slug: tenantMatch[1] },
          replace: true,
        } as any);
      } else {
        navigate('/offline-mode', { replace: true });
      }
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
