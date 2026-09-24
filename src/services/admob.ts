import { Capacitor } from '@capacitor/core';
import { AdMob } from '@capacitor-community/admob';

export const initializeAdMob = async (): Promise<void> => {
  if (!Capacitor.isNativePlatform()) return;
  await removeBannerAd();
};

/**
 * Native banners are disabled. Existing page calls remove any banner left by
 * an older app session instead of creating a new native advertising surface.
 */
export const showBannerAd = async (): Promise<void> => {
  if (!Capacitor.isNativePlatform()) return;
  await removeBannerAd();
};

/**
 * Kept for compatibility with existing pages.
 */
export const hideBannerAd = async (): Promise<void> => {
  return;
};

export const removeBannerAd = async (): Promise<void> => {
  if (!Capacitor.isNativePlatform()) return;

  try {
    await AdMob.removeBanner();
  } catch (error) {
    console.error('AdMob: Failed to remove banner', error);
  }
};
