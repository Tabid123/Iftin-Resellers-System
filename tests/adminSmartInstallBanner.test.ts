import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  ADMIN_INSTALL_BANNER_DURATION_MS,
  ADMIN_INSTALL_BANNER_SNOOZE_MS,
  adminInstallBannerKey,
  shouldShowAdminInstallBanner,
} from '../src/lib/adminInstallBannerState';

const read = (path: string) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

describe('Smart Admin PWA install banner', () => {
  it('shows for a non-installed tenant but not when standalone or already installed', () => {
    const base = { standalone: false, installed: false, hiddenUntil: 0, now: 10_000 };
    expect(shouldShowAdminInstallBanner(base)).toBe(true);
    expect(shouldShowAdminInstallBanner({ ...base, standalone: true })).toBe(false);
    expect(shouldShowAdminInstallBanner({ ...base, installed: true })).toBe(false);
    expect(shouldShowAdminInstallBanner({ ...base, hiddenUntil: 10_001 })).toBe(false);
    expect(shouldShowAdminInstallBanner({ ...base, hiddenUntil: 10_000 })).toBe(true);
  });

  it('uses a ten-second auto timeout and a separate 24-hour X dismissal', () => {
    expect(ADMIN_INSTALL_BANNER_DURATION_MS).toBe(10_000);
    expect(ADMIN_INSTALL_BANNER_SNOOZE_MS).toBe(86_400_000);
    const component = read('src/components/admin/AdminPwaInstall.tsx');
    expect(component).toContain('window.setTimeout(() => setVisible(false), ADMIN_INSTALL_BANNER_DURATION_MS)');
    expect(component).toContain("adminInstallBannerKey(tenantSlug, 'hiddenUntil')");
    expect(component).toContain("adminInstallBannerKey(tenantSlug, 'installed')");
    expect(component).toContain("window.addEventListener('appinstalled', installed)");
    expect(component).toContain("if (!visible || standalone()) return null");
    expect(component).toContain('setHelpOpen(true)');
    expect(component).toContain('Download Admin App');
  });

  it('stores banner preferences per tenant rather than globally', () => {
    expect(adminInstallBannerKey('demo', 'installed')).not.toBe(adminInstallBannerKey('luubaan', 'installed'));
    expect(adminInstallBannerKey('demo', 'hiddenUntil')).not.toBe(adminInstallBannerKey('demo', 'installed'));
  });

  it('places a single compact banner before dashboard period filters and cards', () => {
    const dashboard = read('src/components/pages/SimpleAdminDashboard.tsx');
    const anchor = dashboard.indexOf('<main className="flex-1 px-3 pb-6 space-y-4">');
    const banner = dashboard.indexOf('<AdminPwaInstall', anchor);
    const periods = dashboard.indexOf("key: 'today' as const", anchor);
    const cards = dashboard.indexOf('{statCards[0]?.isWallet', anchor);
    expect(anchor).toBeGreaterThanOrEqual(0);
    expect(banner).toBeGreaterThan(anchor);
    expect(banner).toBeLessThan(periods);
    expect(banner).toBeLessThan(cards);
    expect(dashboard.match(/<AdminPwaInstall/g)?.length).toBe(1);
  });
});
