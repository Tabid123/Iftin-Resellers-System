import { Capacitor } from '@capacitor/core';

const ONESIGNAL_APP_ID = 'e5260228-4238-43e6-9bb7-77d839e5907d';

export const initializeOneSignal = async (): Promise<void> => {
  if (!Capacitor.isNativePlatform()) return;
  
  const OneSignal = (window as any).plugins?.OneSignal;
  if (!OneSignal) {
    console.log('OneSignal plugin not available');
    return;
  }
  
  try {
    OneSignal.initialize(ONESIGNAL_APP_ID);
    OneSignal.Notifications.requestPermission(true);
    
    // Handle notification clicks
    OneSignal.Notifications.addEventListener('click', (event: any) => {
      console.log('Notification clicked:', event);
    });
    
    console.log('OneSignal initialized successfully');
  } catch (error) {
    console.error('OneSignal initialization error:', error);
  }
};

export const setUserPhone = (phone: string) => {
  if (!Capacitor.isNativePlatform()) return;
  
  const OneSignal = (window as any).plugins?.OneSignal;
  if (OneSignal) {
    try {
      OneSignal.login(phone);
      OneSignal.User.addTags({ phone: phone });
    } catch (error) {
      console.error('OneSignal setUserPhone error:', error);
    }
  }
};
