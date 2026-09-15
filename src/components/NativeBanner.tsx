import { useEffect, useRef } from 'react';
import { useLocation } from "@/lib/router-compat";

// Pages where ads should be HIDDEN
const HIDE_ADS_PATHS = [
  '/payment-providers',
  '/payment-success',
  '/privacy-policy',
  '/admin'
];

export const NativeBanner = () => {
  const location = useLocation();
  const bannerRef = useRef<HTMLDivElement>(null);
  const scriptLoaded = useRef(false);

  const shouldHideAds = HIDE_ADS_PATHS.some(path => 
    location.pathname === path || location.pathname.startsWith(path + '/')
  );

  useEffect(() => {
    if (shouldHideAds || scriptLoaded.current) return;

    // Native Banner 300x250 - Higher CPM than regular banners
    const script = document.createElement('script');
    script.async = true;
    script.setAttribute('data-cfasync', 'false');
    script.src = 'https://pl28370041.effectivegatecpm.com/008e1384975c93804c4646d6d0c8ea50/invoke.js';

    if (bannerRef.current) {
      bannerRef.current.appendChild(script);
      scriptLoaded.current = true;
    }

    return () => {
      scriptLoaded.current = false;
    };
  }, [shouldHideAds]);

  if (shouldHideAds) return null;

  return (
    <div className="w-full flex justify-center my-6">
      <div 
        ref={bannerRef}
        id="container-008e1384975c93804c4646d6d0c8ea50"
        className="bg-muted/30 rounded-lg overflow-hidden flex justify-center items-center"
        style={{ width: '300px', minHeight: '250px' }}
      />
    </div>
  );
};
