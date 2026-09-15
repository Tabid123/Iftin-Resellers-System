import { useLocation } from "@/lib/router-compat";
import { BottomNavigation } from "@/components/BottomNavigation";

/**
 * Keep the customer bottom navigation mounted for the entire storefront
 * lifetime. Android WebView visibly flashes when a fixed bottom layer is
 * destroyed and recreated during route transitions, so routes that should not
 * show the bar only hide the already-mounted layer.
 */
const NAV_PATHS = ["/providers", "/history", "/notifications", "/profile"];

export function PersistentBottomNav() {
  const location = useLocation();
  const pathname = location.pathname;
  const visible =
    NAV_PATHS.includes(pathname) || pathname.startsWith("/categories/");

  return (
    <div
      className="storefront-bottom-nav-host"
      data-visible={visible ? "true" : "false"}
      aria-hidden={!visible}
    >
      <BottomNavigation />
    </div>
  );
}
