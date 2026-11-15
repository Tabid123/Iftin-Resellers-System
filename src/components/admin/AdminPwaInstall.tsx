import { useEffect, useState } from 'react';
import { Download, Copy, Check, Smartphone, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { requestAdminPwaInstall } from '@/lib/adminPwaInstall';
import {
  ADMIN_INSTALL_BANNER_DURATION_MS,
  ADMIN_INSTALL_BANNER_SNOOZE_MS,
  adminInstallBannerKey,
  shouldShowAdminInstallBanner,
} from '@/lib/adminInstallBannerState';

type Props = { tenantSlug?: string | null; tenantName?: string | null; isSo: boolean };

function adminUrl(slug: string | null | undefined): string {
  const path = slug ? `/t/${encodeURIComponent(slug)}/dashboard/` : '/dashboard/';
  return typeof window !== 'undefined' ? window.location.origin + path : path;
}

function standalone(): boolean {
  return typeof window !== 'undefined' && (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function getStored(key: string): string | null {
  try { return window.localStorage.getItem(key); } catch { return null; }
}

function setStored(key: string, value: string): void {
  try { window.localStorage.setItem(key, value); } catch { /* storage unavailable */ }
}

function isEligible(slug: string | null | undefined): boolean {
  if (typeof window === 'undefined') return false;
  const installed = getStored(adminInstallBannerKey(slug, 'installed')) === '1';
  const hiddenUntil = Number(getStored(adminInstallBannerKey(slug, 'hiddenUntil')) || '0');
  return shouldShowAdminInstallBanner({ standalone: standalone(), installed, hiddenUntil, now: Date.now() });
}

/**
 * Compact dashboard-only install banner.
 * Hides after ten seconds, hides for 24h on X, and permanently hides when
 * an actual appinstalled event is received. It is never shown in standalone.
 */
export default function AdminPwaInstall({ tenantSlug, tenantName, isSo }: Props) {
  const [visible, setVisible] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [installing, setInstalling] = useState(false);
  const isiOS = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/i.test(navigator.userAgent);
  const link = adminUrl(tenantSlug);

  // Read browser state only after mounting, avoiding SSR/hydration mismatch.
  useEffect(() => {
    setVisible(isEligible(tenantSlug));
    setHelpOpen(false);
    setCopied(false);
  }, [tenantSlug]);

  useEffect(() => {
    if (!visible || helpOpen || installing) return;
    const timer = window.setTimeout(() => setVisible(false), ADMIN_INSTALL_BANNER_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [visible, helpOpen, installing, tenantSlug]);

  useEffect(() => {
    const installed = () => {
      setStored(adminInstallBannerKey(tenantSlug, 'installed'), '1');
      setVisible(false);
      setHelpOpen(false);
    };
    const mode = window.matchMedia?.('(display-mode: standalone)');
    const checkMode = () => { if (standalone()) setVisible(false); };
    window.addEventListener('appinstalled', installed);
    mode?.addEventListener?.('change', checkMode);
    checkMode();
    return () => {
      window.removeEventListener('appinstalled', installed);
      mode?.removeEventListener?.('change', checkMode);
    };
  }, [tenantSlug]);

  function dismiss() {
    setStored(adminInstallBannerKey(tenantSlug, 'hiddenUntil'), String(Date.now() + ADMIN_INSTALL_BANNER_SNOOZE_MS));
    setVisible(false);
  }

  async function install() {
    if (installing) return;
    setInstalling(true);
    try {
      const outcome = await requestAdminPwaInstall();
      if (outcome === 'accepted') {
        // appinstalled is the authoritative completion signal. Suppress the
        // banner for today while the browser finishes installation.
        setStored(adminInstallBannerKey(tenantSlug, 'hiddenUntil'), String(Date.now() + ADMIN_INSTALL_BANNER_SNOOZE_MS));
        setVisible(false);
        setHelpOpen(false);
      } else {
        // Manual Chrome/Safari instructions, and do not auto-dismiss mid-task.
        setHelpOpen(true);
      }
    } catch {
      setHelpOpen(true);
    } finally {
      setInstalling(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  if (!visible || standalone()) return null;

  return (
    <section
      aria-label="Admin Web App download"
      className="relative overflow-hidden rounded-xl border border-border bg-card p-3 shadow-sm sm:p-4"
    >
      <style>{`@keyframes admin-install-countdown{from{transform:scaleX(1)}to{transform:scaleX(0)}}`}</style>
      <div className="flex items-start gap-3">
        <div className="shrink-0 rounded-lg bg-primary/10 p-2.5 text-primary">
          <Smartphone className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-foreground">
            {isSo ? 'Soo dejiso Admin App' : 'Install Admin App'}
          </h2>
          <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
            {isSo
              ? `${tenantName || 'Tenant-ka'} Admin si toos ah ayuu dashboard-ka u furaa.`
              : `${tenantName || 'Tenant'} Admin opens the dashboard directly.`}
          </p>
        </div>
        <button type="button" onClick={dismiss} aria-label={isSo ? 'Xir xayeysiiska rakibidda' : 'Dismiss install banner'}
          className="shrink-0 rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>
      <Button type="button" className="mt-3 w-full gap-2 sm:w-auto" disabled={installing} onClick={() => void install()}>
        <Download className="h-4 w-4" />
        {installing ? (isSo ? 'Fadlan sug...' : 'Please wait...') : 'Download Admin App'}
      </Button>

      {helpOpen && (
        <div role="dialog" aria-label="Install Admin Web App"
          className="mt-3 space-y-3 rounded-lg border border-border bg-muted/40 p-3 text-sm">
          <div className="flex items-center justify-between gap-2">
            <strong>{isSo ? 'Ku rakib Admin-ka' : 'Install Admin App'}</strong>
            <button type="button" aria-label="Close instructions" onClick={() => setHelpOpen(false)}>
              <X className="h-4 w-4" />
            </button>
          </div>
          <p>{isSo
            ? isiOS
              ? 'Safari ku fur link-ga Admin-ka, taabo Share, kadib Add to Home Screen.'
              : 'Chrome ku fur link-ga Admin-ka, taabo ⋮, kadib Install app ama Add to Home screen.'
            : isiOS
              ? 'Open the Admin link in Safari, tap Share, then Add to Home Screen.'
              : 'Open the Admin link in Chrome, tap ⋮, then Install app or Add to Home screen.'}
          </p>
          <p className="break-all rounded-md bg-background p-2 text-xs">{link}</p>
          <Button variant="outline" type="button" className="w-full gap-2" onClick={() => void copy()}>
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? (isSo ? 'Link-ga waa la koobiyeeyay' : 'Link copied') : 'Copy Admin Link'}
          </Button>
        </div>
      )}
      {!helpOpen && !installing && (
        <div className="absolute inset-x-0 bottom-0 h-[3px] bg-primary/10">
          <div
            key={tenantSlug ?? 'default'}
            className="h-full w-full origin-left bg-primary/70"
            style={{ animation: `admin-install-countdown ${ADMIN_INSTALL_BANNER_DURATION_MS}ms linear forwards` }}
          />
        </div>
      )}
    </section>
  );
}
