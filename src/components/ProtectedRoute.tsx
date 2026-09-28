import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from "@/lib/router-compat";
import { readVerifiedPhone } from "@/lib/verifiedPhone";

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

  useEffect(() => {
    setChecked(true);
    if (!hasAccess) {
      navigate('/', { replace: true });
    }
  }, [navigate, hasAccess, location.pathname]);

  // Render the page right away; only hide it once we know access is invalid,
  // so navigating between providers / categories / packages never flashes blank.
  if (checked && !hasAccess) {
    return null;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
