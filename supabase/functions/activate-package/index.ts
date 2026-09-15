import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-device-id',
};

async function resolveActiveDevice(supabase: any, deviceId?: string | null, columns = 'id, device_id, tenant_id, sim1_provider, sim2_provider') {
  const cleanDeviceId = String(deviceId || '').trim();
  if (!cleanDeviceId) return { device: null, errorResponse: json({ error: 'deviceId required' }, 400) };

  const { data: device, error } = await supabase
    .from('android_devices')
    .select(columns)
    .eq('device_id', cleanDeviceId)
    .eq('is_active', true)
    .is('archived_at', null)
    .maybeSingle();

  if (error) {
    console.error('Device lookup error:', error);
    return { device: null, errorResponse: json({ error: 'Device lookup failed' }, 500) };
  }
  if (!device?.tenant_id) {
    console.warn('Rejecting unregistered/tenantless Android device:', cleanDeviceId);
    return { device: null, errorResponse: json({ error: 'Device not registered to a reseller tenant', needsLogin: true }, 403) };
  }

  return { device, errorResponse: null };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const url = new URL(req.url);
    const path = url.pathname.split('/').pop();
    const action = url.searchParams.get('action');

    // Route: Get device SIM configuration (for dynamic SIM slot routing)
    if (req.method === 'GET' && (path === 'device-config' || action === 'device-config')) {
      const deviceId = url.searchParams.get('deviceId');
      const { device, errorResponse } = await resolveActiveDevice(supabase, deviceId, 'id, device_id, tenant_id, sim1_provider, sim2_provider');
      if (errorResponse) return errorResponse;
      
      console.log('📱 Fetching SIM config for device:', deviceId);
      
      const config = {
        sim1Provider: device?.sim1_provider || null,
        sim2Provider: device?.sim2_provider || null
      };
      
      console.log('📱 SIM config response:', config);
      
      return new Response(
        JSON.stringify(config),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Route: Log an EVC / e-voucher SMS (tenant resolved from the reporting device)
    if (req.method === 'POST' && (path === 'log-sms' || action === 'log-sms')) {
      const body = await req.json();
      const { device, errorResponse } = await resolveActiveDevice(supabase, body?.device_id, 'id, device_id, tenant_id');
      if (errorResponse) return errorResponse;

      const tenantId = device.tenant_id;
      const smsBody = String(body?.sms_body || '').trim();
      if (!smsBody) {
        return new Response(
          JSON.stringify({ success: false, error: 'sms_body required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Dedup: same tenant + device + body within the last 5 minutes
      const since = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const { data: duplicate } = await supabase
        .from('sms_logs')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('device_id', device.device_id)
        .eq('sms_body', smsBody)
        .gte('created_at', since)
        .maybeSingle();

      if (duplicate) {
        console.log('⏭️ Duplicate SMS skipped:', duplicate.id);
        return new Response(
          JSON.stringify({ success: true, duplicate: true, id: duplicate.id }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data: inserted, error: smsErr } = await supabase
        .from('sms_logs')
        .insert({
          tenant_id: tenantId,
          device_id: device.device_id,
          sim_slot: body?.sim_slot ?? 1,
          sim_number: body?.sim_number ?? null,
          sms_type: body?.sms_type ?? 'incoming',
          sms_sender: body?.sms_sender ?? null,
          sms_body: smsBody,
          amount: body?.amount ?? null,
          tx_type: body?.tx_type ?? null,
          tx_id: body?.tx_id ?? null,
          counterpart_phone: body?.counterpart_phone ?? null,
          received_at: body?.received_at ?? new Date().toISOString(),
        })
        .select('id')
        .single();

      if (smsErr) {
        console.error('❌ sms_logs insert error:', smsErr);
        return new Response(
          JSON.stringify({ success: false, error: smsErr.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log('✅ SMS logged:', inserted.id, 'tenant:', tenantId);
      return new Response(
        JSON.stringify({ success: true, id: inserted.id }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }


    // Route: Queue activation request
    if (req.method === 'POST' && path === 'activate-package') {
      const requestBody = await req.json();
      let orderId = String(requestBody?.orderId || '').trim();
      let providerName = String(requestBody?.providerName || '').trim();
      let receiverPhone = String(requestBody?.receiverPhone || '').trim();
      const pendingPaymentId = String(requestBody?.pendingPaymentId || '').trim();

      // Bank payment paths identify the pending payment, not an existing order.
      // Resolve it idempotently into an order before using the normal queue path.
      if (!orderId && pendingPaymentId) {
        const { data: pendingPayment, error: pendingError } = await supabase
          .from('pending_online_payments')
          .select('id, tenant_id, verified_phone, sender_phone, receiver_phone, provider_id, package_id, payment_provider, expected_amount, status')
          .eq('id', pendingPaymentId)
          .maybeSingle();

        if (pendingError || !pendingPayment?.tenant_id || !pendingPayment.package_id || !pendingPayment.provider_id) {
          return json({ error: 'Pending online payment not found or incomplete' }, 404);
        }

        const externalRef = `pending-payment:${pendingPayment.id}`;
        const { data: existingOrder } = await supabase
          .from('orders')
          .select('id, receiver_phone, provider_id')
          .eq('tenant_id', pendingPayment.tenant_id)
          .eq('external_ref', externalRef)
          .maybeSingle();

        const { data: packageRow } = await supabase
          .from('data_packages_config')
          .select('package_name, data_amount, selling_price, cost_price')
          .eq('id', pendingPayment.package_id)
          .eq('tenant_id', pendingPayment.tenant_id)
          .maybeSingle();
        const { data: providerRow } = await supabase
          .from('providers_config')
          .select('provider_name')
          .eq('id', pendingPayment.provider_id)
          .eq('tenant_id', pendingPayment.tenant_id)
          .maybeSingle();

        if (!packageRow || !providerRow?.provider_name) {
          return json({ error: 'Pending payment package/provider not found' }, 404);
        }

        if (existingOrder) {
          orderId = existingOrder.id;
          receiverPhone = existingOrder.receiver_phone;
          providerName = providerRow.provider_name;
        } else {
          const { data: createdOrder, error: createError } = await supabase
            .from('orders')
            .insert({
              tenant_id: pendingPayment.tenant_id,
              customer_phone: pendingPayment.verified_phone || pendingPayment.sender_phone,
              sender_phone: pendingPayment.sender_phone,
              receiver_phone: pendingPayment.receiver_phone,
              provider_id: pendingPayment.provider_id,
              package_id: pendingPayment.package_id,
              package_name: packageRow.package_name,
              data_amount: packageRow.data_amount,
              selling_price: pendingPayment.expected_amount ?? packageRow.selling_price,
              cost_price: packageRow.cost_price,
              payment_source: requestBody?.source || pendingPayment.payment_provider || 'online',
              status: 'completed',
              delivery_status: 'pending',
              source: 'web',
              external_ref: externalRef,
            })
            .select('id, receiver_phone')
            .single();
          if (createError || !createdOrder) {
            console.error('Pending payment order creation failed:', createError);
            return json({ error: createError?.message || 'Could not create order' }, 500);
          }
          orderId = createdOrder.id;
          receiverPhone = createdOrder.receiver_phone;
          providerName = providerRow.provider_name;
        }
      }

      if (!orderId || !receiverPhone) {
        return json({ error: 'orderId/receiverPhone or pendingPaymentId required' }, 400);
      }

      console.log('Queueing activation:', { orderId, providerName, receiverPhone });

      // 1. Get order details first; all following Service Role queries must stay in this tenant.
      const { data: order, error: orderErr } = await supabase
        .from('orders')
        .select('package_id, provider_id, tenant_id')
        .eq('id', orderId)
        .single();

      if (orderErr || !order?.tenant_id) {
        console.error('Order not found:', orderErr);
        throw new Error('Order not found');
      }

      const tenantId = order.tenant_id;

      // Block check: reject if receiver phone is blocked
      const normalizedReceiver = receiverPhone?.replace(/\D/g, '').replace(/^252/, '').slice(-9) || '';
      const { data: blockInfo } = await supabase
        .from('blocked_users')
        .select('reason')
        .eq('tenant_id', tenantId)
        .eq('phone_number', normalizedReceiver)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();
      if (blockInfo) {
        console.log('🚫 Blocked user attempted activation:', receiverPhone);
        const blockReason = blockInfo?.reason || 'Phone number is blocked';
        // Update order with blocked status
        await supabase.from('orders').update({
          delivery_status: 'blocked',
          delivery_notes: `Blocked: ${blockReason}`
        }).eq('id', orderId).eq('tenant_id', tenantId);
        return new Response(
          JSON.stringify({ error: 'This phone number is blocked', blocked: true, reason: blockReason }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // 1b. api_partner tenants: Iftin ayaa lacagta qaadanaysa oo xirmada
      // gaarsiinaysa (Prepaid Intent). Waxba dhinaceena lama sameynayo —
      // delivery_queue maxalli lama gelinayo, partner-order lama wacayo.
      const { data: tenantRow } = await supabase
        .from('tenants')
        .select('delivery_mode')
        .eq('id', tenantId)
        .maybeSingle();

      if (tenantRow?.delivery_mode === 'api_partner') {
        console.log(`[iftin] api_partner tenant — Iftin delivers order ${orderId}; no local queue`);
        return new Response(
          JSON.stringify({ success: true, handled_by: 'iftin_intent' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }


      // 2. Get package cost_price & category_id from database
      const { data: pkg, error: pkgErr } = await supabase
        .from('data_packages_config')
        .select('cost_price, category_id')
        .eq('id', order.package_id)
        .eq('tenant_id', tenantId)
        .single();

      if (pkgErr || !pkg) {
        console.error('Package not found:', pkgErr);
        throw new Error('Package not found');
      }

      console.log('Package from DB:', { 
        packageId: order.package_id,
        costPrice: pkg.cost_price,
        categoryId: pkg.category_id 
      });

      // 3. Get delivery instruction template with priority: Package > Category > Provider default
      let instruction: { code_template: string | null; sim_password: string | null } | null = null;

      // First: Try package-specific instruction
      const { data: packageInstr } = await supabase
        .from('delivery_instructions')
        .select('code_template, sim_password')
        .eq('tenant_id', tenantId)
        .eq('provider_id', order.provider_id)
        .eq('package_id', order.package_id)
        .maybeSingle();

      if (packageInstr?.code_template) {
        instruction = packageInstr;
        console.log('Using package-specific instruction for package:', order.package_id);
      } else if (pkg.category_id) {
        // Second: Try category-specific instruction (without package_id)
        const { data: categoryInstr } = await supabase
          .from('delivery_instructions')
          .select('code_template, sim_password')
          .eq('tenant_id', tenantId)
          .eq('provider_id', order.provider_id)
          .eq('category_id', pkg.category_id)
          .is('package_id', null)
          .maybeSingle();

        if (categoryInstr?.code_template) {
          instruction = categoryInstr;
          console.log('Using category-specific instruction for category:', pkg.category_id);
        }
      }

      // Third: Fall back to provider default (no category, no package)
      if (!instruction) {
        const { data: providerInstr } = await supabase
          .from('delivery_instructions')
          .select('code_template, sim_password')
          .eq('tenant_id', tenantId)
          .eq('provider_id', order.provider_id)
          .is('category_id', null)
          .is('package_id', null)
          .maybeSingle();

        if (providerInstr?.code_template) {
          instruction = providerInstr;
          console.log('Using provider default instruction');
        }
      }

      if (!instruction || !instruction.code_template) {
        console.error('No delivery instruction found for order:', orderId);
        throw new Error('Delivery instruction not configured for this package/category/provider');
      }

      // 4. Build final USSD code - format amount correctly
      // Decimal amounts use * as separator in USSD: $4.25 -> "4*25", $0.10 -> "0*10"
      // Integer amounts stay as-is: $4 -> "4", $20 -> "20"
      const formatAmountForUssd = (amount: number) => {
        const numericAmount = Number(amount);
        if (!Number.isFinite(numericAmount)) return '0';
        // Pure integer: 4 -> "4", 20 -> "20"
        if (Math.abs(numericAmount - Math.round(numericAmount)) < 0.000001) {
          return String(Math.round(numericAmount));
        }
        // Decimal amount: 4.25 -> "4*25", 0.10 -> "0*10"
        const parts = numericAmount.toFixed(2).split('.');
        return `${parts[0]}*${parts[1]}`;
      };

      // No longer split amounts — send full amount in single USSD
      const splitMixedAmount = (amount: number): number[] => {
        return [Number(amount)];
      };

      const sanitizeUssdCode = (ussdCode: string) => {
        const [rawDial, ...metadataParts] = (ussdCode || '').split('|');
        let cleaned = (rawDial || '').replace(/\s+/g, '').trim();
        cleaned = cleaned.replace(/^(\*\d+?)(\d{9})(\*)/, '$1*$2$3');
        cleaned = cleaned.replace(/\*{2,}/g, '*');
        if (cleaned && !cleaned.endsWith('#')) {
          cleaned += '#';
        }
        const metadata = metadataParts.join('|').trim();
        return metadata ? `${cleaned}|${metadata}` : cleaned;
      };

      // Normalize phone to 9 digits - remove 252 prefix (ALL providers reject 252!)
      const normalizePhoneForUssd = (phone: string): string => {
        let p = (phone || '').replace(/^\+/, '').replace(/\D/g, '');
        // Ka saar 252 prefix - shirkadaha DHAN wey diidayaan!
        if (p.startsWith('252')) {
          p = p.substring(3);
        }
        return p.slice(-9);
      };

      const receiverForUssd = normalizePhoneForUssd(receiverPhone);
      const costParts = splitMixedAmount(Number(pkg.cost_price));
      
      // Build USSD for a specific amount part — uses GLOBAL replace to defend
      // against templates that contain the same placeholder more than once.
      const buildUssd = (amountPart: number) => {
        const amountFormatted = formatAmountForUssd(amountPart);
        return sanitizeUssdCode(
          instruction.code_template
            .replace(/\{receiver_phone\}/g, receiverForUssd)
            .replace(/\{cost_price\}/g, amountFormatted)
            .replace(/\{sim_password\}/g, instruction.sim_password || '')
        );
      };

      // Guard: detect templates that still contain placeholder remnants
      // (e.g. malformed `(receiver_phone}` typo in DB). We must NOT send
      // such USSD to the carrier — mark order failed and stop here.
      const isUssdMalformed = (ussd: string): { bad: boolean; reason?: string } => {
        if (!ussd) return { bad: true, reason: 'empty USSD' };
        const l = ussd.toLowerCase();
        if (l.includes('{') || l.includes('}') || l.includes('(') || l.includes(')') ||
            l.includes('receiver_phone') || l.includes('cost_price') ||
            l.includes('sim_password') || l.includes('package_code')) {
          return { bad: true, reason: `Template malformed (placeholder remnant): ${ussd}` };
        }
        return { bad: false };
      };

      const builtUssds = costParts.map((p) => buildUssd(p));
      console.log('💰 Cost split:', { originalCost: pkg.cost_price, parts: costParts, ussds: builtUssds });

      for (const u of builtUssds) {
        const check = isUssdMalformed(u);
        if (check.bad) {
          console.error('🛑 Refusing to queue malformed USSD:', check.reason);
          await supabase.from('orders').update({
            delivery_status: 'failed',
            delivery_notes: check.reason || 'Template malformed',
          }).eq('id', orderId).eq('tenant_id', tenantId);
          return new Response(
            JSON.stringify({ error: 'Template malformed — order marked as failed', reason: check.reason }),
            { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }

      // 5. Idempotent insert into delivery_queue (avoid duplicates)
      let queueData: any = null;
      let queueError: any = null;

      const { data: existingQueues, error: existingErr } = await supabase
        .from('delivery_queue')
        .select('id, status')
        .eq('tenant_id', tenantId)
        .eq('order_id', orderId)
        .in('status', ['pending', 'processing', 'completed'])
        .order('created_at', { ascending: false })
        .limit(1);

      if (existingErr) {
        console.warn('Existing queue fetch error:', existingErr);
      }

      const existingQueue = existingQueues && existingQueues.length > 0 ? existingQueues[0] : null;
      if (existingQueue) {
        console.log(`⚠️ Idempotency: delivery_queue already has active entry for order ${orderId} (status: ${existingQueue.status}). Skipping insert.`);
        queueData = existingQueue;
      } else {
        // Normalize provider name to slug format
        const normalizeProviderSlug = (name: string) => {
          const lower = name.toLowerCase();
          if (lower.includes('hormuud')) return 'hormuud';
          if (lower.includes('somnet')) return 'somnet';
          if (lower.includes('somtel')) return 'somtel';
          if (lower.includes('amtel')) return 'amtel';
          if (lower.includes('somlink')) return 'somlink';
          return lower.split(' ')[0];
        };

        const providerSlug = normalizeProviderSlug(providerName || '');

        // Find device with this provider and determine correct sim_slot
        const { data: deviceWithProvider } = await supabase
          .from('android_devices')
          .select('device_id, sim1_provider, sim2_provider')
          .eq('tenant_id', tenantId)
          .is('archived_at', null)
          .or(`sim1_provider.ilike.%${providerSlug}%,sim2_provider.ilike.%${providerSlug}%`)
          .limit(1)
          .maybeSingle();

        // Calculate sim_slot: 0 = SIM1, 1 = SIM2
        let simSlot = 0;
        if (deviceWithProvider) {
          if (deviceWithProvider.sim1_provider?.toLowerCase().includes(providerSlug)) {
            simSlot = 0;
          } else if (deviceWithProvider.sim2_provider?.toLowerCase().includes(providerSlug)) {
            simSlot = 1;
          }
        }
        console.log('📱 Calculated sim_slot:', simSlot, 'for provider:', providerSlug);

        // Auto-split mixed amounts into separate delivery queue entries
        const queueItems = costParts.map((part, idx) => ({
          tenant_id: tenantId,
          order_id: orderId,
          provider_name: providerSlug,
          ussd_code: buildUssd(part),
          receiver_phone: receiverPhone,
          status: idx === 0 ? 'pending' : 'scheduled',
          sim_slot: simSlot,
          ...(idx > 0 ? { scheduled_at: new Date(Date.now() + idx * 15000).toISOString() } : {}),
        }));

        if (queueItems.length > 1) {
          console.log(`📦 Auto-splitting $${pkg.cost_price} into ${queueItems.length} separate USSD deliveries`);
        }

        const insertRes = await supabase
          .from('delivery_queue')
          .insert(queueItems.length === 1 ? queueItems[0] : queueItems)
          .select();
        
        queueData = Array.isArray(insertRes.data) ? insertRes.data[0] : insertRes.data;
        queueError = insertRes.error;
      }

      if (queueError) {
        console.error('Queue insertion error:', queueError);
        throw queueError;
      }

      // 6. Update order status
      const { error: orderError } = await supabase
        .from('orders')
        .update({ delivery_status: 'queued' })
        .eq('id', orderId)
        .eq('tenant_id', tenantId);

      if (orderError) {
        console.error('Order update error:', orderError);
      }

      return new Response(
        JSON.stringify({
          success: true,
          orderId,
          queueId: queueData.id,
          estimatedTime: '10-30 seconds',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Route: Get pending orders (Android app polls this)
    if (req.method === 'GET' && path === 'pending') {
      const deviceId = url.searchParams.get('deviceId');
      const batteryParam = url.searchParams.get('battery');
      const chargingParam = url.searchParams.get('charging');
      const appVersion = url.searchParams.get('appVersion') || 'unknown';
      const versionCode = url.searchParams.get('versionCode') || 'unknown';

      console.log('Fetching pending orders:', { deviceId, appVersion, versionCode });

      const { device, errorResponse } = await resolveActiveDevice(supabase, deviceId, 'id, device_id, tenant_id, sim1_provider, sim2_provider');
      if (errorResponse) return errorResponse;
      const tenantId = device.tenant_id;

      // Update last_ping_at ALWAYS when deviceId exists (battery is optional)
      if (deviceId) {
        const pingUpdate: Record<string, unknown> = {
          last_ping_at: new Date().toISOString(),
        };
        if (batteryParam) {
          pingUpdate.battery_level = parseInt(batteryParam);
          pingUpdate.is_charging = chargingParam === 'true';
        }
        await supabase
          .from('android_devices')
          .update(pingUpdate)
          .eq('device_id', deviceId)
          .eq('tenant_id', tenantId)
          .is('archived_at', null);
        console.log(`🔋 Ping merged: device=${deviceId} battery=${batteryParam || 'N/A'}% charging=${chargingParam}`);
      }

      // Build list of providers this device can handle
      const deviceProviders: string[] = [];
      if (device?.sim1_provider) {
        deviceProviders.push(device.sim1_provider.toLowerCase());
      }
      if (device?.sim2_provider) {
        deviceProviders.push(device.sim2_provider.toLowerCase());
      }

      console.log('Device providers:', deviceProviders);

      // If no device found or no providers configured, return empty
      if (deviceProviders.length === 0) {
        console.log('No providers configured for device:', deviceId);
        return new Response(
          JSON.stringify({ orders: [], nextPollMs: 20000 }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Promote scheduled deliveries whose time has arrived
      await supabase
        .from('delivery_queue')
        .update({ status: 'pending' })
        .eq('tenant_id', tenantId)
        .eq('status', 'scheduled')
        .lte('scheduled_at', new Date().toISOString());

      // ATOMIC CLAIM: Use RPC to claim one pending order (prevents race condition)
      const { data: claimed, error } = await supabase
        .rpc('claim_next_delivery', {
          p_device_id: deviceId,
          p_providers: deviceProviders
        });

      if (error) {
        console.error('Claim error:', error);
        throw error;
      }

      // claim_next_delivery returns a single JSON object (not array)
      if (claimed && typeof claimed === 'object' && claimed.id) {
        const order = claimed;

        // claim_next_delivery cannot return a PIN because delivery_queue has no PIN
        // column. Resolve the tenant's configured PIN from the claimed order instead.
        // This applies equally to online, offline, auto-top-up, and manual queue rows.
        let configuredPin = String(order.pin_code || '').trim();
        if (!configuredPin && order.order_id) {
          const { data: claimedOrder } = await supabase
            .from('orders')
            .select('provider_id, package_id')
            .eq('id', order.order_id)
            .eq('tenant_id', tenantId)
            .maybeSingle();

          if (claimedOrder?.provider_id) {
            let categoryId: string | null = null;
            if (claimedOrder.package_id) {
              const { data: claimedPackage } = await supabase
                .from('data_packages_config')
                .select('category_id')
                .eq('id', claimedOrder.package_id)
                .eq('tenant_id', tenantId)
                .maybeSingle();
              categoryId = claimedPackage?.category_id || null;
            }

            const instructionQueries = [
              claimedOrder.package_id
                ? supabase.from('delivery_instructions').select('sim_password').eq('tenant_id', tenantId).eq('provider_id', claimedOrder.provider_id).eq('package_id', claimedOrder.package_id).limit(1)
                : null,
              categoryId
                ? supabase.from('delivery_instructions').select('sim_password').eq('tenant_id', tenantId).eq('provider_id', claimedOrder.provider_id).eq('category_id', categoryId).is('package_id', null).limit(1)
                : null,
              supabase.from('delivery_instructions').select('sim_password').eq('tenant_id', tenantId).eq('provider_id', claimedOrder.provider_id).is('category_id', null).is('package_id', null).limit(1),
              // Fallback: a newly added package/category may not have its own PIN row
              // yet. The SIM PIN belongs to the tenant's SIM, so reuse any PIN already
              // configured for this provider, then any PIN configured for this tenant.
              supabase.from('delivery_instructions').select('sim_password').eq('tenant_id', tenantId).eq('provider_id', claimedOrder.provider_id).not('sim_password', 'is', null).neq('sim_password', '').limit(1),
              supabase.from('delivery_instructions').select('sim_password').eq('tenant_id', tenantId).not('sim_password', 'is', null).neq('sim_password', '').limit(1),
            ].filter(Boolean);


            for (const query of instructionQueries) {
              const { data: rows } = await query;
              const candidate = String(rows?.[0]?.sim_password || '').trim();
              if (candidate) {
                configuredPin = candidate;
                break;
              }
            }
          }
        }
        
        console.log('✅ Claimed delivery:', {
          id: order.id,
          provider_name: order.provider_name,
          appVersion,
          versionCode,
          pinConfigured: configuredPin.length > 0,
        });

      return new Response(
          JSON.stringify({
            orders: [{
              id: order.id,
              orderId: order.order_id,
              ussdCode: order.ussd_code,
              receiverPhone: order.receiver_phone,
              packageCode: order.package_code,
              attempts: order.attempts,
              simSlot: order.sim_slot ?? 0,
              provider: order.provider_name,
              pinCode: configuredPin,
            }],
            nextPollMs: 2000,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ orders: [], nextPollMs: 4000 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Route: Mark delivery as dispatched (USSD actually dialed on device).
    // This is the one-send lock — once set, server must NEVER re-queue the row.
    if (req.method === 'POST' && path === 'dispatch') {
      const { queueId, deviceId } = await req.json();
      if (!queueId || !deviceId) {
        return new Response(
          JSON.stringify({ error: 'queueId and deviceId required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const { errorResponse } = await resolveActiveDevice(supabase, deviceId, 'id, device_id, tenant_id');
      if (errorResponse) return errorResponse;
      const { data: marked, error: markErr } = await supabase.rpc('mark_delivery_dispatched', {
        p_queue_id: queueId,
        p_device_id: deviceId,
      });
      if (markErr) {
        console.error('Dispatch mark error:', markErr);
        return new Response(
          JSON.stringify({ error: markErr.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      console.log(`📤 Dispatched queueId=${queueId} byDevice=${deviceId} firstTime=${marked}`);
      return new Response(
        JSON.stringify({ success: true, firstTime: !!marked }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Route: Update delivery status (Android app reports back)
    if (req.method === 'POST' && path === 'status') {
      const { queueId, deviceId, status, errorMessage, providerResponse } = await req.json();

      console.log('Updating delivery status:', { queueId, deviceId, status, errorMessage });

      const { device, errorResponse } = await resolveActiveDevice(supabase, deviceId, 'id, device_id, tenant_id');
      if (errorResponse) return errorResponse;
      const tenantId = device.tenant_id;

      // Idempotency: if this queue already finalized, ignore further updates
      const { data: existingQueue, error: existingQueueErr } = await supabase
        .from('delivery_queue')
        .select('id, status, order_id, dispatched_at, tenant_id')
        .eq('id', queueId)
        .eq('tenant_id', tenantId)
        .maybeSingle();
      if (existingQueueErr) {
        console.warn('Queue fetch error:', existingQueueErr);
      }
      if (!existingQueue) {
        return new Response(
          JSON.stringify({ success: false, message: 'Queue not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (['completed', 'failed', 'verification_required'].includes(existingQueue.status as string)) {
        return new Response(
          JSON.stringify({ success: true, message: 'Already finalized' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const wasDispatched = !!existingQueue.dispatched_at;

      // Enhanced logging for debugging
      console.log('📊 Status update received:', { 
        queueId, 
        status, 
        errorMessage: errorMessage?.slice(0, 100),
        hasProviderResponse: !!providerResponse 
      });
      
      if (providerResponse) {
        console.log('🔍 Hormuud Response:', String(providerResponse).slice(0, 300));
      } else {
        console.log('⚠️  No provider response received from Android');
      }
      
      // Determine final status with provider response heuristics
      const text = String(providerResponse || '').toLowerCase();
      const successKeywords = [
        'ugu shubtay', 'u shubtay', 'e-voucher', 'haraagaagu waa',
        'success', 'successful', 'complete', 'completed', 'approved',
        'confirm', 'confirmed', 'activated',
        'ku guulaysatay', 'u wareejiso', 'u dirto', 'transcation id',
        'transaction id', 'jeeb', 'dhammays', 'abaal'
      ];
      const failureKeywords = [
        'khalad', 'fail', 'failed', 'error', 'reject', 'rejected',
        'insufficient', 'invalid', 'unknown', 'denied', 'declined',
        'cancelled', 'canceled',
        'service error', 'try again', 'please try again', 'internal',
        'temporarily', 'unavailable', 'not available', 'time out',
        'connection', 'network error', 'waxba kama dhicin'
      ];

      const providerIndicatesFailure = text.length > 0 && failureKeywords.some(k => text.includes(k));
      const providerIndicatesSuccess = text.length > 0 && successKeywords.some(k => text.includes(k));

      // Fetch current attempts for auto-retry logic
      const { data: existingAttempts, error: attemptsErr } = await supabase
        .from('delivery_queue')
        .select('attempts')
        .eq('id', queueId)
        .eq('tenant_id', tenantId)
        .maybeSingle();
      if (attemptsErr) {
        console.warn('Attempts fetch error:', attemptsErr);
      }
      const currentAttempts = ((existingAttempts?.attempts as number | null) ?? 0);

      // ===== SMS DEDUCTION RECLASSIFICATION =====
      // If Android reports timeout with no provider response, check sms_logs for a recent
      // deduction SMS (e.g., "ugu shubtay 252...") matching the receiver phone.
      // The carrier deduction SMS is the strongest proof the USSD succeeded.
      let smsConfirmedTimeout = false;
      let smsConfirmedBody: string | null = null;
      if (
        status === 'timeout' &&
        !providerIndicatesSuccess &&
        !providerIndicatesFailure
      ) {
        try {
          const { data: queueDetail } = await supabase
            .from('delivery_queue')
            .select('receiver_phone, android_device_id, last_attempt_at, created_at')
            .eq('id', queueId)
            .eq('tenant_id', tenantId)
            .maybeSingle();

          if (queueDetail?.receiver_phone && queueDetail?.android_device_id) {
            // Normalize receiver phone to last 9 digits for matching
            const receiverDigits = String(queueDetail.receiver_phone).replace(/\D/g, '');
            const receiverLast9 = receiverDigits.slice(-9);
            const sinceTs = new Date(Date.now() - 120_000).toISOString();

            const { data: recentSms } = await supabase
              .from('sms_logs')
              .select('sms_body, received_at')
              .eq('tenant_id', tenantId)
              .eq('device_id', queueDetail.android_device_id)
              .gte('received_at', sinceTs)
              .order('received_at', { ascending: false })
              .limit(20);

            if (recentSms && recentSms.length > 0 && receiverLast9.length === 9) {
              for (const row of recentSms) {
                const body = String(row.sms_body || '');
                const bodyLower = body.toLowerCase();
                const isDeduction =
                  bodyLower.includes('ugu shubtay') ||
                  bodyLower.includes('haraagaagu waa') ||
                  bodyLower.includes('u wareejisay') ||
                  bodyLower.includes('ku guulaysatay');
                const bodyDigits = body.replace(/\D/g, '');
                if (isDeduction && bodyDigits.includes(receiverLast9)) {
                  smsConfirmedTimeout = true;
                  smsConfirmedBody = body;
                  console.log(`✅ SMS-confirmed late callback for queue ${queueId} - reclassifying timeout as completed`);
                  break;
                }
              }
            }
          }
        } catch (lookupErr) {
          console.warn('SMS deduction lookup failed:', lookupErr);
        }
      }

      // Ambiguous error keywords mean: USSD was dispatched but we don't actually know if
      // the carrier accepted it. After dispatch we MUST NOT auto-retry these — operator must verify.
      const ambiguousKeywords = [
        'time out', 'timeout', 'connection', 'network error',
        'invalid mmi', 'mmi', 'try again', 'no response',
        'service error', 'temporarily', 'unavailable', 'not available'
      ];
      const isAmbiguous = (status === 'timeout') ||
        text.length === 0 ||
        ambiguousKeywords.some(k => text.includes(k));

      // Priority: failure keywords override Android status; success keywords override failure
      let normalizedStatus = 'failed';
      let isAutoRetry = false;

      if (smsConfirmedTimeout) {
        // Treat as success — late carrier callback confirmed by deduction SMS
        normalizedStatus = 'completed';
      } else if (providerIndicatesSuccess) {
        // Duplicate delivery prevention: check if a NEW delivered delivery exists for same receiver + order
        const { data: existingDelivered } = await supabase
          .from('delivery_queue')
          .select('id')
          .eq('tenant_id', tenantId)
          .eq('order_id', existingQueue.order_id)
          .eq('status', 'completed')
          .neq('id', queueId)
          .limit(1)
          .maybeSingle();

        if (existingDelivered) {
          console.log(`⚠️ Duplicate delivery detected - another delivery already completed for order ${existingQueue.order_id}`);
        }

        normalizedStatus = 'completed';
        console.log('✅ Overriding status to COMPLETED based on provider message keywords');
      } else if (wasDispatched && isAmbiguous) {
        // ONE-SEND LOCK: USSD already sent, response is ambiguous → manual verification.
        // NEVER auto-retry after dispatch on ambiguous errors.
        normalizedStatus = 'verification_required';
        console.log(`🛑 Dispatched + ambiguous response → verification_required for queue ${queueId} (no auto-retry)`);
      } else if (providerIndicatesFailure && !providerIndicatesSuccess) {
        // Provider clearly said "failed" (insufficient balance, invalid, declined, etc.)
        // For Somtel "horey furtay" we keep the existing retry behavior because it's a
        // safe "not yet processed" signal from the provider itself.
        const isSomtelRetry = text.includes('horey') && text.includes('furtay');

        if (isSomtelRetry) {
          if (currentAttempts < 10) {
            normalizedStatus = 'pending';
            isAutoRetry = true;
            console.log(`🔄 Somtel retry: attempt ${currentAttempts + 1}/10 for queue ${queueId} - 60s cooldown`);
          } else {
            normalizedStatus = 'failed';
            console.log(`❌ Somtel: max retries (10) exceeded for queue ${queueId}`);
          }
        } else if (!wasDispatched && currentAttempts < 2) {
          // Only retry pre-dispatch failures (SIM/permission errors before the USSD ever left)
          normalizedStatus = 'pending';
          isAutoRetry = true;
          console.log(`🔄 Pre-dispatch retry: attempt ${currentAttempts + 1}/3 for queue ${queueId}`);
        } else {
          normalizedStatus = 'failed';
          console.log(`❌ Final failure (dispatched=${wasDispatched}) for queue ${queueId}`);
        }
      } else if (status === 'completed') {
        normalizedStatus = 'completed';
      } else if (status === 'failed') {
        // Generic Android-reported failure without keywords. If already dispatched → verify, not retry.
        normalizedStatus = wasDispatched ? 'verification_required' : 'failed';
      }

      // Prepare update data
      const updateData: any = {
        status: normalizedStatus,
        last_attempt_at: new Date().toISOString(),
        attempts: currentAttempts + 1,
      };

      // Save provider response (prefer SMS-confirmed body when applicable)
      const effectiveProviderResponse = smsConfirmedTimeout
        ? (smsConfirmedBody || providerResponse)
        : providerResponse;
      if (effectiveProviderResponse) {
        updateData.provider_response = effectiveProviderResponse;
      }

      if (isAutoRetry) {
        // Somtel retry uses 60s cooldown, others use 15s
        const isSomtelRetry = text.includes('horey') && text.includes('furtay');
        const cooldownMs = isSomtelRetry ? 60000 : 15000;
        // Release device and schedule retry
        updateData.android_device_id = null;
        updateData.scheduled_at = new Date(Date.now() + cooldownMs).toISOString();
        updateData.error_message = isSomtelRetry 
          ? `Somtel auto-retry attempt ${currentAttempts + 1}/10 (60s cooldown)`
          : `Auto-retry attempt ${currentAttempts + 1}/3`;
        console.log(`⏰ Scheduled retry in ${cooldownMs/1000}s for queue ${queueId}`);
      } else if (normalizedStatus === 'completed') {
        updateData.completed_at = new Date().toISOString();
      } else if (errorMessage) {
        updateData.error_message = errorMessage;
      }

      // Update delivery queue
      const { data: queueData, error: queueError } = await supabase
        .from('delivery_queue')
        .update(updateData)
        .eq('id', queueId)
        .eq('tenant_id', tenantId)
        .select()
        .single();

      if (queueError) {
        console.error('Queue update error:', queueError);
        throw queueError;
      }

      // Update order based on final delivery queue status
      // Skip order update for auto-retry (status='pending')
      const finalDeliveryStatus = queueData.status;
      
      if (finalDeliveryStatus !== 'pending') {
        const orderUpdate: any = {};
        
        if (finalDeliveryStatus === 'completed') {
          orderUpdate.delivery_status = 'delivered';
          orderUpdate.delivered_at = new Date().toISOString();
          orderUpdate.delivery_notes = smsConfirmedTimeout
            ? `Auto-confirmed by deduction SMS — late USSD callback. ${smsConfirmedBody?.slice(0, 200) || ''}`.trim()
            : (effectiveProviderResponse || 'Package activated successfully');
        } else if (finalDeliveryStatus === 'failed') {
          orderUpdate.delivery_status = 'failed';
          const isSomtelMaxRetries = text.includes('horey') && text.includes('furtay') && currentAttempts >= 10;
          orderUpdate.delivery_notes = isSomtelMaxRetries 
            ? `Somtel: max retries (10) exceeded - ${errorMessage || providerResponse || 'Activation failed'}`
            : (errorMessage || 'Activation failed');
        } else if (finalDeliveryStatus === 'verification_required') {
          orderUpdate.delivery_status = 'verification_required';
          orderUpdate.delivery_notes = `USSD dispatched but provider callback ambiguous (${(errorMessage || text || 'no response').slice(0, 160)}). MANUAL VERIFICATION REQUIRED — do not auto-resend.`;
        }

        await supabase
          .from('orders')
          .update(orderUpdate)
          .eq('id', queueData.order_id)
          .eq('tenant_id', tenantId);
      }

      // Update device counters
      if (queueData.android_device_id) {
        const { data: device, error: devErr } = await supabase
          .from('android_devices')
          .select('id, total_deliveries, failed_deliveries, device_id')
          .eq('tenant_id', tenantId)
          .eq('device_id', queueData.android_device_id)
          .is('archived_at', null)
          .maybeSingle();
        if (devErr) {
          console.warn('Device fetch error:', devErr);
        } else if (device) {
          const updates: any = {};
          if (normalizedStatus === 'completed') {
            updates.total_deliveries = ((device.total_deliveries as number | null) ?? 0) + 1;
          } else {
            updates.failed_deliveries = ((device.failed_deliveries as number | null) ?? 0) + 1;
          }
          await supabase
            .from('android_devices')
            .update(updates)
            .eq('id', device.id)
            .eq('tenant_id', tenantId);
        }
      }

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Route: Device heartbeat
    if (req.method === 'POST' && path === 'ping') {
      const { deviceId, batteryLevel, isCharging, queueSize } = await req.json();
      const { device, errorResponse } = await resolveActiveDevice(supabase, deviceId, 'id, device_id, tenant_id');
      if (errorResponse) return errorResponse;
      const tenantId = device.tenant_id;

      // Try to update existing device with battery level (only non-archived)
      const { error: updateErr, count: updateCount } = await supabase
        .from('android_devices')
        .update({ 
          last_ping_at: new Date().toISOString(),
          battery_level: typeof batteryLevel === 'number' ? batteryLevel : null
        })
        .eq('device_id', deviceId)
        .eq('tenant_id', tenantId)
        .is('archived_at', null);

      // If no rows updated and no error, device doesn't exist. Do not auto-register here;
      // first login/register-device must bind it to a tenant.
      if ((updateCount === 0 || updateCount === null) && !updateErr) {
        // Double-check: device may exist but updateCount is null (no count header)
        const { data: existingDevice } = await supabase
          .from('android_devices')
          .select('id')
          .eq('device_id', deviceId)
          .eq('tenant_id', tenantId)
          .is('archived_at', null)
          .maybeSingle();

        if (!existingDevice) {
          return json({ error: 'Device must be registered with reseller login first', needsLogin: true }, 403);
        }
      }

      // Sweep stuck 'processing' deliveries for this device.
      // ONE-SEND LOCK: if row was already dispatched (USSD dialed), NEVER re-queue.
      // Only re-queue rows that never reached dispatch (true app crash before dial).
      try {
        const timeoutMs = 90000; // 90 seconds
        const now = Date.now();
        const { data: processingRows, error: procErr } = await supabase
          .from('delivery_queue')
          .select('id, order_id, last_attempt_at, created_at, attempts, dispatched_at')
          .eq('tenant_id', tenantId)
          .eq('status', 'processing')
          .eq('android_device_id', deviceId);

        if (procErr) {
          console.warn('Processing fetch error:', procErr);
        } else {
          for (const row of processingRows ?? []) {
            const last = row.last_attempt_at ? new Date(row.last_attempt_at as string).getTime() : 0;
            const created = row.created_at ? new Date(row.created_at as string).getTime() : 0;
            const age = Math.max(now - last, now - created);
            if (age <= timeoutMs) continue;

            const currentAttempts = ((row.attempts as number | null) ?? 0);
            const wasDispatched = !!row.dispatched_at;

            if (wasDispatched) {
              // USSD was dialed → cannot safely retry. Flag for manual verification.
              console.log(`🛑 Dispatched-but-stuck queueId=${row.id} → verification_required (age=${age}ms)`);
              const { data: updated } = await supabase
                .from('delivery_queue')
                .update({
                  status: 'verification_required',
                  error_message: 'USSD dispatched but no provider callback within 90s. Manual verification required.',
                  last_attempt_at: new Date().toISOString(),
                  attempts: currentAttempts + 1,
                })
                .eq('id', row.id as string)
                .eq('tenant_id', tenantId)
                .select()
                .single();
              if (updated) {
                await supabase.from('orders').update({
                  delivery_status: 'verification_required',
                  delivery_notes: 'USSD sent but provider callback missing. Verify before any resend.',
                }).eq('id', updated.order_id as string).eq('tenant_id', tenantId);
              }
            } else if (currentAttempts < 3) {
              // Never dispatched → safe to retry (true pre-dial failure)
              console.log(`🔄 Re-queuing NEVER-dispatched delivery queueId=${row.id} (attempt ${currentAttempts + 1}/3)`);
              await supabase
                .from('delivery_queue')
                .update({
                  status: 'pending',
                  android_device_id: null,
                  error_message: `Auto-requeued (pre-dispatch failure, attempt ${currentAttempts + 1}/3)`,
                  last_attempt_at: new Date().toISOString(),
                })
                .eq('id', row.id as string)
                .eq('tenant_id', tenantId);
              await supabase
                .from('orders')
                .update({
                  delivery_status: 'pending',
                  delivery_notes: `Auto-requeued: device offline before USSD dialed (attempt ${currentAttempts + 1}/3)`,
                })
                .eq('id', row.order_id as string)
                .eq('tenant_id', tenantId);
            } else {
              // Never dispatched, 3 attempts exhausted → final failed
              console.log(`❌ Final fail (never-dispatched) queueId=${row.id}`);
              const { data: updated } = await supabase
                .from('delivery_queue')
                .update({
                  status: 'failed',
                  error_message: 'Pre-dispatch failure after 3 attempts',
                  last_attempt_at: new Date().toISOString(),
                  attempts: currentAttempts + 1,
                })
                .eq('id', row.id as string)
                .eq('tenant_id', tenantId)
                .select()
                .single();
              if (updated) {
                await supabase.from('orders').update({
                  delivery_status: 'failed',
                  delivery_notes: 'Could not dispatch USSD after 3 attempts.',
                }).eq('id', updated.order_id as string).eq('tenant_id', tenantId);
              }
            }
          }
        }
      } catch (e) {
        console.warn('Ping sweep error:', e);
      }

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ==================== OTP SMS ROUTES ====================
    
    // Route: Get pending OTP tasks for Android device (filtered by provider)
    if (req.method === 'GET' && path === 'otp-pending') {
      const deviceId = url.searchParams.get('deviceId');
      
      console.log('📱 Fetching pending OTP tasks for device:', deviceId);

      // Get device's configured providers (sim1_provider, sim2_provider)
      const { data: device, error: deviceError } = await supabase
        .from('android_devices')
        .select('sim1_provider, sim2_provider')
        .eq('device_id', deviceId)
        .is('archived_at', null)
        .maybeSingle();

      if (deviceError) {
        console.error('Device lookup error:', deviceError);
      }

      // Build list of providers this device can handle
      const deviceProviders: string[] = [];
      if (device?.sim1_provider) {
        deviceProviders.push(device.sim1_provider.toLowerCase());
      }
      if (device?.sim2_provider) {
        deviceProviders.push(device.sim2_provider.toLowerCase());
      }

      console.log('📱 Device providers for OTP:', deviceProviders);

      // If no providers configured, return empty
      if (deviceProviders.length === 0) {
        console.log('No providers configured for device:', deviceId);
        return new Response(
          JSON.stringify({ tasks: [] }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Get pending OTP tasks matching device's providers (oldest first, limit 5)
      const { data: tasks, error } = await supabase
        .from('sms_otp_queue')
        .select('id, phone_number, otp_code, provider')
        .eq('status', 'pending')
        .in('provider', deviceProviders)
        .order('created_at', { ascending: true })
        .limit(5);

      if (error) {
        console.error('OTP fetch error:', error);
        throw error;
      }

      // Mark fetched tasks as processing
      if (tasks && tasks.length > 0) {
        const taskIds = tasks.map(t => t.id);
        await supabase
          .from('sms_otp_queue')
          .update({ 
            status: 'processing',
            device_id: deviceId 
          })
          .in('id', taskIds);
        
        console.log(`✅ Found ${tasks.length} pending OTP tasks for providers:`, deviceProviders);
      } else {
        console.log('📭 No pending OTP tasks for providers:', deviceProviders);
      }

      return new Response(
        JSON.stringify({ 
          tasks: tasks?.map(t => ({
            id: t.id,
            phoneNumber: t.phone_number,
            otpCode: t.otp_code,
            provider: t.provider
          })) || []
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Route: Update OTP task status
    if (req.method === 'POST' && path === 'otp-status') {
      const { taskId, status, errorMessage } = await req.json();

      console.log('📱 Updating OTP status:', { taskId, status });

      const updateData: any = {
        status: status,
        processed_at: new Date().toISOString()
      };

      if (errorMessage) {
        updateData.error_message = errorMessage;
      }

      const { error } = await supabase
        .from('sms_otp_queue')
        .update(updateData)
        .eq('id', taskId);

      if (error) {
        console.error('OTP status update error:', error);
        throw error;
      }

      console.log(`✅ OTP task ${taskId} marked as ${status}`);

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ==================== COMBINED POLL ROUTE ====================
    // Combines /pending + /ping + /otp-pending into a single call to reduce Edge Function invocations
    if (req.method === 'POST' && path === 'poll') {
      const { deviceId, batteryLevel } = await req.json();
      
      const { device: registeredDevice, errorResponse } = await resolveActiveDevice(supabase, deviceId, 'id, device_id, tenant_id, sim1_provider, sim2_provider');
      if (errorResponse) return errorResponse;
      const tenantId = registeredDevice.tenant_id;

      // 1. Ping / heartbeat
      const { data: updatedDevice } = await supabase
        .from('android_devices')
        .update({ 
          last_ping_at: new Date().toISOString(),
          battery_level: typeof batteryLevel === 'number' ? batteryLevel : null
        })
        .eq('device_id', deviceId)
        .eq('tenant_id', tenantId)
        .is('archived_at', null)
        .select('sim1_provider, sim2_provider')
        .maybeSingle();

      const device = updatedDevice || registeredDevice;
      const deviceProviders: string[] = [];
      if (device.sim1_provider) deviceProviders.push(device.sim1_provider.toLowerCase());
      if (device.sim2_provider) deviceProviders.push(device.sim2_provider.toLowerCase());

      let deliveryOrder = null;
      let otpTasks: any[] = [];

      if (deviceProviders.length > 0) {
        // Promote scheduled deliveries whose time has arrived
        await supabase
          .from('delivery_queue')
          .update({ status: 'pending' })
          .eq('tenant_id', tenantId)
          .eq('status', 'scheduled')
          .lte('scheduled_at', new Date().toISOString());

        // 2. ATOMIC CLAIM: Pending delivery (prevents race condition)
        const { data: claimed } = await supabase
          .rpc('claim_next_delivery', {
            p_device_id: deviceId,
            p_providers: deviceProviders
          });

        // claim_next_delivery returns a single JSON object (not array)
        if (claimed && typeof claimed === 'object' && (claimed as any).id) {
          const order: any = claimed;
          deliveryOrder = {
            id: order.id,
            orderId: order.order_id,
            ussdCode: order.ussd_code,
            receiverPhone: order.receiver_phone,
            packageCode: order.package_code,
            attempts: order.attempts,
            simSlot: order.sim_slot ?? 0,
            provider: order.provider_name,
          };
          console.log('✅ Claimed delivery (poll):', { id: order.id, provider_name: order.provider_name });
        }

        // 3. OTP tasks removed - OTP is now shown on-screen, no SMS needed
      }

      // 4. Sweep stuck processing deliveries with ONE-SEND LOCK
      try {
        const timeoutMs = 90000;
        const now = Date.now();
        const { data: processingRows } = await supabase
          .from('delivery_queue')
          .select('id, order_id, last_attempt_at, created_at, attempts, dispatched_at')
          .eq('tenant_id', tenantId)
          .eq('status', 'processing')
          .eq('android_device_id', deviceId);

        for (const row of processingRows ?? []) {
          const last = row.last_attempt_at ? new Date(row.last_attempt_at as string).getTime() : 0;
          const created = row.created_at ? new Date(row.created_at as string).getTime() : 0;
          const age = Math.max(now - last, now - created);
          if (age <= timeoutMs) continue;

          const newAttempts = ((row.attempts as number | null) ?? 0) + 1;
          const wasDispatched = !!row.dispatched_at;
          const finalStatus = wasDispatched ? 'verification_required' : 'failed';
          const orderStatus = wasDispatched ? 'verification_required' : 'failed';
          const note = wasDispatched
            ? 'USSD sent but no provider callback within 90s. Manual verification required.'
            : 'Device timeout before USSD dispatch.';

          const { data: updated } = await supabase
            .from('delivery_queue')
            .update({ status: finalStatus, error_message: note, last_attempt_at: new Date().toISOString(), attempts: newAttempts })
            .eq('id', row.id as string)
            .eq('tenant_id', tenantId)
            .select()
            .single();
          if (updated) {
            await supabase.from('orders').update({ delivery_status: orderStatus, delivery_notes: note }).eq('id', updated.order_id as string).eq('tenant_id', tenantId);
          }
        }
      } catch (_e) { /* sweep error, non-critical */ }

      // Dynamic poll interval: 2s when busy, 4s when idle (faster pickup)
      const hasPendingWork = deliveryOrder !== null;
      const nextPollMs = hasPendingWork ? 2000 : 4000;

      return new Response(
        JSON.stringify({
          success: true,
          orders: deliveryOrder ? [deliveryOrder] : [],
          tasks: [],
          nextPollMs,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Route not found' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
