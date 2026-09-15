import { useLocation } from "@/lib/router-compat";
import { BottomNavigation } from "@/components/BottomNavigation";

/**
 * Rendered once in the root layout and kept mounted for the entire storefront
 * session. Route changes only toggle visibility; the Android WebView never has
 * to destroy/recreate the fixed bottom layer, which avoids the blank/flash
 * seen when navigating between storefront screens.
 */
const NAV_PATHS = ["/providers", "/history", "/notifications", "/profile"];

export function PersistentBottomNav() {
  const location = useLocation();
  const pathname = location.pathname;
  const visible =
    NAV_PATHS.includes(pathname) || pathname.startsWith("/categories/");

  return <BottomNavigation visible={visible} />;
}
