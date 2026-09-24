import { useLayoutEffect } from 'react';
import { useNavigate } from "@/lib/router-compat";
import HeroSection from '@/components/HeroSection';
import PhoneInput from '@/components/PhoneInput';
import Footer from '@/components/Footer';

const isValidSomaliPhone = (phone: string | null): boolean => {
  if (!phone) return false;
  return /^(61|77|62|68)\d{7}$/.test(phone);
};

const hasOfflineRegistration = (): boolean => {
  const hasSkipped = localStorage.getItem('hasSkippedOfflineRegistration') === 'true';
  if (hasSkipped) return true;
  const sender = localStorage.getItem('offlineSenderPhone');
  const receiver = localStorage.getItem('offlineReceiverPhone');
  return !!sender && !!receiver && sender.length === 9 && receiver.length >= 7;
};

const Index = () => {
  const navigate = useNavigate();
  const verifiedPhone = localStorage.getItem('verifiedPhone');
  const destination = isValidSomaliPhone(verifiedPhone)
    ? (hasOfflineRegistration() ? '/providers' : '/offline-mode')
    : null;

  useLayoutEffect(() => {
    sessionStorage.setItem('appInitialized', 'true');

    if (destination) {
      navigate(destination, { replace: true });
      return;
    }

    if (verifiedPhone) localStorage.removeItem('verifiedPhone');
  }, [destination, navigate, verifiedPhone]);

  if (destination) return null;

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-5 py-6 gap-4">
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
