import { Capacitor } from '@capacitor/core';
import { AdMob, BannerAdSize, BannerAdPosition, BannerAdPluginEvents } from '@capacitor-community/admob';

const ADMOB_APP_ID = 'ca-app-pub-5845806199436628~8041425865';
const BANNER_AD_UNIT_ID = 'ca-app-pub-5845806199436628/2635032427';

let isInitialized = false;
let isBannerShowing = false;
let showInFlight: Promise<void> | null = null;

export const initializeAdMob = async (): Promise<void> => {
  if (!Capacitor.isNativePlatform()) return;
  if (isInitialized) return;

  try {
    await AdMob.initialize({ initializeForTesting: false });
    isInitialized = true;

    AdMob.addListener(BannerAdPluginEvents.Loaded, () => {
      isBannerShowing = true;
    });

    AdMob.addListener(BannerAdPluginEvents.FailedToLoad, () => {
      isBannerShowing = false;
      showInFlight = null;
    });
  } catch (error) {
    console.error('AdMob: Initialization failed', error);
  }
};

/**
 * The customer shell uses one persistent native banner. Route components may
 * all call this helper, but the native view is created only once. Recreating
 * it on every route caused bottom-area flashes and touch jank on Android.
 */
export const showBannerAd = async (): Promise<void> => {
  if (!Capacitor.isNativePlatform()) return;
  await removeBannerAd();
};

/**
 * Kept for compatibility with existing pages. Intentionally do not hide the
 * native banner during route unmounts; doing so caused a visible flash and a
 * costly native surface teardown/recreate on the next page.
 */
export const hideBannerAd = async (): Promise<void> => {
  return;
};

export const removeBannerAd = async (): Promise<void> => {
  if (!Capacitor.isNativePlatform()) return;

  try {
    await AdMob.removeBanner();
    isBannerShowing = false;
    showInFlight = null;
  } catch (error) {
    console.error('AdMob: Failed to remove banner', error);
  }
};
