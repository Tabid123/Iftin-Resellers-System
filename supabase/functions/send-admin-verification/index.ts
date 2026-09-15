import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Cached Hormuud token
let cachedToken: { token: string; expiresAt: number } | null = null;

async function getHormuudToken(): Promise<string> {
  // Check if we have a valid cached token
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.token;
  }

  const username = Deno.env.get('HORMUUD_USERNAME');
  const password = Deno.env.get('HORMUUD_PASSWORD');

  if (!username || !password) {
    throw new Error('Hormuud credentials not configured');
  }

  const response = await fetch('https://smsapi.hormuud.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'password',
      username: username,
      password: password,
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to get Hormuud token');
  }

  const data = await response.json();
  
  // Cache the token (expires in 23 hours to be safe)
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (23 * 60 * 60 * 1000),
  };

  return data.access_token;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { userId, action, code: verifyCode } = await req.json();

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    if (action === 'send') {
      // Generate 6-digit code
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

      // Get admin phone from app_settings
      const { data: settingData } = await supabase
        .from('app_settings')
        .select('text_value')
        .eq('setting_key', 'device_alert_phone')
        .single();

      if (!settingData?.text_value) {
        return new Response(
          JSON.stringify({ success: false, error: 'Admin phone not configured' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      let phoneNumber = settingData.text_value;
      // Format phone number
      if (phoneNumber.startsWith('+252')) {
        phoneNumber = phoneNumber.substring(4);
      } else if (phoneNumber.startsWith('252')) {
        phoneNumber = phoneNumber.substring(3);
      }

      // Delete any existing codes for this user
      await supabase
        .from('admin_verification_codes')
        .delete()
        .eq('user_id', userId);

      // Save new code
      const { error: insertError } = await supabase
        .from('admin_verification_codes')
        .insert({
          user_id: userId,
          code,
          expires_at: expiresAt.toISOString(),
        });

      if (insertError) {
        console.error('Insert error:', insertError);
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to save verification code' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Send SMS via Hormuud
      const token = await getHormuudToken();
      const senderId = Deno.env.get('HORMUUD_SENDER_ID') || 'NajaxData';
      const message = `Najax Data Admin: Code-kaaga waa ${code}. 5 daqiiqo kadib wuu dhacayaa.`;

      const smsPayload = {
        refid: `admin-verify-${Date.now()}`,
        mobile: phoneNumber,
        message: message,
        senderid: senderId,
      };

      const smsResponse = await fetch('https://smsapi.hormuud.com/api/SendSMS', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(smsPayload),
      });

      const smsResult = await smsResponse.json();
      console.log('SMS result:', smsResult);

      if (smsResult.ResponseCode !== '200' && smsResult.ResponseCode !== 200) {
        return new Response(
          JSON.stringify({ success: false, error: smsResult.ResponseMessage || 'Failed to send SMS' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Verification code sent',
          phone: `+252${phoneNumber.substring(0, 2)}****${phoneNumber.substring(phoneNumber.length - 2)}`
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } else if (action === 'verify') {
      // Verify the code
      const { data: codeData, error: codeError } = await supabase
        .from('admin_verification_codes')
        .select('*')
        .eq('user_id', userId)
        .eq('code', verifyCode)
        .eq('used', false)
        .single();

      if (codeError || !codeData) {
        return new Response(
          JSON.stringify({ success: false, error: 'Code-ka waa khalad' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Check if expired
      if (new Date(codeData.expires_at) < new Date()) {
        return new Response(
          JSON.stringify({ success: false, error: 'Code-ka wuu dhacay. Dib u codsо code cusub' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Mark as used
      await supabase
        .from('admin_verification_codes')
        .update({ used: true })
        .eq('id', codeData.id);

      return new Response(
        JSON.stringify({ success: true, message: 'Verified successfully' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: 'Invalid action' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});