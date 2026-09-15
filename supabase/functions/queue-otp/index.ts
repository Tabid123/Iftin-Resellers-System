import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    if (req.method === 'POST') {
      const { phoneNumber, code } = await req.json();

      if (!phoneNumber || !code) {
        return new Response(
          JSON.stringify({ success: false, error: 'Phone number and code are required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Detect provider from phone number prefix
      const getProviderFromPhone = (phone: string): string => {
        // Remove +252 prefix if present
        const cleaned = phone.replace(/^\+252/, '');
        const prefix = cleaned.substring(0, 2);
        
        if (prefix === '61' || prefix === '77') return 'hormuud';
        if (prefix === '62') return 'somtel';
        if (prefix === '68') return 'somnet';
        if (prefix === '71') return 'amtel';
        if (prefix === '64') return 'somlink';
        return 'hormuud'; // default
      };

      const provider = getProviderFromPhone(phoneNumber);
      console.log('📱 Queueing OTP SMS:', { phoneNumber, codeLength: code.length, provider });

      // Insert into sms_otp_queue for Android device to pick up
      const { data, error } = await supabase
        .from('sms_otp_queue')
        .insert({
          phone_number: phoneNumber,
          otp_code: code,
          status: 'pending',
          provider: provider
        })
        .select()
        .single();

      if (error) {
        console.error('❌ Failed to queue OTP:', error);
        throw error;
      }

      console.log('✅ OTP queued successfully:', data.id);

      return new Response(
        JSON.stringify({ 
          success: true, 
          taskId: data.id,
          message: 'OTP queued for Android device to send'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ queue-otp error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
