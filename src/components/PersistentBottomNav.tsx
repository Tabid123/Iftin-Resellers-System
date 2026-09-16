import { useLocation } from "@/lib/router-compat";
import { BottomNavigation } from "@/components/BottomNavigation";

/**
 * Rendered once in the root layout and kept mounted for the lifetime of the app.
 * Android WebView can visibly flash a fixed layer when it is destroyed/recreated,
 * so route visibility is applied inside BottomNavigation instead of returning null.
 *
 * Keep it visible for the whole catalog flow. Hiding it on /packages and then
 * showing it again when the user presses Back was the visible "pop" seen on
 * Android. Payment/checkout and admin screens intentionally remain nav-free.
 */
function storefrontPath(pathname: string) {
  // Tenant preview URLs use /t/:slug/... while installed tenant APKs normally
  // use the root routes. Normalize both to the same storefront path.
  const tenantPrefixed = pathname.match(/^\/t\/[^/]+(\/.*)?$/);
  return tenantPrefixed ? (tenantPrefixed[1] || '/') : pathname;
}

export function PersistentBottomNav() {
  const location = useLocation();
  const pathname = storefrontPath(location.pathname);

  const visible =
    pathname === '/providers' ||
    pathname === '/history' ||
    pathname === '/notifications' ||
    pathname === '/profile' ||
    pathname.startsWith('/categories/') ||
    pathname.startsWith('/packages/');

  return <BottomNavigation visible={visible} />;
}
