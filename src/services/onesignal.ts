import { Capacitor } from '@capacitor/core';
import OneSignal from '@onesignal/capacitor-plugin';

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

function registerClickHandler() {
  if (clickHandlerRegistered) return;
  OneSignal.Notifications.addEventListener('click', (event: any) => {
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
 * hard-coded so tenant APK builds cannot accidentally inherit another app id.
 * Provider REST/API secrets stay server-side and are never exposed here.
 */
export async function initializeOneSignal(
  tenant?: { id?: string | null; slug?: string | null } | null,
): Promise<boolean> {
  if (!Capacitor.isNativePlatform() || !ONESIGNAL_APP_ID) return false;

  try {
    if (!initialized) {
      await OneSignal.initialize(ONESIGNAL_APP_ID);
      registerClickHandler();
      initialized = true;
    }

    const tags: Record<string, string> = {};
    if (tenant?.id) tags.tenant_id = tenant.id;
    if (tenant?.slug) tags.tenant_slug = tenant.slug;
    if (Object.keys(tags).length > 0) await OneSignal.User.addTags(tags);

    // Android 13+ requires runtime notification permission. Older Android
    // versions safely resolve without a permission dialog.
    await OneSignal.Notifications.requestPermission(true);
    return true;
  } catch (error) {
    console.error('OneSignal initialization error:', error);
    return false;
  }
}

/** Keep the native subscription scoped to the currently resolved tenant. */
export async function syncOneSignalTenant(
  tenant?: { id?: string | null; slug?: string | null } | null,
): Promise<void> {
  if (!Capacitor.isNativePlatform() || !initialized) return;

  try {
    if (!tenant?.id) {
      await OneSignal.User.removeTags(['tenant_id', 'tenant_slug']);
      return;
    }

    const tags: Record<string, string> = { tenant_id: tenant.id };
    if (tenant.slug) tags.tenant_slug = tenant.slug;
    await OneSignal.User.addTags(tags);
  } catch (error) {
    console.error('OneSignal tenant sync error:', error);
  }
}

export async function setUserPhone(phone: string): Promise<void> {
  if (!Capacitor.isNativePlatform() || !initialized) return;

  const normalizedPhone = phone.trim();
  if (!normalizedPhone) return;

  try {
    await OneSignal.login(normalizedPhone);
    await OneSignal.User.addTags({ phone: normalizedPhone });
  } catch (error) {
    console.error('OneSignal setUserPhone error:', error);
  }
}
