import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  SomlinkApiError,
  sanitizeSomlinkResponse,
  somlinkLogin,
  somlinkSendData,
} from '../_shared/somlink.ts';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function errorMessage(error: unknown) {
  if (error instanceof SomlinkApiError) {
    return `${error.message}${error.status ? ` (${error.status})` : ''}`.slice(0, 500);
  }
  return (error instanceof Error ? error.message : 'Unknown Somlink error').slice(0, 500);
}

serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // pg_net cannot send a user JWT. Instead, this endpoint is protected by a
  // server-only random secret generated in Vault and injected by the DB trigger.
  const suppliedDispatchSecret = req.headers.get('x-somlink-dispatch-secret') || '';
  const { data: expectedDispatchSecret, error: dispatchSecretError } = await admin.rpc(
    'somlink_admin_dispatch_secret',
  );
  if (dispatchSecretError || !expectedDispatchSecret) {
    console.error('somlink-delivery dispatch authentication is not configured');
    return json({ error: 'dispatch_not_configured' }, 503);
  }
  if (!suppliedDispatchSecret || suppliedDispatchSecret !== expectedDispatchSecret) {
    return json({ error: 'unauthorized' }, 401);
  }

  let queueId = '';
  let tenantId = '';
  let orderId = '';

  try {
    const body = await req.json().catch(() => ({}));
    queueId = String(body?.queue_id || '').trim();
    if (!queueId) return json({ error: 'queue_id_required' }, 400);

    const { data: queue, error: queueError } = await admin
      .from('delivery_queue')
      .select('id, tenant_id, order_id, provider_name, ussd_code, status, attempts, dispatched_at')
      .eq('id', queueId)
      .maybeSingle();

    if (queueError) throw queueError;
    if (!queue) return json({ error: 'queue_not_found' }, 404);
    if (queue.provider_name !== 'somlink' || !String(queue.ussd_code || '').startsWith('API:SOMLINK:')) {
      return json({ error: 'not_somlink_delivery' }, 400);
    }
    if (queue.status === 'completed') return json({ success: true, duplicate: true, queue_id: queueId });
    if (queue.status !== 'processing') return json({ error: 'queue_not_processable', status: queue.status }, 409);
    if (queue.dispatched_at) return json({ success: true, processing: true, queue_id: queueId }, 202);

    tenantId = queue.tenant_id;
    orderId = queue.order_id;

    const { data: isDemo, error: demoError } = await admin.rpc('is_demo_tenant', {
      p_tenant_id: tenantId,
    });
    if (demoError) throw demoError;
    if (isDemo === true) return json({ error: 'demo_tenant_live_delivery_blocked' }, 409);

    const now = new Date().toISOString();

    // Atomic claim. Only one invocation can move dispatched_at from NULL.
    const { data: claimed, error: claimError } = await admin
      .from('delivery_queue')
      .update({
        dispatched_at: now,
        last_attempt_at: now,
        attempts: Number(queue.attempts || 0) + 1,
        dispatch_device_id: 'somlink-api',
      })
      .eq('id', queueId)
      .eq('tenant_id', tenantId)
      .eq('status', 'processing')
      .is('dispatched_at', null)
      .select('id')
      .maybeSingle();

    if (claimError) throw claimError;
    if (!claimed) return json({ success: true, processing: true, queue_id: queueId }, 202);

    const { data: order, error: orderError } = await admin
      .from('orders')
      .select('id, tenant_id, package_id, receiver_phone, status, delivery_status')
      .eq('id', orderId)
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (orderError) throw orderError;
    if (!order?.package_id) throw new Error('Somlink order/package not found');
    if (order.status !== 'completed') throw new Error('Somlink order is not paid/completed');

    const { data: pkg, error: packageError } = await admin
      .from('data_packages_config')
      .select('id, tenant_id, cost_price, somlink_bundle_id')
      .eq('id', order.package_id)
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (packageError) throw packageError;

    const bundleId = Number(pkg?.somlink_bundle_id);
    const amount = Number(pkg?.cost_price);
    const receiverDigits = String(order.receiver_phone || '').replace(/\D/g, '');
    if (!Number.isInteger(bundleId) || bundleId <= 0) throw new Error('Somlink bundle id is missing or invalid');
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('Somlink package cost price is missing or invalid');
    if (receiverDigits.length < 9) throw new Error('Somlink receiver phone is invalid');

    const { data: credentials, error: credentialsError } = await admin.rpc('somlink_admin_credentials', {
      p_tenant_id: tenantId,
    });
    if (credentialsError) throw credentialsError;
    if (!credentials?.wallet_phone || !credentials?.password) throw new Error('Somlink credentials not configured');
    if (credentials.connection_status !== 'connected' || credentials.is_active !== true) {
      throw new Error('Somlink integration is not connected and active');
    }

    const login = await somlinkLogin(credentials.wallet_phone, credentials.password);
    const providerResponse = await somlinkSendData({
      token: login.token,
      receiverPhone: order.receiver_phone,
      walletPhone: credentials.wallet_phone,
      amount,
      bundleId,
    });
    const safeResponse = sanitizeSomlinkResponse(providerResponse);
    const providerResponseText = safeResponse == null ? null : JSON.stringify(safeResponse);
    const completedAt = new Date().toISOString();

    await Promise.all([
      admin
        .from('delivery_queue')
        .update({
          status: 'completed',
          completed_at: completedAt,
          error_message: null,
          provider_response: providerResponseText,
          somlink_response: safeResponse,
        })
        .eq('id', queueId)
        .eq('tenant_id', tenantId),
      admin
        .from('orders')
        .update({
          delivery_status: 'delivered',
          delivered_at: completedAt,
          delivery_notes: 'Somlink API delivery completed',
        })
        .eq('id', orderId)
        .eq('tenant_id', tenantId),
    ]);

    return json({ success: true, queue_id: queueId, order_id: orderId });
  } catch (error) {
    const message = errorMessage(error);
    const safeResponse = error instanceof SomlinkApiError
      ? sanitizeSomlinkResponse(error.response)
      : null;
    const providerResponseText = safeResponse == null ? null : JSON.stringify(safeResponse);

    console.error('somlink-delivery failed:', {
      queueId,
      orderId,
      tenantId,
      stage: error instanceof SomlinkApiError ? error.stage : 'internal',
      message,
    });

    if (queueId) {
      let queueUpdate = admin
        .from('delivery_queue')
        .update({
          status: 'failed',
          error_message: message,
          provider_response: providerResponseText,
          somlink_response: safeResponse,
          completed_at: new Date().toISOString(),
        })
        .eq('id', queueId);
      if (tenantId) queueUpdate = queueUpdate.eq('tenant_id', tenantId);
      await queueUpdate;
    }

    if (orderId) {
      let orderUpdate = admin
        .from('orders')
        .update({ delivery_status: 'failed', delivery_notes: `Somlink API: ${message}` })
        .eq('id', orderId);
      if (tenantId) orderUpdate = orderUpdate.eq('tenant_id', tenantId);
      await orderUpdate;
    }

    // A real HTTP login rejection invalidates the configured credentials.
    // Network/timeout failures (status=null) fail this order but do not disable
    // the tenant's catalog globally.
    if (tenantId && error instanceof SomlinkApiError && error.stage === 'login' && error.status !== null) {
      await admin.rpc('somlink_admin_set_connection', {
        p_tenant_id: tenantId,
        p_status: 'failed',
        p_error: message,
        p_is_active: false,
      });
    }

    return json({ success: false, error: message }, 502);
  }
});
