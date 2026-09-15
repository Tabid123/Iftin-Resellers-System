import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

// Simple beep sound using Web Audio API
const playNotificationSound = () => {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.frequency.value = 880;
    oscillator.type = 'sine';
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.5);
  } catch { /* silent fail */ }
};

const triggerVibration = () => {
  try {
    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
  } catch { /* silent fail */ }
};

// Table-specific notification messages
const TABLE_NOTIFICATIONS: Record<string, { so: string; en: string; icon: string }> = {
  orders: { so: '📦 Dalab cusub soo galay!', en: '📦 New order received!', icon: '📦' },
  android_devices: { so: '📱 Aalad cusub oo la cusboonaysiiyay', en: '📱 Device updated', icon: '📱' },
  sim_balances: { so: '💰 Haraaga SIM-ka waa la cusboonaysiiyay', en: '💰 SIM balance updated', icon: '💰' },
  delivery_queue: { so: '🚀 Delivery queue waa la cusboonaysiiyay', en: '🚀 Delivery queue updated', icon: '🚀' },
  payment_receipts: { so: '💳 Lacag cusub soo gashay!', en: '💳 New payment received!', icon: '💳' },
  verified_phones: { so: '✅ Macmiil cusub oo is diwaangeliyay', en: '✅ New customer registered', icon: '✅' },
  providers_config: { so: '⚙️ Provider config waa la bedelay', en: '⚙️ Provider config changed', icon: '⚙️' },
  data_packages_config: { so: '📋 Package waa la cusboonaysiiyay', en: '📋 Package updated', icon: '📋' },
  auto_topup_numbers: { so: '🔄 Auto top-up waa la cusboonaysiiyay', en: '🔄 Auto top-up updated', icon: '🔄' },
  fraud_alerts: { so: '🚨 Digniin khatar ah!', en: '🚨 Fraud alert detected!', icon: '🚨' },
  blocked_users: { so: '🚫 Blocked users waa la cusboonaysiiyay', en: '🚫 Blocked users updated', icon: '🚫' },
  offline_registrations: { so: '📝 Diiwaangelin cusub', en: '📝 New offline registration', icon: '📝' },
  device_alerts: { so: '⚠️ Aalad digniin!', en: '⚠️ Device alert!', icon: '⚠️' },
};

/**
 * Subscribe to Supabase Realtime changes on one or more tables.
 * Calls `onRefresh` whenever an INSERT, UPDATE, or DELETE occurs.
 * Optionally plays sound, vibrates, and shows toast on INSERT events.
 */
export function useRealtimeRefresh(
  tables: string[],
  onRefresh: () => void,
  debounceMs = 800,
  options?: { notify?: boolean; lang?: 'so' | 'en' }
) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFirstLoad = useRef(true);
  const optionsRef = useRef(options);
  optionsRef.current = options; // always latest

  // After 3 seconds, allow notifications (skip initial load events)
  useEffect(() => {
    const t = setTimeout(() => { isFirstLoad.current = false; }, 3000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (tables.length === 0) return;

    const channelName = `rt-${tables.join('-')}-${Math.random().toString(36).slice(2, 8)}`;

    const handleChange = (payload: any, table: string) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => onRefresh(), debounceMs);

      const currentOptions = optionsRef.current;
      const shouldNotify = currentOptions?.notify !== false;
      const lang = currentOptions?.lang || 'so';

      // Notify on INSERT only, skip initial load
      if (shouldNotify && payload.eventType === 'INSERT' && !isFirstLoad.current) {
        const info = TABLE_NOTIFICATIONS[table];
        if (info) {
          playNotificationSound();
          triggerVibration();
          toast.success(lang === 'so' ? info.so : info.en, { duration: 4000 });
        }
      }
    };

    let channel = supabase.channel(channelName);

    tables.forEach((table) => {
      channel = channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        (payload) => handleChange(payload, table)
      );
    });

    channel.subscribe();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      supabase.removeChannel(channel);
    };
  }, [tables.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps
}
