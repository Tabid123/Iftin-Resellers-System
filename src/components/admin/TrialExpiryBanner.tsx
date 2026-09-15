import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, ArrowRight, X } from 'lucide-react';
import { useTenant } from '@/contexts/TenantContext';

const HOUR_MS = 60 * 60 * 1000;
const WARNING_WINDOW_HOURS = 48;
const RENEWAL_WHATSAPP = '252619535029';

const TrialExpiryBanner = () => {
  const tenantState = useTenant();
  const tenant = tenantState.tenant;
  const [mountNode, setMountNode] = useState<HTMLElement | null>(null);
  const [now, setNow] = useState(() => Date.now());
  // Deliberately not persisted: closing hides the banner only until the next refresh.
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let raf = 0;

    const ensureHost = () => {
      if (cancelled) return;

      const header = document.querySelector('header');
      const parent = header?.parentElement;
      if (!header || !parent) return;

      let host = document.getElementById('trial-expiry-banner-host');

      // The dashboard re-renders every second because of its live clock. A node
      // manually inserted inside that React-owned parent can be removed during
      // reconciliation, so recreate/reposition it whenever needed.
      const hostIsValid =
        host &&
        host.parentElement === parent &&
        host.previousElementSibling === header;

      if (!hostIsValid) {
        host?.remove();
        host = document.createElement('div');
        host.id = 'trial-expiry-banner-host';
        parent.insertBefore(host, header.nextSibling);
      }

      setMountNode((current) => (current === host ? current : host));
    };

    const scheduleEnsureHost = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(ensureHost);
    };

    ensureHost();

    // Keep watching even after the first successful attach. This is important
    // because the dashboard clock causes continuous React re-renders.
    const observer = new MutationObserver(scheduleEnsureHost);
    observer.observe(document.body, { childList: true, subtree: true });

    // Small safety net for browsers/WebViews where a reconciliation mutation can
    // happen before the observer attaches.
    const heartbeat = window.setInterval(ensureHost, 1000);

    return () => {
      cancelled = true;
      observer.disconnect();
      window.clearInterval(heartbeat);
      if (raf) cancelAnimationFrame(raf);
      const host = document.getElementById('trial-expiry-banner-host');
      if (host) host.remove();
      setMountNode(null);
    };
  }, []);

  const view = useMemo(() => {
    if (!tenant) return null;

    const endsAt = tenant.trial_ends_at ?? tenant.current_period_end;
    if (!endsAt) return null;

    const end = new Date(endsAt);
    const remainingMs = end.getTime() - now;
    const hours = Math.max(0, Math.ceil(remainingMs / HOUR_MS));
    if (!Number.isFinite(end.getTime()) || remainingMs <= 0 || hours > WARNING_WINDOW_HOURS) return null;

    const days = Math.max(1, Math.ceil(hours / 24));
    const endLabel = new Intl.DateTimeFormat('so-SO', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: 'Africa/Mogadishu',
    }).format(end);
    const endTimeLabel = new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      timeZone: 'Africa/Mogadishu',
    }).format(end);

    return {
      hours,
      days,
      endLabel,
      endTimeLabel,
      isTrial: Boolean(tenant.trial_ends_at),
    };
  }, [tenant, now]);

  if (!mountNode || !view || dismissed) return null;

  const planLabel = view.isTrial ? 'Qorshaha Tijaabada' : 'Qorshaha Adeegga';
  const renewalMessage = encodeURIComponent(
    `Asc, waxaan rabaa inaan cusbooneysiiyo adeegga ${tenant?.name ?? 'reseller-kayga'}.`,
  );

  return createPortal(
    <div className="px-4 pt-4 pb-1 bg-gray-100 dark:bg-gray-900">
      <div className="relative rounded-2xl border-2 border-amber-400 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/35 dark:to-orange-950/25 shadow-sm p-4">
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-full text-amber-800 hover:bg-amber-200/70 dark:text-amber-200 dark:hover:bg-amber-900/50"
          aria-label="Xir digniinta"
          title="Xir"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex items-start gap-3 pr-7">
          <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-sm">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-extrabold text-amber-900 dark:text-amber-200 text-sm tracking-wide">DIGNIINTA ADEEGGA</h3>
              <span className="shrink-0 rounded-full bg-amber-500 px-3 py-1 text-[11px] font-extrabold text-white shadow-sm mr-1">
                Haray: {view.hours} saac
              </span>
            </div>
            <p className="mt-2 text-sm leading-6 text-amber-950 dark:text-amber-100">
              Digniin: Adeeggaagu wuxuu dhacayaa <strong>{view.days} {view.days === 1 ? 'maalin' : 'maalmood'}</strong> gudahood ({view.endLabel}). Fadlan cusboonaysii si uusan adeeggaagu kaaga go'in.
            </p>
            <p className="mt-1 text-xs font-semibold text-amber-900 dark:text-amber-200">
              Waqtiga uu dhacayo: {view.endTimeLabel}
            </p>
            <div className="mt-3 border-t border-amber-300/80 pt-3 flex items-center justify-between gap-3">
              <span className="text-xs font-semibold text-amber-900 dark:text-amber-200 truncate">{planLabel}</span>
              <button
                type="button"
                onClick={() => {
                  window.location.href = `https://wa.me/${RENEWAL_WHATSAPP}?text=${renewalMessage}`;
                }}
                className="shrink-0 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 px-4 py-2 text-xs font-extrabold text-white shadow-sm active:scale-[0.98] transition-transform"
              >
                Cusboonaysii Hadda <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    mountNode,
  );
};

export default TrialExpiryBanner;
