import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-tenant-id',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CLIENT_REF_RE = /^[A-Za-z0-9._-]{8,80}$/;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function normalizePhone(value: unknown): string {
  let digits = String(value ?? '').replace(/\D/g, '');
  if (digits.startsWith('252')) digits = digits.slice(3);
  if (digits.startsWith('0')) digits = digits.slice(1);
  return digits.slice(-9);
}

function waafiAccount(phone: string): string {
  return `252${phone}`;
}

// WaafiPay rejects long / punctuated reference ids with E10000
// ("An error occurred while creating order"). Keep it short + alphanumeric.
function referenceId(tenantId: string, clientReference: string): string {
  const seed = `${tenantId}:${clientReference}`;
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  const stamp = Date.now().toString(36).toUpperCase().slice(-6);
  return `WP${stamp}${hash.toString(36).toUpperCase()}`.replace(/[^A-Z0-9]/g, '').slice(0, 20);
}

function waafiTimestamp(): string {
  return new Date().toISOString().replace('T', ' ').replace('Z', '');
}

// Kala saarid: user-ka ayaa cancel dhigay vs haraag kuma filna vs kale
function classifyFailure(responseCode: string, responseMsg: string, state: string): string {
  const code = String(responseCode || '').trim();
  const msg = String(responseMsg || '').toUpperCase();
  if (
    code === '5206' ||
    msg.includes('INSUFFICIENT') ||
    msg.includes('NOT ENOUGH') ||
    msg.includes('LOW BALANCE') ||
    msg.includes('BALANCE')
  ) {
    return 'insufficient_balance';
  }
  if (
    code === '5310' ||
    msg.includes('REJECT') ||
    msg.includes('CANCEL') ||
    msg.includes('DENIED') ||
    msg.includes('TIMEOUT') ||
    msg.includes('EXPIRE')
  ) {
    return msg.includes('TIMEOUT') || msg.includes('EXPIRE') ? 'payment_timeout' : 'payment_cancelled';
  }
  if (String(state || '').toUpperCase() === 'DECLINED') return 'payment_declined';
  return 'payment_failed';
}

function publicErrorMessage(code: string, fallback?: string) {
  const messages: Record<string, string> = {
    payment_declined: 'Lacag-bixinta waa la diiday.',
    payment_cancelled: 'Waad joojisay lacag-bixinta.',
    insufficient_balance: 'Haraagaagu kuma filna. Fadlan lacag shubo kadibna isku day mar kale.',
    payment_timeout: 'Waqtigii lacag-bixinta wuu dhamaaday. Fadlan isku day mar kale.',
    payment_failed: 'Lacag-bixinta ma dhammaan.',
    payment_status_unknown: 'Xaaladda lacag-bixinta lama xaqiijin. Fadlan ha ku celin hadda; la xiriir adeegga macaamiisha.',
    waafipay_not_configured: 'WaafiPay tenant-kan looma diyaarin.',
    waafipay_inactive: 'WaafiPay tenant-kan waa hakad.',
    waafipay_credentials_invalid: 'WaafiPay credentials-ka tenant-kan ma dhammaystirna. Super Admin-ku ha hubiyo credentials-ka WaafiPay bixiyey.',
    waafipay_delivery_mode_not_supported: 'WaafiPay Direct Purchase wuxuu u baahan yahay Android/USSD delivery.',
  };
  return messages[code] || fallback || 'WaafiPay request failed';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const body = await req.json().catch(() => ({}));
    const tenantId = String(body?.tenant_id || '').trim();
    const requestTenantId = String(req.headers.get('x-tenant-id') || '').trim();
    const clientReference = String(body?.client_reference || '').trim();
    let payerPhone = normalizePhone(body?.payer_phone);
    let receiverPhone = normalizePhone(body?.receiver_phone);
    let packageId = String(body?.package_id || '').trim();
    let paymentProviderId = String(body?.payment_provider_id || '').trim() || null;

    if (!UUID_RE.test(tenantId) || requestTenantId !== tenantId) {
      return json({ error: 'invalid_tenant_context' }, 403);
    }
    if (!CLIENT_REF_RE.test(clientReference)) {
      return json({ error: 'invalid_client_reference' }, 422);
    }
    if (!UUID_RE.test(packageId) || payerPhone.length !== 9 || receiverPhone.length < 7) {
      return json({ error: 'invalid_purchase_fields' }, 422);
    }
    if (paymentProviderId && !UUID_RE.test(paymentProviderId)) {
      return json({ error: 'invalid_payment_provider' }, 422);
    }

    const { data: existing, error: existingError } = await admin
      .from('waafipay_transactions')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('client_reference', clientReference)
      .maybeSingle();
    if (existingError) throw existingError;

    let transaction = existing as any;
    let resumeApproved = transaction?.status === 'approved';

    if (transaction && !resumeApproved) {
      if (transaction.status === 'processing' || transaction.status === 'unknown') {
        return json({
          error: 'payment_status_unknown',
          message: publicErrorMessage('payment_status_unknown'),
          reference_id: transaction.reference_id,
        }, 409);
      }
      const priorCode = classifyFailure(
        transaction.response_code || '',
        transaction.response_message || transaction.error_message || '',
        transaction.waafi_state || '',
      );
      return json({
        error: priorCode,
        message: publicErrorMessage(priorCode),
        state: transaction.waafi_state,
        reference_id: transaction.reference_id,
      }, 409);
    }

    const { data: tenant, error: tenantError } = await admin
      .from('tenants')
      .select('id, status, delivery_mode')
      .eq('id', tenantId)
      .maybeSingle();
    if (tenantError) throw tenantError;
    if (!tenant) return json({ error: 'tenant_not_found' }, 404);
    if (tenant.delivery_mode === 'api_partner') {
      return json({
        error: 'waafipay_delivery_mode_not_supported',
        message: publicErrorMessage('waafipay_delivery_mode_not_supported'),
      }, 409);
    }
    if (!['active', 'trial'].includes(String(tenant.status || '').toLowerCase())) {
      return json({ error: 'tenant_inactive' }, 403);
    }

    const { data: credentials, error: credentialError } = await admin.rpc(
      'waafipay_admin_credentials',
      { p_tenant_id: tenantId },
    );
    if (credentialError) throw credentialError;
    if (!credentials?.api_key) {
      return json({
        error: 'waafipay_not_configured',
        message: publicErrorMessage('waafipay_not_configured'),
      }, 409);
    }
    const merchantUid = String(credentials.merchant_uid || '');
    const apiUserId = String(credentials.api_user_id || '');
    const apiKey = String(credentials.api_key || '');
    const credentialsValid =
      merchantUid.length >= 7 && merchantUid.length <= 15 &&
      apiUserId.length >= 7 && apiUserId.length <= 15 &&
      apiKey.length >= 10 && apiKey.length <= 100;
    if (!credentialsValid) {
      return json({
        error: 'waafipay_credentials_invalid',
        message: publicErrorMessage('waafipay_credentials_invalid'),
      }, 409);
    }
    if (credentials.is_active !== true) {
      return json({
        error: 'waafipay_inactive',
        message: publicErrorMessage('waafipay_inactive'),
      }, 409);
    }

    if (resumeApproved) {
      payerPhone = String(transaction.payer_phone);
      receiverPhone = String(transaction.receiver_phone);
      packageId = String(transaction.package_id);
      paymentProviderId = transaction.payment_provider_id || null;
    }

    const [{ data: pkg, error: packageError }, { data: provider, error: providerError }] = await Promise.all([
      admin
        .from('data_packages_config')
        .select('id, tenant_id, provider_id, package_name, data_amount, selling_price, cost_price, is_active, is_discovery_root')
        .eq('id', packageId)
        .eq('tenant_id', tenantId)
        .maybeSingle(),
      paymentProviderId
        ? admin
            .from('payment_providers_config')
            .select('id, provider_name, is_active')
            .eq('id', paymentProviderId)
            .eq('tenant_id', tenantId)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);
    if (packageError) throw packageError;
    if (providerError) throw providerError;
    if (!pkg || pkg.is_active !== true || pkg.is_discovery_root === true) {
      return json({ error: 'package_not_available' }, 404);
    }
    if (
      !paymentProviderId ||
      !provider ||
      provider.is_active !== true ||
      String(provider.provider_name || '').trim().toLowerCase() !== 'waafipay'
    ) {
      return json({ error: 'waafipay_payment_provider_not_available' }, 404);
    }

    const { data: providerConfig, error: providerConfigError } = await admin
      .from('providers_config')
      .select('provider_name')
      .eq('id', pkg.provider_id)
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (providerConfigError) throw providerConfigError;
    if (!providerConfig?.provider_name) return json({ error: 'provider_not_found' }, 404);

    const amount = Number(pkg.selling_price);
    if (!Number.isFinite(amount) || amount <= 0) return json({ error: 'invalid_package_price' }, 422);

    if (!transaction) {
      const since = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const { count, error: rateError } = await admin
        .from('waafipay_transactions')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('payer_phone', payerPhone)
        .in('status', ['processing', 'approved', 'unknown'])
        .gte('created_at', since);
      if (rateError) throw rateError;
      if ((count || 0) >= 5) return json({ error: 'too_many_payment_attempts' }, 429);

      const ref = referenceId(tenantId, clientReference);
      const requestId = crypto.randomUUID();
      const { data: inserted, error: insertError } = await admin
        .from('waafipay_transactions')
        .insert({
          tenant_id: tenantId,
          client_reference: clientReference,
          reference_id: ref,
          request_id: requestId,
          payer_phone: payerPhone,
          receiver_phone: receiverPhone,
          package_id: packageId,
          payment_provider_id: paymentProviderId,
          amount,
          currency: 'USD',
          environment: credentials.environment,
          status: 'processing',
        })
        .select('*')
        .single();

      if (insertError) {
        if (insertError.code === '23505') {
          return json({ error: 'request_already_processing' }, 409);
        }
        throw insertError;
      }
      transaction = inserted;

      const endpoint = credentials.environment === 'sandbox'
        ? 'https://sandbox.waafipay.com/asm'
        : 'https://api.waafipay.net/asm';
      const payload = {
        schemaVersion: '1.0',
        requestId,
        timestamp: waafiTimestamp(),
        channelName: 'WEB',
        serviceName: 'API_PURCHASE',
        serviceParams: {
          merchantUid: credentials.merchant_uid,
          apiUserId: credentials.api_user_id,
          apiKey: credentials.api_key,
          paymentMethod: 'MWALLET_ACCOUNT',
          payerInfo: { accountNo: waafiAccount(payerPhone) },
          transactionInfo: {
            referenceId: ref,
            invoiceId: ref,
            amount: amount.toFixed(2),
            currency: 'USD',
            description: `Data package ${pkg.package_name}`,
          },
        },
      };

      let waafiResponse: any;
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(45000),
        });
        const rawText = await response.text();
        try {
          waafiResponse = rawText ? JSON.parse(rawText) : {};
        } catch {
          waafiResponse = { raw: rawText.slice(0, 2000) };
        }
        if (!response.ok) {
          await admin
            .from('waafipay_transactions')
            .update({
              status: 'unknown',
              raw_response: waafiResponse,
              error_message: `WaafiPay HTTP ${response.status}`,
              updated_at: new Date().toISOString(),
            })
            .eq('id', transaction.id);
          return json({
            error: 'payment_status_unknown',
            message: publicErrorMessage('payment_status_unknown'),
            reference_id: ref,
          }, 502);
        }
      } catch (error) {
        await admin
          .from('waafipay_transactions')
          .update({
            status: 'unknown',
            error_message: error instanceof Error ? error.message.slice(0, 500) : 'Network error',
            updated_at: new Date().toISOString(),
          })
          .eq('id', transaction.id);
        return json({
          error: 'payment_status_unknown',
          message: publicErrorMessage('payment_status_unknown'),
          reference_id: ref,
        }, 502);
      }

      const params = waafiResponse?.params || {};
      const code = String(waafiResponse?.responseCode || '');
      const state = String(params?.state || '').toUpperCase();
      const rejected = code === '5310' || String(waafiResponse?.responseMsg || '').toUpperCase().includes('REJECTED');
      const approved = code === '2001' && state === 'APPROVED';
      const finalStatus = approved ? 'approved' : (state === 'DECLINED' || rejected) ? 'declined' : 'failed';

      const { data: updated, error: updateError } = await admin
        .from('waafipay_transactions')
        .update({
          status: finalStatus,
          waafi_state: state || null,
          response_code: String(waafiResponse?.responseCode || '') || null,
          response_message: String(waafiResponse?.responseMsg || '') || null,
          waafi_transaction_id: String(params?.transactionId || '') || null,
          issuer_transaction_id: String(params?.issuerTransactionId || '') || null,
          raw_response: waafiResponse,
          error_message: approved ? null : String(waafiResponse?.responseMsg || state || 'Payment failed').slice(0, 500),
          approved_at: approved ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', transaction.id)
        .select('*')
        .single();
      if (updateError) throw updateError;
      transaction = updated;

      if (!approved) {
        const errorCode = classifyFailure(code, String(waafiResponse?.responseMsg || ''), state);
        return json({
          error: errorCode,
          message: publicErrorMessage(errorCode),
          state,
          reference_id: transaction.reference_id,
        }, 402);
      }
    }

    let order: any = null;
    if (transaction.order_id) {
      const { data, error } = await admin
        .from('orders')
        .select('id, delivery_status')
        .eq('id', transaction.order_id)
        .eq('tenant_id', tenantId)
        .maybeSingle();
      if (error) throw error;
      order = data;
    }

    if (!order) {
      const { data: existingOrder, error: orderLookupError } = await admin
        .from('orders')
        .select('id, delivery_status')
        .eq('tenant_id', tenantId)
        .eq('external_ref', transaction.reference_id)
        .maybeSingle();
      if (orderLookupError) throw orderLookupError;
      order = existingOrder;
    }

    if (!order) {
      const { data: createdOrder, error: orderError } = await admin
        .from('orders')
        .insert({
          tenant_id: tenantId,
          customer_phone: payerPhone,
          sender_phone: payerPhone,
          receiver_phone: receiverPhone,
          provider_id: pkg.provider_id,
          package_id: pkg.id,
          package_name: pkg.package_name,
          data_amount: pkg.data_amount,
          selling_price: amount,
          cost_price: Number(pkg.cost_price || 0),
          payment_provider_id: paymentProviderId,
          payment_source: 'waafipay',
          status: 'completed',
          delivery_status: 'pending',
          source: 'waafipay_api',
          tx_id: transaction.waafi_transaction_id,
          external_ref: transaction.reference_id,
        })
        .select('id, delivery_status')
        .single();

      if (orderError || !createdOrder) {
        await admin
          .from('waafipay_transactions')
          .update({
            error_message: `Payment approved; order creation failed: ${orderError?.message || 'unknown'}`,
            updated_at: new Date().toISOString(),
          })
          .eq('id', transaction.id);
        return json({
          success: true,
          payment_approved: true,
          delivery_queued: false,
          warning: 'approved_order_creation_pending',
          message: 'Lacagta waa la xaqiijiyey; delivery-ga wuxuu u baahan yahay dib-u-hubin.',
          reference_id: transaction.reference_id,
        }, 202);
      }
      order = createdOrder;
    }

    await admin
      .from('waafipay_transactions')
      .update({ order_id: order.id, error_message: null, updated_at: new Date().toISOString() })
      .eq('id', transaction.id);

    const activationResponse = await fetch(`${supabaseUrl}/functions/v1/activate-package`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        orderId: order.id,
        providerName: providerConfig.provider_name,
        receiverPhone,
        source: 'waafipay',
      }),
    });
    const activationText = await activationResponse.text();
    let activation: any = null;
    try {
      activation = activationText ? JSON.parse(activationText) : null;
    } catch {
      activation = { raw: activationText.slice(0, 500) };
    }

    if (!activationResponse.ok) {
      await admin
        .from('waafipay_transactions')
        .update({
          error_message: `Payment approved; activation failed: ${activationText.slice(0, 300)}`,
          updated_at: new Date().toISOString(),
        })
        .eq('id', transaction.id);
      return json({
        success: true,
        payment_approved: true,
        delivery_queued: false,
        order_id: order.id,
        reference_id: transaction.reference_id,
        message: 'Lacagta waa la xaqiijiyey; delivery-ga admin-ka ayaa dib u diri kara.',
      }, 202);
    }

    return json({
      success: true,
      payment_approved: true,
      delivery_queued: true,
      order_id: order.id,
      reference_id: transaction.reference_id,
      transaction_id: transaction.waafi_transaction_id,
      delivery: activation,
    });
  } catch (error) {
    console.error('waafipay-purchase error:', error instanceof Error ? error.message : 'unknown');
    return json({
      error: 'server_error',
      message: 'Cilad server ayaa dhacday. Fadlan ha ku celin payment-ka isla markiiba.',
    }, 500);
  }
});
