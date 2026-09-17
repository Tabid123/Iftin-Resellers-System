import { useState, useEffect, useRef } from 'react';
import { useNavigate } from "@/lib/router-compat";
import HeroSection from '@/components/HeroSection';
import PhoneInput from '@/components/PhoneInput';
import Footer from '@/components/Footer';
import najaxLogoSplash from '@/assets/najax-logo.jpeg';
import { useTenant } from '@/contexts/TenantContext';
import { hideNativeSplash } from '@/lib/nativeSplash';
import CachedImage from '@/components/CachedImage';
import { phoneEntryPrompt } from '@/lib/phoneEntryPrompt';

// Validate Somali phone format: 9 digits starting with 61, 77, 62, or 68.
const isValidSomaliPhone = (phone: string | null): boolean => {
  if (!phone) return false;
  return /^(61|77|62|68)\d{7}$/.test(phone);
};

const STARTUP_PAINT_MS = 450;

const Index = () => {
  const navigate = useNavigate();
  const wasAlreadyInitialized = sessionStorage.getItem('appInitialized') === 'true';
  const [isChecking, setIsChecking] = useState(!wasAlreadyInitialized);
  const hasInitialized = useRef(false);
  const phonePromptPlayed = useRef(false);

  const hasOfflineRegistration = (): boolean => {
    const hasSkipped = localStorage.getItem('hasSkippedOfflineRegistration') === 'true';
    if (hasSkipped) return true;
    const sender = localStorage.getItem('offlineSenderPhone');
    const receiver = localStorage.getItem('offlineReceiverPhone');
    return !!sender && !!receiver && sender.length === 9 && receiver.length >= 7;
  };

  const continueIntoApp = () => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;

    const verifiedPhone = localStorage.getItem('verifiedPhone');
    sessionStorage.setItem('appInitialized', 'true');

    if (isValidSomaliPhone(verifiedPhone)) {
      navigate(hasOfflineRegistration() ? '/providers' : '/offline-mode', { replace: true });
      return;
    }

    if (verifiedPhone) localStorage.removeItem('verifiedPhone');
    setIsChecking(false);
  };

  // Returning to the root route in the same app session should be instant.
  useEffect(() => {
    if (wasAlreadyInitialized) continueIntoApp();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cold start: give the bundled web UI a very small fixed paint window, then
  // continue regardless of internet state. Connectivity is never a startup gate.
  useEffect(() => {
    if (wasAlreadyInitialized || !isChecking) return;
    const timer = window.setTimeout(continueIntoApp, STARTUP_PAINT_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wasAlreadyInitialized, isChecking]);

  // Voice guidance for first-time phone entry. Try autoplay as soon as the form
  // is visible. If a browser/WebView blocks audible autoplay, the first pointer,
  // keyboard or focus interaction unlocks and plays the same prompt once.
  useEffect(() => {
    if (isChecking || phonePromptPlayed.current) return;

    const audio = new Audio(phoneEntryPrompt);
    audio.preload = 'auto';
    audio.volume = 1;

    let disposed = false;
    let fallbackAttached = false;

    const cleanupFallback = () => {
      if (!fallbackAttached) return;
      fallbackAttached = false;
      window.removeEventListener('pointerdown', playPrompt, true);
      window.removeEventListener('keydown', playPrompt, true);
      window.removeEventListener('focusin', playPrompt, true);
    };

    const markPlayed = () => {
      phonePromptPlayed.current = true;
      cleanupFallback();
    };

    const playPrompt = () => {
      if (disposed || phonePromptPlayed.current) return;
      audio.currentTime = 0;
      void audio.play().then(markPlayed).catch(() => {
        if (disposed || fallbackAttached) return;
        fallbackAttached = true;
        window.addEventListener('pointerdown', playPrompt, true);
        window.addEventListener('keydown', playPrompt, true);
        window.addEventListener('focusin', playPrompt, true);
      });
    };

    // Let the phone form paint first so the spoken instruction matches what the
    // customer can already see on screen.
    const timer = window.setTimeout(playPrompt, 120);

    return () => {
      disposed = true;
      window.clearTimeout(timer);
      cleanupFallback();
      audio.pause();
      audio.src = '';
    };
  }, [isChecking]);

  // Storefront bootstrap/cache refresh is owned centrally by AppContent's
  // single useOfflineCache() instance. Keeping it out of this route prevents
  // duplicate cold-start provider/category/package/banner requests.

  if (isChecking) return <SplashScreen />;

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

const SplashScreen = () => {
  const t = useTenant();
  const tenant = t.status === 'ready' || t.status === 'suspended' ? t.tenant : null;
  const logo = tenant?.logo_url || najaxLogoSplash;
  const name = tenant?.name || (import.meta.env.VITE_TENANT_NAME as string) || 'App';

  // Hide the native artwork only after this web screen has painted, preventing
  // the white WebView flash while still keeping launch time short.
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => void hideNativeSplash());
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center z-50 bg-primary">
      <CachedImage
        src={logo}
        alt={name}
        className="w-36 h-36 rounded-2xl object-cover"
        fallback={<img src={najaxLogoSplash} alt={name} className="w-36 h-36 rounded-2xl object-cover" />}
      />
      <div className="w-9 h-9 mt-8 border-[3px] border-accent/30 border-t-accent rounded-full animate-spin" />
    </div>
  );
};

export default Index;
