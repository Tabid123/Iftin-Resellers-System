export const ADMIN_INSTALL_BANNER_DURATION_MS = 10_000;
export const ADMIN_INSTALL_BANNER_SNOOZE_MS = 24 * 60 * 60 * 1_000;

/** Scope UI preferences to the tenant, never to the whole platform. */
export function adminInstallBannerKey(slug: string | null | undefined, setting: 'installed' | 'hiddenUntil'): string {
  return `iftin.admin.install.${encodeURIComponent(slug || 'default')}.${setting}`;
}

/** Show only if admin is not installed/standalone and not dismissed for today. */
export function shouldShowAdminInstallBanner({
  standalone,
  installed,
  hiddenUntil,
  now,
}: {
  standalone: boolean;
  installed: boolean;
  hiddenUntil: number;
  now: number;
}): boolean {
  return !standalone && !installed && (!Number.isFinite(hiddenUntil) || hiddenUntil <= now);
}
