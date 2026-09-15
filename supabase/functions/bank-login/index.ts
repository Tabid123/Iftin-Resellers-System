import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function generateToken(): string {
  // 256-bit random token, hex encoded
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ token: 'Method not allowed', status: false }),
        { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let body: any;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ token: 'Invalid JSON', status: false }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const username = (body?.username ?? '').toString().trim();
    const password = (body?.password ?? '').toString();

    if (!username || !password) {
      return new Response(
        JSON.stringify({ token: 'Unauthorized', status: false }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Look up the credential and verify with bcrypt via SQL (crypt())
    const { data: cred, error: credErr } = await supabase
      .from('bank_credentials')
      .select('id, username, password_hash, is_active')
      .eq('username', username)
      .eq('is_active', true)
      .maybeSingle();

    if (credErr || !cred) {
      console.log('🔐 bank-login: credential not found for', username);
      return new Response(
        JSON.stringify({ token: 'Unauthorized', status: false }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify password using pgcrypto via RPC-like SQL
    const { data: verifyRows, error: verifyErr } = await supabase.rpc('verify_bank_password' as any, {
      p_username: username,
      p_password: password,
    });

    let valid = false;
    if (!verifyErr && verifyRows === true) {
      valid = true;
    } else {
      // Fallback: re-hash compare via crypt() using a one-shot select through PostgREST is not possible,
      // so create the helper function once. Here, we attempt a second strategy: use pgmeta if RPC missing.
      // We'll create the SQL helper in a follow-up migration if needed.
      console.log('🔐 verify rpc result:', verifyRows, 'err:', verifyErr?.message);
    }

    if (!valid) {
      return new Response(
        JSON.stringify({ token: 'Unauthorized', status: false }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Issue a token (24h)
    const token = generateToken();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const { error: sessErr } = await supabase
      .from('bank_sessions')
      .insert({
        credential_id: cred.id,
        token,
        expires_at: expiresAt,
      });

    if (sessErr) {
      console.error('🔐 session insert failed:', sessErr);
      return new Response(
        JSON.stringify({ token: 'Server error', status: false }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('✅ bank-login success for', username);
    return new Response(
      JSON.stringify({ token, status: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (e) {
    console.error('bank-login error:', e);
    return new Response(
      JSON.stringify({ token: 'Server error', status: false }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
