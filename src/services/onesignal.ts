import { Capacitor } from '@capacitor/core';

const ONESIGNAL_APP_ID = String(import.meta.env.VITE_ONESIGNAL_APP_ID ?? '').trim();
const ALLOWED_NOTIFICATION_PATHS = [
  '/',
  '/providers',
  '/history',
  '/notifications',
  '/profile',
  '/categories/',
];

let initialized = false;
let clickHandlerRegistered = false;

function getOneSignal(): any | null {
  if (typeof window === 'undefined' || !Capacitor.isNativePlatform()) return null;
  return (window as any).plugins?.OneSignal ?? null;
}

function getSafeNotificationPath(event: any): string | null {
  const data =
    event?.notification?.additionalData ??
    event?.notification?.additional_data ??
    event?.result?.notification?.payload?.additionalData ??
    {};
  const candidate = String(data?.path ?? data?.deep_link ?? data?.deeplink ?? '').trim();
  if (!candidate.startsWith('/') || candidate.startsWith('//')) return null;
  return ALLOWED_NOTIFICATION_PATHS.some((path) =>
    path.endsWith('/') ? candidate.startsWith(path) : candidate === path,
  )
    ? candidate
    : null;
}

function registerClickHandler(OneSignal: any) {
  if (clickHandlerRegistered) return;
  OneSignal.Notifications?.addEventListener?.('click', (event: any) => {
    const path = getSafeNotificationPath(event);
    if (!path || typeof window === 'undefined') return;
    window.location.assign(path);
  });
  clickHandlerRegistered = true;
}

/**
 * Initialize native push for the tenant APK.
 *
 * The OneSignal app id is supplied at APK build time. It is deliberately not
 * hard-coded so two tenant builds cannot accidentally share the wrong push app.
 * Provider REST/API secrets must stay server-side and must never be exposed here.
 */
export async function initializeOneSignal(
  tenant?: { id?: string | null; slug?: string | null } | null,
): Promise<boolean> {
  if (!Capacitor.isNativePlatform() || !ONESIGNAL_APP_ID) return false;

  const OneSignal = getOneSignal();
  if (!OneSignal) {
    console.info('OneSignal native plugin is not available in this APK');
    return false;
  }

  try {
    if (!initialized) {
      OneSignal.initialize(ONESIGNAL_APP_ID);
      registerClickHandler(OneSignal);
      initialized = true;
    }

    const tags: Record<string, string> = {};
    if (tenant?.id) tags.tenant_id = tenant.id;
    if (tenant?.slug) tags.tenant_slug = tenant.slug;
    if (Object.keys(tags).length > 0) OneSignal.User?.addTags?.(tags);

    // Android 13+ requires runtime notification permission. Older Android
    // versions safely ignore this request.
    await Promise.resolve(OneSignal.Notifications?.requestPermission?.(true));
    return true;
  } catch (error) {
    console.error('OneSignal initialization error:', error);
    return false;
  }
}

/** Keep the native subscription scoped to the currently resolved tenant. */
export function syncOneSignalTenant(
  tenant?: { id?: string | null; slug?: string | null } | null,
): void {
  const OneSignal = getOneSignal();
  if (!OneSignal || !initialized) return;

  try {
    if (!tenant?.id) {
      OneSignal.User?.removeTags?.(['tenant_id', 'tenant_slug']);
      return;
    }

    const tags: Record<string, string> = { tenant_id: tenant.id };
    if (tenant.slug) tags.tenant_slug = tenant.slug;
    OneSignal.User?.addTags?.(tags);
  } catch (error) {
    console.error('OneSignal tenant sync error:', error);
  }
}

export function setUserPhone(phone: string): void {
  const OneSignal = getOneSignal();
  if (!OneSignal || !initialized) return;

  const normalizedPhone = phone.trim();
  if (!normalizedPhone) return;

  try {
    OneSignal.login?.(normalizedPhone);
    OneSignal.User?.addTags?.({ phone: normalizedPhone });
  } catch (error) {
    console.error('OneSignal setUserPhone error:', error);
  }
}
