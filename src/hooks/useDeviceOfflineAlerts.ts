import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { useLanguage } from '@/contexts/LanguageContext';

interface DeviceAlert {
  id: string;
  device_id: string;
  device_name: string;
  alert_type: string;
  is_acknowledged: boolean;
  acknowledged_by: string | null;
  acknowledged_at: string | null;
  created_at: string;
}

interface AndroidDevice {
  id: string;
  device_id: string;
  device_name: string;
  last_ping_at: string | null;
  is_active: boolean;
  archived_at: string | null;
}

const OFFLINE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
const CHECK_INTERVAL_MS = 30 * 1000; // 30 seconds

export const useDeviceOfflineAlerts = () => {
  const { language } = useLanguage();
  const [alerts, setAlerts] = useState<DeviceAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const alertedDevicesRef = useRef<Set<string>>(new Set());

  // Fetch unacknowledged alerts
  const fetchAlerts = useCallback(async () => {
    const { data, error } = await supabase
      .from('device_alerts')
      .select('*')
      .eq('is_acknowledged', false)
      .eq('alert_type', 'offline')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching device alerts:', error);
      return;
    }

    setAlerts((data || []) as unknown as DeviceAlert[]);
    
    // Update the ref with currently alerted devices
    const deviceIds = new Set<string>((data || []).map((a: any) => a.device_id as string));
    alertedDevicesRef.current = deviceIds;
    
    setLoading(false);
  }, []);

  // Check for offline devices and create alerts
  const checkOfflineDevices = useCallback(async () => {
    // Fetch active devices
    const { data: devices, error: devicesError } = await supabase
      .from('android_devices')
      .select('id, device_id, device_name, last_ping_at, is_active, archived_at')
      .eq('is_active', true)
      .is('archived_at', null);

    if (devicesError) {
      console.error('Error fetching devices:', devicesError);
      return;
    }

    const now = Date.now();
    
    for (const device of (devices || []) as AndroidDevice[]) {
      if (!device.last_ping_at) continue;
      
      const lastPing = new Date(device.last_ping_at).getTime();
      const offlineDuration = now - lastPing;
      
      // Check if device is offline for more than 5 minutes
      if (offlineDuration > OFFLINE_THRESHOLD_MS) {
        // Check if we already have an unacknowledged alert for this device
        if (!alertedDevicesRef.current.has(device.device_id)) {
          // Create new alert
          const { error: insertError } = await supabase
            .from('device_alerts')
            .insert({
              device_id: device.device_id,
              device_name: device.device_name,
              alert_type: 'offline',
            });

          if (!insertError) {
            // Add to tracked set
            alertedDevicesRef.current.add(device.device_id);
            
            // Show toast notification
            const minutes = Math.floor(offlineDuration / 60000);
            toast({
              title: language === 'so' ? '⚠️ Phone-ku wuu Offline-ay' : '⚠️ Device Offline',
              description: language === 'so' 
                ? `${device.device_name} wuu offline noqday ${minutes}+ daqiiqo`
                : `${device.device_name} has been offline for ${minutes}+ minutes`,
              variant: 'destructive',
            });
            
            // Send SMS notification via Hormuud
            try {
              const { error: smsError } = await supabase.functions.invoke('send-device-alert-sms', {
                body: {
                  deviceName: device.device_name,
                  offlineMinutes: minutes,
                }
              });
              
              if (smsError) {
                console.error('SMS notification error:', smsError);
              } else {
                console.log('SMS notification sent for device:', device.device_name);
              }
            } catch (err) {
              console.error('Failed to send SMS notification:', err);
            }
            
            // Refresh alerts
            await fetchAlerts();
          }
        }
      }
    }
  }, [language, fetchAlerts]);

  // Acknowledge an alert
  const acknowledgeAlert = useCallback(async (alertId: string, deviceId: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    
    const { error } = await supabase
      .from('device_alerts')
      .update({
        is_acknowledged: true,
        acknowledged_by: user?.id || null,
        acknowledged_at: new Date().toISOString(),
      })
      .eq('id', alertId);

    if (error) {
      toast({
        title: language === 'so' ? 'Khalad' : 'Error',
        description: error.message,
        variant: 'destructive',
      });
      return;
    }

    // Remove from tracked set
    alertedDevicesRef.current.delete(deviceId);
    
    toast({
      title: language === 'so' ? 'Guul' : 'Success',
      description: language === 'so' ? 'Alert waa la aqbalay' : 'Alert acknowledged',
    });
    
    await fetchAlerts();
  }, [language, fetchAlerts]);

  // Initial fetch
  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  // Fallback: 60-second interval to check offline devices independently
  // This ensures alerts fire even when Supabase Realtime misses events
  useEffect(() => {
    const interval = setInterval(() => {
      checkOfflineDevices();
    }, 60000);
    return () => clearInterval(interval);
  }, [checkOfflineDevices]);

  // Subscribe to realtime changes on device_alerts
  useEffect(() => {
    const alertsChannel = supabase
      .channel('device-alerts-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'device_alerts',
        },
        () => {
          fetchAlerts();
        }
      )
      .subscribe();

    // Subscribe to android_devices UPDATE to check offline when ping changes
    const devicesChannel = supabase
      .channel('device-ping-monitor')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'android_devices',
        },
        () => {
          checkOfflineDevices();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(alertsChannel);
      supabase.removeChannel(devicesChannel);
    };
  }, [fetchAlerts, checkOfflineDevices]);

  return {
    alerts,
    loading,
    acknowledgeAlert,
    refetch: fetchAlerts,
  };
};
