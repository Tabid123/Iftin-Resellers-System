import { useLocation } from "@/lib/router-compat";
import { BottomNavigation } from "@/components/BottomNavigation";

/**
 * Rendered once in the root layout so the bar never unmounts between routes
 * (no blank flash). Visibility is decided from the tenant-normalized path.
 */
const NAV_PATHS = ["/providers", "/history", "/notifications", "/profile"];

export function PersistentBottomNav() {
  const location = useLocation();
  const pathname = location.pathname;
  const visible =
    NAV_PATHS.includes(pathname) || pathname.startsWith("/categories/");

  if (!visible) return null;
  return <BottomNavigation />;
}
