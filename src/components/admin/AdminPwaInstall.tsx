import { useEffect, useState } from 'react';
import { Download, Copy, Check, Smartphone, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { hasAdminInstallPrompt, requestAdminPwaInstall, subscribeAdminInstallPrompt } from '@/lib/adminPwaInstall';

type Props = { tenantSlug?: string | null; tenantName?: string | null; isSo: boolean };

function adminUrl(slug: string | null | undefined): string {
  const path = slug ? `/t/${encodeURIComponent(slug)}/dashboard/` : '/dashboard/';
  return typeof window !== 'undefined' ? window.location.origin + path : path;
}

/** This installs the separate ADMIN PWA; it never points to the buyer's home page. */
export default function AdminPwaInstall({ tenantSlug, tenantName, isSo }: Props) {
  const [canPrompt, setCanPrompt] = useState(hasAdminInstallPrompt);
  const [helpOpen, setHelpOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [accepted, setAccepted] = useState(false);

  useEffect(() => subscribeAdminInstallPrompt(() => setCanPrompt(hasAdminInstallPrompt())), []);
  const link = adminUrl(tenantSlug);
  const installedStandalone = typeof window !== 'undefined' &&
    (window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true);
  const isiOS = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/i.test(navigator.userAgent);

  async function install() {
    if (installing) return;
    setInstalling(true);
    try {
      const outcome = await requestAdminPwaInstall();
      if (outcome === 'accepted') {
        setAccepted(true);
        setHelpOpen(false);
      } else {
        // Browsers without beforeinstallprompt (including iOS) must use the
        // browser menu. Never redirect to / or install the storefront app.
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

  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm" aria-label="Admin Web App download">
      <div className="flex items-start gap-3">
        <span className="rounded-xl bg-primary/10 p-3 text-primary"><Smartphone className="h-6 w-6" /></span>
        <div className="min-w-0 flex-1">
          <h2 className="font-bold text-foreground">{isSo ? 'Soo dejiso Admin Web App' : 'Install Admin Web App'}</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {isSo
              ? `${tenantName || 'Tenant-ka'} Admin wuxuu si toos ah u furaa dashboard-ka, ma aha app-ka macaamiisha.`
              : `${tenantName || 'Tenant'} Admin opens the dashboard, not the customer storefront.`}
          </p>
        </div>
      </div>
      <Button type="button" className="mt-4 w-full gap-2" disabled={installing || accepted} onClick={() => void install()}>
        {accepted ? <Check className="h-4 w-4" /> : <Download className="h-4 w-4" />}
        {accepted
          ? (isSo ? 'Rakibidda waa la aqbalay' : 'Installation accepted')
          : installing ? (isSo ? 'Fadlan sug...' : 'Please wait...')
          : isSo ? 'Download Admin App' : 'Download Admin App'}
      </Button>
      {!canPrompt && (
        <p className="mt-2 text-center text-[11px] text-muted-foreground">
          {isSo ? 'Haddii browser-ku aanu rakibid toos ah taageerin, tallaabooyinka ayaa soo baxaya.' :
            'Manual installation steps appear if your browser does not support the install prompt.'}
        </p>
      )}

      {helpOpen && (
        <div role="dialog" aria-label="Install Admin Web App" className="mt-4 space-y-3 rounded-xl border border-border bg-muted/40 p-4 text-sm">
          <div className="flex items-center justify-between">
            <strong>{isSo ? 'Ku rakib Admin-ka' : 'Install the Admin app'}</strong>
            <button type="button" aria-label="Close instructions" onClick={() => setHelpOpen(false)}><X className="h-4 w-4" /></button>
          </div>
          <p>
            {isSo
              ? isiOS
                ? 'Safari ku fur link-ga hoose, taabo Share, kadib Add to Home Screen.'
                : 'Chrome ku fur link-ga hoose, taabo ⋮, kadib Install app ama Add to Home screen.'
              : isiOS
                ? 'Open the admin link in Safari, tap Share, then Add to Home Screen.'
                : 'Open the admin link in Chrome, tap ⋮, then Install app or Add to Home screen.'}
          </p>
          {installedStandalone && (
            <p className="text-xs text-amber-700 dark:text-amber-300">
              {isSo
                ? 'Haddii app-kii hore uu furo bogga macaamiisha, link-gan ku fur Chrome/Safari oo si gaar ah Admin u rakib.'
                : 'If an older shortcut opens the customer app, open this admin URL in Chrome/Safari and install it separately.'}
            </p>
          )}
          <p className="break-all rounded-lg bg-background px-3 py-2 text-xs">{link}</p>
          <Button variant="outline" type="button" className="w-full gap-2" onClick={() => void copy()}>
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? (isSo ? 'Link-ga waa la koobiyeeyay' : 'Link copied') : isSo ? 'Copy Admin Link' : 'Copy Admin Link'}
          </Button>
        </div>
      )}
    </section>
  );
}
