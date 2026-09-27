import { useEffect } from 'react';
import HeroSection from '@/components/HeroSection';
import PhoneInput from '@/components/PhoneInput';
import Footer from '@/components/Footer';

const isValidSomaliPhone = (phone: string | null): boolean => {
  if (!phone) return false;
  return /^(61|77|62|68)\d{7}$/.test(phone);
};

const Index = () => {
  // Route beforeLoad owns all returning-user redirects. Keeping a second
  // component-level redirect used to create a null/white transition frame
  // after OTP verification and could race normal navigation.
  useEffect(() => {
    try {
      sessionStorage.setItem('appInitialized', 'true');
      const verifiedPhone = localStorage.getItem('verifiedPhone');
      if (verifiedPhone && !isValidSomaliPhone(verifiedPhone)) {
        localStorage.removeItem('verifiedPhone');
      }
    } catch {
      // Storage may be unavailable in restricted browser contexts.
    }
  }, []);

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
