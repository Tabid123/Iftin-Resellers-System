import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function cleanText(value: unknown, maxLength: number) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function safePath(value: unknown): string | null {
  const path = String(value ?? '').trim();
  if (!path || !path.startsWith('/') || path.startsWith('//')) return null;
  const allowed = ['/', '/providers', '/history', '/notifications', '/profile', '/categories/'];
  return allowed.some((prefix) => prefix.endsWith('/') ? path.startsWith(prefix) : path === prefix)
    ? path
    : null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const authHeader = req.headers.get('Authorization') || '';

  if (!supabaseUrl || !anonKey || !serviceKey || !authHeader.startsWith('Bearer ')) {
    return json({ error: 'unauthorized' }, 401);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userError } = await userClient.auth.getUser();
  const user = userData?.user;
  if (userError || !user) return json({ error: 'unauthorized' }, 401);

  const body = await req.json().catch(() => ({}));
  const tenantId = String(body?.tenant_id ?? '').trim();
  const title = cleanText(body?.title, 100);
  const message = cleanText(body?.message, 500);
  const path = safePath(body?.path);

  if (!isUuid(tenantId)) return json({ error: 'invalid_tenant' }, 400);
  if (!title || !message) return json({ error: 'title_and_message_required' }, 400);

  const [{ data: tenant }, { data: membership }, { data: role }] = await Promise.all([
    admin.from('tenants').select('id, owner_user_id, status').eq('id', tenantId).maybeSingle(),
    admin.from('tenant_members').select('id, role').eq('tenant_id', tenantId).eq('user_id', user.id).maybeSingle(),
    admin.from('user_roles').select('role').eq('user_id', user.id).eq('role', 'super_admin').maybeSingle(),
  ]);

  if (!tenant) return json({ error: 'tenant_not_found' }, 404);

  const membershipRole = String(membership?.role || '').toLowerCase();
  const isTenantAdmin = membershipRole === 'owner' || membershipRole === 'admin';
  const authorized = tenant.owner_user_id === user.id || isTenantAdmin || Boolean(role);
  if (!authorized) return json({ error: 'forbidden' }, 403);

  const { data: notification, error: insertError } = await admin
    .from('notifications')
    .insert({ tenant_id: tenantId, title, message, is_active: true })
    .select('id, tenant_id, title, message, created_at')
    .single();

  if (insertError || !notification) {
    console.error('notification insert failed', insertError);
    return json({ error: 'notification_create_failed' }, 500);
  }

  // Prefer a tenant-dedicated OneSignal app. The App ID is safe to bake into
  // that tenant's APK; its REST key remains encrypted in Supabase Vault and is
  // only decrypted by this service-role-only RPC. Existing deployments can
  // temporarily fall back to the old global Edge Function secrets when no
  // tenant-specific row exists yet.
  const { data: tenantPushRows, error: tenantPushError } = await admin.rpc(
    'get_tenant_push_credentials',
    { p_tenant_id: tenantId },
  );
  if (tenantPushError) console.error('tenant push config lookup failed', tenantPushError);

  const tenantPush = Array.isArray(tenantPushRows) ? tenantPushRows[0] : tenantPushRows;
  const hasTenantPushRow = Boolean(tenantPush?.onesignal_app_id);
  const tenantPushEnabled = tenantPush?.enabled !== false;

  let oneSignalAppId = '';
  let oneSignalApiKey = '';
  let pushScope: 'tenant' | 'legacy-global' | 'disabled' = 'disabled';

  if (hasTenantPushRow) {
    if (tenantPushEnabled) {
      oneSignalAppId = String(tenantPush.onesignal_app_id || '').trim();
      oneSignalApiKey = String(tenantPush.rest_api_key || '').trim();
      pushScope = 'tenant';
    }
  } else {
    oneSignalAppId = String(Deno.env.get('ONESIGNAL_APP_ID') || '').trim();
    oneSignalApiKey = String(Deno.env.get('ONESIGNAL_REST_API_KEY') || '').trim();
    if (oneSignalAppId && oneSignalApiKey) pushScope = 'legacy-global';
  }

  if (!oneSignalAppId || !oneSignalApiKey) {
    return json({
      success: true,
      notification,
      push_configured: false,
      push_sent: false,
      push_scope: pushScope,
    });
  }

  try {
    const payload: Record<string, unknown> = {
      app_id: oneSignalAppId,
      headings: { en: title },
      contents: { en: message },
      // Tenant-dedicated apps already isolate recipients physically. Keep the
      // tenant tag filter as a second guard and for the legacy shared app.
      filters: [{ field: 'tag', key: 'tenant_id', relation: '=', value: tenantId }],
      data: path ? { path } : {},
    };

    const pushResponse = await fetch('https://api.onesignal.com/notifications', {
      method: 'POST',
      headers: {
        Authorization: `Key ${oneSignalApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const pushBody = await pushResponse.json().catch(() => ({}));
    if (!pushResponse.ok) {
      console.error('OneSignal send failed', { status: pushResponse.status, scope: pushScope });
      return json({
        success: true,
        notification,
        push_configured: true,
        push_sent: false,
        push_error: 'provider_rejected',
        push_scope: pushScope,
      });
    }

    return json({
      success: true,
      notification,
      push_configured: true,
      push_sent: true,
      push_scope: pushScope,
      push_id: typeof pushBody?.id === 'string' ? pushBody.id : null,
      recipients: Number.isFinite(Number(pushBody?.recipients)) ? Number(pushBody.recipients) : null,
    });
  } catch (error) {
    console.error('OneSignal request failed', { error, scope: pushScope });
    return json({
      success: true,
      notification,
      push_configured: true,
      push_sent: false,
      push_error: 'provider_unreachable',
      push_scope: pushScope,
    });
  }
});
