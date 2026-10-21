/**
 * Dib u dirista dalab (resend) — dalab cusub LAMA ABUURIN.
 *
 * Dalabka hore ayaa dib loo diraa: waxaa la cusboonaysayaa receiver_phone-ka
 * (haddii la beddelo), delivery_status waxaa loo beddelaa 'pending', oo waxaa
 * la darayaa saf cusub oo delivery_queue ah oo isku dalabka (order_id) qabta.
 * Mid cusub ma abuurmaa.
 */
import { supabase } from '@/integrations/supabase/client';

export const digits9 = (raw: string): string => {
  let s = String(raw ?? '').replace(/\D/g, '');
  if (s.startsWith('252')) s = s.slice(3);
  return s.slice(-9);
};

// Match activate-package: $0.35 -> "035", $4.25 -> "4*25", $4 -> "4".
const formatAmountForUssd = (value: unknown): string => {
  if (value == null || value === '') return '';
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '';
  if (Math.abs(amount - Math.round(amount)) < 0.000001) return String(Math.round(amount));
  return amount.toFixed(2).replace('.', amount < 1 ? '' : '*');
};

const applyTemplate = (template: string, phone: string, order: any, packageCode: string, simPassword: string) => {
  const expanded = template.replace(/\{package_code\}/g, () => packageCode);
  if (template.includes('{package_code}') && !packageCode.trim()) {
    throw new Error('USSD-ka xirmada lama buuxin — delivery instructions hubi');
  }
  if (expanded.includes('{sim_password}') && !simPassword.trim()) {
    throw new Error('PIN-ka USSD lama helin — delivery instructions hubi');
  }
  const cost = formatAmountForUssd(order.cost_price);
  if (expanded.includes('{cost_price}') && !cost) {
    throw new Error('Qiimaha xirmada lama helin — xirmada hubi');
  }
  const ussd = expanded
    .replace(/\{receiver_phone\}/g, phone)
    .replace(/\{cost_price\}/g, cost)
    .replace(/\{selling_price\}/g, String(order.selling_price ?? ''))
    .replace(/\{sim_password\}/g, () => simPassword);
  if (/\{[^{}]*\}/.test(ussd)) {
    throw new Error('USSD-ka si sax ah looma buuxin — delivery instructions hubi');
  }
  return ussd;
};

async function lookupUssd(order: any, phone: string): Promise<{ ussd: string | null; provider: string | null; deviceId: string | null; simSlot: number | null }> {
  // 1. Reuse the original queue row (most reliable — it already worked once).
  let prev: any = null;
  if (order.id) {
    const { data, error } = await supabase
      .from('delivery_queue')
      .select('ussd_code, provider_name, android_device_id, sim_slot, receiver_phone')
      .eq('order_id', order.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error('Xogta diristii hore lama soo akhrin — fadlan isku day mar kale');
    prev = data;
  }

  if (prev?.ussd_code && prev.ussd_code !== 'MANUAL') {
    const oldPhone = digits9(String(prev.receiver_phone ?? order.receiver_phone ?? ''));
    const ussd = oldPhone ? prev.ussd_code.split(oldPhone).join(phone) : prev.ussd_code;
    return { ussd, provider: prev.provider_name ?? null, deviceId: prev.android_device_id ?? null, simSlot: prev.sim_slot ?? null };
  }

  // Orders and the unmatched picker do not carry category_id. Read it from
  // the selected package before resolving Package > Category > Provider.
  let pkg: any = null;
  if (order.package_id) {
    const { data, error } = await supabase
      .from('data_packages_config')
      .select('ussd_code, category_id, provider_id')
      .eq('id', order.package_id)
      .maybeSingle();
    if (error) throw new Error('Xogta xirmada lama soo akhrin — fadlan isku day mar kale');
    if (!data) throw new Error('Xirmadan lama helin — fadlan dib u dooro xirmada');
    pkg = data;
  }

  const providerId = order.provider_id ?? pkg?.provider_id;
  const readInstruction = async (query: any) => {
    const { data, error } = await query.limit(1).maybeSingle();
    if (error) throw new Error('Delivery instructions lama soo akhrin — fadlan isku day mar kale');
    return data?.code_template?.trim() || data?.ussd_code?.trim() ? data : null;
  };

  let instruction: any = null;
  if (providerId && order.package_id) {
    instruction = await readInstruction(supabase
      .from('delivery_instructions')
      .select('code_template, ussd_code, sim_password')
      .eq('provider_id', providerId)
      .eq('package_id', order.package_id));
  }
  if (!instruction && providerId && pkg?.category_id) {
    instruction = await readInstruction(supabase
      .from('delivery_instructions')
      .select('code_template, ussd_code, sim_password')
      .eq('provider_id', providerId)
      .eq('category_id', pkg.category_id)
      .is('package_id', null));
  }
  if (!instruction && providerId) {
    instruction = await readInstruction(supabase
      .from('delivery_instructions')
      .select('code_template, ussd_code, sim_password')
      .eq('provider_id', providerId)
      .is('category_id', null)
      .is('package_id', null));
  }

  const packageCode = pkg?.ussd_code?.trim() ?? '';
  const template = instruction?.code_template?.trim() || instruction?.ussd_code?.trim() || packageCode;
  const ussd = template ? applyTemplate(template, phone, order, packageCode, instruction?.sim_password ?? '') : null;
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

  let delivery: Awaited<ReturnType<typeof lookupUssd>>;
  try {
    delivery = await lookupUssd(order, phone);
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Xogta USSD lama soo akhrin' };
  }
  const { ussd, provider, deviceId, simSlot } = delivery;
  if (!ussd) return { ok: false, message: 'USSD-ka xirmadan lama helin — delivery instructions hubi' };

  // Lacag unmatched ah: dalab hore ma jiro — mid cusub ayaa la abuuraa.
  if (!order?.id) {
    if (!order?.package_id) return { ok: false, message: 'Fadlan dooro xirmada' };

    const { data: created, error: createErr } = await supabase
      .from('orders')
      .insert({
        provider_id: order.provider_id ?? null,
        package_id: order.package_id,
        package_name: order.package_name ?? 'Data Package',
        data_amount: order.data_amount ?? null,
        selling_price: order.selling_price ?? 0,
        cost_price: order.cost_price ?? 0,
        receiver_phone: phone,
        sender_phone: order.sender_phone ? digits9(order.sender_phone) : null,
        customer_phone: digits9(order.customer_phone ?? order.sender_phone ?? phone) || phone,
        payment_number: order.payment_number ?? 'UNMATCHED',
        payment_source: order.payment_source ?? 'offline',
        status: 'paid',
        delivery_status: 'pending',
        delivery_notes: order.delivery_notes ?? null,
      })
      .select('id')
      .single();

    if (createErr || !created?.id) {
      return { ok: false, message: createErr?.message ?? 'Dalabka lama abuurin' };
    }

    const { error: qErr } = await supabase.from('delivery_queue').insert({
      order_id: created.id,
      receiver_phone: phone,
      provider_name: provider ?? 'unknown',
      ussd_code: ussd,
      ...(deviceId ? { android_device_id: deviceId } : {}),
      ...(simSlot !== null ? { sim_slot: simSlot } : {}),
      status: 'pending',
    });
    if (qErr) return { ok: false, message: qErr.message };

    return { ok: true, orderId: created.id };
  }

  // Dalab cusub MA ABUURINNO — midkii hore ayaa dib loo diraa.
  // 1) Cusbooneysi lambarka qaataha (haddii la beddelo) iyo dib-u-dejiinta status-ka.
  const update: Record<string, any> = {
    delivery_status: 'pending',
    status: 'paid',
    delivered_at: null,
    delivery_notes: `Dib loo diray ${new Date().toISOString()}`,
  };
  if (phone !== digits9(order.receiver_phone)) {
    update.receiver_phone = phone;
    update.customer_phone = order.customer_phone ?? phone;
  }

  const { error: orderErr } = await supabase
    .from('orders')
    .update(update)
    .eq('id', order.id);

  if (orderErr) return { ok: false, message: orderErr.message };

  // 2) Ku dar saf cusub oo delivery_queue ah oo isku dalabka qabta.
  const { error: queueErr } = await supabase.from('delivery_queue').insert({
    order_id: order.id,
    receiver_phone: phone,
    provider_name: provider ?? 'unknown',
    ussd_code: ussd,
    ...(deviceId ? { android_device_id: deviceId } : {}),
    ...(simSlot !== null ? { sim_slot: simSlot } : {}),
    status: 'pending',
  });
  if (queueErr) return { ok: false, message: queueErr.message };

  return { ok: true, orderId: order.id };
}
