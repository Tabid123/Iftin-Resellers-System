import { useEffect, useRef, useState } from 'react';
import { useNavigate } from '@/lib/router-compat';
import { readVerifiedPhone } from '@/lib/verifiedPhone';
import { useTenant } from '@/contexts/TenantContext';
import { TenantSplash } from '@/components/TenantSplash';
import HeroSection from '@/components/HeroSection';
import PhoneInput from '@/components/PhoneInput';
import Footer from '@/components/Footer';

const Index = () => {
  const navigate = useNavigate();
  const tenantState = useTenant();
  const tenant = tenantState.status === 'ready' || tenantState.status === 'suspended' ? tenantState.tenant : null;
  const [showLogin, setShowLogin] = useState(false);
  const initialRedirectChecked = useRef(false);
  // Route beforeLoad owns all returning-user redirects. Keeping a second
  // check after hydration is also needed: server-side beforeLoad cannot read
  // localStorage, and the initial client navigation may reuse that SSR result.
  useEffect(() => {
    // The tenant-aware navigate callback changes as the route changes. Without
    // this guard, the old login screen can run this effect once more after OTP
    // verification and overwrite /offline-mode with /providers.
    if (initialRedirectChecked.current) return;
    initialRedirectChecked.current = true;

    try {
      sessionStorage.setItem('appInitialized', 'true');
      const requiresOfflineOnboarding =
        sessionStorage.getItem('iftin:force-offline-onboarding-once') === '1';
      if (requiresOfflineOnboarding) {
        navigate('/offline-mode', { replace: true });
        return;
      }

      const verifiedPhone = readVerifiedPhone();
      if (verifiedPhone) {
        navigate('/providers', { replace: true });
      } else {
        setShowLogin(true);
      }
    } catch {
      // Storage may be unavailable in restricted browser contexts.
      setShowLogin(true);
    }
  }, [navigate]);

  // SSR cannot read the visitor's saved number. Never render the login form
  // until the browser has checked it, or returning visitors see it flash.
  if (!showLogin) {
    return (
      <TenantSplash
        logo={tenant?.logo_url || (import.meta.env.VITE_TENANT_LOGO_URL as string | undefined) || null}
        name={tenant?.name || (import.meta.env.VITE_TENANT_NAME as string | undefined) || ''}
        color={tenant?.primary_color || (import.meta.env.VITE_SPLASH_COLOR as string | undefined) || null}
      />
    );
  }

  return (
    <div className="iftin-auth-page min-h-screen bg-background flex flex-col items-center justify-center px-5 py-6 gap-4">
      <div className="w-full max-w-md space-y-5">
        <HeroSection />
        <div className="bg-card rounded-2xl p-5 shadow-sm border border-border/50">
          <PhoneInput />
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default Index;
