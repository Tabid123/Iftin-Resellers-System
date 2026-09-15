import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Cache for Bearer token
let cachedToken: { token: string; expiry: number } | null = null;

// Get Bearer token for Hormuud API
async function getHormuudToken(): Promise<string> {
  const now = Date.now();
  
  // Return cached token if still valid (with 5 minute buffer)
  if (cachedToken && cachedToken.expiry > now + 300000) {
    console.log('Using cached Hormuud token');
    return cachedToken.token;
  }

  const username = Deno.env.get('HORMUUD_USERNAME');
  const password = Deno.env.get('HORMUUD_PASSWORD');

  if (!username || !password) {
    throw new Error('Hormuud credentials not configured');
  }

  console.log('Generating new Hormuud token...');

  const tokenResponse = await fetch('https://smsapi.hormuud.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'password',
      username: username,
      password: password,
    }),
  });

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text();
    console.error('Token generation failed:', errorText);
    throw new Error('Failed to authenticate with Hormuud API');
  }

  const tokenData = await tokenResponse.json();
  const accessToken = tokenData.access_token;
  const expiresIn = tokenData.expires_in || 3600;

  cachedToken = {
    token: accessToken,
    expiry: now + (expiresIn * 1000),
  };

  console.log('New token generated successfully');
  return accessToken;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { deviceName, offlineMinutes } = await req.json();

    if (!deviceName) {
      throw new Error('Device name is required');
    }

    console.log(`Sending device alert SMS for: ${deviceName}, offline: ${offlineMinutes} minutes`);

    // Get alert phone number from app_settings
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: setting, error: settingError } = await supabase
      .from('app_settings')
      .select('text_value')
      .eq('setting_key', 'device_alert_whatsapp_number')
      .single();

    if (settingError || !setting?.text_value) {
      console.error('Alert phone number not configured:', settingError);
      throw new Error('Alert phone number not configured in app_settings');
    }

    // Format phone number - remove +252 prefix if present
    let phoneNumber = setting.text_value.replace(/\s/g, '');
    if (phoneNumber.startsWith('+252')) {
      phoneNumber = phoneNumber.substring(4);
    } else if (phoneNumber.startsWith('252')) {
      phoneNumber = phoneNumber.substring(3);
    }

    console.log(`Sending alert to: ${phoneNumber}`);

    // Get current time in Somalia timezone
    const now = new Date();
    const somaliaTime = now.toLocaleTimeString('en-US', { 
      timeZone: 'Africa/Mogadishu',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true 
    });

    // Create alert message in Somali
    const message = `DEVICE OFFLINE

${deviceName}
${offlineMinutes} daqiiqo
${somaliaTime}

Hubi phone-ka! isku day inaa online ka dhigtid!`;

    // Use short sender ID (max 11 chars for most providers)
    const senderId = 'NajaxData';
    const token = await getHormuudToken();

    const smsPayload = {
      refid: crypto.randomUUID(),
      mobile: phoneNumber,
      message: message,
      senderid: senderId,
      validity: 0,
    };

    console.log('Sending SMS with payload:', smsPayload);

    const response = await fetch('https://smsapi.hormuud.com/api/SendSMS', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(smsPayload),
    });

    const responseText = await response.text();
    console.log('Hormuud API raw response:', responseText);

    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch (e) {
      console.error('Failed to parse Hormuud response:', e);
      throw new Error('Invalid response from SMS provider');
    }

    const responseCode = responseData.ResponseCode;
    
    if (responseCode === '200') {
      console.log('Device alert SMS sent successfully:', responseData.Data?.MessageID);
      return new Response(JSON.stringify({ 
        success: true, 
        messageSid: responseData.Data?.MessageID,
        description: responseData.Data?.Description 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Handle error responses
    const errorMessages: Record<string, string> = {
      '201': 'Authentication failed',
      '203': 'Invalid sender ID',
      '204': 'No credit - please top up',
      '205': 'Insufficient credit',
      '206': 'Message too long',
      '207': 'Invalid phone number',
      '500': 'Internal error',
    };

    const errorMessage = errorMessages[responseCode] || responseData.ResponseMessage || 'Failed to send SMS';
    console.error(`Hormuud API error (${responseCode}):`, errorMessage);

    return new Response(JSON.stringify({
      success: false,
      errorCode: responseCode,
      errorMessage: errorMessage,
    }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in send-device-alert-sms function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(JSON.stringify({ 
      success: false,
      errorMessage: errorMessage 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
