import { useEffect, useRef } from 'react';
import { useLocation } from "@/lib/router-compat";

// Pages where ads should be HIDDEN
const HIDE_ADS_PATHS = [
  '/payment-providers',
  '/payment-success',
  '/privacy-policy',
  '/admin'
];

export const AdsterraBanner = () => {
  const location = useLocation();
  const bannerRef = useRef<HTMLDivElement>(null);
  const scriptLoaded = useRef(false);

  const shouldHideAds = HIDE_ADS_PATHS.some(path => 
    location.pathname === path || location.pathname.startsWith(path + '/')
  );

  useEffect(() => {
    if (shouldHideAds || scriptLoaded.current) return;

    // Load banner script
    const script = document.createElement('script');
    script.innerHTML = `
      atOptions = {
        'key' : 'ac65b1ee14a08ff9091f0d45f88166a3',
        'format' : 'iframe',
        'height' : 50,
        'width' : 320,
        'params' : {}
      };
    `;
    
    const invokeScript = document.createElement('script');
    invokeScript.src = 'https://www.highperformanceformat.com/ac65b1ee14a08ff9091f0d45f88166a3/invoke.js';
    invokeScript.async = true;

    if (bannerRef.current) {
      bannerRef.current.appendChild(script);
      bannerRef.current.appendChild(invokeScript);
      scriptLoaded.current = true;
    }

    return () => {
      scriptLoaded.current = false;
    };
  }, [shouldHideAds]);

  if (shouldHideAds) return null;

  return (
    <div 
      ref={bannerRef}
      className="fixed bottom-16 left-1/2 -translate-x-1/2 z-40 flex justify-center items-center"
      style={{ width: '320px', height: '50px' }}
    />
  );
};
