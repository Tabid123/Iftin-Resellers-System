import { useEffect } from 'react';
import { useLocation } from "@/lib/router-compat";

// Pages where ads should be HIDDEN
const HIDE_ADS_PATHS = [
  '/payment-providers',
  '/payment-success',
  '/privacy-policy',
  '/admin'
];

export const AdManager = () => {
  const location = useLocation();

  useEffect(() => {
    const shouldHideAds = HIDE_ADS_PATHS.some(path => 
      location.pathname === path || location.pathname.startsWith(path + '/')
    );

    // Find and control ALL Adsterra ad elements including Social Bar
    const adSelectors = [
      '[class*="adsterra"]',
      'iframe[src*="highperformanceformat"]',
      'iframe[src*="effectivegatecpm"]',
      '[id*="effectivegatecpm"]',
      '.social-bar',
      '[class*="pl28370050"]'
    ];
    
    const adElements = document.querySelectorAll(adSelectors.join(', '));
    
    if (shouldHideAds) {
      // Hide ads on sensitive pages
      adElements.forEach(el => {
        (el as HTMLElement).style.display = 'none';
        (el as HTMLElement).style.visibility = 'hidden';
      });
    } else {
      // Show ads on allowed pages
      adElements.forEach(el => {
        (el as HTMLElement).style.display = '';
        (el as HTMLElement).style.visibility = 'visible';
      });
    }
  }, [location.pathname]);

  return null; // This component doesn't render anything
};
