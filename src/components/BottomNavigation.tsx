import { useNavigate, useLocation } from "@/lib/router-compat";
import { Home, History, Bell, User } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

interface BottomNavigationProps {
  onNotificationsClick?: () => void;
}

export function BottomNavigation({ onNotificationsClick }: BottomNavigationProps = {}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { language } = useLanguage();

  const isCatalogHome =
    location.pathname === "/providers" ||
    location.pathname.startsWith("/categories/") ||
    location.pathname.startsWith("/packages/");

  const isActive = (path: string) =>
    path === "/providers" ? isCatalogHome : location.pathname === path;

  const go = (path: string) => {
    if (path === "/notifications" && onNotificationsClick) {
      onNotificationsClick();
      return;
    }
    if (isActive(path) && !(path === "/providers" && location.pathname !== "/providers")) return;
    navigate(path);
  };

  const navItems = [
    { icon: Home, label: language === "so" ? "Hoyga" : "Home", path: "/providers" },
    { icon: History, label: language === "so" ? "Dalabyada" : "History", path: "/history" },
    { icon: Bell, label: language === "so" ? "Ogeysiis" : "Notifications", path: "/notifications" },
    { icon: User, label: "Profile", path: "/profile" },
  ];

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50"
      style={{
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
        contain: "layout",
      }}
    >
      <div className="border-t border-border/60 bg-background shadow-[0_-4px_16px_rgba(0,0,0,0.06)]">
        <div className="flex items-center justify-around px-2 pb-1.5 pt-2">
          {navItems.map(({ icon: Icon, label, path }) => {
            const active = isActive(path);
            return (
              <button
                key={path}
                type="button"
                onClick={() => go(path)}
                className="relative flex min-w-[64px] touch-manipulation flex-col items-center justify-center gap-1 px-3 py-1"
                style={{
                  WebkitTapHighlightColor: "transparent",
                  touchAction: "manipulation",
                }}
                aria-current={active ? "page" : undefined}
              >
                <Icon
                  className="h-6 w-6"
                  style={{ color: active ? "hsl(var(--primary))" : "#9CA3AF" }}
                  strokeWidth={active ? 2.4 : 2}
                />
                <span
                  className="text-[11px] font-semibold tracking-tight"
                  style={{ color: active ? "hsl(var(--primary))" : "#9CA3AF" }}
                >
                  {label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
