import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SomlinkApiError, somlinkLogin } from '../_shared/somlink.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-tenant-id',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function safeError(error: unknown) {
  if (error instanceof SomlinkApiError) {
    return `${error.message}${error.status ? ` (${error.status})` : ''}`.slice(0, 500);
  }
  return (error instanceof Error ? error.message : 'Unknown error').slice(0, 500);
}

async function runtimeReady(admin: any) {
  const { data, error } = await admin.rpc('somlink_admin_runtime_status');
  if (error) throw error;
  return data?.enabled === true && typeof data?.edge_base_url === 'string' && data.edge_base_url.length > 0;
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

    const [{ data: authorizedTenant }, { data: isSuperAdmin }, membershipResult] = await Promise.all([
      userClient.rpc('authorized_tenant_id'),
      userClient.rpc('is_super_admin'),
      admin
        .from('tenant_members')
        .select('role')
        .eq('tenant_id', tenantId)
        .eq('user_id', userData.user.id)
        .maybeSingle(),
    ]);

    if (isSuperAdmin !== true) {
      if (membershipResult.error) throw membershipResult.error;
      if (String(authorizedTenant || '') !== tenantId || membershipResult.data?.role !== 'owner') {
        return json({ error: 'forbidden' }, 403);
      }
    }

    if (action === 'status') {
      const [{ data, error }, isRuntimeReady] = await Promise.all([
        admin.rpc('somlink_admin_status', { p_tenant_id: tenantId }),
        runtimeReady(admin),
      ]);
      if (error) throw error;
      return json({ success: true, integration: data, runtime_ready: isRuntimeReady });
    }

    if (action === 'save') {
      const walletPhone = String(body?.wallet_phone || '').trim();
      const password = typeof body?.password === 'string' && body.password.length > 0 ? body.password : null;
      const wantsActive = body?.is_active === true;
      const isRuntimeReady = await runtimeReady(admin);
      const { data, error } = await admin.rpc('somlink_admin_save', {
        p_tenant_id: tenantId,
        p_wallet_phone: walletPhone,
        p_password: password,
        p_is_active: wantsActive && isRuntimeReady,
      });
      if (error) return json({ error: error.message || 'save_failed' }, 400);
      return json({ success: true, integration: data, runtime_ready: isRuntimeReady });
    }

    if (action === 'test') {
      const { data: credentials, error: credentialsError } = await admin.rpc('somlink_admin_credentials', {
        p_tenant_id: tenantId,
      });
      if (credentialsError) throw credentialsError;
      if (!credentials?.wallet_phone || !credentials?.password) {
        return json({ error: 'somlink_credentials_not_configured' }, 400);
      }

      try {
        await somlinkLogin(credentials.wallet_phone, credentials.password);
      } catch (error) {
        const message = safeError(error);
        await admin.rpc('somlink_admin_set_connection', {
          p_tenant_id: tenantId,
          p_status: 'failed',
          p_error: message,
          p_is_active: false,
        });
        return json({ success: false, connected: false, error: message }, 400);
      }

      // Infrastructure/runtime failures are deliberately handled outside the login
      // catch above so they never invalidate a tenant's otherwise valid credentials.
      const wantsActive = body?.activate !== false;
      const isRuntimeReady = await runtimeReady(admin);
      const { data: state, error: stateError } = await admin.rpc('somlink_admin_set_connection', {
        p_tenant_id: tenantId,
        p_status: 'connected',
        p_error: null,
        p_is_active: wantsActive && isRuntimeReady,
      });
      if (stateError) throw stateError;
      return json({
        success: true,
        connected: true,
        activated: state?.is_active === true,
        runtime_ready: isRuntimeReady,
        integration: state,
      });
    }

    if (action === 'delete') {
      const { data, error } = await admin.rpc('somlink_admin_delete', { p_tenant_id: tenantId });
      if (error) throw error;
      return json({ success: true, integration: data });
    }

    return json({ error: 'unknown_action' }, 400);
  } catch (error) {
    console.error('somlink-integration error:', error instanceof Error ? error.message : 'unknown');
    return json({ error: safeError(error) }, 500);
  }
});
