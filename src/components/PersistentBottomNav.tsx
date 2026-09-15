import { useLocation } from "@/lib/router-compat";
import { BottomNavigation } from "@/components/BottomNavigation";

/**
 * Rendered once in the root layout and kept mounted for the lifetime of the app.
 * Android WebView can visibly flash a fixed layer when it is destroyed/recreated,
 * so route visibility is applied inside BottomNavigation instead of returning null.
 */
const NAV_PATHS = ["/providers", "/history", "/notifications", "/profile"];

export function PersistentBottomNav() {
  const location = useLocation();
  const pathname = location.pathname;
  const visible =
    NAV_PATHS.includes(pathname) || pathname.startsWith("/categories/");

  return <BottomNavigation visible={visible} />;
}
