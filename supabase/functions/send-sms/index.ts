import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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
  const expiresIn = tokenData.expires_in || 3600; // Default to 1 hour

  // Cache token with expiry time
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
    const { phoneNumber, code } = await req.json();

    if (!phoneNumber || !code) {
      throw new Error('Phone number and code are required');
    }

    const senderId = Deno.env.get('HORMUUD_SENDER_ID') || 'NajaxData';

    // Convert phone number from +252XXXXXXXXX to local format (XXXXXXXXX)
    const localNumber = phoneNumber.replace(/^\+252/, '');
    console.log(`Sending SMS to ${localNumber} (original: ${phoneNumber}) with code: ${code}`);

    // Get Bearer token
    const token = await getHormuudToken();

    // Send SMS using Hormuud API
    const smsPayload = {
      refid: crypto.randomUUID(),
      mobile: localNumber,
      message: `Your verification code is: ${code}. This code will expire in 5 minutes.`,
      senderid: senderId,
      validity: 0,
    };

    console.log('Sending SMS with payload:', { ...smsPayload, message: '[redacted]' });

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
    
    // Map Hormuud response codes
    if (responseCode === '200') {
      console.log('SMS sent successfully:', responseData.Data?.MessageID);
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
      '201': 'Aqoonsiga ayaa fashilmay. Fadlan hubi xogta gelitaankaaga',
      '203': 'Magaca diraha waa khalad',
      '204': 'Lacag la\'aan - fadlan lacag ku dar koontadaada',
      '205': 'Lacag kama filna - fadlan lacag ku dar',
      '206': 'Fariinta waa mid dheer',
      '207': 'Lambarka telefoonka waa khalad',
      '500': 'Cilad la\'aan ayaa dhacday. Fadlan isku day mar kale',
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
    console.error('Error in send-sms function:', error);
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