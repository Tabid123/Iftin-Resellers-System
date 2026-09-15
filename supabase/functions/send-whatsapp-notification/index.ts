import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface WhatsAppNotificationRequest {
  deviceName: string;
  offlineMinutes: number;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { deviceName, offlineMinutes }: WhatsAppNotificationRequest = await req.json();
    
    console.log(`Sending WhatsApp notification for device: ${deviceName}, offline: ${offlineMinutes} minutes`);

    // Initialize Supabase client to get settings
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Check if WhatsApp notifications are enabled
    const { data: enabledSetting } = await supabase
      .from("app_settings")
      .select("setting_value")
      .eq("setting_key", "device_alert_whatsapp_enabled")
      .single();

    if (!enabledSetting?.setting_value) {
      console.log("WhatsApp notifications are disabled");
      return new Response(
        JSON.stringify({ success: false, message: "WhatsApp notifications disabled" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get WhatsApp number from settings
    const { data: numberSetting } = await supabase
      .from("app_settings")
      .select("text_value")
      .eq("setting_key", "device_alert_whatsapp_number")
      .single();

    const toNumber = numberSetting?.text_value;
    
    if (!toNumber) {
      console.log("No WhatsApp number configured");
      return new Response(
        JSON.stringify({ success: false, message: "No WhatsApp number configured" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get Twilio credentials
    const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
    const twilioNumber = Deno.env.get("TWILIO_PHONE_NUMBER");

    if (!accountSid || !authToken || !twilioNumber) {
      console.error("Missing Twilio credentials");
      return new Response(
        JSON.stringify({ success: false, message: "Twilio credentials not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Format the current time
    const now = new Date();
    const timeString = now.toLocaleString('en-US', { 
      timeZone: 'Africa/Mogadishu',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });

    // Create WhatsApp message
    const message = `⚠️ *DEVICE OFFLINE ALERT*

📱 Device: *${deviceName}*
⏱️ Offline: *${offlineMinutes}+ daqiiqo*
🕐 Waqtiga: ${timeString}

Fadlan hubi phone-ka!`;

    // Format phone numbers for WhatsApp (remove any spaces)
    const formattedTo = (toNumber.startsWith('+') ? toNumber : `+${toNumber}`).replace(/\s/g, '');
    const formattedFrom = (twilioNumber.startsWith('+') ? twilioNumber : `+${twilioNumber}`).replace(/\s/g, '');

    // Send WhatsApp message via Twilio
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    const credentials = btoa(`${accountSid}:${authToken}`);

    const body = new URLSearchParams({
      To: `whatsapp:${formattedTo}`,
      From: `whatsapp:${formattedFrom}`,
      Body: message,
    });

    console.log(`Sending to: whatsapp:${formattedTo}, from: whatsapp:${formattedFrom}`);

    const twilioResponse = await fetch(twilioUrl, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });

    const twilioResult = await twilioResponse.json();
    
    if (!twilioResponse.ok) {
      console.error("Twilio error:", twilioResult);
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: "Failed to send WhatsApp message",
          error: twilioResult 
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("WhatsApp message sent successfully:", twilioResult.sid);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "WhatsApp notification sent",
        messageSid: twilioResult.sid 
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("Error in send-whatsapp-notification:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);
