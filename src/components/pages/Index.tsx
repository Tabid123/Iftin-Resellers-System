import { useEffect } from 'react';
import { useNavigate } from '@/lib/router-compat';
import HeroSection from '@/components/HeroSection';
import PhoneInput from '@/components/PhoneInput';
import Footer from '@/components/Footer';

const isValidSomaliPhone = (phone: string | null): boolean => {
  if (!phone) return false;
  return /^(61|77|62|68)\d{7}$/.test(phone);
};

const Index = () => {
  const navigate = useNavigate();
  // Route beforeLoad owns all returning-user redirects. Keeping a second
  // check after hydration is also needed: server-side beforeLoad cannot read
  // localStorage, and the initial client navigation may reuse that SSR result.
  useEffect(() => {
    try {
      sessionStorage.setItem('appInitialized', 'true');
      const verifiedPhone = localStorage.getItem('verifiedPhone');
      if (isValidSomaliPhone(verifiedPhone)) {
        const sender = localStorage.getItem('offlineSenderPhone');
        const receiver = localStorage.getItem('offlineReceiverPhone');
        const registered = Boolean(sender && receiver && sender.length === 9 && receiver.length >= 7);
        const skipped = localStorage.getItem('hasSkippedOfflineRegistration') === 'true';
        navigate(registered || skipped ? '/providers' : '/offline-mode', { replace: true });
      } else if (verifiedPhone) {
        localStorage.removeItem('verifiedPhone');
      }
    } catch {
      // Storage may be unavailable in restricted browser contexts.
    }
  }, [navigate]);

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
