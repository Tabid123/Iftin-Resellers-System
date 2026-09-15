import { useEffect } from 'react';
import { useLocation } from "@/lib/router-compat";
import { useTheme } from '@/contexts/ThemeContext';
import { applyNativeStatusBarColor, BUILD_BAR_COLOR } from '@/lib/nativeStatusBar';


const providerColors: Record<string, { light: string; dark: string }> = {
  hormuud: { light: '#00c853', dark: '#00c853' },
  somtel: { light: '#ffd600', dark: '#ffd600' },
  somlink: { light: '#9c27b0', dark: '#9c27b0' },
  somnet: { light: '#42a5f5', dark: '#42a5f5' },
  amtel: { light: '#ef5350', dark: '#ef5350' },
};

const pageColors: Record<string, { light: string; dark: string }> = {
  '/': { light: 'hsl(var(--primary))', dark: 'hsl(var(--primary))' },
  '/providers': { light: 'hsl(var(--primary))', dark: 'hsl(var(--primary))' },
  '/payment-success': { light: '#00c853', dark: '#00c853' },
  '/dashboard/login': { light: 'hsl(var(--primary))', dark: 'hsl(var(--primary))' },
  '/admin': { light: 'hsl(var(--primary))', dark: 'hsl(var(--primary))' },
  '/history': { light: 'hsl(var(--primary))', dark: 'hsl(var(--primary))' },
  '/profile': { light: 'hsl(var(--primary))', dark: 'hsl(var(--primary))' },
  '/notifications': { light: 'hsl(var(--primary))', dark: 'hsl(var(--primary))' },
};

export const StatusBarColor = () => {
  const location = useLocation();
  const { theme } = useTheme();

  useEffect(() => {
    let color = pageColors[location.pathname]?.[theme] || pageColors['/'][theme];

    // Check if we have provider name in location state
    const providerName = (location.state as { providerName?: string })?.providerName?.toLowerCase().trim();
    if (providerName && providerColors[providerName]) {
      color = providerColors[providerName][theme];
    }

    // Update meta tag
    let metaTag = document.querySelector('meta[name="theme-color"]');
    if (!metaTag) {
      metaTag = document.createElement('meta');
      metaTag.setAttribute('name', 'theme-color');
      document.head.appendChild(metaTag);
    }
    metaTag.setAttribute('content', color);

    // Native Android status bar. When the app was built with a tenant color
    // the bars stay locked to it, so skip per-route calls entirely — that is
    // what used to make the navigation bar flicker on every tap.
    if (!BUILD_BAR_COLOR) void applyNativeStatusBarColor(color);
  }, [location.pathname, location.state, theme]);


  return null;
};
