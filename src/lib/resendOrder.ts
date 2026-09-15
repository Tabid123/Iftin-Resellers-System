/**
 * Dib u dirista dalab (resend).
 *
 * Dalab hore (delivered ama failed) waxaa laga sameeyaa dalab cusub oo isku
 * package/qiimo ah laakiin lambar cusub. USSD-ka waxaa laga soo qaadaa
 * safkii hore ee delivery_queue (lambarkii hore ayaa lagu beddelaa kan cusub);
 * haddii uusan jirin, waxaa la isticmaalaa delivery_instructions template-ka.
 */
import { supabase } from '@/integrations/supabase/client';

export const digits9 = (raw: string): string => {
  let s = String(raw ?? '').replace(/\D/g, '');
  if (s.startsWith('252')) s = s.slice(3);
  return s.slice(-9);
};

const applyTemplate = (template: string, phone: string, order: any, packageCode: string) =>
  template
    .replace(/\{receiver_phone\}/g, phone)
    .replace(/\{package_code\}/g, packageCode)
    .replace(/\{cost_price\}/g, String(order.cost_price ?? ''))
    .replace(/\{selling_price\}/g, String(order.selling_price ?? ''));

async function lookupUssd(order: any, phone: string): Promise<{ ussd: string | null; provider: string | null; deviceId: string | null; simSlot: number | null }> {
  // 1. Reuse the original queue row (most reliable — it already worked once).
  const prev = order.id
    ? (
        await supabase
          .from('delivery_queue')
          .select('ussd_code, provider_name, android_device_id, sim_slot, receiver_phone')
          .eq('order_id', order.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
      ).data
    : null;

  if (prev?.ussd_code && prev.ussd_code !== 'MANUAL') {
    const oldPhone = digits9(String(prev.receiver_phone ?? order.receiver_phone ?? ''));
    const ussd = oldPhone ? prev.ussd_code.split(oldPhone).join(phone) : prev.ussd_code;
    return { ussd, provider: prev.provider_name ?? null, deviceId: prev.android_device_id ?? null, simSlot: prev.sim_slot ?? null };
  }

  // 2. Fall back to the tenant's delivery instructions.
  let template: string | null = null;
  if (order.provider_id) {
    const { data: pkgLevel } = await supabase
      .from('delivery_instructions')
      .select('code_template')
      .eq('provider_id', order.provider_id)
      .eq('package_id', order.package_id ?? '')
      .limit(1)
      .maybeSingle();
    template = pkgLevel?.code_template ?? null;
    if (!template) {
      const { data: provLevel } = await supabase
        .from('delivery_instructions')
        .select('code_template')
        .eq('provider_id', order.provider_id)
        .is('category_id', null)
        .is('package_id', null)
        .limit(1)
        .maybeSingle();
      template = provLevel?.code_template ?? null;
    }
  }

  let packageCode = '';
  if (order.package_id) {
    const { data: pkg } = await supabase
      .from('data_packages_config')
      .select('ussd_code')
      .eq('id', order.package_id)
      .maybeSingle();
    packageCode = pkg?.ussd_code ?? '';
  }

  const ussd = template ? applyTemplate(template, phone, order, packageCode) : (packageCode || null);
  return {
    ussd,
    provider: prev?.provider_name ?? order.provider_name ?? null,
    deviceId: prev?.android_device_id ?? null,
    simSlot: prev?.sim_slot ?? null,
  };
}

export type ResendResult = { ok: true; orderId: string } | { ok: false; message: string };

export async function resendOrder(order: any, newReceiverRaw: string): Promise<ResendResult> {
  const phone = digits9(newReceiverRaw);
  if (phone.length !== 9) return { ok: false, message: 'Lambarka sax ma aha' };

  const { ussd, provider, deviceId, simSlot } = await lookupUssd(order, phone);
  if (!ussd) return { ok: false, message: 'USSD-ka xirmadan lama helin — delivery instructions hubi' };

  const { data: created, error: orderErr } = await supabase
    .from('orders')
    .insert({
      provider_id: order.provider_id ?? null,
      package_id: order.package_id ?? null,
      package_name: order.package_name,
      data_amount: order.data_amount ?? null,
      selling_price: order.selling_price,
      cost_price: order.cost_price ?? 0,
      receiver_phone: phone,
      sender_phone: order.sender_phone ?? null,
      customer_phone: order.customer_phone ?? phone,
      payment_number: order.payment_number ?? 'RESEND',
      payment_provider_id: order.payment_provider_id ?? null,
      payment_source: order.payment_source ?? 'manual',
      status: 'completed',
      delivery_status: 'pending',
      is_manual: true,
      delivery_notes: order.id ? `Resend of order ${order.id}` : (order.delivery_notes ?? 'Manual dispatch'),
    })
    .select('id')
    .single();

  if (orderErr || !created) return { ok: false, message: orderErr?.message ?? 'Dalabka lama abuurin' };

  const { error: queueErr } = await supabase.from('delivery_queue').insert({
    order_id: created.id,
    receiver_phone: phone,
    provider_name: provider ?? 'unknown',
    ussd_code: ussd,
    ...(deviceId ? { android_device_id: deviceId } : {}),
    ...(simSlot !== null ? { sim_slot: simSlot } : {}),
    status: 'pending',
  });
  if (queueErr) return { ok: false, message: queueErr.message };

  return { ok: true, orderId: created.id };
}
