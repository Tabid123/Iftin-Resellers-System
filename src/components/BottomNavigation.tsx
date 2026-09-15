import { startTransition, useEffect, useState } from 'react';
import { useNavigate, useLocation } from "@/lib/router-compat";
import { useNotifications } from '@/hooks/useNotifications';
import { useVisualViewport } from '@/hooks/useVisualViewport';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTenant } from '@/contexts/TenantContext';

interface BottomNavigationProps {
  onNotificationsClick?: () => void;
  visible?: boolean;
}

const HomeIcon = (_: { active: boolean }) => (
  <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M4 10.2C4 9.5 4.32 8.85 4.87 8.43L10.47 4.15C11.37 3.46 12.63 3.46 13.53 4.15L19.13 8.43C19.68 8.85 20 9.5 20 10.2V17.5C20 19.16 18.66 20.5 17 20.5H7C5.34 20.5 4 19.16 4 17.5V10.2Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    <path d="M10 20.5V14.5C10 13.95 10.45 13.5 11 13.5H13C13.55 13.5 14 13.95 14 14.5V20.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const HistoryIcon = (_: { active: boolean }) => (
  <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M3.5 8.5V4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    <path d="M3.5 8.5H8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    <path d="M4.2 8.6C5.72 5.86 8.64 4 12 4C16.97 4 21 8.03 21 13C21 17.97 16.97 22 12 22C7.03 22 3 17.97 3 13" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M12 9V13L15 14.8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const BellIcon = (_: { active: boolean }) => (
  <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M6 10C6 6.69 8.69 4 12 4C15.31 4 18 6.69 18 10V14.2L19.4 16.6C19.6 16.93 19.36 17.35 18.97 17.35H5.03C4.64 17.35 4.4 16.93 4.6 16.6L6 14.2V10Z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M9.8 20C10.35 20.6 11.13 20.95 12 20.95C12.87 20.95 13.65 20.6 14.2 20" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
  </svg>
);

const UserIcon = (_: { active: boolean }) => (
  <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.7" />
    <path d="M5 20.5C5 17.2 8.13 15.5 12 15.5C15.87 15.5 19 17.2 19 20.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
  </svg>
);

export function BottomNavigation({ onNotificationsClick, visible = true }: BottomNavigationProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { language } = useLanguage();
  const { unreadCount, markAsSeen } = useNotifications();
  const t = useTenant();
  const tenant = t.status === 'ready' || t.status === 'suspended' ? t.tenant : null;

  useVisualViewport();

  // Optimistic tab highlight: the tap must paint in the very next frame even
  // though rendering the destination screen costs a few hundred milliseconds
  // on a low-end phone. The pending path wins until the router catches up.
  const [pendingPath, setPendingPath] = useState<string | null>(null);
  useEffect(() => {
    if (pendingPath && location.pathname === pendingPath) setPendingPath(null);
  }, [location.pathname, pendingPath]);

  const currentPath = pendingPath ?? location.pathname;
  const isActive = (path: string) => currentPath === path;
  const go = (path: string) => {
    // Re-navigating to the route already on screen creates pointless router
    // work and a visible redraw on some Android WebViews.
    if (isActive(path)) return;
    setPendingPath(path);
    // Keep the current screen interactive while the next one renders instead
    // of blocking the main thread inside the tap handler.
    startTransition(() => navigate(path));
  };

  const handleNotificationsClick = () => {
    markAsSeen();
    if (onNotificationsClick) {
      onNotificationsClick();
    } else if (!isActive('/notifications')) {
      go('/notifications');
    }
  };

  const navItems = [
    { icon: HomeIcon, path: '/providers', label: language === 'so' ? 'Hoyga' : 'Home', onClick: () => go('/providers') },
    { icon: HistoryIcon, path: '/history', label: language === 'so' ? 'Dalabyada' : 'History', onClick: () => go('/history') },
    { icon: BellIcon, path: '/notifications', label: language === 'so' ? 'Ogeysiis' : 'Notifications', onClick: handleNotificationsClick, badge: unreadCount },
    { icon: UserIcon, path: '/profile', label: 'Profile', onClick: () => go('/profile') },
  ];

  const navBackground = tenant?.primary_color ? tenant.primary_color : 'hsl(var(--primary))';
  // Never resolve to a CSS variable here: on a white pill an unresolved/late
  // variable would paint the icon invisible for a frame during navigation.
  const activeIconColor = tenant?.primary_color || '#0F4C81';

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50"
      aria-hidden={!visible}
      style={{
        paddingBottom: 'calc(8px + var(--effective-safe-area-bottom, env(safe-area-inset-bottom, 0px)))',
        background: navBackground,
        WebkitTapHighlightColor: 'transparent',
        visibility: visible ? 'visible' : 'hidden',
        pointerEvents: visible ? 'auto' : 'none',
      }}
    >
      <div className="mx-auto w-full max-w-md">
        <div className="grid h-[68px] grid-cols-4 items-center px-2">
          {navItems.map(({ icon: Icon, path, label, onClick, badge }) => {
            const active = isActive(path);
            return (
              <button
                key={path}
                type="button"
                onClick={onClick}
                tabIndex={visible ? 0 : -1}
                className="relative flex h-[68px] min-w-0 touch-manipulation select-none flex-col items-center justify-center gap-1.5 bg-transparent px-1 outline-none"
                style={{ WebkitTapHighlightColor: 'transparent' }}
                aria-current={active ? 'page' : undefined}
              >
                <div
                  className={`flex h-9 w-14 items-center justify-center rounded-full ${
                    active ? 'shadow-sm' : ''
                  }`}
                  style={{
                    backgroundColor: active ? '#ffffff' : 'transparent',
                    transition: 'none',
                  }}
                >
                  <div
                    className="h-[26px] w-[26px]"
                    style={{ color: active ? activeIconColor : 'rgba(255,255,255,0.6)', transition: 'none' }}
                  >
                    <Icon active={active} />
                  </div>
                </div>
                <span className={`w-full truncate text-center text-[11px] leading-none ${
                  active ? 'text-white font-bold' : 'text-white/60'
                }`}>
                  {label}
                </span>
                {badge != null && badge > 0 && (
                  <span className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                    {badge > 99 ? '99+' : badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
