import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Cache token to avoid repeated auth requests
let cachedToken: { token: string; expiresAt: number } | null = null;

// Configuration
const OFFLINE_THRESHOLD_MINUTES = 5;  // First alert after 5 min offline
const ESCALATION_INTERVAL_MINUTES = 10; // Send follow-up every 10 min
const MAX_SMS_PER_ALERT = 3; // Maximum 3 SMS per incident
const DEFAULT_LOW_BALANCE_THRESHOLD = 5; // Default $5 threshold

async function getHormuudToken(): Promise<string> {
  // Check if we have a valid cached token
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    console.log('Using cached Hormuud token');
    return cachedToken.token;
  }

  console.log('Fetching new Hormuud token...');
  
  const username = Deno.env.get('HORMUUD_USERNAME');
  const password = Deno.env.get('HORMUUD_PASSWORD');

  if (!username || !password) {
    throw new Error('Hormuud credentials not configured');
  }

  const tokenResponse = await fetch('https://smsapi.hormuud.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: `grant_type=password&username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`,
  });

  if (!tokenResponse.ok) {
    throw new Error(`Failed to get Hormuud token: ${tokenResponse.status}`);
  }

  const tokenData = await tokenResponse.json();
  
  // Cache the token (expires in 1 hour, we'll refresh at 50 minutes)
  cachedToken = {
    token: tokenData.access_token,
    expiresAt: Date.now() + (50 * 60 * 1000), // 50 minutes
  };

  console.log('New Hormuud token obtained and cached');
  return tokenData.access_token;
}

async function sendSmsAlert(
  message: string,
  alertPhoneNumber: string
): Promise<boolean> {
  try {
    const token = await getHormuudToken();
    const senderId = 'NajaxData';

    // Format phone number
    let formattedPhone = alertPhoneNumber.replace(/\D/g, '');
    if (formattedPhone.startsWith('0')) {
      formattedPhone = '252' + formattedPhone.substring(1);
    } else if (!formattedPhone.startsWith('252')) {
      formattedPhone = '252' + formattedPhone;
    }

    console.log(`Sending SMS to ${formattedPhone}: ${message}`);

    const smsResponse = await fetch('https://smsapi.hormuud.com/api/SendSMS', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        mobile: formattedPhone,
        message: message,
        senderid: senderId,
      }),
    });

    if (!smsResponse.ok) {
      const errorText = await smsResponse.text();
      console.error(`SMS API error: ${smsResponse.status} - ${errorText}`);
      return false;
    }

    const result = await smsResponse.json();
    console.log(`SMS sent successfully:`, result);
    return true;
  } catch (error) {
    console.error(`Error sending SMS:`, error);
    return false;
  }
}

function getOfflineAlertMessage(deviceName: string, smsNumber: number): string {
  if (smsNumber === 1) {
    return `DEVICE ${deviceName} waa OFFLINE - Hubi phone-ka!`;
  } else if (smsNumber === 2) {
    return `DIGNIINTA 2-AAD: DEVICE ${deviceName} waa OFFLINE - Hubi phone-ka! - Weli offline!`;
  } else {
    return `DIGNIINTA UGU DANBEYSA - DEVICE ${deviceName} waa OFFLINE - Hubi phone-ka! DEGDEG!`;
  }
}

function getLowBalanceAlertMessage(deviceName: string, providerName: string, balance: number, smsNumber: number): string {
  const balanceFormatted = `$${balance.toFixed(2)}`;
  if (smsNumber === 1) {
    return `LOW BALANCE: ${deviceName} - ${providerName} - E-Voucher: ${balanceFormatted} - Ku shub lacag!`;
  } else if (smsNumber === 2) {
    return `DIGNIINTA 2-AAD: ${deviceName} - ${providerName} - E-Voucher weli LOW! ${balanceFormatted}`;
  } else {
    return `DEGDEG: ${deviceName} - ${providerName} - E-Voucher: ${balanceFormatted} - Ku shub HADDA!`;
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('=== CHECK OFFLINE DEVICES & LOW BALANCE CRON JOB STARTED ===');

    // Create Supabase client with service role key for bypassing RLS
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get alert phone number from app_settings
    const { data: alertPhoneSetting, error: settingsError } = await supabase
      .from('app_settings')
      .select('text_value')
      .eq('setting_key', 'device_alert_phone')
      .single();

    if (settingsError || !alertPhoneSetting?.text_value) {
      console.log('No alert phone number configured, skipping check');
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'No alert phone number configured',
          checked: 0,
          alerts_sent: 0 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const alertPhoneNumber = alertPhoneSetting.text_value;
    console.log(`Alert phone number: ${alertPhoneNumber}`);

    // Get low balance settings
    const { data: lowBalanceSettings } = await supabase
      .from('app_settings')
      .select('setting_key, text_value, setting_value')
      .in('setting_key', ['low_balance_threshold', 'low_balance_alert_enabled']);

    let lowBalanceThreshold = DEFAULT_LOW_BALANCE_THRESHOLD;
    let lowBalanceAlertEnabled = true;

    if (lowBalanceSettings) {
      for (const setting of lowBalanceSettings) {
        if (setting.setting_key === 'low_balance_threshold' && setting.text_value) {
          lowBalanceThreshold = parseFloat(setting.text_value) || DEFAULT_LOW_BALANCE_THRESHOLD;
        }
        if (setting.setting_key === 'low_balance_alert_enabled') {
          lowBalanceAlertEnabled = setting.setting_value !== false;
        }
      }
    }

    console.log(`Low balance alert enabled: ${lowBalanceAlertEnabled}, threshold: $${lowBalanceThreshold}`);

    // Get all active devices
    const { data: devices, error: devicesError } = await supabase
      .from('android_devices')
      .select('id, device_id, device_name, provider_name, last_ping_at, is_active')
      .eq('is_active', true)
      .is('archived_at', null);

    if (devicesError) {
      console.error('Error fetching devices:', devicesError);
      throw new Error('Failed to fetch devices');
    }

    if (!devices || devices.length === 0) {
      console.log('No active devices found');
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'No active devices found',
          checked: 0,
          alerts_sent: 0 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${devices.length} active devices to check`);

    const now = new Date();
    let alertsSent = 0;
    let devicesChecked = 0;

    for (const device of devices) {
      devicesChecked++;
      
      // ============ CHECK OFFLINE STATUS ============
      if (device.last_ping_at) {
        const lastPing = new Date(device.last_ping_at);
        const minutesOffline = Math.floor((now.getTime() - lastPing.getTime()) / 60000);

        console.log(`Device ${device.device_name}: last ping ${minutesOffline} minutes ago`);

        // Check if device is offline for more than threshold
        if (minutesOffline >= OFFLINE_THRESHOLD_MINUTES) {
          console.log(`Device ${device.device_name} is OFFLINE (${minutesOffline} min)`);

          // Check if we already have an unacknowledged alert for this device
          const { data: existingAlerts, error: alertsError } = await supabase
            .from('device_alerts')
            .select('id, created_at, sms_count, last_sms_at')
            .eq('device_id', device.device_id)
            .eq('alert_type', 'offline')
            .eq('is_acknowledged', false)
            .order('created_at', { ascending: false })
            .limit(1);

          if (alertsError) {
            console.error(`Error checking alerts for ${device.device_name}:`, alertsError);
            continue;
          }

          if (existingAlerts && existingAlerts.length > 0) {
            const existingAlert = existingAlerts[0];
            const currentSmsCount = existingAlert.sms_count || 1;
            const lastSmsAt = new Date(existingAlert.last_sms_at || existingAlert.created_at);
            const minutesSinceLastSms = Math.floor((now.getTime() - lastSmsAt.getTime()) / 60000);

            console.log(`Existing offline alert for ${device.device_name}: SMS count=${currentSmsCount}, last SMS ${minutesSinceLastSms} min ago`);

            // Check if we should send escalation SMS
            if (currentSmsCount < MAX_SMS_PER_ALERT && minutesSinceLastSms >= ESCALATION_INTERVAL_MINUTES) {
              const message = getOfflineAlertMessage(device.device_name, currentSmsCount + 1);
              const smsSent = await sendSmsAlert(message, alertPhoneNumber);
              
              if (smsSent) {
                await supabase
                  .from('device_alerts')
                  .update({
                    sms_count: currentSmsCount + 1,
                    last_sms_at: now.toISOString(),
                  })
                  .eq('id', existingAlert.id);
                alertsSent++;
                console.log(`Escalation SMS #${currentSmsCount + 1} sent for ${device.device_name}`);
              }
            }
          } else {
            // Create new alert record and send first SMS
            const { error: insertError } = await supabase
              .from('device_alerts')
              .insert({
                device_id: device.device_id,
                device_name: device.device_name,
                alert_type: 'offline',
                is_acknowledged: false,
                sms_count: 1,
                last_sms_at: now.toISOString(),
              });

            if (!insertError) {
              const message = getOfflineAlertMessage(device.device_name, 1);
              const smsSent = await sendSmsAlert(message, alertPhoneNumber);
              if (smsSent) {
                alertsSent++;
                console.log(`First offline SMS alert sent for ${device.device_name}`);
              }
            }
          }
        } else {
          console.log(`Device ${device.device_name} is online`);
        }
      }

      // ============ CHECK LOW BALANCE (E-Voucher only) ============
      if (lowBalanceAlertEnabled) {
        // Get E-Voucher balance for this device
        const { data: balanceData, error: balanceError } = await supabase
          .from('sim_balances')
          .select('balance')
          .eq('sim_id', device.id)
          .eq('balance_type', 'evoucher')
          .maybeSingle();

        if (balanceError) {
          console.error(`Error fetching balance for ${device.device_name}:`, balanceError);
          continue;
        }

        if (balanceData) {
          const currentBalance = balanceData.balance || 0;
          console.log(`Device ${device.device_name} E-Voucher balance: $${currentBalance}`);

          if (currentBalance < lowBalanceThreshold) {
            console.log(`Device ${device.device_name} has LOW BALANCE: $${currentBalance} < $${lowBalanceThreshold}`);

            // Create unique alert identifier for low balance
            const alertIdentifier = `${device.device_id}_evoucher`;

            // Check for existing low_balance alert
            const { data: existingLowBalanceAlerts, error: lowBalanceAlertsError } = await supabase
              .from('device_alerts')
              .select('id, created_at, sms_count, last_sms_at')
              .eq('device_id', alertIdentifier)
              .eq('alert_type', 'low_balance')
              .eq('is_acknowledged', false)
              .order('created_at', { ascending: false })
              .limit(1);

            if (lowBalanceAlertsError) {
              console.error(`Error checking low balance alerts for ${device.device_name}:`, lowBalanceAlertsError);
              continue;
            }

            if (existingLowBalanceAlerts && existingLowBalanceAlerts.length > 0) {
              const existingAlert = existingLowBalanceAlerts[0];
              const currentSmsCount = existingAlert.sms_count || 1;
              const lastSmsAt = new Date(existingAlert.last_sms_at || existingAlert.created_at);
              const minutesSinceLastSms = Math.floor((now.getTime() - lastSmsAt.getTime()) / 60000);

              console.log(`Existing low balance alert for ${device.device_name}: SMS count=${currentSmsCount}, last SMS ${minutesSinceLastSms} min ago`);

              // Check if we should send escalation SMS
              if (currentSmsCount < MAX_SMS_PER_ALERT && minutesSinceLastSms >= ESCALATION_INTERVAL_MINUTES) {
                const message = getLowBalanceAlertMessage(device.device_name, device.provider_name, currentBalance, currentSmsCount + 1);
                const smsSent = await sendSmsAlert(message, alertPhoneNumber);
                
                if (smsSent) {
                  await supabase
                    .from('device_alerts')
                    .update({
                      sms_count: currentSmsCount + 1,
                      last_sms_at: now.toISOString(),
                    })
                    .eq('id', existingAlert.id);
                  alertsSent++;
                  console.log(`Low balance escalation SMS #${currentSmsCount + 1} sent for ${device.device_name}`);
                }
              }
            } else {
              // Create new low balance alert record and send first SMS
              const { error: insertError } = await supabase
                .from('device_alerts')
                .insert({
                  device_id: alertIdentifier,
                  device_name: device.device_name,
                  alert_type: 'low_balance',
                  is_acknowledged: false,
                  sms_count: 1,
                  last_sms_at: now.toISOString(),
                });

              if (!insertError) {
                const message = getLowBalanceAlertMessage(device.device_name, device.provider_name, currentBalance, 1);
                const smsSent = await sendSmsAlert(message, alertPhoneNumber);
                if (smsSent) {
                  alertsSent++;
                  console.log(`First low balance SMS alert sent for ${device.device_name}`);
                }
              } else {
                console.error(`Error creating low balance alert for ${device.device_name}:`, insertError);
              }
            }
          } else {
            // Balance is now above threshold - auto-acknowledge any existing low balance alerts
            const { error: ackError } = await supabase
              .from('device_alerts')
              .update({
                is_acknowledged: true,
                acknowledged_at: now.toISOString(),
              })
              .eq('device_id', `${device.device_id}_evoucher`)
              .eq('alert_type', 'low_balance')
              .eq('is_acknowledged', false);

            if (!ackError) {
              console.log(`Auto-acknowledged low balance alert for ${device.device_name} (balance now: $${currentBalance})`);
            }
          }
        }
      }
    }

    console.log(`=== CHECK COMPLETE: ${devicesChecked} devices checked, ${alertsSent} alerts sent ===`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Device check completed',
        checked: devicesChecked,
        alerts_sent: alertsSent 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in check-offline-devices:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
