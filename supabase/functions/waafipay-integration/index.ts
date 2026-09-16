import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-tenant-id',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function safeError(error: unknown) {
  return (error instanceof Error ? error.message : 'Unknown error').slice(0, 500);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || 'status');
    const tenantId = String(body?.tenant_id || '').trim();
    if (!tenantId) return json({ error: 'tenant_id_required' }, 400);

    const authHeader = req.headers.get('Authorization') || '';
    if (!authHeader) return json({ error: 'unauthorized' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

    const userClient = createClient(supabaseUrl, anonKey, {
      global: {
        headers: {
          Authorization: authHeader,
          'x-tenant-id': tenantId,
        },
      },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData?.user) return json({ error: 'unauthorized' }, 401);

    // WaafiPay merchant credentials are platform-managed. Tenant owners cannot
    // create, rotate, activate or delete them.
    const { data: isSuperAdmin, error: roleError } = await userClient.rpc('is_super_admin');
    if (roleError) throw roleError;
    if (isSuperAdmin !== true) return json({ error: 'super_admin_required' }, 403);

    if (action === 'status') {
      const { data, error } = await admin.rpc('waafipay_admin_status', { p_tenant_id: tenantId });
      if (error) throw error;
      return json({ success: true, integration: data });
    }

    if (action === 'save') {
      const { data, error } = await admin.rpc('waafipay_admin_save', {
        p_tenant_id: tenantId,
        p_merchant_uid: String(body?.merchant_uid || '').trim(),
        p_api_user_id: String(body?.api_user_id || '').trim(),
        p_api_key: typeof body?.api_key === 'string' && body.api_key.trim() ? body.api_key.trim() : null,
        p_environment: body?.environment === 'sandbox' ? 'sandbox' : 'production',
        p_is_active: body?.is_active === true,
      });
      if (error) return json({ error: error.message || 'save_failed' }, 400);
      return json({ success: true, integration: data });
    }

    if (action === 'delete') {
      const { data, error } = await admin.rpc('waafipay_admin_delete', { p_tenant_id: tenantId });
      if (error) throw error;
      return json({ success: true, integration: data });
    }

    return json({ error: 'unknown_action' }, 400);
  } catch (error) {
    console.error('waafipay-integration error:', safeError(error));
    return json({ error: safeError(error) }, 500);
  }
});
